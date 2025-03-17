declare module 'smart-batcher' {
    import { EventEmitter } from 'events';
  
    /**
     * Interface representing an item in the batch queue
     */
    interface QueueItem<T> {
      key: string;
      resolve: (value: T) => void;
      reject: (reason?: any) => void;
      originalQuery: any;
    }
  
    /**
     * Base error class for SmartBatcher errors
     */
    export class BatcherError extends Error {
      /**
       * The query that caused the error
       */
      readonly query: any;
      
      /**
       * The underlying cause of the error, if any
       */
      readonly cause?: any;
      
      /**
       * Creates a new BatcherError
       * 
       * @param message - Error message
       * @param query - The query that caused the error
       * @param cause - The underlying cause of the error
       */
      constructor(message: string, query: any, cause?: any);
    }
  
    /**
     * Error thrown when there's an issue with cache operations
     */
    export class CacheError extends BatcherError {}
  
    /**
     * Error thrown when the batch function fails
     */
    export class BatchFunctionError extends BatcherError {}
  
    /**
     * Error thrown when memory limits are exceeded
     */
    export class MemoryLimitError extends BatcherError {}
  
    /**
     * Error thrown when an item is not found
     */
    export class NotFoundError extends BatcherError {}
  
    /**
     * Configuration options for SmartBatcher
     */
    export interface SmartBatcherOptions {
      /**
       * Delay in milliseconds between receiving requests and executing the batch
       * @default 0
       */
      delay?: number;
  
      /**
       * Maximum memory usage in megabytes allowed for the cache
       * @default 1024 (1GB)
       */
      memoryLimitMB?: number;
  
      /**
       * Time in milliseconds after which cached items will expire
       * Set to 0 for no expiration
       * @default 0
       */
      expirationTime?: number;
  
      /**
       * Custom function to generate a hash for cache keys
       * @param key - The key data to hash
       * @returns A string hash
       */
      hashFn?: (key: any) => string;
  
      /**
       * Function to normalize queries before processing
       * @param query - The original query
       * @returns Normalized query
       */
      queryNormalizer?: (query: any) => any;
  
      /**
       * List of field names to extract from queries when creating cache keys
       * If null or empty, the entire query will be used
       * @default null
       */
      cacheKeyFields?: string[] | null;
  
      /**
       * Enable debug logging
       * @default false
       */
      debugMode?: boolean;
    }
  
    /**
     * SmartBatcher - Efficiently batch and cache requests
     */
    export default class SmartBatcher<T> extends EventEmitter {
      /**
       * Creates a new SmartBatcher instance
       * 
       * @param batchFunction - Function that handles batched requests
       * @param options - Configuration options
       */
      constructor(
        batchFunction: (queries: any[]) => Promise<(T | Error | null)[]>,
        options?: SmartBatcherOptions
      );
  
      /**
       * Loads a single item, batching with other requests if necessary
       * 
       * @param query - The query to process
       * @returns Promise that resolves with the result
       * @throws CacheError, BatchFunctionError, NotFoundError
       */
      load(query: any): Promise<T>;
  
      /**
       * Loads multiple items in a batch
       * 
       * @param queries - Array of queries to process
       * @returns Promise that resolves with results or errors
       */
      loadMany(queries: any[]): Promise<(T | Error)[]>;
  
      /**
       * Clears the entire cache
       */
      clearCache(): Promise<void>;
  
      /**
       * Sets a value in the cache
       * 
       * @param key - Cache key
       * @param value - Value to store
       * @returns Record containing the new cache entry
       * @throws MemoryLimitError
       */
      setValue(key: string, value: T): Promise<Record<string, T>>;
  
      /**
       * Deletes a value from the cache
       * 
       * @param key - Cache key to delete
       * @returns Record containing the deleted cache entry
       */
      deleteValue(key: string): Promise<Record<string, T>>;
  
      /**
       * Retrieves a value from the cache
       * 
       * @param key - Cache key
       * @returns The cached value or undefined if not found
       */
      get(key: string): Promise<T | undefined>;
  
      /**
       * Checks if a key exists in the cache
       * 
       * @param key - Cache key to check
       * @returns Boolean indicating if the key exists
       */
      has(key: string): Promise<boolean>;
  
      /**
       * Clears all values from the cache
       * 
       * @returns Empty cache object
       */
      restartAllValues(): Promise<Record<string, T>>;
  
      /**
       * Event: Emitted when a value is successfully retrieved from cache
       */
      on(event: 'cacheHit', listener: (data: { key: string, query: any, value: T }) => void): this;
  
      /**
       * Event: Emitted when a value is not found in cache
       */
      on(event: 'cacheMiss', listener: (data: { key: string, query: any }) => void): this;
  
      /**
       * Event: Emitted when a value is added to the cache
       */
      on(event: 'setValue', listener: (data: { key: string, value: T }) => void): this;
  
      /**
       * Event: Emitted when a value is deleted from the cache
       */
      on(event: 'deleteValue', listener: (data: { key: string, deletedValue: Record<string, T> }) => void): this;
  
      /**
       * Event: Emitted when a value is retrieved from the cache
       */
      on(event: 'getValue', listener: (data: { key: string, value: T | undefined }) => void): this;
  
      /**
       * Event: Emitted when checking if a key exists in the cache
       */
      on(event: 'has', listener: (data: { key: string, exists: boolean }) => void): this;
  
      /**
       * Event: Emitted when a cached value expires
       */
      on(event: 'expiredValue', listener: (data: { key: string }) => void): this;
  
      /**
       * Event: Emitted when the entire cache is cleared
       */
      on(event: 'deleteAlls', listener: (emptyStore: Record<string, T>) => void): this;
    }
  }