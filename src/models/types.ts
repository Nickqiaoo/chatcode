export enum UserState {
  Idle = 'idle',
  WaitingProjectType = 'waiting_project_type',
  WaitingRepo = 'waiting_repo',
  WaitingDirectory = 'waiting_directory',
  InSession = 'in_session',
}

export enum ProjectType {
  GitHub = 'github',
  Directory = 'directory',
}

export enum TargetTool {
  Task = 'Task',
  Bash = 'Bash',
  Glob = 'Glob',
  Grep = 'Grep',
  LS = 'LS',
  ExitPlanMode = 'ExitPlanMode',
  Read = 'Read',
  Edit = 'Edit',
  MultiEdit = 'MultiEdit',
  Write = 'Write',
  TodoWrite = 'TodoWrite',
}

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  repoUrl?: string;
  localPath: string;
  created: Date;
  lastUsed: Date;
  status: string;
}

export interface User {
  chat_id: number;
  state: UserState;
  projects: Map<string, Project>;
  activeProject: string;
  currentInput: string;
  lastActivity: Date;
}


export interface RepoInfo {
  name: string;
  description: string;
  language: string;
  size: string;
  updatedAt: string;
  private: boolean;
  url: string;
}

export enum PermissionMode {
  Default = 'default',
  AcceptEdits = 'acceptEdits',
  Plan = 'plan',
  BypassPermissions = 'bypassPermissions'
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  activeSessions: number;
}

export interface DirectoryItem {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
  icon: string;
}

export interface FileBrowsingState {
  currentPath: string;
  basePath: string;
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  items: DirectoryItem[];
  messageId?: number;
}