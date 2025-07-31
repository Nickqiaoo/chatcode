import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { Telegraf } from 'telegraf';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { markdownv2 as format } from 'telegram-format';
import { IStorage } from '../storage/interface';

interface PendingRequest {
  id: string;
  chatId: number;
  toolName: string;
  input: any;
  tool_use_id: string;
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
  timestamp: Date;
}

export class MCPPermissionServer {
  private server: Server;
  private bot: Telegraf;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private readonly TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private app: express.Application;
  private transports: Record<string, StreamableHTTPServerTransport> = {};
  private storage: IStorage;
  private port: number;

  constructor(bot: Telegraf, storage: IStorage, port: number = 3002) {
    this.bot = bot;
    this.storage = storage;
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.server = new Server(
      {
        name: 'permission',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
    this.setupExpress();
  }

  private setupMiddleware(): void {
    // Parse JSON bodies (excluding MCP routes)
    this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.path.startsWith('/mcp')) {
        next();
      } else {
        express.json()(req, res, next);
      }
    });

    // Security headers
    this.app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });
  }

  private setupTools(): void {
    // approve tool - send permission request to Telegram and wait for user reply
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'approve') {
        const { tool_name, input, tool_use_id } = args as {
          tool_name: string;
          input: any;
          tool_use_id: string;
        };

        return this.handleApprove(tool_name, input, tool_use_id);
      }


      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    });

    // Register tool list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'approve',
            description: 'Send permission request to user via Telegram and wait for approval',
            inputSchema: {
              type: 'object',
              properties: {
                tool_name: {
                  type: 'string',
                  description: 'Name of the tool requesting permission'
                },
                input: {
                  type: 'object',
                  description: 'Input parameters for the tool'
                },
                tool_use_id: {
                  type: 'string',
                  description: 'The unique tool use request ID'
                },
              },
              required: ['tool_name', 'input', 'tool_use_id']
            }
          }
        ]
      };
    });
  }

  /**
   * approve function - send permission request to Telegram and block waiting for user reply
   */
  private async handleApprove(toolName: string, input: any, tool_use_id: string): Promise<any> {
    const requestId = this.generateRequestId();

    // Retrieve chat ID from Redis using enhanced key generation
    const chatId = await this.storage.getToolUseMapping(tool_use_id, toolName, input);
    if (!chatId) {
      throw new Error(`No chat ID found for tool_use_id: ${tool_use_id}`);
    }

    // Create Promise for blocking wait
    const approval = new Promise<boolean>((resolve, reject) => {
      // Set timeout
      const timeoutId = setTimeout(() => {
        const request = this.pendingRequests.get(requestId);
        if (request) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Permission request timed out after 5 minutes'));
        }
      }, this.TIMEOUT_MS);

      // Store pending request
      const pendingRequest: PendingRequest = {
        id: requestId,
        chatId,
        toolName,
        input,
        tool_use_id,
        resolve,
        reject,
        timeoutId,
        timestamp: new Date()
      };

      this.pendingRequests.set(requestId, pendingRequest);
    });

    try {
      // Sleep for 3 second
      await new Promise(resolve => setTimeout(resolve, 3000));
      // Send Telegram message
      await this.sendPermissionRequest(chatId, toolName, requestId);

      // Wait for user reply
      const approved = await approval;

      // Return MCP specification response
      if (approved) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                behavior: 'allow',
                updatedInput: input
              })
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                behavior: 'deny',
                message: 'Permission denied by user'
              })
            }
          ]
        };
      }
    } catch (error) {
      console.error(`MCP: Error processing permission request: ${error}`);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              behavior: 'deny',
              message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            })
          }
        ]
      };
    }
  }

  /**
   * approve_callback function - handle user's authorization reply
   */
  public async handleApproveCallback(chatId: number, approved: string): Promise<any> {

    // Extract requestId and approval status from callback_data
    const isApproved = approved.startsWith('approve_');
    const requestId = approved.replace(/^(approve_|deny_)/, '');

    // Find corresponding pending request
    const pendingRequest = this.pendingRequests.get(requestId);

    if (!pendingRequest) {
      return {
        content: [
          {
            type: 'text',
            text: 'No pending permission request found'
          }
        ]
      };
    }

    // Atomically remove from pending requests and clear timeout
    this.pendingRequests.delete(pendingRequest.id);
    clearTimeout(pendingRequest.timeoutId);

    // Resolve Promise, notify approve function
    pendingRequest.resolve(isApproved);

    return {
      content: [
        {
          type: 'text',
          text: `Permission request ${isApproved ? 'approved' : 'denied'} for chat ${chatId}`
        }
      ]
    };
  }

  /**
   * Send permission request to Telegram
   */
  private async sendPermissionRequest(chatId: number, toolName: string, requestId: string): Promise<void> {
    const message = `🔐 ${format.bold('Permission request')}

Tool: ${format.bold(toolName)}
Time: ${format.escape(new Date().toLocaleString('en-US'))}

⚠️ ${format.bold('This request will timeout automatically after 5 minutes')}

Do you allow this operation?`;

    try {
      await this.bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Allow', callback_data: `approve_${requestId}` },
              { text: '❌ Deny', callback_data: `deny_${requestId}` }
            ]
          ]
        }
      });

    } catch (error) {
      console.error(`MCP: Failed to send permission request to chat ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * Setup Express routes
   */
  private setupExpress(): void {
    // MCP main handler route (preserve original req stream)
    this.app.post('/mcp', async (req, res) => {
      await this.handleMCPRequest(req, res);
    });

    this.app.delete('/mcp', async (req, res) => {
      await this.handleSessionTermination(req, res);
    });

    // HTTP interface: handle approval callback
    this.app.post('/api/approve-callback', async (req, res) => {
      try {
        const { chat_id, approved } = req.body;

        if (!chat_id || !approved) {
          return res.status(400).json({ error: 'Missing required fields: chat_id, approved' });
        }

        const result = await this.handleApproveCallback(chat_id, approved);
        return res.json({ success: true, result });
      } catch (error) {
        console.error('Error handling approve callback:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  /**
   * Handle MCP request
   */
  private async handleMCPRequest(req: express.Request, res: express.Response): Promise<void> {
    let sessionId = req.headers['mcp-session-id'] as string;

    // If no session ID, create new one
    if (!sessionId) {
      sessionId = randomUUID();
      res.setHeader('mcp-session-id', sessionId);
    }

    try {
      // Get or create transport instance
      let transport = this.transports[sessionId];
      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId,
        });

        await this.server.connect(transport);
        this.transports[sessionId] = transport;
      }

      await transport.handleRequest(req, res);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  }

  /**
   * Handle session termination
   */
  private async handleSessionTermination(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string;

    if (!sessionId || !this.transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }


    try {
      const transport = this.transports[sessionId];
      await transport.handleRequest(req, res);

      // Clean up transport instance
      delete this.transports[sessionId];
    } catch (error) {
      console.error('Error handling session termination:', error);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  }

  /**
   * Start MCP server
   */
  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Only listen on localhost for security
        const server = this.app.listen(this.port, 'localhost', () => {
          console.log(`MCP server listening on localhost:${this.port}`);
          resolve();
        });

        server.on('error', (error: any) => {
          console.error('MCP server failed to start:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop MCP server
   */
  public async stop(): Promise<void> {
    // Clean up all pending requests
    for (const request of this.pendingRequests.values()) {
      clearTimeout(request.timeoutId);
      request.reject(new Error('Server shutting down'));
    }
    this.pendingRequests.clear();

    // Close all transport instances
    for (const sessionId in this.transports) {
      try {
        const transport = this.transports[sessionId];
        if (transport) {
          await transport.close();
          delete this.transports[sessionId];
        }
      } catch (error) {
        console.error(`Error closing transport for session ${sessionId}:`, error);
      }
    }

    await this.server.close();
  }
}

// For compatibility, export alias
export { MCPPermissionServer as MCPServer };