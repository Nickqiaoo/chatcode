import { Telegraf } from 'telegraf';
import { markdownv2 as format } from 'telegram-format';

export type PermissionResult =
  | {
    behavior: 'allow'
    updatedInput: Record<string, unknown>
  }
  | {
    behavior: 'deny'
    message: string
  }

export type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
) => Promise<PermissionResult>

interface PendingPermissionRequest {
  id: string;
  chatId: number;
  toolName: string;
  input: any;
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
  timestamp: Date;
}

export class PermissionManager {
  private bot: Telegraf;
  private pendingRequests: Map<string, PendingPermissionRequest> = new Map();

  constructor(bot: Telegraf) {
    this.bot = bot;
  }

  /**
   * Main permission check method for use by Claude Code SDK
   */
  async canUseTool(toolName: string, input: Record<string, unknown>): Promise<PermissionResult> {
    // Extract chatId from input, this needs to be passed when calling
    const chatId = (input as any).__chatId;
    if (!chatId) {
      return { behavior: 'deny', message: 'No chat ID provided for permission check' };
    }

    // Remove internal parameters
    const cleanInput = { ...input };
    delete (cleanInput as any).__chatId;

    return await this.requestUserPermission(chatId, toolName, cleanInput);
  }

  /**
   * Request permission from user
   */
  private async requestUserPermission(chatId: number, toolName: string, input: any): Promise<PermissionResult> {
    const requestId = this.generateRequestId();

    // Create Promise to wait for user response
    const permissionPromise = new Promise<boolean>((resolve, reject) => {
      const pendingRequest: PendingPermissionRequest = {
        id: requestId,
        chatId,
        toolName,
        input,
        resolve,
        reject,
        timestamp: new Date()
      };

      this.pendingRequests.set(requestId, pendingRequest);
    });

    try {
      // Send Telegram permission request
      await this.sendPermissionRequest(chatId, toolName, requestId);

      // Wait for user response
      const approved = await permissionPromise;

      return approved
        ? { behavior: 'allow' as const, updatedInput: input }
        : { behavior: 'deny' as const, message: 'Permission denied by user' };

    } catch (error) {
      return {
        behavior: 'deny',
        message: `Permission request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Send permission request to Telegram
   */
  private async sendPermissionRequest(chatId: number, toolName: string, requestId: string): Promise<void> {
    const message = `🔐 ${format.bold('Permission request')}

Tool: ${format.bold(toolName)}
Time: ${format.escape(new Date().toLocaleString('en-US'))}

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
      throw error;
    }
  }

  /**
   * Handle user permission callback
   */
  public async handleApprovalCallback(_chatId: number, callbackData: string): Promise<void> {
    const isApproved = callbackData.startsWith('approve_');
    const requestId = callbackData.replace(/^(approve_|deny_)/, '');

    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      return;
    }

    // Clean up request
    this.pendingRequests.delete(requestId);

    // Resolve Promise
    pendingRequest.resolve(isApproved);
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * Get the number of pending permission requests
   */
  public getPendingRequestsCount(): number {
    return this.pendingRequests.size;
  }
}
