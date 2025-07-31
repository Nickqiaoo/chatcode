import { IStorage } from './interface';
import { RedisStorage } from './redis';
import { MemoryStorage } from './memory';
import { StorageConfig } from '../config/config';

export type StorageType = 'redis' | 'memory';


export class StorageFactory {
  static create(config: StorageConfig): IStorage {
    switch (config.type) {
      case 'redis':
        return new RedisStorage(config.redisUrl, config.sessionTimeout);
      case 'memory':
        return new MemoryStorage();
      default:
        throw new Error(`Unsupported storage type: ${config.type}`);
    }
  }
}