import { createClient, RedisClientType } from 'redis';
import { UserSessionModel } from '../models/user-session';
import { Project } from '../models/project';
import { IStorage } from './interface';

export class RedisStorage implements IStorage {
  private client: RedisClientType;
  private connected: boolean = false;
  private readonly redisUrl: string;
  private readonly USER_SESSION_PREFIX = 'user_session:';
  private readonly USER_PROJECTS_PREFIX = 'user_projects:';
  private readonly TOOL_USE_PREFIX = 'tool_use:';
  private readonly SESSION_TTL = 3 * 60 * 60; // 3 hours in seconds
  private readonly TOOL_USE_TTL = 30 * 60; // 30 minutes in seconds
  private readonly PROJECT_TTL = 15 * 24 * 60 * 60; // 15 days in seconds
  private readonly PENDING_ASR_PREFIX = 'pending_asr:';
  private readonly PENDING_ASR_TTL = 10 * 60; // 10 minutes
  private readonly MAX_RECONNECT_DELAY = 30000; // 30 seconds max delay
  private reconnectAttempts = 0;

  constructor(redisUrl?: string, sessionTimeout: number = 30 * 60 * 1000) {
    this.redisUrl = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = this.createClient();
    this.SESSION_TTL = sessionTimeout / 1000; // Convert milliseconds to seconds
  }

