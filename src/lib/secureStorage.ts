/**
 * Secure Storage Utility
 * 
 * Provides safe wrappers around localStorage with:
 * - Schema validation
 * - Size limits
 * - XSS prevention
 * - JSON parsing safety
 */

import { sanitizeJsonInput } from './xss';
import { logger } from './logger';

const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB limit
const MAX_ITEM_SIZE = 100 * 1024; // 100KB per item

interface StorageOptions {
  maxSize?: number;
  validate?: (data: unknown) => boolean;
  schema?: Record<string, string>;
}

/**
 * Safely parses JSON with size limit and validation
 */
export function safeJsonParse<T>(
  text: string,
  maxSize: number = MAX_ITEM_SIZE
): T | null {
  if (!text || text.length > maxSize) {
    logger.warn('JSON parse rejected: size limit exceeded or empty');
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    // Prevent prototype pollution
    return sanitizeJsonInput(parsed) as T;
  } catch (error) {
    logger.warn('JSON parse failed', { error });
    return null;
  }
}

/**
 * Safely serializes data to JSON with validation
 */
export function safeJsonStringify(data: unknown, maxSize: number = MAX_ITEM_SIZE): string | null {
  try {
    const sanitized = sanitizeJsonInput(data);
    const json = JSON.stringify(sanitized);
    if (json.length > maxSize) {
      logger.warn('JSON stringify rejected: size limit exceeded');
      return null;
    }
    return json;
  } catch (error) {
    logger.warn('JSON stringify failed', { error });
    return null;
  }
}

/**
 * Validates that data matches expected schema types
 */
function validateSchema(data: unknown, schema: Record<string, string>): boolean {
  if (typeof data !== 'object' || data === null) return false;
  
  const record = data as Record<string, unknown>;
  for (const [key, expectedType] of Object.entries(schema)) {
    const value = record[key];
    if (value === undefined) continue;
    
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== expectedType) {
      logger.warn(`Schema validation failed for key: ${key}`, { expected: expectedType, actual: actualType });
      return false;
    }
  }
  return true;
}

/**
 * Secure wrapper for localStorage operations
 */
export class SecureStorage {
  private storage: Storage | null;
  private prefix: string;

  constructor(prefix = 'soma_', storage?: Storage) {
    this.prefix = prefix;
    this.storage = typeof window !== 'undefined' ? (storage || localStorage) : null;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Safely get and parse an item from storage
   */
  get<T>(key: string, options: StorageOptions = {}): T | null {
    if (!this.storage) return null;

    try {
      const raw = this.storage.getItem(this.getKey(key));
      if (!raw) return null;

      const parsed = safeJsonParse<T>(raw, options.maxSize);
      if (parsed === null) return null;

      // Validate against schema if provided
      if (options.schema && !validateSchema(parsed, options.schema)) {
        logger.warn(`Schema validation failed for key: ${key}`);
        return null;
      }

      // Run custom validation if provided
      if (options.validate && !options.validate(parsed)) {
        logger.warn(`Custom validation failed for key: ${key}`);
        return null;
      }

      return parsed;
    } catch (error) {
      logger.error(`Failed to get item: ${key}`, error as Error);
      return null;
    }
  }

  /**
   * Safely set an item in storage
   */
  set<T>(key: string, value: T, options: StorageOptions = {}): boolean {
    if (!this.storage) return false;

    try {
      const json = safeJsonStringify(value, options.maxSize);
      if (!json) return false;

      // Check total storage size
      const currentSize = this.getStorageSize();
      if (currentSize + json.length > MAX_STORAGE_SIZE) {
        logger.warn('Storage set rejected: total size limit exceeded');
        return false;
      }

      this.storage.setItem(this.getKey(key), json);
      return true;
    } catch (error) {
      logger.error(`Failed to set item: ${key}`, error as Error);
      return false;
    }
  }

  /**
   * Remove an item from storage
   */
  remove(key: string): boolean {
    if (!this.storage) return false;

    try {
      this.storage.removeItem(this.getKey(key));
      return true;
    } catch (error) {
      logger.error(`Failed to remove item: ${key}`, error as Error);
      return false;
    }
  }

  /**
   * Clear all items with this prefix
   */
  clear(): boolean {
    if (!this.storage) return false;

    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key?.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => this.storage?.removeItem(key));
      return true;
    } catch (error) {
      logger.error('Failed to clear storage', error as Error);
      return false;
    }
  }

  /**
   * Get current storage size in bytes
   */
  getStorageSize(): number {
    if (!this.storage) return 0;

    let size = 0;
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(this.prefix)) {
        const value = this.storage.getItem(key);
        if (value) {
          size += key.length + value.length;
        }
      }
    }
    return size * 2; // UTF-16 encoding
  }
}

// Singleton instance
export const secureStorage = new SecureStorage();

/**
 * Creates a namespaced secure storage instance
 */
export function createSecureStorage(namespace: string): SecureStorage {
  return new SecureStorage(`soma_${namespace}_`);
}
