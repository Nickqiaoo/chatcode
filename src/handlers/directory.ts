import * as fs from 'fs';
import * as path from 'path';
import { DirectoryItem } from '../models/types';

export class DirectoryManager {
  constructor() {
  }

  /**
   * Validates if a directory path exists and is accessible
   */
  async validateDirectory(directoryPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(directoryPath);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }


  /**
   * Gets directory information like name, size, and last modified
   */
  async getDirectoryInfo(directoryPath: string): Promise<{
    name: string;
    size: string;
    lastModified: string;
    files: number;
    directories: number;
  }> {
    const stats = await fs.promises.stat(directoryPath);
    const dirName = path.basename(directoryPath);
    
    // Count files and directories
    const items = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    const files = items.filter(item => item.isFile()).length;
    const directories = items.filter(item => item.isDirectory()).length;

    return {
      name: dirName,
      size: this.formatBytes(stats.size || 0),
      lastModified: stats.mtime.toLocaleString(),
      files,
      directories,
    };
  }

  /**
   * Checks if a path is an absolute path
   */
  isAbsolutePath(directoryPath: string): boolean {
    return path.isAbsolute(directoryPath);
  }

  /**
   * Resolves a relative path to absolute path
   */
  resolvePath(directoryPath: string): string {
    return path.resolve(directoryPath);
  }

  /**
   * Validates that a target path is within the allowed base path (no directory traversal)
   */
  isPathWithinBase(targetPath: string, basePath: string): boolean {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedBase = path.resolve(basePath);
    
    // Ensure the target path starts with the base path
    return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
  }

  /**
   * Lists directory contents with file/directory information, validating against base path
   */
  async listDirectoryContents(directoryPath: string, basePath?: string): Promise<DirectoryItem[]> {
    // If basePath is provided, validate that directoryPath is within basePath
    if (basePath && !this.isPathWithinBase(directoryPath, basePath)) {
      throw new Error('Access denied: path is outside allowed directory');
    }
    try {
      const items = await fs.promises.readdir(directoryPath, { withFileTypes: true });
      const directoryItems: DirectoryItem[] = [];

      for (const item of items) {
        const itemPath = path.join(directoryPath, item.name);
        let stats: fs.Stats | null = null;
        
        try {
          stats = await fs.promises.stat(itemPath);
        } catch (error) {
          // Skip items that can't be accessed
          continue;
        }

        const directoryItem: DirectoryItem = {
          name: item.name,
          type: item.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime,
          icon: this.getItemIcon(item.name, item.isDirectory())
        };

        directoryItems.push(directoryItem);
      }

      // Sort: directories first, then files, both alphabetically
      return directoryItems.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
    } catch (error) {
      console.error('Error listing directory contents:', error);
      return [];
    }
  }

  /**
   * Gets appropriate icon for file or directory
   */
  private getItemIcon(name: string, isDirectory: boolean): string {
    if (isDirectory) {
      return '📁';
    }

    // File type icons based on extension
    const ext = path.extname(name).toLowerCase().slice(1);
    const iconMap: Record<string, string> = {
      // Programming languages
      'js': '🟨', 'jsx': '⚛️', 'ts': '🔵', 'tsx': '⚛️',
      'vue': '💚', 'svelte': '🧡',
      'html': '🌐', 'css': '🎨', 'scss': '🎨', 'sass': '🎨', 'less': '🎨',
      'json': '📋', 'xml': '📋', 'yaml': '📋', 'yml': '📋', 'toml': '📋',
      'md': '📝', 'txt': '📄', 'log': '📋', 'ini': '⚙️', 'conf': '⚙️',
      'py': '🐍', 'java': '☕', 'cpp': '⚙️', 'c': '⚙️', 'h': '⚙️',
      'php': '🐘', 'rb': '💎', 'go': '🚀', 'rs': '🦀', 'swift': '🦉',
      'sql': '🗃️', 'sh': '💲', 'bat': '💲', 'ps1': '💙',
      'dockerfile': '🐳', 'docker': '🐳',
      
      // Data files
      'csv': '📊', 'xlsx': '📊', 'xls': '📊',
      
      // Images
      'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'svg': '🖼️', 'webp': '🖼️',
      
      // Documents
      'pdf': '📕', 'doc': '📘', 'docx': '📘', 'ppt': '📙', 'pptx': '📙',
      
      // Archives
      'zip': '📦', 'rar': '📦', 'tar': '📦', 'gz': '📦'
    };

    return iconMap[ext] || '📄';
  }

  /**
   * Checks if a file is readable (not binary or too large)
   */
  async isFileReadable(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      
      // Skip very large files (> 1MB)
      if (stats.size > 1024 * 1024) {
        return false;
      }

      // Try to read a small portion to check if it's binary
      const buffer = Buffer.alloc(512);
      const fd = await fs.promises.open(filePath, 'r');
      try {
        const result = await fd.read(buffer, 0, 512, 0);
        const bytesRead = result.bytesRead;
        
        // Check for null bytes (indicator of binary file) - only check bytes actually read
        for (let i = 0; i < bytesRead; i++) {
          if (buffer[i] === 0) {
            return false;
          }
        }
        return true;
      } finally {
        await fd.close();
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Reads file content safely
   */
  async readFileContent(filePath: string): Promise<string | null> {
    try {
      if (!(await this.isFileReadable(filePath))) {
        return null;
      }

      const content = await fs.promises.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  }

  /**
   * Detects language from file extension
   */
  detectLanguage(filename: string): string | undefined {
    const ext = path.extname(filename).toLowerCase().slice(1);
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'jsx',
      'ts': 'typescript',
      'tsx': 'tsx',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'h': 'c',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'sql': 'sql',
      'sh': 'bash',
      'bat': 'batch',
      'ps1': 'powershell',
      'dockerfile': 'dockerfile'
    };

    return languageMap[ext];
  }

  /**
   * Formats bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}