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

- **UserSessionModel**: Manages user state, active projects, Claude session data, and model selection
- **Project**: Represents GitHub repos or local directories
- **PermissionMode**: Controls tool use permissions (`default`, `acceptEdits`, `plan`, `bypassPermissions`)
- **ClaudeModel**: Available Claude models (`claude-opus-4-5-20251101`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001`)
- **TargetTool**: Enum of Claude Code tools that can be intercepted

### Telegram Handler Delegation

The TelegramHandler delegates to specialized handlers:
- **CommandHandler**: Bot commands (`/start`, `/createproject`, `/model`, etc.)
- **CallbackHandler**: Inline keyboard interactions (project selection, model selection, etc.)
- **MessageHandler**: Text, photo, and voice message processing
- **ToolHandler**: Claude tool use approval/rejection
- **FileBrowserHandler**: Directory navigation interface
- **ProjectHandler**: Project creation and management

### Configuration System

Environment-based configuration with validation:
- `TG_BOT_TOKEN` (required): Telegram bot token
- `CLAUDE_CODE_PATH` (required): Path to Claude Code binary
- `WORK_DIR` (required): Working directory for projects
- `STORAGE_TYPE`: `redis` or `memory`
- `SECURITY_SECRET_REQUIRED`: Enable secret-based authentication (`true`/`false`)
- `SECURITY_SECRET_TOKEN`: Secret token for authentication
- `SECURITY_WHITELIST`: Comma-separated Telegram user IDs that bypass authentication
- `ASR_ENABLED`: Enable voice message support via ASR service (`true`/`false`)
- `ASR_ENDPOINT`: ASR service URL (default: `http://localhost:8600`)

Only polling mode is supported; webhook mode is disabled.

### Model Selection

Users can switch between different Claude models during their session:
- **Opus 4.5** (default): Most capable model for complex tasks
- **Sonnet 4.5**: Balanced performance and speed
- **Haiku 4.5**: Fastest model for simple tasks

Use `/model` command to view and switch models. The new model will be used for subsequent messages while preserving conversation history.

### Multimodal Input

- **Photo messages**: Images are downloaded from Telegram, converted to base64, and sent to Claude as image content blocks. Supports optional captions.
- **Voice messages**: Audio is downloaded from Telegram, sent to an external ASR service (Fun-ASR) for speech-to-text, then the transcribed text is forwarded to Claude. Requires `ASR_ENABLED=true`.

### ASR Service (`asr-service/`)

A standalone FastAPI service wrapping the Fun-ASR-Nano-2512 speech recognition model:
- `POST /asr`: Transcribe audio file to text (accepts `file`, `language`, `hotwords`, `itn` params)
- `GET /health`: Health check
- Setup: `cd asr-service && source venv/bin/activate && uvicorn server:app --host 0.0.0.0 --port 8600`
- Requires Python venv with `funasr`, `torch`, `tiktoken`, `transformers`, and `ffmpeg` installed on the system

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