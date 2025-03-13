import { EventEmitter } from "events";
import sizeof from "object-sizeof";

interface QueueItem<T> {
  key: string;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
}

class SmartBatcher<T> extends EventEmitter {
  private queue: QueueItem<T>[] = [];
  private scheduled: boolean = false;
  private batchFunction: (keys: string[]) => Promise<(T | Error | null)[]>;
  private delay: number;

  private memoryStore: Record<string, T> = {};
  private memoryLimitMB: number;
  private expirationTime: number;
  private expirationTimers: Record<string, NodeJS.Timeout> = {};

  constructor(
    batchFunction: (keys: string[]) => Promise<(T | Error | null)[]>,
    options: {
      delay?: number;
      memoryLimitMB?: number;
      expirationTime?: number;
    } = {}
  ) {
    super();
    const { delay = 0, memoryLimitMB = 1024, expirationTime = 0 } = options;
    this.batchFunction = batchFunction;
    this.delay = delay;
    this.memoryLimitMB = memoryLimitMB;
    this.expirationTime = expirationTime;
  }

  async load(key: string): Promise<T> {
    try {
      const cachedValue = await this.get(key);
      if (cachedValue !== undefined) {
        return cachedValue;
      }
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ key, resolve, reject });
      this.scheduleBatch();
    });
  }

  async loadMany(keys: string[]): Promise<(T | Error)[]> {
    const results: (T | Error)[] = [];
    const keysToFetch: string[] = [];
    const keyIndexMap = new Map<string, number>();

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      try {
        const cachedValue = await this.get(key);
        if (cachedValue !== undefined) {
          results[i] = cachedValue;
        } else {
          keysToFetch.push(key);
          keyIndexMap.set(key, i);
          results[i] = new Error(`Key not found in cache: ${key}`);
        }
      } catch (error) {
        console.error("Cache get error:", error);
        keysToFetch.push(key);
        keyIndexMap.set(key, i);
        results[i] = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (keysToFetch.length === 0) {
      return results;
    }

    try {
      const batchResults = await this.batchFunction(keysToFetch);
      if (!Array.isArray(batchResults)) {
        throw new Error("batchFunction must return an array");
      }
      batchResults.forEach((result, index) => {
        const key = keysToFetch[index];
        const originalIndex = keyIndexMap.get(key)!;

        if (result instanceof Error) {
          results[originalIndex] = result;
        } else if (result !== null) {
          results[originalIndex] = result;
          this.setValue(key, result).catch((error) => {
            console.error("Cache set error:", error);
          });
        } else {
          results[originalIndex] = new Error(`Not found: ${key}`);
        }
      });
    } catch (batchError) {
      keysToFetch.forEach((key) => {
        const originalIndex = keyIndexMap.get(key)!;
        results[originalIndex] =
          batchError instanceof Error
            ? batchError
            : new Error(String(batchError));
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

    const keys = currentQueue.map((item) => item.key);

    try {
      const results = await this.batchFunction(keys);

      if (!Array.isArray(results)) {
        const error = new Error("batchFunction must return an array");
        currentQueue.forEach((item) => item.reject(error));
        return;
      }

      const resultMap = new Map<string, T>();
      results.forEach((result, index) => {
        if (result instanceof Error) {
          currentQueue[index]?.reject(result);
        } else if (result !== null) {
          resultMap.set(keys[index], result);
          this.setValue(keys[index], result).catch((error) => {
            console.error("Cache set error:", error);
          });
        }
      });

      currentQueue.forEach((item) => {
        if (resultMap.has(item.key)) {
          item.resolve(resultMap.get(item.key)!);
        } else {
          item.reject(new Error(`Not found: ${item.key}`));
        }
      });
    } catch (error) {
      currentQueue.forEach((item) => item.reject(error));
    }
  }

  async clearCache(): Promise<void> {
    await this.restartAllValues();
  }

  private async checkMemoryAvailability(
    newData: Record<string, T>
  ): Promise<boolean> {
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
        this.emit("expiredValue", { key });
      }, this.expirationTime);
    }
  }

  async setValue(key: string, value: T): Promise<Record<string, T>> {
    if (await this.checkMemoryAvailability({ [key]: value })) {
      this.memoryStore[key] = value;
      this.setExpiration(key);
      this.emit("setValue", { key, value });
      return { [key]: value };
    }
    throw new Error("Not enough memory to save data.");
  }

  async deleteValue(key: string): Promise<Record<string, T>> {
    const value = { [key]: this.memoryStore[key] };
    delete this.memoryStore[key];

    if (this.expirationTimers[key]) {
      clearTimeout(this.expirationTimers[key]);
      delete this.expirationTimers[key];
    }
    this.emit("deleteValue", { key, deletedValue: value });
    return value;
  }

  async get(key: string): Promise<T | undefined> {
    const value = this.memoryStore[key];
    this.emit("getValue", { key, value });
    return value;
  }
  async has(key: string): Promise<boolean> {
    const exists = key in this.memoryStore;
    this.emit("has", { key, exists });
    return exists;
  }

  async restartAllValues(): Promise<Record<string, T>> {
    this.memoryStore = {};
    Object.values(this.expirationTimers).forEach(clearTimeout);
    this.expirationTimers = {};
    this.emit("deleteAlls", this.memoryStore);
    return this.memoryStore;
  }
}

export default SmartBatcher;
