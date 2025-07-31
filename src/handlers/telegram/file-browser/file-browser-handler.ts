import { Context, Markup, Telegraf } from 'telegraf';
import { UserState, FileBrowsingState } from '../../../models/types';
import { IStorage } from '../../../storage/interface';
import { DirectoryManager } from '../../directory';
import { MessageFormatter } from '../../../utils/formatter';
import { Config } from '../../../config/config';
import { KeyboardFactory } from '../keyboards/keyboard-factory';
import { AuthService } from '../../../services/auth-service';
import * as path from 'path';
import { TelegramSender } from '../../../services/telegram-sender';

export class FileBrowserHandler {
  private fileBrowsingStates: Map<number, FileBrowsingState> = new Map();
  private authService: AuthService;
  private telegramSender: TelegramSender;

  constructor(
    private storage: IStorage,
    private directory: DirectoryManager,
    private formatter: MessageFormatter,
    private config: Config,
    private bot: Telegraf
  ) {
    this.authService = new AuthService(config);
    this.telegramSender = new TelegramSender(bot);
  }

  async handleLsCommand(ctx: Context): Promise<void> {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const user = await this.storage.getUserSession(chatId);

    // Check if user exists and is in session
    if (!user || user.state !== UserState.InSession) {
      await ctx.reply(this.formatter.formatError('Please create a project first to browse files.'), { parse_mode: 'MarkdownV2' });
      return;
    }

    // Check authentication for sensitive operations
    if (!this.authService.isUserAuthenticated(user)) {
      await ctx.reply(this.formatter.formatError(this.authService.getAuthErrorMessage()), { parse_mode: 'MarkdownV2' });
      return;
    }

    if (!user.activeProject) {
      await ctx.reply(this.formatter.formatError('No active project.'), { parse_mode: 'MarkdownV2' });
      return;
    }

    const activeProject = await this.storage.getProject(user.activeProject, chatId);
    if (!activeProject || !activeProject.localPath) {
      await ctx.reply(this.formatter.formatError('Active project not found.'), { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      // List directory contents
      const items = await this.directory.listDirectoryContents(activeProject.localPath, activeProject.localPath);

      // Initialize browsing state
      const browsingState: FileBrowsingState = {
        currentPath: activeProject.localPath,
        basePath: activeProject.localPath,
        currentPage: 1,
        itemsPerPage: 12,
        totalItems: items.length,
        items
      };

      // Store browsing state temporarily
      this.fileBrowsingStates.set(chatId, browsingState);

      // Send directory listing
      await this.sendDirectoryListing(chatId, browsingState);
    } catch (error) {
      await ctx.reply(this.formatter.formatError(`Failed to access directory: ${error instanceof Error ? error.message : 'Unknown error'}`), { parse_mode: 'MarkdownV2' });
    }
  }

  async handleFileBrowsingCallback(data: string, chatId: number, messageId?: number): Promise<void> {
    const browsingState = this.fileBrowsingStates.get(chatId);
    if (!browsingState) {
      await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('File browsing session has expired, please use /ls command again'), { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      if (data.startsWith('file:')) {
        // Handle file click
        const fileName = decodeURIComponent(data.substring(5));
        await this.handleFileClick(chatId, browsingState.currentPath, fileName);
      } else if (data.startsWith('directory:')) {
        // Handle directory click
        const dirName = decodeURIComponent(data.substring(10));
        await this.handleDirectoryClick(chatId, browsingState, dirName, messageId);
      } else if (data.startsWith('nav:')) {
        // Handle navigation
        await this.handleNavigation(chatId, browsingState, data.substring(4), messageId);
      }
    } catch (error) {
      await this.bot.telegram.sendMessage(chatId, this.formatter.formatError(`Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { parse_mode: 'MarkdownV2' });
    }
  }

  private async handleFileClick(chatId: number, currentPath: string, fileName: string): Promise<void> {
    if (!this.config.workers.enabled || !this.config.workers.endpoint) {
      await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('File viewing feature is not enabled or configured'), { parse_mode: 'MarkdownV2' });
      return;
    }

    const filePath = path.join(currentPath, fileName);

    try {
      // Check if file is readable
      if (!(await this.directory.isFileReadable(filePath))) {
        await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('This file cannot be read (may be a binary file or too large)'), { parse_mode: 'MarkdownV2' });
        return;
      }

      // Read file content
      const content = await this.directory.readFileContent(filePath);
      if (!content) {
        await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('Unable to read file content'), { parse_mode: 'MarkdownV2' });
        return;
      }

      // Upload to workers
      const language = this.directory.detectLanguage(fileName);
      const uploadData = {
        content,
        filename: fileName,
        language,
        chatid: chatId.toString()
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.config.workers.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.workers.apiKey}`;
      }

      const response = await fetch(`${this.config.workers.endpoint}/api/file`, {
        method: 'POST',
        headers,
        body: JSON.stringify(uploadData)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as { id: string };
      const miniAppUrl = `${this.config.workers.endpoint}/file?id=${result.id}`;

      // Create WebApp button
      const keyboard = Markup.inlineKeyboard([
        Markup.button.webApp('📄 View File', miniAppUrl)
      ]);

      await this.telegramSender.safeSendMessage(
        chatId,
        `📄 **${fileName}**\n\nClick the button below to view file content`,
        keyboard
      );
    } catch (error) {
      await this.bot.telegram.sendMessage(chatId, this.formatter.formatError(`File processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { parse_mode: 'MarkdownV2' });
    }
  }

  private async handleDirectoryClick(chatId: number, browsingState: FileBrowsingState, dirName: string, messageId?: number): Promise<void> {
    const newPath = path.join(browsingState.currentPath, dirName);

    // Validate that the new path is within the base path
    if (!this.directory.isPathWithinBase(newPath, browsingState.basePath)) {
      await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('Access denied: cannot access paths outside the project directory'), { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      // List new directory contents
      const items = await this.directory.listDirectoryContents(newPath, browsingState.basePath);

      // Update browsing state
      const newBrowsingState: FileBrowsingState = {
        currentPath: newPath,
        basePath: browsingState.basePath,
        currentPage: 1,
        itemsPerPage: browsingState.itemsPerPage,
        totalItems: items.length,
        items
      };

      // Update browsing state in memory
      this.fileBrowsingStates.set(chatId, newBrowsingState);

      // Update the message
      if (messageId) {
        await this.updateDirectoryListing(chatId, messageId, newBrowsingState);
      } else {
        await this.sendDirectoryListing(chatId, newBrowsingState);
      }
    } catch (error) {
      await this.bot.telegram.sendMessage(chatId, this.formatter.formatError(`Failed to access directory: ${error instanceof Error ? error.message : 'Unknown error'}`), { parse_mode: 'MarkdownV2' });
    }
  }

  private async handleNavigation(chatId: number, browsingState: FileBrowsingState, action: string, messageId?: number): Promise<void> {
    try {
      let newBrowsingState = browsingState;

      if (action === 'parent') {
        // Go to parent directory
        const parentPath = path.dirname(browsingState.currentPath);

        // Validate that the parent path is within the base path
        if (parentPath !== browsingState.currentPath && this.directory.isPathWithinBase(parentPath, browsingState.basePath)) {
          const items = await this.directory.listDirectoryContents(parentPath, browsingState.basePath);
          newBrowsingState = {
            currentPath: parentPath,
            basePath: browsingState.basePath,
            currentPage: 1,
            itemsPerPage: browsingState.itemsPerPage,
            totalItems: items.length,
            items
          };
        } else if (parentPath !== browsingState.currentPath) {
          // Parent directory is outside allowed base path
          await this.bot.telegram.sendMessage(chatId, this.formatter.formatError('Already at project root directory, cannot access parent directory'), { parse_mode: 'MarkdownV2' });
          return;
        }
      } else if (action === 'refresh') {
        // Refresh current directory
        const items = await this.directory.listDirectoryContents(browsingState.currentPath, browsingState.basePath);
        newBrowsingState = {
          ...browsingState,
          totalItems: items.length,
          items
        };
      } else if (action.startsWith('page:')) {
        // Page navigation
        const page = parseInt(action.substring(5));
        newBrowsingState = {
          ...browsingState,
          currentPage: page
        };
      } else if (action === 'close') {
        // Close file browser
        this.fileBrowsingStates.delete(chatId);

        if (messageId) {
          await this.bot.telegram.deleteMessage(chatId, messageId);
        }
        await this.bot.telegram.sendMessage(chatId, 'File browser closed');
        return;
      }

      // Update browsing state in memory
      this.fileBrowsingStates.set(chatId, newBrowsingState);

      // Update the message
      if (messageId) {
        await this.updateDirectoryListing(chatId, messageId, newBrowsingState);
      } else {
        await this.sendDirectoryListing(chatId, newBrowsingState);
      }
    } catch (error) {
      await this.bot.telegram.sendMessage(chatId, this.formatter.formatError(`Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`), { parse_mode: 'MarkdownV2' });
    }
  }

  private async sendDirectoryListing(chatId: number, browsingState: FileBrowsingState): Promise<void> {
    const message = this.formatDirectoryMessage(browsingState);
    const keyboard = KeyboardFactory.createDirectoryKeyboard(browsingState);

    const sentMessage = await this.telegramSender.safeSendMessage(chatId, message, keyboard);

    // Update browsing state with message ID
    const updatedState = { ...browsingState, messageId: sentMessage.message_id };
    this.fileBrowsingStates.set(chatId, updatedState);
  }

  private async updateDirectoryListing(chatId: number, messageId: number, browsingState: FileBrowsingState): Promise<void> {
    const message = this.formatDirectoryMessage(browsingState);
    const keyboard = KeyboardFactory.createDirectoryKeyboard(browsingState);

    try {
      await this.telegramSender.safeEditMessage(chatId, messageId, message, keyboard);
    } catch (error) {
      // If edit fails, send new message
      await this.sendDirectoryListing(chatId, browsingState);
    }
  }

  private formatDirectoryMessage(browsingState: FileBrowsingState): string {
    const { currentPath, currentPage, itemsPerPage, totalItems, items } = browsingState;

    // Get relative path for display
    const displayPath = currentPath.replace(process.cwd(), '').replace(/^\/+/, '') || '/';

    // Calculate pagination
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const pageItems = items.slice(startIndex, endIndex);

    let message = `📁 **${displayPath}**\n\n`;

    if (totalPages > 1) {
      message += `📄 Page ${currentPage}/${totalPages}\n`;
    }

    const dirCount = items.filter(item => item.type === 'directory').length;
    const fileCount = items.filter(item => item.type === 'file').length;
    message += `📊 ${dirCount} directories, ${fileCount} files\n\n`;

    // Add items
    if (pageItems.length === 0) {
      message += '_Directory is empty_';
    } else {
      for (const item of pageItems) {
        const icon = item.icon;
        const name = item.name;
        message += `${icon} ${name}\n`;
      }
    }

    return message;
  }

}