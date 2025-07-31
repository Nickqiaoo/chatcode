import express, { Request, Response, NextFunction } from 'express';
import { Telegraf } from 'telegraf';
import { WebhookConfig } from '../config/config';

export class ExpressServer {
  private app: express.Application;
  private bot: Telegraf;
  private port: number;

  constructor(bot: Telegraf, port: number) {
    this.app = express();
    this.bot = bot;
    this.port = port;
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Security headers
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });
  }

  public setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        mode: 'webhook'
      });
    });

    // Root endpoint
    this.app.get('/', (_req: Request, res: Response) => {
      res.json({ 
        message: 'Telegram Bot Webhook Server',
        status: 'running'
      });
    });

    // 404 handler
    this.app.use('*', (_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Express server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const server = this.app.listen(this.port, () => {
          console.log(`Express server listening on port ${this.port}`);
          resolve();
        });

        server.on('error', (error: any) => {
          console.error('Express server failed to start:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }


  public async setupWebhook(webhookConfig: WebhookConfig): Promise<void> {
    try {
        // Webhook endpoint for Telegram
      this.app.use(webhookConfig.path, this.bot.webhookCallback(webhookConfig.path));

      const webhookUrl = `${webhookConfig.domain}${webhookConfig.path}`;
      console.log(`Setting up webhook: ${webhookUrl}`);
      
      const webhookOptions: any = {
        url: webhookUrl,
      };

      // Add secret token if provided
      if (webhookConfig.secretToken) {
        webhookOptions.secret_token = webhookConfig.secretToken;
      }

      await this.bot.telegram.setWebhook(webhookUrl, webhookOptions);
      console.log('Webhook set successfully');
    } catch (error) {
      console.error('Failed to set webhook:', error);
      throw error;
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}