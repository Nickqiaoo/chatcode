import { Context, Telegraf } from 'telegraf';
import { UserSessionModel } from '../../../models/user-session';
import { UserState } from '../../../models/types';
import { IStorage } from '../../../storage/interface';
import { GitHubManager } from '../../github';
import { DirectoryManager } from '../../directory';
import { MessageFormatter } from '../../../utils/formatter';
import { MESSAGES } from '../../../constants/messages';
import { KeyboardFactory } from '../keyboards/keyboard-factory';
import { TelegramUtils } from '../utils/telegram-utils';
import { createProject } from '../../../models/project';

export class ProjectHandler {
  constructor(
    private storage: IStorage,
    private github: GitHubManager,
    private directory: DirectoryManager,
    private formatter: MessageFormatter,
    private bot: Telegraf
  ) {}

  async handleRepoInput(ctx: Context, user: UserSessionModel, repoUrl: string): Promise<void> {
    if (!this.github.isGitHubURL(repoUrl)) {
      await ctx.reply(this.formatter.formatError(MESSAGES.ERRORS.INVALID_GITHUB_URL), { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      const repoInfo = await this.github.getRepoInfo(repoUrl);

      const confirmText = MESSAGES.PROJECT_CONFIRMATION_TEXT(
        repoInfo.name,
        repoInfo.description,
        repoInfo.language,
        repoInfo.size,
        repoInfo.updatedAt
      );

      await ctx.reply(confirmText);
      await ctx.reply(MESSAGES.CLONING_REPO);

      const projectId = TelegramUtils.generateProjectId();
      const localPath = await this.github.cloneRepo(repoUrl, user.chatId, projectId);

      const project = createProject(
        projectId,
        user.chatId, 
        repoInfo.name,
        localPath,
        'git',
        repoUrl
      );

      await this.storage.saveProject(project);
      user.setActiveProject(projectId, localPath);
      user.setState(UserState.InSession);
      user.setActive(true);
      // Clear previous session ID to start fresh
      delete user.sessionId;
      await this.storage.saveUserSession(user);

      const successText = MESSAGES.PROJECT_SUCCESS_TEXT(
        project.name,
        projectId,
        project.repoUrl,
        project.localPath
      );

      await ctx.reply(successText);
    } catch (error) {
      await ctx.reply(this.formatter.formatError(MESSAGES.ERRORS.PROJECT_CREATION_FAILED(error instanceof Error ? error.message : 'Unknown error')), { parse_mode: 'MarkdownV2' });
    }
  }

  async handleDirectoryInput(ctx: Context, user: UserSessionModel, directoryPath: string): Promise<void> {
    if (!this.directory.isAbsolutePath(directoryPath)) {
      await ctx.reply(this.formatter.formatError(MESSAGES.ERRORS.INVALID_ABSOLUTE_PATH), { parse_mode: 'MarkdownV2' });
      return;
    }

    const resolvedPath = this.directory.resolvePath(directoryPath);

    if (!await this.directory.validateDirectory(resolvedPath)) {
      await ctx.reply(this.formatter.formatError(MESSAGES.ERRORS.DIRECTORY_NOT_FOUND), { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      const dirInfo = await this.directory.getDirectoryInfo(resolvedPath);

      const confirmText = MESSAGES.DIRECTORY_CONFIRMATION_TEXT(
        dirInfo.name,
        resolvedPath,
        dirInfo.files,
        dirInfo.directories,
        dirInfo.lastModified
      );

      await ctx.reply(confirmText);

      const projectId = TelegramUtils.generateProjectId();

      const project = createProject(
        projectId,
        user.chatId,
        dirInfo.name,
        resolvedPath,
        'local'
      );

      await this.storage.saveProject(project);
      user.setActiveProject(projectId, resolvedPath);
      user.setState(UserState.InSession);
      user.setActive(true);
      // Clear previous session ID to start fresh
      delete user.sessionId;
      await this.storage.saveUserSession(user);

      const successText = MESSAGES.PROJECT_SUCCESS_TEXT(
        project.name,
        projectId,
        undefined,
        project.localPath
      );

      await ctx.reply(successText);
    } catch (error) {
      await ctx.reply(this.formatter.formatError(MESSAGES.ERRORS.PROJECT_CREATION_FAILED(error instanceof Error ? error.message : 'Unknown error')), { parse_mode: 'MarkdownV2' });
    }
  }

  async handleProjectTypeSelection(data: string, chatId: number): Promise<void> {
    const projectType = data.replace('project_type_', '');
    const user = await this.storage.getUserSession(chatId);

    if (!user || user.state !== UserState.WaitingProjectType) {
      await this.bot.telegram.sendMessage(chatId, this.formatter.formatError(MESSAGES.ERRORS.INVALID_OPERATION), { parse_mode: 'MarkdownV2' });
      return;
    }

    if (projectType === 'github') {
      user.setState(UserState.WaitingRepo);
      await this.storage.saveUserSession(user);

      const text = MESSAGES.GITHUB_PROJECT_TEXT;

      await this.bot.telegram.sendMessage(chatId, text, {
        reply_markup: KeyboardFactory.createCancelKeyboard().reply_markup
      });
    } else if (projectType === 'directory') {
      user.setState(UserState.WaitingDirectory);
      await this.storage.saveUserSession(user);

      const text = MESSAGES.LOCAL_PROJECT_TEXT;

      await this.bot.telegram.sendMessage(chatId, text, {
        reply_markup: KeyboardFactory.createCancelKeyboard().reply_markup
      });
    }
  }

  async startProjectCreation(ctx: Context, user: UserSessionModel, repoUrl: string): Promise<void> {
    if (user.state !== UserState.Idle) {
      await ctx.reply(this.formatter.formatError(MESSAGES.ERRORS.COMPLETE_CURRENT_OPERATION), { parse_mode: 'MarkdownV2' });
      return;
    }

    user.setState(UserState.WaitingRepo);
    await this.storage.saveUserSession(user);

    await this.handleRepoInput(ctx, user, repoUrl);
  }
}