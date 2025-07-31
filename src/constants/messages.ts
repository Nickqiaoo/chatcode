// Text templates for Telegram bot messages
export const MESSAGES = {
  // Welcome message
  WELCOME_TEXT: `🚀 Welcome to Claude Code Bot!

This bot helps you interact with Claude Code through Telegram.

Main features:
• Create and manage multiple projects
• Connect with GitHub repositories
• Use Claude Code in Telegram
• Full keyboard interaction support

Available commands:
📋 **Project Management**
• /createproject - Create new project
• /listproject - View all projects  
• /exitproject - Exit current project

💬 **Session Control**
• /auth - Authenticate with secret (if required)
• /abort - Abort current query
• /clear - Clear session

🔧 **Permission Modes**
• /default - Standard behavior with permission prompts
• /acceptedits - Auto-accept file edit permissions
• /plan - Analysis only, no modifications
• /bypass - Skip all permission prompts

📁 **File Operations**
• /ls - Browse project files

ℹ️ **Information**
• /status - View current status
• /help - Show detailed help

Let's get started! 🎉`,

  // Project creation
  CREATE_PROJECT_TEXT: `📁 Create New Project

Please select project type:

🔗 **GitHub Repository**
- Clone repository from GitHub
- Support public and private repos
- Auto-download code locally

📂 **Local Directory**
- Use existing local directory
- Support any absolute path
- Start directly in specified directory`,

  // GitHub project setup
  GITHUB_PROJECT_TEXT: `🔗 GitHub Repository Project

Please send GitHub repository link in format:
• https://github.com/username/repo
• git@github.com:username/repo.git

Supported repository types:
✅ Public repositories

Example:
https://github.com/microsoft/vscode`,

  // Local directory project setup
  LOCAL_PROJECT_TEXT: `📂 Local Directory Project

Please send absolute path of local directory, for example:
• /Users/username/projects/myproject
• /home/user/code/myapp
• /opt/projects/webapp

Requirements:
✅ Must be absolute path (starting with /)
✅ Directory must exist and accessible
✅ Have read/write permissions

Example:
/Users/john/projects/my-react-app`,

  // Project confirmation
  PROJECT_CONFIRMATION_TEXT: (name: string, description: string, language: string, size: string, updatedAt: string) => 
    `📋 Project Information Confirmation

Repository: ${name}
Description: ${description}
Language: ${language}
Size: ${size}
Last updated: ${updatedAt}

Using repository name "${name}" as project name...`,

  // Directory confirmation
  DIRECTORY_CONFIRMATION_TEXT: (name: string, path: string, files: number, directories: number, lastModified: string) =>
    `📋 Directory Information Confirmation

Directory name: ${name}
Path: ${path}
File count: ${files}
Subdirectory count: ${directories}
Last modified: ${lastModified}

Using directory name "${name}" as project name...`,

  // Success messages
  PROJECT_SUCCESS_TEXT: (name: string, projectId: string, repoUrl?: string, localPath?: string, sourcePath?: string) => {
    const repoSection = repoUrl ? `Repository URL: ${repoUrl}\n` : '';
    const sourceSection = sourcePath ? `Source path: ${sourcePath}\n` : '';
    
    return `✅ Project created successfully!

Project name: ${name}
Project ID: ${projectId}
${repoSection}Project type: ${repoUrl ? 'GitHub repository' : 'Local directory'}
Local path: ${localPath}
${sourceSection}
Project is ready! You can now chat with Claude Code directly.`;
  },

  // Status messages
  STATUS_TEXT: (userState: string, sessionStatus: string, projectCount: number, activeProjectName: string, activeProjectType: string, activeProjectPath: string, permissionMode: string, authStatus: string, hasClaudeSession: string) =>
    `📊 Current Status

🔧 **System Status**
User state: ${userState}
Session status: ${sessionStatus}
Authentication: ${authStatus}
Claude session: ${hasClaudeSession}

📋 **Projects**
Total projects: ${projectCount}
Active project: ${activeProjectName}
Project type: ${activeProjectType}
Project path: ${activeProjectPath}

⚙️ **Settings**
Permission mode: ${permissionMode}`,

  // Help text
  HELP_TEXT: `📚 Help Documentation

📋 **Project Management**
/createproject - Create new project (GitHub repo or local directory)
/listproject - View all your projects
/exitproject - Exit current project

💬 **Session Control**
/auth [secret] - Authenticate with secret (if required)
/abort - Abort current Claude query
/clear - Clear Claude session

🔧 **Permission Modes**
/default - Standard behavior with permission prompts
/acceptedits - Auto-accept file edit permissions
/plan - Analysis only, no file modifications
/bypass - Skip all permission prompts (secure environments)

📁 **File Operations**
/ls [path] - Browse project files and directories

ℹ️ **Information**
/status - View comprehensive status information
/help - Show this help message

**Usage Flow:**
1. Authenticate with /auth if secret is required
2. Create project with /createproject
3. Chat directly with Claude Code
4. Use permission modes to control Claude's capabilities
5. Browse files with /ls when needed

**Tips:**
• After creating a project, just send messages to interact with Claude
• Use /status to check your current setup`,

  // Progress messages
  CLONING_REPO: '⏳ Cloning repository...',
  TYPING_INDICATOR: '⌨️ Typing...',

  // Error messages
  ERRORS: {
    COMPLETE_CURRENT_OPERATION: 'Please exit current project first',
    INVALID_GITHUB_URL: 'Invalid GitHub repository link',
    INVALID_ABSOLUTE_PATH: 'Please provide absolute path (starting with /)',
    DIRECTORY_NOT_FOUND: 'Directory does not exist or cannot be accessed',
    PROJECT_CREATION_FAILED: (error: string) => `Project creation failed: ${error}`,
    NO_ACTIVE_SESSION: 'No active session',
    SEND_INPUT_FAILED: (error: string) => `Failed to send input: ${error}`,
    INVALID_OPERATION: 'Invalid operation',
    USER_NOT_INITIALIZED: 'User not initialized',
    FEATURE_IN_DEVELOPMENT: 'Feature under development'
  },

  // Permission messages
  PERMISSION_GRANTED: 'Permission granted',
  PERMISSION_DENIED: 'Permission denied',

  // Button labels
  BUTTONS: {
    GITHUB_REPO: '🔗 GitHub Repository',
    LOCAL_DIRECTORY: '📂 Local Directory',
    CANCEL: '❌ Cancel',
    START_SESSION: '🚀 Start Session',
    PROJECT_LIST: '📋 Project List',
    APPROVE: '✅ Allow',
    DENY: '❌ Deny',
  }
};