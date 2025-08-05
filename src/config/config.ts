import { config } from 'dotenv';

config();

export interface TelegramConfig {
  botToken: string;
  mode: 'polling' | 'webhook';
}

export interface WebhookConfig {
  domain: string;
  port: number;
  path: string;
  secretToken?: string | undefined;
}

export interface ClaudeCodeConfig {
  binaryPath: string;
}

export interface WorkDirConfig {
  workDir: string;
}

export interface StorageConfig {
  type: 'redis' | 'memory';
  redisUrl?: string;
  sessionTimeout: number; // in milliseconds
}

export interface WorkersConfig {
  enabled: boolean;
  endpoint?: string | undefined;
  apiKey?: string | undefined;
}

export interface SecurityConfig {
  secretRequired: boolean;
  secretToken?: string | undefined;
}



export interface Config {
  telegram: TelegramConfig;
  claudeCode: ClaudeCodeConfig;
  workDir: WorkDirConfig;
  storage: StorageConfig;
  webhook?: WebhookConfig;
  workers: WorkersConfig;
  security: SecurityConfig;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function parseDuration(s: string): number {
  const match = s.match(/^(\d+)([smhdwM])$/);
  if (!match) {
    return 30 * 60 * 1000; // 30 minutes default
  }
  
  const value = parseInt(match[1]!, 10);
  const unit = match[2];
  
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    case 'w':
      return value * 7 * 24 * 60 * 60 * 1000;
    case 'M':
      return value * 30 * 24 * 60 * 60 * 1000;
    default:
      return 30 * 60 * 1000;
  }
}

export function loadConfig(): Config {
  const mode = getEnvOrDefault('BOT_MODE', 'polling') as 'polling' | 'webhook';
  const storageType = getEnvOrDefault('STORAGE_TYPE', 'redis') as 'redis' | 'memory';
  
  const config: Config = {
    telegram: {
      botToken: getEnvOrDefault('TG_BOT_TOKEN', ''),
      mode,
    },
    claudeCode: {
      binaryPath: getEnvOrDefault('CLAUDE_CODE_PATH', 'claude'),
    },
    workDir: {
      workDir: getEnvOrDefault('WORK_DIR', '/tmp/tg-claudecode'),
    },
    storage: {
      type: storageType,
      sessionTimeout: parseDuration(getEnvOrDefault('SESSION_TIMEOUT', '30m')),
      ...(process.env.REDIS_URL ? { redisUrl: process.env.REDIS_URL } : {})
    },
    workers: {
      enabled: getEnvOrDefault('WORKERS_ENABLED', 'false') === 'true',
      endpoint: process.env.WORKERS_ENDPOINT || undefined,
      apiKey: process.env.WORKERS_API_KEY || undefined,
    },
    security: {
      secretRequired: getEnvOrDefault('SECURITY_SECRET_REQUIRED', 'false') === 'true',
      secretToken: process.env.SECURITY_SECRET_TOKEN || undefined,
    },
  };

  // Add webhook config if mode is webhook
  if (mode === 'webhook') {
    config.webhook = {
      domain: getEnvOrDefault('WEBHOOK_DOMAIN', ''),
      port: parseInt(getEnvOrDefault('WEBHOOK_PORT', '3000'), 10),
      path: getEnvOrDefault('WEBHOOK_PATH', '/webhook'),
      secretToken: process.env.WEBHOOK_SECRET || undefined,
    };
  }

  return config;
}

export function validateConfig(config: Config): void {
  if (!config.telegram.botToken) {
    throw new Error('TG_BOT_TOKEN is required');
  }
  
  if (!config.claudeCode.binaryPath) {
    throw new Error('CLAUDE_CODE_PATH is required');
  }
  
  if (!config.workDir.workDir) {
    throw new Error('WORK_DIR is required');
  }

  // Only polling mode is supported, reject webhook mode
  if (config.telegram.mode === 'webhook') {
    throw new Error('Webhook mode is not supported. Only polling mode is available.');
  }



  // Validate security config
  if (config.security.secretRequired && !config.security.secretToken) {
    throw new Error('SECURITY_SECRET_TOKEN is required when SECURITY_SECRET_REQUIRED is true');
  }
}