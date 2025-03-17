interface QueueItem<T, K> {
  key: K;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
}

class SmartBatcher<T, K extends string | number = string> {
  private queue: QueueItem<T, K>[];
  private scheduled: boolean;
  private batchFunction: (keys: K[]) => Promise<(T | Error | null)[]>;
  private delay: number;

  constructor(
    batchFunction: (keys: K[]) => Promise<(T | Error | null)[]>,
    delay: number = 0
  ) {
    this.batchFunction = batchFunction;
    this.delay = delay;
    this.queue = [];
    this.scheduled = false;
  }

  load(key: K): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ key, resolve, reject });
      this.scheduleBatch();
    });
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

      const resultMap = new Map<K, T>();
      results.forEach((result, index) => {
        if (result instanceof Error) {
          currentQueue[index]?.reject(result);
        } else if (result !== null) {
          resultMap.set(keys[index], result);
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
}

export default SmartBatcher;
