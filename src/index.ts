import { EventEmitter } from 'events';
import sizeof from 'object-sizeof';
import hash from 'object-hash';

interface QueueItem<T> {
    key: string;
    resolve: (value: T) => void;
    reject: (reason?: any) => void;
    originalQuery: any;
}

export class BatcherError extends Error {
    constructor(message: string, public readonly query: any, public readonly cause?: any) {
        super(message);
        this.name = 'BatcherError'; 
        if (Error.captureStackTrace) {
          Error.captureStackTrace(this, BatcherError)
        }
    }
}

export class CacheError extends BatcherError {}
export class BatchFunctionError extends BatcherError {}
export class MemoryLimitError extends BatcherError {}
export class NotFoundError extends BatcherError {}

interface SmartBatcherOptions {
    delay?: number;
    memoryLimitMB?: number;
    expirationTime?: number;
    hashFn?: (key: any) => string;
    queryNormalizer?: (query: any) => any;
    cacheKeyFields?: string[];
    debugMode?: boolean;
}

class SmartBatcher<T> extends EventEmitter {
    private queue: QueueItem<T>[] = [];
    private scheduled: boolean = false;
    private batchFunction: (queries: any[]) => Promise<(T | Error | null)[]>;
    private delay: number;
    private memoryStore: Record<string, T> = {};
    private memoryLimitMB: number;
    private expirationTime: number;
    private expirationTimers: Record<string, NodeJS.Timeout> = {};
    private hashFn: (key: any) => string;
    private queryNormalizer: (query: any) => any;
    private cacheKeyFields: string[] | null;
    private debugMode: boolean;

    constructor(
        batchFunction: (queries: any[]) => Promise<(T | Error | null)[]>,
        options: SmartBatcherOptions = {}
    ) {
        super();
        const { 
            delay = 0, 
            memoryLimitMB = 1024, 
            expirationTime = 0, 
            hashFn = this.defaultHashFn,
            queryNormalizer = this.defaultQueryNormalizer,
            cacheKeyFields = null,
            debugMode = false
        } = options;

        this.batchFunction = batchFunction;
        this.delay = delay;
        this.memoryLimitMB = memoryLimitMB;
        this.expirationTime = expirationTime;
        this.hashFn = hashFn;
        this.queryNormalizer = queryNormalizer;
        this.cacheKeyFields = cacheKeyFields;
        this.debugMode = debugMode;
    }

    private defaultHashFn(query: any): string {
        return hash(query);
    }
    
    private defaultQueryNormalizer(query: any): any {
        return query;
    }
    
    private extractCacheKey(query: any): any {
        if (!this.cacheKeyFields || this.cacheKeyFields.length === 0) {
            return query;
        }
        
        const keyObject: Record<string, any> = {};
        this.cacheKeyFields.forEach(field => {
            if (query[field] !== undefined) {
                keyObject[field] = query[field];
            }
        });
        return keyObject;
    }

    async load(query: any): Promise<T> {
        const normalizedQuery = this.queryNormalizer(query);
        const cacheKeyData = this.extractCacheKey(normalizedQuery);
        const key = this.hashFn(cacheKeyData);

        if (this.debugMode) {
            console.debug('SmartBatcher load:', { 
                originalQuery: query,
                normalizedQuery,
                cacheKeyData,
                key
            });
        }

        try {
            const cachedValue = await this.get(key);
            if (cachedValue !== undefined) {
                this.emit('cacheHit', { key, query: normalizedQuery, value: cachedValue });
                return cachedValue;
            }
        } catch (error) {
            throw new CacheError(`Error getting value from cache for key '${key}'`, normalizedQuery, error);
        }

        this.emit('cacheMiss', { key, query: normalizedQuery });
        return new Promise((resolve, reject) => {
            this.queue.push({ key, resolve, reject, originalQuery: normalizedQuery });
            this.scheduleBatch();
        });
    }

