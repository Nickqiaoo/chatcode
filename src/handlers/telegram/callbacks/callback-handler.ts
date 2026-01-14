import { Context, Telegraf } from 'telegraf';
import { IStorage } from '../../../storage/interface';
import { MessageFormatter } from '../../../utils/formatter';
import { ProjectHandler } from '../project/project-handler';
import { FileBrowserHandler } from '../file-browser/file-browser-handler';
import { UserState } from '../../../models/types';
import { PermissionManager } from '../../permission-manager';
import { ClaudeSessionReader } from '../../../utils/claude-session-reader';

export class CallbackHandler {
  private sessionReader: ClaudeSessionReader;

  constructor(
    private formatter: MessageFormatter,
    private projectHandler: ProjectHandler,
    private storage: IStorage,
    private fileBrowserHandler: FileBrowserHandler,
    private bot: Telegraf,
    private permissionManager: PermissionManager
  ) {
    this.sessionReader = new ClaudeSessionReader();
  }

  async handleCallback(ctx: Context): Promise<void> {
    if (!ctx.callbackQuery || !ctx.chat) return;
    if (!('data' in ctx.callbackQuery)) return;

    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat.id;
    const messageId = ctx.callbackQuery?.message?.message_id;

    await ctx.answerCbQuery();

    if (data?.startsWith('project_type_')) {
      await this.projectHandler.handleProjectTypeSelection(data, chatId);
    } else if (data?.startsWith('project_select_')) {
      await this.handleProjectSelection(data, chatId, messageId);
    } else if (data?.startsWith('claude_project_')) {
      await this.handleClaudeProjectSelection(data, chatId, messageId);
    } else if (data?.startsWith('session_select_')) {
      await this.handleSessionSelection(data, chatId, messageId);
    } else if (data === 'cancel') {
      await this.handleCancelCallback(chatId, messageId);
    } else if (data?.startsWith('approve_') || data?.startsWith('deny_')) {
      await this.handleMCPApprovalCallback(data, chatId, messageId);
    } else if (data?.startsWith('file:') || data?.startsWith('directory:') || data?.startsWith('nav:')) {
      await this.fileBrowserHandler.handleFileBrowsingCallback(data, chatId, messageId);
    }
  }

  private async handleMCPApprovalCallback(data: string, chatId: number, messageId?: number): Promise<void> {
    try {
      await this.permissionManager.handleApprovalCallback(chatId, data);

      const isApproved = data.startsWith('approve_');
      const message = isApproved ? '✅ Operation approved' : '❌ Operation denied';
      await this.bot.telegram.sendMessage(chatId, message);

      if (messageId) {
        await this.bot.telegram.deleteMessage(chatId, messageId);
      }
    } catch (error) {
      console.error('Error handling approval callback:', error);
      await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('Error handling permission response'), { parse_mode: 'MarkdownV2' });
    }
  }

  private async handleClaudeProjectSelection(data: string, chatId: number, messageId?: number): Promise<void> {
    try {
      const shortId = data.replace('claude_project_', '');
      const user = await this.storage.getUserSession(chatId);

      if (!user) {
        await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('No user session found. Please auth first or /start.'), { parse_mode: 'MarkdownV2' });
        return;
      }

      // Find the full project from Claude projects list
      const projects = await this.sessionReader.listAllProjects(50);
      const project = projects.find(p => p.id === shortId || p.id.endsWith(shortId));

      if (!project) {
        await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('Project not found.'), { parse_mode: 'MarkdownV2' });
        return;
      }

      // Set active project using the project path
      user.setActiveProject(project.id, project.path);
      user.setState(UserState.InSession);
      user.setActive(true);
      // Clear previous session ID to start fresh
      delete user.sessionId;
      await this.storage.saveUserSession(user);

      // Delete the project list message
      if (messageId) {
        try {
          await this.bot.telegram.deleteMessage(chatId, messageId);
        } catch (error) {
          console.error('Could not delete message:', error);
        }
      }

      await this.bot.telegram.sendMessage(
        chatId,
        `🚀 Selected project "${project.name}".\n📂 Path: ${project.path}\n\nYou can now chat with Claude Code!`
      );
    } catch (error) {
      console.error('Error handling Claude project selection:', error);
      await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('Failed to select project. Please try again.'), { parse_mode: 'MarkdownV2' });
    }
  }

  private async handleSessionSelection(data: string, chatId: number, messageId?: number): Promise<void> {
    try {
      const sessionId = data.replace('session_select_', '');
      const user = await this.storage.getUserSession(chatId);

      if (!user) {
        await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('No user session found. Please auth first or /start.'), { parse_mode: 'MarkdownV2' });
        return;
      }

      // Set the Claude Code session ID to resume
      user.sessionId = sessionId;
      user.setState(UserState.InSession);
      user.setActive(true);
      await this.storage.saveUserSession(user);

      // Delete the session list message
      if (messageId) {
        try {
          await this.bot.telegram.deleteMessage(chatId, messageId);
        } catch (error) {
          console.error('Could not delete message:', error);
        }
      }

      await this.bot.telegram.sendMessage(
        chatId,
        `🔄 Session resumed! You can continue your conversation with Claude Code.\n\nSession ID: \`${sessionId.substring(0, 8)}...\``,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Error handling session selection:', error);
      await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('Failed to resume session. Please try again.'), { parse_mode: 'MarkdownV2' });
    }
  }

  private async handleProjectSelection(data: string, chatId: number, messageId?: number): Promise<void> {
    try {
      const projectId = data.replace('project_select_', '');
      const user = await this.storage.getUserSession(chatId);
      
      if (!user) {
        await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('No user session found. Please auth first or /start.'), { parse_mode: 'MarkdownV2' });
        return;
      }

      const project = await this.storage.getProject(projectId, chatId);
      if (!project) {
        await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('Project not found.'), { parse_mode: 'MarkdownV2' });
        return;
      }

      // Set active project and update session
      user.setActiveProject(projectId, project.localPath);
      user.setState(UserState.InSession);
      user.setActive(true);
      // Clear previous session ID to start fresh
      delete user.sessionId;
      await this.storage.saveUserSession(user);

      // Update project last accessed time
      await this.storage.updateProjectLastAccessed(projectId, chatId);

      // Delete the project list message
      if (messageId) {
        try {
          await this.bot.telegram.deleteMessage(chatId, messageId);
        } catch (error) {
          console.error('Could not delete message:', error);
        }
      }

      await this.bot.telegram.sendMessage(
        chatId, 
        `🚀 Selected project "${project.name}". You can now chat with Claude Code!`
      );
    } catch (error) {
      console.error('Error handling project selection:', error);
      await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('Failed to select project. Please try again.'), { parse_mode: 'MarkdownV2' });
    }
  }


  private async handleCancelCallback(chatId: number, messageId?: number): Promise<void> {
    try {
      // Delete the message with inline keyboard
      if (messageId) {
        await this.bot.telegram.deleteMessage(chatId, messageId);
      }
      
      await this.bot.telegram.sendMessage(chatId, '❌ Operation cancelled.');
    } catch (error) {
      console.error('Error handling cancel callback:', error);
    }
  }
}