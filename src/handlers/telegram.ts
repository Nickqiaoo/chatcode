import { Telegraf } from 'telegraf';
import { PermissionMode } from '../models/types';
import { IStorage } from '../storage/interface';
import { GitHubManager } from './github';
import { DirectoryManager } from './directory';
import { ClaudeManager } from './claude';
import { MessageFormatter } from '../utils/formatter';
import { message } from 'telegraf/filters';
import { Config } from '../config/config';
import { PermissionManager } from './permission-manager';

// Import handlers
import { CommandHandler } from './telegram/commands/command-handler';
import { CallbackHandler } from './telegram/callbacks/callback-handler';
import { MessageHandler } from './telegram/messages/message-handler';
import { ToolHandler } from './telegram/tools/tool-handler';
import { FileBrowserHandler } from './telegram/file-browser/file-browser-handler';
import { ProjectHandler } from './telegram/project/project-handler';

export class TelegramHandler {
  private bot: Telegraf;
  private github: GitHubManager;
  private directory: DirectoryManager;
  private storage: IStorage;
  private claudeSDK: ClaudeManager;
  private formatter: MessageFormatter;
  private config: Config;
  private permissionManager: PermissionManager;
  
  // Handlers
  private commandHandler: CommandHandler;
  private callbackHandler: CallbackHandler;
  private messageHandler: MessageHandler;
  private toolHandler: ToolHandler;
  private fileBrowserHandler: FileBrowserHandler;
  private projectHandler: ProjectHandler;

  constructor(
    bot: Telegraf,
    github: GitHubManager,
    directory: DirectoryManager,
    claudeSDK: ClaudeManager,
    storage: IStorage,
    formatter: MessageFormatter,
    config: Config,
    permissionManager: PermissionManager
  ) {
    this.bot = bot;
    this.github = github;
    this.directory = directory;
    this.storage = storage;
    this.claudeSDK = claudeSDK;
    this.formatter = formatter;
    this.config = config;
    this.permissionManager = permissionManager;

    // Initialize handlers
    this.commandHandler = new CommandHandler(this.storage, this.formatter, this.claudeSDK, this.config, this.bot);
    this.projectHandler = new ProjectHandler(this.storage, this.github, this.directory, this.formatter, this.bot);
    this.messageHandler = new MessageHandler(this.storage, this.github, this.formatter, this.claudeSDK, this.projectHandler, this.bot);
    this.toolHandler = new ToolHandler(this.storage, this.formatter, this.config, this.bot, this.claudeSDK);
    this.fileBrowserHandler = new FileBrowserHandler(this.storage, this.directory, this.formatter, this.config, this.bot);
    this.callbackHandler = new CallbackHandler(this.formatter, this.projectHandler, this.storage, this.fileBrowserHandler, this.bot, this.permissionManager);


    this.setupHandlers();
  }

  public async handleClaudeResponse(userId: string, message: any, toolInfo?: { toolId: string; toolName: string; isToolUse: boolean; isToolResult: boolean }, parentToolUseId?: string): Promise<void> {
    const chatId = parseInt(userId);
    if (isNaN(chatId)) return;

    // If message is null, this indicates completion
    if (!message) {
      return;
    }

    await this.handleClaudeMessage(chatId, message, toolInfo, parentToolUseId);
  }

  public async handleClaudeError(userId: string, error: string): Promise<void> {
    const chatId = parseInt(userId);
    if (isNaN(chatId)) return;

    try {
      await this.bot.telegram.sendMessage(
        chatId,
        this.formatter.formatError(`Claude Error: ${error}`),
        { parse_mode: 'MarkdownV2' }
      );
    } catch (error) {
      console.error('Error sending error message:', error);
    }
  }


  private setupHandlers(): void {
    // Command handlers
    this.bot.start((ctx) => this.commandHandler.handleStart(ctx));
    this.bot.command('createproject', (ctx) => this.commandHandler.handleCreateProject(ctx));
    this.bot.command('listproject', (ctx) => this.commandHandler.handleListProject(ctx));
    this.bot.command('exitproject', (ctx) => this.commandHandler.handleExitProject(ctx));

    this.bot.command('help', (ctx) => this.commandHandler.handleHelp(ctx));
    this.bot.command('status', (ctx) => this.commandHandler.handleStatus(ctx));
    this.bot.command('ls', (ctx) => this.fileBrowserHandler.handleLsCommand(ctx));
    this.bot.command('auth', (ctx) => this.commandHandler.handleAuth(ctx));

    this.bot.command('abort', (ctx) => this.commandHandler.handleAbort(ctx));
    this.bot.command('clear', (ctx) => this.commandHandler.handleClear(ctx));

    // Permission mode commands
    this.bot.command('default', (ctx) => this.commandHandler.handlePermissionModeChange(ctx, PermissionMode.Default));
    this.bot.command('acceptedits', (ctx) => this.commandHandler.handlePermissionModeChange(ctx, PermissionMode.AcceptEdits));
    this.bot.command('plan', (ctx) => this.commandHandler.handlePermissionModeChange(ctx, PermissionMode.Plan));
    this.bot.command('bypass', (ctx) => this.commandHandler.handlePermissionModeChange(ctx, PermissionMode.BypassPermissions));

    // Text message handler
    this.bot.on(message('text'), (ctx) => this.messageHandler.handleTextMessage(ctx));

    this.bot.on('callback_query', (ctx) => this.callbackHandler.handleCallback(ctx));
  }

  public async handleClaudeMessage(chatId: number, message: any, toolInfo?: { toolId: string; toolName: string; isToolUse: boolean; isToolResult: boolean }, parentToolUseId?: string): Promise<void> {
    const user = await this.storage.getUserSession(chatId);
    if (!user || !user.sessionId) return;

    if (toolInfo) {
      if (toolInfo.isToolUse) {
        await this.toolHandler.handleToolUse(chatId, message, toolInfo, user, parentToolUseId);
        return;
      }
      if (toolInfo.isToolResult) {
        await this.toolHandler.handleToolResult(chatId, message, toolInfo, user, parentToolUseId);
        return;
      }
    }

    await this.messageHandler.handleRegularMessage(chatId, message, user.permissionMode);
  }

  public async cleanup(): Promise<void> {
    try {
      console.log('TelegramHandler cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}