  private createClient(): RedisClientType {
    const client = createClient({
      url: this.redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          // Exponential backoff with max delay
          const delay = Math.min(Math.pow(2, retries) * 100, this.MAX_RECONNECT_DELAY);
          console.log(`Redis reconnecting in ${delay}ms (attempt ${retries + 1})`);
          return delay;
        }
      }
    });

    client.on('error', (err) => {
      // Only log non-socket-closed errors to reduce noise during reconnection
      if (err.message !== 'Socket closed unexpectedly') {
        console.error('Redis Client Error:', err);
      }
    });

    client.on('connect', () => {
      console.log('Connected to Redis');
      this.connected = true;
      this.reconnectAttempts = 0;
    });

    client.on('ready', () => {
      console.log('Redis client ready');
    });

    client.on('end', () => {
      console.log('Redis connection ended');
      this.connected = false;
    });

    client.on('reconnecting', () => {
      this.reconnectAttempts++;
      console.log(`Redis reconnecting (attempt ${this.reconnectAttempts})`);
    });

    return client as RedisClientType;
  }

  async initialize() {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.quit();
    }
  }

  private getUserSessionKey(chatId: number): string {
    return `${this.USER_SESSION_PREFIX}${chatId}`;
  }

  async saveUserSession(userSession: UserSessionModel): Promise<void> {
    const key = this.getUserSessionKey(userSession.chatId);
    const data = JSON.stringify(userSession.toJSON());
    
    await this.client.setEx(key, this.SESSION_TTL, data);
  }

  async getUserSession(chatId: number): Promise<UserSessionModel | null> {
    const key = this.getUserSessionKey(chatId);
    const data = await this.client.get(key);
    
    if (!data) {
      return null;
    }

    try {
      const parsed = JSON.parse(data);
      return UserSessionModel.fromJSON(parsed);
    } catch (error) {
      console.error('Error parsing user session data:', error);
      return null;
    }
  }

  async deleteUserSession(chatId: number): Promise<void> {
    const key = this.getUserSessionKey(chatId);
    await this.client.del(key);
  }

  async updateSessionActivity(userSession: UserSessionModel): Promise<void> {
    userSession.updateActivity();
    await this.saveUserSession(userSession);
  }

  // Session-specific methods
  async startClaudeSession(userSession: UserSessionModel, sessionId: string, projectPath?: string): Promise<void> {
    userSession.startSession(sessionId, projectPath);
    await this.saveUserSession(userSession);
  }

  async endClaudeSession(userSession: UserSessionModel): Promise<void> {
    userSession.endSession();
    await this.saveUserSession(userSession);
  }

  // Tool use storage methods for customized handling
  private getToolUseKey(sessionId: string, toolId: string): string {
    return `${this.TOOL_USE_PREFIX}${sessionId}_${toolId}`;
  }

  async storeToolUse(sessionId: string, toolId: string, toolData: {
    name: string;
    messageId: number;
    originalMessage: string;
    chatId: string;
    parentToolUseId?: string;
  }): Promise<void> {
    const key = this.getToolUseKey(sessionId, toolId);
    const data = JSON.stringify({
      ...toolData,
      createdAt: Date.now()
    });
    await this.client.setEx(key, this.TOOL_USE_TTL, data);
  }

  async getToolUse(sessionId: string, toolId: string): Promise<{
    name: string;
    messageId: number;
    originalMessage: string;
    chatId: string;
    createdAt: number;
    parentToolUseId?: string;
  } | null> {
    const key = this.getToolUseKey(sessionId, toolId);
    const data = await this.client.get(key);
    
    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Error parsing tool use data:', error);
      return null;
    }
  }

  async deleteToolUse(sessionId: string, toolId: string): Promise<void> {
    const key = this.getToolUseKey(sessionId, toolId);
    await this.client.del(key);
  }

  async storePendingASR(chatId: number, text: string): Promise<void> {
    const key = `${this.PENDING_ASR_PREFIX}${chatId}`;
    await this.client.setEx(key, this.PENDING_ASR_TTL, text);
  }

  async getPendingASR(chatId: number): Promise<string | null> {
    const key = `${this.PENDING_ASR_PREFIX}${chatId}`;
    return await this.client.get(key);
  }

  async deletePendingASR(chatId: number): Promise<void> {
    const key = `${this.PENDING_ASR_PREFIX}${chatId}`;
    await this.client.del(key);
  }

  // Project management methods
  private getUserProjectsKey(userId: number): string {
    return `${this.USER_PROJECTS_PREFIX}${userId}`;
  }

  async getUserProjects(userId: number): Promise<Project[]> {
    const key = this.getUserProjectsKey(userId);
    const hashData = await this.client.hGetAll(key);
    const projects: Project[] = [];
    
    for (const value of Object.values(hashData)) {
      try {
        const project = JSON.parse(value);
        // Convert date strings back to Date objects
        project.createdAt = new Date(project.createdAt);
        project.lastAccessed = new Date(project.lastAccessed);
        projects.push(project);
      } catch (error) {
        console.error('Error parsing project data:', error);
      }
    }
    
    return projects.sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime());
  }

  async getProject(projectId: string, userId: number): Promise<Project | null> {
    const key = this.getUserProjectsKey(userId);
    const projectJson = await this.client.hGet(key, projectId);
    
    if (!projectJson) {
      return null;
    }

    try {
      const project = JSON.parse(projectJson);
      // Convert date strings back to Date objects
      project.createdAt = new Date(project.createdAt);
      project.lastAccessed = new Date(project.lastAccessed);
      return project;
    } catch (error) {
      console.error('Error parsing project data:', error);
      return null;
    }
  }

  async saveProject(project: Project): Promise<void> {
    const key = this.getUserProjectsKey(project.userId);
    const projectData = {
      ...project,
      createdAt: project.createdAt.toISOString(),
      lastAccessed: project.lastAccessed.toISOString()
    };
    
    await this.client.hSet(key, project.id, JSON.stringify(projectData));
    await this.client.expire(key, this.PROJECT_TTL);
  }

  async deleteProject(projectId: string, userId: number): Promise<void> {
    const key = this.getUserProjectsKey(userId);
    await this.client.hDel(key, projectId);
  }

  async updateProjectLastAccessed(projectId: string, userId: number): Promise<void> {
    const project = await this.getProject(projectId, userId);
    if (project) {
      project.lastAccessed = new Date();
      await this.saveProject(project);
    }
  }
}