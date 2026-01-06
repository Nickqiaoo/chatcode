import { query, type Options, AbortError, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { IStorage } from '../storage/interface';
import { TargetTool } from '../models/types';
import { PermissionManager } from './permission-manager';
import { StreamManager } from '../utils/stream-manager';

export class ClaudeManager {
  private storage: IStorage;
  private permissionManager: PermissionManager;
  private streamManager = new StreamManager();
  private binaryPath: string | undefined;
  private onClaudeResponse: (userId: string, message: any, toolInfo?: { toolId: string; toolName: string; isToolUse: boolean; isToolResult: boolean }, parentToolUseId?: string) => Promise<void>;
  private onClaudeError: (userId: string, error: string) => void;

  constructor(
    storage: IStorage,
    permissionManager: PermissionManager,
    callbacks: {
      onClaudeResponse: (userId: string, message: any, toolInfo?: { toolId: string; toolName: string; isToolUse: boolean; isToolResult: boolean }, parentToolUseId?: string) => Promise<void>;
      onClaudeError: (userId: string, error: string) => void;
    },
    binaryPath?: string
  ) {
    this.storage = storage;
    this.permissionManager = permissionManager;
    this.onClaudeResponse = callbacks.onClaudeResponse;
    this.onClaudeError = callbacks.onClaudeError;
    this.binaryPath = binaryPath;
  }

  async addMessageToStream(chatId: number, prompt: string): Promise<void> {
    const session = await this.storage.getUserSession(chatId);
    if (!session) {
      console.error(`[ClaudeManager] No session found for chatId: ${chatId}`);
      return;
    }

    const userMessage: SDKUserMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt
          }
        ]
      },
      parent_tool_use_id: null,
      session_id: ''
    };

    // If no active query, start a new one
    if (!this.streamManager.isStreamActive(chatId)) {
      await this.startNewQuery(chatId, session);
    }

    // Add message to existing stream
    this.streamManager.addMessage(chatId, userMessage);
  }

  async sendMessage(chatId: number, prompt: AsyncIterable<SDKUserMessage>, options: Options): Promise<void> {
    const userSession = await this.storage.getUserSession(chatId);
    if (!userSession) {
      throw new Error('User session not found');
    }

    try {
      for await (const message of query({
        prompt,
        options: options
      })) {
        if (message.session_id && userSession.sessionId !== message.session_id) {
          userSession.sessionId = message.session_id;
          await this.storage.saveUserSession(userSession);
        }
        console.debug(JSON.stringify(message, null, 2));

        // Detect tool use and tool result in message content
        const toolInfo = this.extractToolInfo(message);
        const parentToolUseId = (message as any).parent_tool_use_id || undefined;

        await this.onClaudeResponse(chatId.toString(), message, toolInfo, parentToolUseId);
      }
    } catch (error) {
      // Don't throw error if it's caused by abort
      if (error instanceof AbortError) {
        return;
      }

      this.onClaudeError?.(chatId.toString(), error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      // Signal completion with null message to indicate completion
      this.onClaudeResponse(chatId.toString(), null, undefined, undefined);
    }

    await this.storage.updateSessionActivity(userSession);
  }

  async abortQuery(chatId: number): Promise<boolean> {
    return this.streamManager.abortStream(chatId);
  }

  isQueryRunning(chatId: number): boolean {
    return this.streamManager.isStreamActive(chatId);
  }

  async shutdown(): Promise<void> {
    this.streamManager.shutdown();
    await this.storage.disconnect();
  }

  private extractToolInfo(message: any): { toolId: string; toolName: string; isToolUse: boolean; isToolResult: boolean } | undefined {
    const targetTools = Object.values(TargetTool);

    // Check if message has content array
    if (!message.message?.content || !Array.isArray(message.message.content)) {
      return undefined;
    }

    // Check for tool_use in assistant messages
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'tool_use' && targetTools.includes(block.name)) {
          return {
            toolId: block.id,
            toolName: block.name,
            isToolUse: true,
            isToolResult: false
          };
        }
      }
    }

    // Check for tool_result in user messages
    if (message.type === 'user') {
      for (const block of message.message.content) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          return {
            toolId: block.tool_use_id,
            toolName: '', // We'll retrieve this from Redis
            isToolUse: false,
            isToolResult: true
          };
        }
      }
    }

    return undefined;
  }

  private async startNewQuery(chatId: number, session: any): Promise<void> {
    const stream = this.streamManager.getOrCreateStream(chatId);
    const controller = this.streamManager.getController(chatId)!;
    
    const options: Options = {
      cwd: session.projectPath,
      ...(session.sessionId ? { resume: session.sessionId } : {}),
      ...(this.binaryPath ? { pathToClaudeCodeExecutable: this.binaryPath } : {}),
      abortController: controller,
      permissionMode: session.permissionMode,
      // New SDK requires explicit system prompt and settings configuration
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      settingSources: ['user', 'project', 'local'],
      canUseTool: async (toolName: string, input: Record<string, unknown>) => {
        try {
          // Inject chatId into input for PermissionManager use
          const inputWithChatId = { ...input, __chatId: chatId };
          const result = await this.permissionManager.canUseTool(toolName, inputWithChatId);
          return result;
        } catch (error) {
          return {
            behavior: 'deny',
            message: `Permission check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }
      },
    };

    // Start query
    this.sendMessage(chatId, stream, options);
  }

}