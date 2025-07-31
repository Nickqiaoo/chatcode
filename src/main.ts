import { Telegraf } from 'telegraf';
import { loadConfig, validateConfig } from './config/config';
import { StorageFactory } from './storage/factory';
import { IStorage } from './storage/interface';
import { GitHubManager } from './handlers/github';
import { DirectoryManager } from './handlers/directory';
import { ClaudeManager } from './handlers/claude';
import { TelegramHandler } from './handlers/telegram';
import { ExpressServer } from './server/express';
import { MessageFormatter } from './utils/formatter';
import { MCPServer } from './mcp/server';

async function main(): Promise<void> {
  try {
    // Load and validate configuration
    const config = loadConfig();
    validateConfig(config);

    console.log('Configuration loaded successfully');

    // Create Telegram Bot
    const bot = new Telegraf(config.telegram.botToken);
    bot.telegram.getMe().then((botInfo) => {
      console.log(`Authorized as @${botInfo.username}`);
    });

    // Initialize components
    const storage = StorageFactory.create(config.storage);
    await storage.initialize();
    console.log(`${config.storage.type} storage initialized`);
    
    const messageFormatter = new MessageFormatter();
    const github = new GitHubManager(config.workDir.workDir);
    const directory = new DirectoryManager();

    // First create a placeholder handler that we'll set up later
    let telegramHandler: TelegramHandler;

    // Initialize SDK manager with callback architecture
    const claudeSDK = new ClaudeManager(storage, config, {
      onClaudeResponse: async (userId: string, message: any, toolInfo?: { toolId: string; toolName: string; isToolUse: boolean; isToolResult: boolean }, parentToolUseId?: string) => {
        await telegramHandler.handleClaudeResponse(userId, message, toolInfo, parentToolUseId);
      },
      onClaudeError: async (userId: string, error: string) => {
        await telegramHandler.handleClaudeError(userId, error);
      }
    });
    console.log('Claude SDK manager initialized');

    // Create Telegram handler with callback architecture
    telegramHandler = new TelegramHandler(
      bot,
      github,
      directory,
      claudeSDK,
      storage,
      messageFormatter,
      config
    );

    console.log('Telegram handler initialized with callback architecture');

    // Initialize MCP server with its own Express instance (localhost only)
    const mcpServer = new MCPServer(bot, storage, config.mcp.port);
    await mcpServer.start();
    
    if (config.telegram.mode === 'webhook') {
      if (!config.webhook) {
        throw new Error('Webhook configuration is missing');
      }
      const expressServer = new ExpressServer(bot, 3001);
      // Set up webhook
      await expressServer.setupWebhook(config.webhook);
      // Start Express server
      expressServer.setupRoutes();
      await expressServer.start();
    }
    
    // Start bot based on mode
    console.log(`Starting Telegram bot in ${config.telegram.mode} mode...`);
    
    if (config.telegram.mode === 'webhook') {
      console.log('Telegram bot is running in webhook mode');
    } else {
      // Use polling mode (default)
      await bot.launch();
      console.log('Telegram bot is running in polling mode');
    }

    // Handle graceful shutdown (register after successful startup)
    process.once('SIGINT', () => gracefulShutdown(bot, claudeSDK, mcpServer, storage));
    process.once('SIGTERM', () => gracefulShutdown(bot, claudeSDK, mcpServer, storage));
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}


async function gracefulShutdown(
  bot: Telegraf, 
  claudeSDK: ClaudeManager, 
  mcpServer: MCPServer,
  storage: IStorage
): Promise<void> {
  console.log('Received shutdown signal, shutting down gracefully...');
  
  try {
    // Stop the bot
    bot.stop('SIGINT');
    
    // Shutdown SDK manager
    await claudeSDK.shutdown();
    
    // Shutdown MCP server
    await mcpServer.stop();
    console.log('MCP server shutdown completed');
    
    // Disconnect storage
    await storage.disconnect();
    console.log('Storage disconnected');
    
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
