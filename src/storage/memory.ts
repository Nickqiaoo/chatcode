import { UserSessionModel } from '../models/user-session';
import { Project } from '../models/project';
import { IStorage } from './interface';

export class MemoryStorage implements IStorage {
  private userSessions: Map<number, UserSessionModel> = new Map();
  private userProjects: Map<number, Map<string, Project>> = new Map();
  private toolUseStorage: Map<string, {
    name: string;
    messageId: number;
    originalMessage: string;
    chatId: string;
    createdAt: number;
  }> = new Map();

  async initialize(): Promise<void> {
    console.log('Memory storage initialized');
  }

  async disconnect(): Promise<void> {
    this.userSessions.clear();
    this.userProjects.clear();
    this.toolUseStorage.clear();
    console.log('Memory storage disconnected');
  }

  async saveUserSession(userSession: UserSessionModel): Promise<void> {
    this.userSessions.set(userSession.chatId, userSession);
  }

  async getUserSession(chatId: number): Promise<UserSessionModel | null> {
    return this.userSessions.get(chatId) || null;
  }

  async deleteUserSession(chatId: number): Promise<void> {
    this.userSessions.delete(chatId);
  }
  
  async updateSessionActivity(userSession: UserSessionModel): Promise<void> {
    userSession.updateActivity();
    await this.saveUserSession(userSession);
  }

  async startClaudeSession(userSession: UserSessionModel, sessionId: string, projectPath?: string): Promise<void> {
    userSession.startSession(sessionId, projectPath);
    await this.saveUserSession(userSession);
  }

  async endClaudeSession(userSession: UserSessionModel): Promise<void> {
    userSession.endSession();
    await this.saveUserSession(userSession);
  }


  private getToolUseKey(sessionId: string, toolId: string): string {
    return `tool_use_storage:${sessionId}_${toolId}`;
  }

  async storeToolUse(sessionId: string, toolId: string, toolData: {
    name: string;
    messageId: number;
    originalMessage: string;
    chatId: string;
  }): Promise<void> {
    const key = this.getToolUseKey(sessionId, toolId);
    const data = {
      ...toolData,
      createdAt: Date.now()
    };
    this.toolUseStorage.set(key, data);

    // Auto-cleanup after 30 minutes
    setTimeout(() => {
      this.toolUseStorage.delete(key);
    }, 30 * 60 * 1000);
  }

  async getToolUse(sessionId: string, toolId: string): Promise<{
    name: string;
    messageId: number;
    originalMessage: string;
    chatId: string;
    createdAt: number;
  } | null> {
    const key = this.getToolUseKey(sessionId, toolId);
    return this.toolUseStorage.get(key) || null;
  }

  async deleteToolUse(sessionId: string, toolId: string): Promise<void> {
    const key = this.getToolUseKey(sessionId, toolId);
    this.toolUseStorage.delete(key);
  }

  // Project management methods
  async getUserProjects(userId: number): Promise<Project[]> {
    const projectsMap = this.userProjects.get(userId);
    if (!projectsMap) {
      return [];
    }
    
    return Array.from(projectsMap.values())
      .sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime());
  }

  async getProject(projectId: string, userId: number): Promise<Project | null> {
    const projectsMap = this.userProjects.get(userId);
    if (!projectsMap) {
      return null;
    }
    
    return projectsMap.get(projectId) || null;
  }

  async saveProject(project: Project): Promise<void> {
    if (!this.userProjects.has(project.userId)) {
      this.userProjects.set(project.userId, new Map());
    }
    
    this.userProjects.get(project.userId)!.set(project.id, { ...project });
  }

  async deleteProject(projectId: string, userId: number): Promise<void> {
    const projectsMap = this.userProjects.get(userId);
    if (projectsMap) {
      projectsMap.delete(projectId);
    }
  }

  async updateProjectLastAccessed(projectId: string, userId: number): Promise<void> {
    const project = await this.getProject(projectId, userId);
    if (project) {
      project.lastAccessed = new Date();
      await this.saveProject(project);
    }
  }
}