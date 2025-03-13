import { EventEmitter } from 'events';

interface QueueItem<T> { 
    key: string;
    resolve: (value: T) => void;
    reject: (reason?: any) => void;
}

declare class SmartBatcher<T> extends EventEmitter { 
    private queue: QueueItem<T>[];
    private scheduled: boolean;
    private batchFunction: (keys: string[]) => Promise<(T | Error | null)[]>; 
    private delay: number;
    private memoryStore: Record<string, T>;
    private memoryLimitMB: number;
    private expirationTime: number;
    private expirationTimers: Record<string, NodeJS.Timeout>;


    constructor(
        batchFunction: (keys: string[]) => Promise<(T | Error | null)[]>,
        options?: {
            delay?: number;
            memoryLimitMB?: number;
            expirationTime?: number;
        }
    );

    load(key: string): Promise<T>;  
    loadMany(keys: string[]): Promise<(T | Error)[]>; 
    clearCache(): Promise<void>;
    private scheduleBatch(): void;
    private executeBatch(): Promise<void>;
    private checkMemoryAvailability(newData: Record<string, T>): Promise<boolean>;
    private setExpiration(key: string): void;
    setValue(key: string, value: T): Promise<Record<string, T>>;
    deleteValue(key: string): Promise<Record<string, T>>;
    get(key: string): Promise<T | undefined>;
    has(key: string): Promise<boolean>
    restartAllValues(): Promise<Record<string, T>>;
}

export default SmartBatcher;