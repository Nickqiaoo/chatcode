import { Context } from 'telegraf';
import { UserSessionModel } from '../../../models/user-session';
import { UserState, PermissionMode } from '../../../models/types';
import { IStorage } from '../../../storage/interface';
import { MessageFormatter } from '../../../utils/formatter';
import { MESSAGES } from '../../../constants/messages';
import { KeyboardFactory } from '../keyboards/keyboard-factory';
import { ClaudeManager } from '../../claude';
import { AuthService } from '../../../services/auth-service';
import { Config } from '../../../config/config';
import { TelegramSender } from '../../../services/telegram-sender';

export class CommandHandler {
  private authService: AuthService;
  private telegramSender: TelegramSender;

  constructor(
    private storage: IStorage,
    private formatter: MessageFormatter,
    private claudeSDK: ClaudeManager,
    private config: Config,
    private bot: any
  ) {
    this.authService = new AuthService(config);
    this.telegramSender = new TelegramSender(bot);
  }

  async handleStart(ctx: Context): Promise<void> {
    if (!ctx.chat) return;

    await this.telegramSender.safeSendMessage(ctx.chat.id, MESSAGES.WELCOME_TEXT);
  }

  async handleCreateProject(ctx: Context): Promise<void> {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const user = await this.storage.getUserSession(chatId);

    if (!user) {
      await ctx.reply(this.formatter.formatError(MESSAGES.ERRORS.USER_NOT_INITIALIZED), { parse_mode: 'MarkdownV2' });
      return;
    }

    if (user.state !== UserState.Idle) {
      await ctx.reply(this.formatter.formatError(MESSAGES.ERRORS.COMPLETE_CURRENT_OPERATION), { parse_mode: 'MarkdownV2' });
      return;
    }

    // Check authentication for sensitive operations
    if (!this.authService.isUserAuthenticated(user)) {
      await ctx.reply(this.formatter.formatError(this.authService.getAuthErrorMessage()), { parse_mode: 'MarkdownV2' });
      return;
    }

    user.setState(UserState.WaitingProjectType);
    await this.storage.saveUserSession(user);

    await ctx.reply(MESSAGES.CREATE_PROJECT_TEXT, KeyboardFactory.createProjectTypeKeyboard());
  }

