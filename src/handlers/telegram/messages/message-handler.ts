import { Context, Telegraf } from 'telegraf';
import { UserSessionModel } from '../../../models/user-session';
import { UserState, PermissionMode } from '../../../models/types';
import { IStorage } from '../../../storage/interface';
import { GitHubManager } from '../../github';
import { MessageFormatter } from '../../../utils/formatter';
import { MESSAGES } from '../../../constants/messages';
import { ClaudeManager } from '../../claude';
import { ProjectHandler } from '../project/project-handler';
import { TelegramSender } from '../../../services/telegram-sender';
import { KeyboardFactory } from '../keyboards/keyboard-factory';
import { Config } from '../../../config/config';

export class MessageHandler {
  private telegramSender: TelegramSender;

  constructor(
    private storage: IStorage,
    private github: GitHubManager,
    private formatter: MessageFormatter,
    private claudeSDK: ClaudeManager,
    private projectHandler: ProjectHandler,
    private bot: Telegraf,
    private config: Config
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
      await ctx.reply('Processing...', KeyboardFactory.createCompletionKeyboard());
      await this.claudeSDK.addMessageToStream(user.chatId, text);
    } catch (error) {
      await ctx.reply(this.formatter.formatError(MESSAGES.ERRORS.SEND_INPUT_FAILED(error instanceof Error ? error.message : 'Unknown error')), { parse_mode: 'MarkdownV2' });
    }
  }

  async handlePhotoMessage(ctx: Context): Promise<void> {
    if (!ctx.chat || !ctx.message || !('photo' in ctx.message)) return;
    const chatId = ctx.chat.id;

    const user = await this.storage.getUserSession(chatId);
    if (!user) {
      await this.sendHelp(ctx);
      return;
    }

    if (user.state !== UserState.InSession) {
      await ctx.reply(this.formatter.formatError('You must be in an active session to send images.'), { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      // Get the largest photo (last element)
      const photos = ctx.message.photo;
      const photo = photos[photos.length - 1]!;
      const fileLink = await ctx.telegram.getFileLink(photo.file_id);

      const response = await fetch(fileLink.toString());
      const arrayBuffer = await response.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');

      const caption = 'caption' in ctx.message ? (ctx.message.caption as string) : undefined;

      await ctx.reply('Processing image...', KeyboardFactory.createCompletionKeyboard());
      await this.claudeSDK.addImageMessageToStream(chatId, base64Data, 'image/jpeg', caption);
    } catch (error) {
      await ctx.reply(this.formatter.formatError('Failed to process image. Please try again.'), { parse_mode: 'MarkdownV2' });
      console.error('Error processing photo:', error);
    }
  }

  async handleVoiceMessage(ctx: Context): Promise<void> {
    if (!ctx.chat || !ctx.message || !('voice' in ctx.message)) return;
    const chatId = ctx.chat.id;

    const user = await this.storage.getUserSession(chatId);
    if (!user) {
      await this.sendHelp(ctx);
      return;
    }

    if (user.state !== UserState.InSession) {
      await ctx.reply(this.formatter.formatError('You must be in an active session to send voice messages.'), { parse_mode: 'MarkdownV2' });
      return;
    }

    if (!this.config.asr.enabled) {
      await ctx.reply(this.formatter.formatError('Voice message is not supported. ASR service is not enabled.'), { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
      const audioResponse = await fetch(fileLink.toString());
      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer]), 'voice.ogg');

      const asrResponse = await fetch(`${this.config.asr.endpoint}/asr`, {
        method: 'POST',
        body: formData,
      });

      if (!asrResponse.ok) {
        throw new Error(`ASR service returned ${asrResponse.status}`);
      }

      const result = await asrResponse.json() as { text: string };
      const text = result.text;

      if (!text) {
        await ctx.reply('Could not recognize speech from the voice message.');
        return;
      }

      await ctx.reply(`Speech recognized: ${text}`, KeyboardFactory.createCompletionKeyboard());
      await this.claudeSDK.addMessageToStream(chatId, text);
    } catch (error) {
      await ctx.reply(this.formatter.formatError('Failed to process voice message. Please try again.'), { parse_mode: 'MarkdownV2' });
      console.error('Error processing voice message:', error);
    }
  }

  async handleRegularMessage(chatId: number, message: any, permissionMode?: PermissionMode): Promise<void> {
    await this.sendFormattedMessage(chatId, message, permissionMode);
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