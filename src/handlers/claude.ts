import { query, type Options, AbortError, type SDKUserMessage } from '@anthropic-ai/claude-code';
import { IStorage } from '../storage/interface';
import { TargetTool } from '../models/types';
import { PermissionManager } from './permission-manager';

export class ClaudeManager {
  private storage: IStorage;
  private permissionManager: PermissionManager;
  private abortControllers: Map<number, AbortController> = new Map();
  private onClaudeResponse: (userId: string, message: any, toolInfo?: { toolId: string; toolName: string; isToolUse: boolean; isToolResult: boolean }, parentToolUseId?: string) => Promise<void>;
  private onClaudeError: (userId: string, error: string) => void;

  constructor(
    storage: IStorage,
    permissionManager: PermissionManager,
    callbacks: {
      onClaudeResponse: (userId: string, message: any, toolInfo?: { toolId: string; toolName: string; isToolUse: boolean; isToolResult: boolean }, parentToolUseId?: string) => Promise<void>;
      onClaudeError: (userId: string, error: string) => void;
    }
  ) {
    this.storage = storage;
    this.permissionManager = permissionManager;
    this.onClaudeResponse = callbacks.onClaudeResponse;
    this.onClaudeError = callbacks.onClaudeError;
  }


  async sendMessageBatched(chatId: number, prompt: string): Promise<void> {
    // Construct options for batched messages
    const session = await this.storage.getUserSession(chatId);
    if (!session) {
      console.error(`[ClaudeManager] No session found for chatId: ${chatId}`);
      return;
    }

    // Create AsyncIterable for user message
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
      session_id: '' // Let SDK manage session_id itself
    };

    // Create a new controller for each query
    const abortController = new AbortController();
    this.abortControllers.set(chatId, abortController);

    // Create AsyncIterable - Important: don't let it end, otherwise streamToStdin will close stdin
    const promptIterable = (async function* () {
      yield userMessage;

      // Keep stream open, wait for abort signal
      while (!abortController.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    })();

    const options: Options = {
      cwd: session.projectPath,
      ...(session.sessionId ? { resume: session.sessionId } : {}),
      abortController: abortController,
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

    await this.sendMessage(chatId, promptIterable, options);
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
      this.abortControllers.delete(chatId);

      // Signal completion with null message to indicate completion
      this.onClaudeResponse(chatId.toString(), null, undefined, undefined);
    }

    await this.storage.updateSessionActivity(userSession);
  }

  async abortQuery(chatId: number): Promise<boolean> {
    const controller = this.abortControllers.get(chatId);
    if (controller) {
      // Abort the controller for this chatId
      controller.abort();
      this.abortControllers.delete(chatId);
      return true;
    }
    return false;
  }

  isQueryRunning(chatId: number): boolean {
    return this.abortControllers.has(chatId);
  }

  async shutdown(): Promise<void> {
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

}