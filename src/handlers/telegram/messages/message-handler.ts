import { Context, Telegraf } from 'telegraf';
import { UserSessionModel } from '../../../models/user-session';
import { UserState, PermissionMode } from '../../../models/types';
import { IStorage } from '../../../storage/interface';
import { GitHubManager } from '../../github';
import { MessageFormatter } from '../../../utils/formatter';
import { MESSAGES } from '../../../constants/messages';
import { MessageBatcher } from '../../../queue/message-batcher';
import { ProjectHandler } from '../project/project-handler';
import { TelegramSender } from '../../../services/telegram-sender';
import { parse } from 'path';
import { parse_mode } from 'telegram-format/dist/html';

export class MessageHandler {
  private telegramSender: TelegramSender;

  constructor(
    private storage: IStorage,
    private github: GitHubManager,
    private formatter: MessageFormatter,
    private messageBatcher: MessageBatcher,
    private projectHandler: ProjectHandler,
    private bot: Telegraf
  ) {
    this.telegramSender = new TelegramSender(bot);
  }

  async handleTextMessage(ctx: Context): Promise<void> {
    if (!ctx.chat || !ctx.message || !('text' in ctx.message)) return;
    const chatId = ctx.chat.id;
    const text = ctx.message.text;

    const user = await this.storage.getUserSession(chatId);
    if (!user) {
      await this.sendHelp(ctx);
      return;
    }

    switch (user.state) {
      case UserState.WaitingRepo:
        await this.projectHandler.handleRepoInput(ctx, user, text);
        break;
      case UserState.WaitingDirectory:
        await this.projectHandler.handleDirectoryInput(ctx, user, text);
        break;
      case UserState.InSession:
        await this.handleSessionInput(ctx, user, text);
        break;
      default:
        if (this.github.isGitHubURL(text)) {
          await this.projectHandler.startProjectCreation(ctx, user, text);
        } else {
          await this.sendHelp(ctx);
        }
    }
  }

  async handleSessionInput(ctx: Context, user: UserSessionModel, text: string): Promise<void> {
    try {
      await ctx.reply('Processing...');
      this.messageBatcher.addMessage(user.chatId, text);
    } catch (error) {
      await ctx.reply(this.formatter.formatError(MESSAGES.ERRORS.SEND_INPUT_FAILED(error instanceof Error ? error.message : 'Unknown error')), { parse_mode: 'MarkdownV2' });
    }
  }

  async handleRegularMessage(chatId: number, message: any, permissionMode?: PermissionMode): Promise<void> {
    await this.processLegacyToolMapping(chatId, message);
    await this.sendFormattedMessage(chatId, message, permissionMode);
  }

  private async processLegacyToolMapping(chatId: number, message: any): Promise<void> {
    if (message.type !== 'assistant' || !message.message.content) return;

    for (const content of message.message.content) {
      if (content.type === 'tool_use' && content.id) {
        await this.storage.storeToolUseMapping(content.id, chatId, content.name || undefined, content.input);
      }
    }
  }

  async sendFormattedMessage(chatId: number, message: any, permissionMode?: PermissionMode): Promise<void> {
    try {
      const formattedMessage = await this.formatter.formatClaudeMessage(message, permissionMode);
      if (formattedMessage) {
        await this.telegramSender.safeSendMessage(chatId, formattedMessage);
      }
    } catch (error) {
      console.error('Error handling Claude message:', error);
    }
  }

  private async sendHelp(ctx: Context): Promise<void> {
    const helpText = MESSAGES.HELP_TEXT;
    await ctx.reply(helpText);
  }

}