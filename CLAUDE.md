# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Use pnpm.
All comments and text in the code should be written in English.

## Development Commands

### Basic Commands
- `pnpm install` - Install all dependencies
- `pnpm run build` - Build TypeScript to JavaScript (output: `dist/`)
- `pnpm run start` - Start the production bot
- `pnpm run dev` - Start development server with watch mode
- `pnpm run watch` - Watch mode for development (TypeScript compiler)

### Code Quality
- `pnpm run lint` - Run ESLint on TypeScript files
- `pnpm run lint:fix` - Fix linting issues automatically
- `pnpm run format` - Format code with Prettier

### Workers (Optional Cloudflare Workers)
- `cd workers && pnpm install` - Install Workers dependencies
- `cd workers && wrangler deploy` - Deploy to Cloudflare Workers
- `cd workers && wrangler dev --remote --env production` - Test Workers locally

## Architecture Overview

This is a Telegram bot that integrates with Claude Code SDK, featuring a modular callback-based architecture:

### Core Components

1. **Entry Point** (`src/main.ts`)
   - Initializes all components with proper dependency injection
   - Sets up callback architecture between ClaudeManager and TelegramHandler
   - Handles graceful shutdown

2. **Claude Integration** (`src/handlers/claude.ts`)
   - Manages Claude Code SDK interactions via `@anthropic-ai/claude-code` package
   - Handles session resumption, tool use detection, and streaming responses
   - Uses callback pattern to communicate with Telegram handler

3. **Telegram Coordination** (`src/handlers/telegram.ts`)
   - Coordinates all Telegram bot functionality through specialized handlers
   - Delegates operations to command, callback, message, tool, file browser, and project handlers
   - Implements message batching for efficient delivery

4. **Storage Abstraction** (`src/storage/`)
   - Supports Redis (production) and memory (development) backends
   - Manages user sessions, projects, tool mappings, and session state
   - Factory pattern for storage type selection

5. **Permission System** (`src/services/permission.ts`)
   - Implements integrated permission handling for tool usage
   - Manages approval workflow for tool use requests
   - Provides different permission modes for various use cases

### Key Models and Types

- **UserSessionModel**: Manages user state, active projects, and Claude session data
- **Project**: Represents GitHub repos or local directories
- **PermissionMode**: Controls tool use permissions (`default`, `acceptEdits`, `plan`, `bypassPermissions`)
- **TargetTool**: Enum of Claude Code tools that can be intercepted

### Telegram Handler Delegation

The TelegramHandler delegates to specialized handlers:
- **CommandHandler**: Bot commands (`/start`, `/createproject`, etc.)
- **CallbackHandler**: Inline keyboard interactions
- **MessageHandler**: Regular text message processing
- **ToolHandler**: Claude tool use approval/rejection
- **FileBrowserHandler**: Directory navigation interface
- **ProjectHandler**: Project creation and management

### Configuration System

Environment-based configuration with validation:
- `TG_BOT_TOKEN` (required): Telegram bot token
- `CLAUDE_CODE_PATH` (required): Path to Claude Code binary
- `WORK_DIR` (required): Working directory for projects
- `STORAGE_TYPE`: `redis` or `memory`


Only polling mode is supported; webhook mode is disabled.

### Optional Cloudflare Workers

The `workers/` directory contains a separate Cloudflare Workers integration:
- Provides diff viewer service with HTML rendering
- Uses KV storage for temporary file hosting
- Independent package.json and wrangler.toml configuration

## Development Notes

- TypeScript with strict mode enabled and comprehensive type checking
- ESLint configuration with TypeScript-specific rules
- No test framework currently configured
- Callback architecture prevents circular dependencies between Claude and Telegram handlers
- Storage interface allows easy switching between Redis and memory backends
- Permission manager handles tool use permissions directly within the application

## important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.