import { UserState, PermissionMode, FileBrowsingState } from './types';

export interface UserSession {
  chatId: number;
  
  // User state management
  state: UserState;
  currentInput: string;
  lastActivity: Date;
  
  // Project management
  activeProject: string;
  
  // Claude session management
  sessionId?: string;
  projectPath: string;
  active: boolean;
  
  // Permission management
  permissionMode: PermissionMode;
  
  // File browsing state
  fileBrowsingState?: FileBrowsingState;
  
  // Security authentication
  authenticated: boolean;
}

export class UserSessionModel {
  chatId: number;
  state: UserState;
  lastActivity: Date;
  activeProject: string;
  sessionId?: string;
  projectPath: string;
  active: boolean;
  permissionMode: PermissionMode;
  fileBrowsingState?: FileBrowsingState;
  authenticated: boolean;

  constructor(chatId: number) {
    this.chatId = chatId;
    this.state = UserState.Idle;
    this.lastActivity = new Date();
    this.activeProject = '';
    this.projectPath = '';
    this.active = false;
    this.permissionMode = PermissionMode.Default;
    this.authenticated = false;
  }

  setActive(active: boolean): void {
    this.active = active;
    this.updateActivity();
  }

  // User state methods
  setState(state: UserState): void {
    this.state = state;
    this.updateActivity();
  }

  updateActivity(): void {
    this.lastActivity = new Date();
  }

  // Project management methods
  setActiveProject(projectId: string, projectPath: string): void {
    this.activeProject = projectId;
    this.projectPath = projectPath;
    this.updateActivity();
  }

  clearActiveProject(): void {
    this.activeProject = '';
    this.projectPath = '';
    this.updateActivity();
  }

  // Claude session methods
  startSession(sessionId: string, projectPath?: string): void {
    this.sessionId = sessionId;
    this.active = true;
    if (projectPath) {
      this.projectPath = projectPath;
    }
    this.updateActivity();
  }

  endSession(): void {
    delete this.sessionId;
    this.active = false;
    this.setState(UserState.Idle);
    this.updateActivity();
  }

  isSessionActive(): boolean {
    return this.active && !!this.sessionId;
  }

  // Permission mode methods
  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
    this.updateActivity();
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  // Authentication methods
  setAuthenticated(authenticated: boolean): void {
    this.authenticated = authenticated;
    this.updateActivity();
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  // File browsing methods
  setFileBrowsingState(state: FileBrowsingState): void {
    this.fileBrowsingState = state;
    this.updateActivity();
  }

  getFileBrowsingState(): FileBrowsingState | undefined {
    return this.fileBrowsingState;
  }

  clearFileBrowsingState(): void {
    delete this.fileBrowsingState;
    this.updateActivity();
  }

  // Serialization methods
  toJSON(): any {
    return {
      chatId: this.chatId,
      state: this.state,
      lastActivity: this.lastActivity.toISOString(),
      activeProject: this.activeProject,
      sessionId: this.sessionId,
      projectPath: this.projectPath,
      active: this.active,
      permissionMode: this.permissionMode,
      fileBrowsingState: this.fileBrowsingState,
      authenticated: this.authenticated
    };
  }

  static fromJSON(data: any): UserSessionModel {
    const userSession = new UserSessionModel(data.chatId);
    userSession.state = data.state;
    userSession.lastActivity = new Date(data.lastActivity);
    
    userSession.activeProject = data.activeProject || '';
    if (data.sessionId) {
      userSession.sessionId = data.sessionId;
    }
    userSession.projectPath = data.projectPath || '';
    userSession.active = data.active || false;
    userSession.permissionMode = data.permissionMode || PermissionMode.Default;
    userSession.fileBrowsingState = data.fileBrowsingState;
    userSession.authenticated = data.authenticated || false;
    
    return userSession;
  }
}