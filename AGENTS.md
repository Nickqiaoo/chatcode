<general_rules>
- Use `pnpm` as the package manager for this project.
- All code, comments, and documentation must be written in English.
- Maintain code quality by running the linter and formatter before committing changes.
  - `pnpm run lint`: Lints all TypeScript files in the `src/` directory.
  - `pnpm run lint:fix`: Automatically fixes linting errors where possible.
  - `pnpm run format`: Formats the code using Prettier.
</general_rules>
<repository_structure>
- The repository contains a Telegram bot that integrates with the Claude Code SDK.
- The main application source code is located in the `src/` directory.
- The entry point for the application is `src/main.ts`.
- The architecture is modular:
  - `src/handlers/`: Contains the core logic for Claude integration (`claude.ts`) and Telegram coordination (`telegram.ts`).
  - `src/storage/`: Implements a storage abstraction layer that supports both Redis and in-memory backends for session management.
  - `src/services/`: Contains business logic, including a permission management system for tool usage.
- A separate Cloudflare Workers application is located in the `workers/` directory. This worker provides a diff viewer service and has its own `package.json` and dependencies.
</repository_structure>
<dependencies_and_installation>
- To install dependencies for the main bot, run `pnpm install` in the root directory.
- The Cloudflare worker in the `workers/` directory has its own set of dependencies. To install them, navigate to the `workers/` directory and run `pnpm install`.
</dependencies_and_installation>
<testing_instructions>
- There is currently no test framework configured for this project.
</testing_instructions>
<pull_request_formatting>
</pull_request_formatting>

