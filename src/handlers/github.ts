import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import * as fs from 'fs/promises';
import { RepoInfo } from '../models/types';

export class GitHubManager {
  private workDir: string;

  constructor(workDir: string) {
    this.workDir = workDir;
  }

  async getRepoInfo(repoUrl: string): Promise<RepoInfo> {
    // For now, extract basic info from URL
    // In a real implementation, you'd use GitHub API
    const urlMatch = repoUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
    if (!urlMatch) {
      throw new Error('Invalid GitHub URL');
    }

    const [, owner, repo] = urlMatch;
    
    // Mock repo info - in real implementation, use GitHub API
    return {
      name: repo!,
      description: `Repository ${owner}/${repo}`,
      language: 'Unknown',
      size: 'Unknown',
      updatedAt: new Date().toISOString(),
      private: false,
      url: repoUrl,
    };
  }

  async cloneRepo(repoUrl: string, userId: number, projectId: string): Promise<string> {
    if (!this.isGitHubURL(repoUrl)) {
      throw new Error('Invalid GitHub repository URL');
    }

    const userDir = path.join(this.workDir, `user_${userId}`);
    const projectDir = path.join(userDir, projectId);

    try {
      // Ensure user directory exists
      await fs.mkdir(userDir, { recursive: true });

      // Remove existing project directory if it exists
      try {
        await fs.rmdir(projectDir, { recursive: true });
      } catch (error) {
        // Directory doesn't exist, which is fine
      }

      // Clone repository
      const git: SimpleGit = simpleGit();
      await git.clone(repoUrl, projectDir);

      return projectDir;
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateRepo(localPath: string): Promise<void> {
    try {
      const git: SimpleGit = simpleGit(localPath);
      await git.pull();
    } catch (error) {
      throw new Error(`Failed to update repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getRepoStatus(localPath: string): Promise<any> {
    try {
      const git: SimpleGit = simpleGit(localPath);
      return await git.status();
    } catch (error) {
      throw new Error(`Failed to get repository status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteProject(localPath: string): Promise<void> {
    try {
      await fs.rmdir(localPath, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  isGitHubURL(url: string): boolean {
    const patterns = [
      /^https?:\/\/github\.com\/[^\/]+\/[^\/]+\/?$/,
      /^git@github\.com:[^\/]+\/[^\/]+\.git$/,
      /^https?:\/\/github\.com\/[^\/]+\/[^\/]+\.git$/,
    ];

    return patterns.some(pattern => pattern.test(url));
  }

  normalizeGitHubURL(url: string): string {
    // Convert SSH URLs to HTTPS
    if (url.startsWith('git@github.com:')) {
      const match = url.match(/git@github\.com:([^\/]+)\/(.+)\.git$/);
      if (match) {
        return `https://github.com/${match[1]}/${match[2]}`;
      }
    }

    // Remove .git suffix from HTTPS URLs
    if (url.endsWith('.git')) {
      return url.slice(0, -4);
    }

    return url;
  }

  extractRepoInfo(url: string): { owner: string; repo: string } | null {
    const match = url.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
    if (match) {
      return { owner: match[1]!, repo: match[2]! };
    }
    return null;
  }
}