class SmartBatcher<T, K = any> {
    private queue: { key: K, resolve: (value: T) => void, reject: (reason?: any) => void }[];
    private timeout: NodeJS.Timeout | null;
    private batchFunction: (keys: K[]) => Promise<T[]>;
    private delay: number;

    constructor(batchFunction: (keys: K[]) => Promise<T[]>, delay: number = 800) {
        this.batchFunction = batchFunction;
        this.delay = delay;
        this.queue = [];
        this.timeout = null;
    }

    load(key: K): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({ key, resolve, reject });
            this.scheduleBatch();
        });
    }

    private scheduleBatch(): void {
        if (!this.timeout) {
            this.timeout = setTimeout(() => this.executeBatch(), this.delay);
        }
    }

    private async executeBatch(): Promise<void> {
        const currentQueue = this.queue;
        this.queue = [];
        this.timeout = null;

        const keys = currentQueue.map(item => item.key);

        try {
            const results = await this.batchFunction(keys);
            const resultMap = new Map(results.map(result => {
                if (typeof result === 'object' && result !== null && 'key' in result) {
                  return [result.key, result];
                }
                throw new Error("Invalid result format");
            }));

            currentQueue.forEach(item => {
                const result = resultMap.get(item.key);
                if (result) {
                  item.resolve(result);
                }
                else {
                  item.reject(new Error(`Not found: ${item.key}`));
                }
            });
        } catch (error) {
            currentQueue.forEach(item => item.reject(error));
        }
    }
}

export default SmartBatcher;