    async loadMany(queries: any[]): Promise<(T | Error)[]> {
        const results: (T | Error)[] = [];
        const queriesToFetch: any[] = [];
        const queryIndexMap = new Map<number, number>();
        const cacheKeys: string[] = [];
        const normalizedQueries = queries.map(q => this.queryNormalizer(q));

        for (let i = 0; i < normalizedQueries.length; i++) {
            const query = normalizedQueries[i];
            const cacheKeyData = this.extractCacheKey(query);
            const key = this.hashFn(cacheKeyData);
            cacheKeys.push(key);

            if (this.debugMode) {
                console.debug('SmartBatcher loadMany item:', { 
                    originalQuery: queries[i],
                    normalizedQuery: query,
                    cacheKeyData,
                    key
                });
            }

            try {
                const cachedValue = await this.get(key);
                if (cachedValue !== undefined) {
                    this.emit('cacheHit', { key, query, value: cachedValue });
                    results[i] = cachedValue;
                } else {
                    this.emit('cacheMiss', { key, query });
                    queriesToFetch.push(query);
                    queryIndexMap.set(queriesToFetch.length - 1, i);
                    results[i] = new NotFoundError(`Key not found in cache: ${key}`, query);
                }
            } catch (error) {
                queriesToFetch.push(query);
                queryIndexMap.set(queriesToFetch.length - 1, i);
                results[i] = new CacheError(`Error getting value from cache for key '${key}'`, query, error);
            }
        }

        if (queriesToFetch.length === 0) {
            return results;
        }

        try {
            const batchResults = await this.batchFunction(queriesToFetch);

            if (!Array.isArray(batchResults)) {
                throw new BatchFunctionError("batchFunction must return an array", queriesToFetch);
            }

            batchResults.forEach((result, index) => {
                const originalIndex = queryIndexMap.get(index)!;
                const key = cacheKeys[originalIndex];

                if (result instanceof Error) {
                    results[originalIndex] = result;
                } else if (result !== null) {
                    results[originalIndex] = result;
                    this.setValue(key, result).catch(setError => {
                        results[originalIndex] = new CacheError(`Error setting value in cache for key '${key}'`, queriesToFetch[index], setError);
                    });
                } else {
                    results[originalIndex] = new NotFoundError(`Not found: ${key}`, queriesToFetch[index]);
                }
            });
        } catch (batchError: any) {
            queriesToFetch.forEach((query, index) => {
                const originalIndex = queryIndexMap.get(index)!;
                results[originalIndex] = new BatchFunctionError(`Error in batchFunction`, query, batchError);
            });
        }

        return results;
    }

    private scheduleBatch(): void {
        if (!this.scheduled) {
            this.scheduled = true;
            if (this.delay > 0) {
                setTimeout(() => this.executeBatch(), this.delay);
            } else {
                setImmediate(() => this.executeBatch());
            }
        }
    }

    private async executeBatch(): Promise<void> {
        this.scheduled = false;
        const currentQueue = this.queue;
        this.queue = [];

        if (this.debugMode) {
            console.debug('SmartBatcher executeBatch:', { 
                queueLength: currentQueue.length,
                queries: currentQueue.map(item => item.originalQuery)
            });
        }

        const queries = currentQueue.map(item => item.originalQuery);
        try {
            const results = await this.batchFunction(queries);

            if (!Array.isArray(results)) {
                const error = new BatchFunctionError("batchFunction must return an array", queries);
                currentQueue.forEach(item => item.reject(error));
                return;
            }
            results.forEach((result, index) => {
                const item = currentQueue[index];
                if (!item) {
                    return; 
                }

                if (result instanceof Error) {
                    item.reject(result);
                } else if (result !== null) {
                    this.setValue(item.key, result)
                        .then(() => item.resolve(result))
                        .catch(error => item.reject(new CacheError(`Error setting value in cache during batch for key '${item.key}'`, item.originalQuery, error)));

                } else {
                    item.reject(new NotFoundError(`Not found: ${item.key}`, item.originalQuery));
                }
            });

        } catch (error: any) {
            currentQueue.forEach(item =>
                item.reject(new BatchFunctionError("Error executing batchFunction", item.originalQuery, error))
            );
        }
    }

    async clearCache(): Promise<void> {
        await this.restartAllValues();
    }

    private async checkMemoryAvailability(newData: Record<string, T>): Promise<boolean> {
        const currentSize = sizeof(this.memoryStore);
        const newDataSize = sizeof(newData);
        const totalSizeMB = (currentSize + newDataSize) / 1024 / 1024;
        return totalSizeMB <= this.memoryLimitMB;
    }

    private setExpiration(key: string): void {
        if (this.expirationTime > 0) {
            if (this.expirationTimers[key]) {
                clearTimeout(this.expirationTimers[key]);
            }
            this.expirationTimers[key] = setTimeout(async () => {
                await this.deleteValue(key);
                this.emit('expiredValue', { key });
            }, this.expirationTime);
        }
    }

    async setValue(key: string, value: T): Promise<Record<string, T>> {
        if (!(await this.checkMemoryAvailability({ [key]: value }))) {
            throw new MemoryLimitError(`Not enough memory to save data for key '${key}'`, { key, value });
        }
        this.memoryStore[key] = value;
        this.setExpiration(key);
        this.emit('setValue', { key, value });
        return { [key]: value };
    }

    async deleteValue(key: string): Promise<Record<string, T>> {
        const value = { [key]: this.memoryStore[key] };
        delete this.memoryStore[key];

        if (this.expirationTimers[key]) {
            clearTimeout(this.expirationTimers[key]);
            delete this.expirationTimers[key];
        }
        this.emit('deleteValue', { key, deletedValue: value });
        return value;
    }

    async get(key: string): Promise<T | undefined> {
        const value = this.memoryStore[key];
        this.emit('getValue', { key, value });
        return value;
    }

    async has(key: string): Promise<boolean> {
        const exists = key in this.memoryStore;
        this.emit('has', { key, exists });
        return exists;
    }

    async restartAllValues(): Promise<Record<string, T>> {
        this.memoryStore = {};
        Object.values(this.expirationTimers).forEach(clearTimeout);
        this.expirationTimers = {};
        this.emit('deleteAlls', this.memoryStore);
        return this.memoryStore;
    }
}

export default SmartBatcher;