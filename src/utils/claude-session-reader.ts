import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

export interface ClaudeSession {
  sessionId: string;
  cwd: string;
  timestamp: string;
  version: string;
  firstMessage: string | undefined;
  messageCount: number;
}

export interface ClaudeProject {
  id: string;
  name: string;
  path: string;
  lastAccessed: Date;
  sessionCount: number;
}

export class ClaudeSessionReader {
  private projectsDir: string;

  constructor() {
    this.projectsDir = path.join(os.homedir(), '.claude', 'projects');
  }

  /**
   * Check if a file is a main session file (UUID format, not agent- prefix)
   */
  private isMainSessionFile(filename: string): boolean {
    // Match UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.jsonl
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;
    return uuidPattern.test(filename);
  }

  /**
   * Read session info from a jsonl file
   */
  private async readSessionInfo(filePath: string): Promise<ClaudeSession | null> {
    try {
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let sessionLine: any = null;  // First line with sessionId
      let lastLine: any = null;
      let messageCount = 0;
      let firstUserMessage: string | undefined;

      for await (const line of rl) {
        if (!line.trim()) continue;

        try {
          const parsed = JSON.parse(line);
          messageCount++;

          // Find first line with sessionId
          if (!sessionLine && parsed.sessionId) {
            sessionLine = parsed;
          }
          lastLine = parsed;

          // Get first user message as summary (skip meta/system messages)
          if (!firstUserMessage && parsed.type === 'user' && !parsed.isMeta && parsed.message?.content) {
            const content = parsed.message.content;
            if (Array.isArray(content)) {
              const textBlock = content.find((c: any) => c.type === 'text');
              if (textBlock?.text && textBlock.text !== 'Warmup' && !textBlock.text.startsWith('<local-command')) {
                firstUserMessage = textBlock.text;
              }
            } else if (typeof content === 'string' && content !== 'Warmup') {
              firstUserMessage = content;
            }
          }
        } catch {
          // Skip invalid JSON lines
        }
      }

      if (!sessionLine || !sessionLine.sessionId) {
        return null;
      }

      return {
        sessionId: sessionLine.sessionId,
        cwd: sessionLine.cwd || '',
        timestamp: lastLine?.timestamp || sessionLine.timestamp || '',
        version: sessionLine.version || '',
        firstMessage: firstUserMessage,
        messageCount
      };
    } catch (error) {
      console.error(`Error reading session file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * List all sessions for a specific project (by encoded project ID / directory name)
   */
  async listProjectSessions(encodedProjectId: string, limit: number = 10): Promise<ClaudeSession[]> {
    const sessionsDir = path.join(this.projectsDir, encodedProjectId);

    if (!fs.existsSync(sessionsDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(sessionsDir);
      const sessionFiles = files.filter(f => this.isMainSessionFile(f));

      // Get file stats for sorting by modification time
      const fileStats = sessionFiles.map(f => ({
        name: f,
        path: path.join(sessionsDir, f),
        mtime: fs.statSync(path.join(sessionsDir, f)).mtime
      }));

      // Sort by modification time (newest first)
      fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Read session info for the most recent files
      const sessions: ClaudeSession[] = [];
      for (const file of fileStats.slice(0, limit)) {
        const sessionInfo = await this.readSessionInfo(file.path);
        if (sessionInfo) {
          sessions.push(sessionInfo);
        }
      }

      return sessions;
    } catch (error) {
      console.error(`Error listing sessions for ${encodedProjectId}:`, error);
      return [];
    }
  }

  /**
   * Format session for display
   */
  formatSessionDisplay(session: ClaudeSession, index: number): string {
    const date = new Date(session.timestamp);
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Truncate first message for display
    let summary = session.firstMessage || 'No message';
    if (summary.length > 30) {
      summary = summary.substring(0, 30) + '...';
    }

    return `${index + 1}. ${dateStr} - ${summary}`;
  }


  /**
   * Read the actual cwd from a session file (search for line with cwd field)
   */
  private readCwdFromSessionFile(filePath: string): string | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      // Search first 10 lines for one with cwd field
      for (const line of lines.slice(0, 10)) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.cwd) {
            return parsed.cwd;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  /**
   * List all Claude Code projects from ~/.claude/projects/
   */
  async listAllProjects(limit: number = 20): Promise<ClaudeProject[]> {
    if (!fs.existsSync(this.projectsDir)) {
      return [];
    }

    try {
      const dirs = fs.readdirSync(this.projectsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      const projects: ClaudeProject[] = [];

      for (const dir of dirs) {
        const dirPath = path.join(this.projectsDir, dir);

        // Get session files to count and find last accessed time
        const files = fs.readdirSync(dirPath);
        const sessionFiles = files.filter(f => this.isMainSessionFile(f));

        if (sessionFiles.length === 0) {
          continue; // Skip directories with no sessions
        }

        // Get the most recent modification time and file
        let lastAccessed = new Date(0);
        let latestFile = '';
        for (const file of sessionFiles) {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);
          if (stat.mtime > lastAccessed) {
            lastAccessed = stat.mtime;
            latestFile = filePath;
          }
        }

        // Read actual cwd from the latest session file
        const projectPath = latestFile ? this.readCwdFromSessionFile(latestFile) : null;
        if (!projectPath) {
          continue; // Skip if we can't read the path
        }

        // Extract project name from path
        const name = path.basename(projectPath) || projectPath;

        projects.push({
          id: dir,
          name,
          path: projectPath,
          lastAccessed,
          sessionCount: sessionFiles.length
        });
      }

      // Sort by last accessed time (newest first)
      projects.sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime());

      return projects.slice(0, limit);
    } catch (error) {
      console.error('Error listing Claude Code projects:', error);
      return [];
    }
  }
}
