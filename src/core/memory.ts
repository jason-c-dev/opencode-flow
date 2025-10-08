import { MemoryBackend, MemoryEntry } from './types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class FileMemoryBackend implements MemoryBackend {
  private storePath: string;
  private cache: Map<string, MemoryEntry> = new Map();

  constructor(storePath: string = './.flow-memory') {
    this.storePath = storePath;
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storePath, { recursive: true });
    } catch (error) {
      console.warn(`Failed to create memory directory: ${this.storePath}`, error);
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const entry: MemoryEntry = {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
      createdBy: 'system'
    };

    this.cache.set(key, entry);

    try {
      const filePath = this.getFilePath(key);
      await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to persist memory entry: ${key}`, error);
    }
  }

  async get(key: string): Promise<any> {
    let entry = this.cache.get(key);

    if (!entry) {
      try {
        const filePath = this.getFilePath(key);
        const data = await fs.readFile(filePath, 'utf-8');
        entry = JSON.parse(data) as MemoryEntry;
        this.cache.set(key, entry);
      } catch (error) {
        return null;
      }
    }

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      await this.delete(key);
      return null;
    }

    return entry.value;
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);

    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
    } catch (error) {
      // File might not exist, ignore error
    }
  }

  async listKeys(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.storePath);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch (error) {
      return [];
    }
  }

  async clear(): Promise<void> {
    this.cache.clear();

    try {
      const files = await fs.readdir(this.storePath);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.storePath, file)))
      );
    } catch (error) {
      console.error('Failed to clear memory backend', error);
    }
  }

  private getFilePath(key: string): string {
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storePath, `${sanitizedKey}.json`);
  }
}
