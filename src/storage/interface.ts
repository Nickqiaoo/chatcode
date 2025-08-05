import { UserSessionModel } from '../models/user-session';
import { Project } from '../models/project';

export interface ToolData {
  name: string;
  messageId: number;
  originalMessage: string;
  chatId: string;
  parentToolUseId?: string;
  createdAt?: number;
  diffId?: string;
}

export interface IStorage {
  // Core initialization methods
  initialize(): Promise<void>;
  disconnect(): Promise<void>;

  // User session management
  saveUserSession(userSession: UserSessionModel): Promise<void>;
  getUserSession(chatId: number): Promise<UserSessionModel | null>;
  deleteUserSession(chatId: number): Promise<void>;
  updateSessionActivity(userSession: UserSessionModel): Promise<void>;

  // Claude session management
  startClaudeSession(userSession: UserSessionModel, sessionId: string, projectPath?: string): Promise<void>;
  endClaudeSession(userSession: UserSessionModel): Promise<void>;


  // Tool use storage for message handling
  storeToolUse(sessionId: string, toolId: string, toolData: ToolData): Promise<void>;
  getToolUse(sessionId: string, toolId: string): Promise<ToolData | null>;
  deleteToolUse(sessionId: string, toolId: string): Promise<void>;

  // Project management
  getUserProjects(userId: number): Promise<Project[]>;
  getProject(projectId: string, userId: number): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  deleteProject(projectId: string, userId: number): Promise<void>;
  updateProjectLastAccessed(projectId: string, userId: number): Promise<void>;
}