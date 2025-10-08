import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileMemoryBackend } from '../../src/core/memory.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('FileMemoryBackend', () => {
  const testStorePath = './.test-flow-memory';
  let backend: FileMemoryBackend;

  beforeEach(() => {
    backend = new FileMemoryBackend(testStorePath);
  });

  afterEach(async () => {
    await backend.clear();
    try {
      await fs.rm(testStorePath, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('set and get', () => {
    it('should store and retrieve a value', async () => {
      await backend.set('test-key', { data: 'test-value' });
      const value = await backend.get('test-key');
      expect(value).toEqual({ data: 'test-value' });
    });

    it('should store and retrieve different types', async () => {
      await backend.set('string', 'hello');
      await backend.set('number', 42);
      await backend.set('object', { nested: { value: true } });
      await backend.set('array', [1, 2, 3]);

      expect(await backend.get('string')).toBe('hello');
      expect(await backend.get('number')).toBe(42);
      expect(await backend.get('object')).toEqual({ nested: { value: true } });
      expect(await backend.get('array')).toEqual([1, 2, 3]);
    });

    it('should return null for non-existent key', async () => {
      const value = await backend.get('does-not-exist');
      expect(value).toBeNull();
    });

    it('should overwrite existing key', async () => {
      await backend.set('key', 'value1');
      await backend.set('key', 'value2');
      const value = await backend.get('key');
      expect(value).toBe('value2');
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire values after TTL', async () => {
      await backend.set('expiring-key', 'value', 1); // 1 second TTL
      
      // Should exist immediately
      let value = await backend.get('expiring-key');
      expect(value).toBe('value');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be expired
      value = await backend.get('expiring-key');
      expect(value).toBeNull();
    });

    it('should not expire values without TTL', async () => {
      await backend.set('permanent-key', 'value');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const value = await backend.get('permanent-key');
      expect(value).toBe('value');
    });
  });

  describe('delete', () => {
    it('should delete a key', async () => {
      await backend.set('key-to-delete', 'value');
      expect(await backend.get('key-to-delete')).toBe('value');
      
      await backend.delete('key-to-delete');
      expect(await backend.get('key-to-delete')).toBeNull();
    });

    it('should not throw when deleting non-existent key', async () => {
      await expect(backend.delete('does-not-exist')).resolves.not.toThrow();
    });
  });

  describe('listKeys', () => {
    it('should list all keys', async () => {
      await backend.set('key1', 'value1');
      await backend.set('key2', 'value2');
      await backend.set('key3', 'value3');

      const keys = await backend.listKeys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });

    it('should return empty array when no keys exist', async () => {
      const keys = await backend.listKeys();
      expect(keys).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all keys', async () => {
      await backend.set('key1', 'value1');
      await backend.set('key2', 'value2');
      await backend.set('key3', 'value3');

      expect(await backend.listKeys()).toHaveLength(3);

      await backend.clear();

      expect(await backend.listKeys()).toEqual([]);
    });
  });

  describe('key sanitization', () => {
    it('should handle special characters in keys', async () => {
      await backend.set('key/with/slashes', 'value1');
      await backend.set('key with spaces', 'value2');
      await backend.set('key@with#special$chars', 'value3');

      expect(await backend.get('key/with/slashes')).toBe('value1');
      expect(await backend.get('key with spaces')).toBe('value2');
      expect(await backend.get('key@with#special$chars')).toBe('value3');
    });
  });
});
