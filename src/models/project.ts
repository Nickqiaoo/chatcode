export interface Project {
  id: string;
  userId: number;
  name: string;
  localPath: string;
  repoUrl?: string;
  type: 'git' | 'local';
  createdAt: Date;
  lastAccessed: Date;
}

export function createProject(
  id: string,
  userId: number,
  name: string,
  localPath: string,
  type: 'git' | 'local',
  repoUrl?: string
): Project {
  const project: Project = {
    id,
    userId,
    name,
    localPath,
    type,
    createdAt: new Date(),
    lastAccessed: new Date()
  };
  
  if (repoUrl) {
    project.repoUrl = repoUrl;
  }
  
  return project;
}

export function updateProjectLastAccessed(project: Project): Project {
  return {
    ...project,
    lastAccessed: new Date()
  };
}