  async handleListProject(ctx: Context): Promise<void> {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const user = await this.storage.getUserSession(chatId);

    if (!user) {
      await ctx.reply(this.formatter.formatError('No user session found. Please start with /start.'), { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      const projects = await this.storage.getUserProjects(chatId);
      
      if (projects.length === 0) {
        await ctx.reply('📋 You have no projects yet.\n\nUse /createproject to create your first project!');
        return;
      }

      const listText = `📋 Your Projects (${projects.length})\n\nSelect a project to work with:`;
      await ctx.reply(listText, KeyboardFactory.createProjectListKeyboard(projects));
    } catch (error) {
      await ctx.reply(this.formatter.formatError('Failed to load projects. Please try again.'), { parse_mode: 'MarkdownV2' });
      console.error('Error loading projects:', error);
    }
  }

  async handleExitProject(ctx: Context): Promise<void> {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const user = await this.storage.getUserSession(chatId);

    if (!user) {
      await ctx.reply(this.formatter.formatError('No user session found.'), { parse_mode: 'MarkdownV2' });
      return;
    }

    if (user.state === UserState.Idle || !user.activeProject) {
      await ctx.reply(this.formatter.formatError('No active project to exit.'), { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      // Get project name from storage
      const project = await this.storage.getProject(user.activeProject, chatId);
      const projectName = project?.name || 'Unknown Project';
      
      // Clean up active streams before ending session
      this.claudeSDK.abortQuery(chatId);
      
      user.endSession();
      user.clearActiveProject();
      user.setState(UserState.Idle);
      await this.storage.saveUserSession(user);
      
      await ctx.reply(`👋 Exited project "${projectName}". You can create a new project or select another one.`);
    } catch (error) {
      await ctx.reply(this.formatter.formatError('Failed to exit project. Please try again.'), { parse_mode: 'MarkdownV2' });
      console.error('Error exiting project:', error);
    }
  }

  async handleHelp(ctx: Context): Promise<void> {
    if (!ctx.chat) return;

    await this.telegramSender.safeSendMessage(ctx.chat.id, MESSAGES.HELP_TEXT);
  }


  async handleStatus(ctx: Context): Promise<void> {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const user = await this.storage.getUserSession(chatId);

    if (!user) {
      await ctx.reply(this.formatter.formatError(MESSAGES.ERRORS.USER_NOT_INITIALIZED), { parse_mode: 'MarkdownV2' });
      return;
    }

    const session = await this.storage.getUserSession(chatId);
    const sessionStatus = session?.active ? 'Active' : 'Inactive';
    
    // Get project count and details from storage
    const projects = await this.storage.getUserProjects(chatId);
    const projectCount = projects.length;
    
    // Get active project details
    let activeProjectName = 'None';
    let activeProjectType = 'None';
    let activeProjectPath = 'None';
    
    if (user.activeProject) {
      try {
        const project = await this.storage.getProject(user.activeProject, chatId);
        if (project) {
          activeProjectName = project.name;
          activeProjectType = project.repoUrl ? 'GitHub Repository' : 'Local Directory';
          activeProjectPath = project.localPath || 'Unknown';
        }
      } catch (error) {
        console.error('Error getting active project details:', error);
      }
    }

    // Authentication status
    const authStatus = this.authService.isSecretRequired() 
      ? (user.isAuthenticated() ? 'Authenticated' : 'Not authenticated')
      : 'Not required';

    const statusText = MESSAGES.STATUS_TEXT(
      user.state,
      sessionStatus,
      projectCount,
      activeProjectName,
      activeProjectType,
      activeProjectPath,
      user.permissionMode,
      authStatus,
      user.sessionId ? 'Yes' : 'No'
    );
    await this.telegramSender.safeSendMessage(ctx.chat.id, statusText);
  }



  async handleClear(ctx: Context): Promise<void> {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const user = await this.storage.getUserSession(chatId);

    if (!user) {
      await ctx.reply(this.formatter.formatError('No active session found. Please start a session first.'), { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      delete user.sessionId;
      await this.storage.saveUserSession(user);
      await this.claudeSDK.abortQuery(chatId);

      await ctx.reply('✅ Session cleared. Your Claude Code session has been reset.');
    } catch (error) {
      await ctx.reply(this.formatter.formatError('Failed to clear session. Please try again.'), { parse_mode: 'MarkdownV2' });
      console.error('Error clearing session:', error);
    }
  }

  async handleAbort(ctx: Context): Promise<void> {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const user = await this.storage.getUserSession(chatId);

    if (!user) {
      await ctx.reply(this.formatter.formatError('No active session found. Please start a session first.'), { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      const success = await this.claudeSDK.abortQuery(chatId);

      if (success) {
        await ctx.reply('🛑 Query aborted successfully. You can send a new message now.');
      } else {
        await ctx.reply('ℹ️ No active query to abort. All queries have completed.');
      }
    } catch (error) {
      await ctx.reply(this.formatter.formatError('Failed to abort query. Please try again.'), { parse_mode: 'MarkdownV2' });
    }
  }

  async handleAuth(ctx: Context): Promise<void> {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const user = await this.getOrCreateUser(chatId);

    // If secret is not required, inform user
    if (!this.authService.isSecretRequired()) {
      await ctx.reply('🔓 No authentication required. Secret verification is disabled.');
      return;
    }

    // If already authenticated, inform user
    if (user.isAuthenticated()) {
      await ctx.reply('✅ You are already authenticated.');
      return;
    }

    // Check if message contains secret
    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const secret = messageText.replace('/auth', '').trim();

    if (!secret) {
      await ctx.reply(this.authService.getSecretPromptMessage());
      return;
    }

    // Verify secret
    if (this.authService.authenticateUser(user, secret)) {
      await this.storage.saveUserSession(user);
      await ctx.reply('✅ Authentication successful! You can now access sensitive operations.');
    } else {
      await ctx.reply(this.formatter.formatError('❌ Invalid secret token. Please try again.'), { parse_mode: 'MarkdownV2' });
    }
  }

  async handlePermissionModeChange(ctx: Context, mode: PermissionMode): Promise<void> {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const user = await this.storage.getUserSession(chatId);

    if (!user) {
      await ctx.reply(this.formatter.formatError('No active session found. Please start a session first.'), { parse_mode: 'MarkdownV2' });
      return;
    }

    if (user.state !== UserState.InSession) {
      await ctx.reply(this.formatter.formatError('You must be in an active session to change permission mode.'), { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      // Check if Claude is currently running and abort if needed
      let abortMessage = '';
      if (this.claudeSDK.isQueryRunning(chatId)) {
        const abortSuccess = await this.claudeSDK.abortQuery(chatId);
        
        if (abortSuccess) {
          abortMessage = '🛑 Current Claude has been stopped.\n';
        }
      }

      user.setPermissionMode(mode);
      await this.storage.saveUserSession(user);

      const modeNames = {
        [PermissionMode.Default]: 'Default - Standard behavior with permission prompts for each tool on first use',
        [PermissionMode.AcceptEdits]: 'Accept Edits - Automatically accept file edit permissions for the session',
        [PermissionMode.Plan]: 'Plan - Claude can analyze but cannot modify files or execute commands',
        [PermissionMode.BypassPermissions]: 'Bypass Permissions - Skip all permission prompts (requires secure environment)'
      };

      const modeName = modeNames[mode];
      const finalMessage = abortMessage 
        ? `${abortMessage}✅ Permission mode changed to: \n**${modeName}**\n🔄 Claude session is resuming with the new permission mode.`
        : `✅ Permission mode changed to: \n**${modeName}**\nThe new permission mode is now active.`;

      await this.telegramSender.safeSendMessage(ctx.chat.id, finalMessage);
      
      // If we aborted a query, send a continue message to restart Claude session
      if (abortMessage) {
        this.claudeSDK.addMessageToStream(chatId, 'continue');
      }
    } catch (error) {
      await ctx.reply(this.formatter.formatError('Failed to change permission mode. Please try again.'), { parse_mode: 'MarkdownV2' });
      console.error('Error changing permission mode:', error);
    }
  }

  private async getOrCreateUser(chatId: number): Promise<UserSessionModel> {
    let user = await this.storage.getUserSession(chatId);
    if (!user) {
      user = new UserSessionModel(chatId);
      await this.storage.saveUserSession(user);
    }
    return user;
  }
}