class Smartbatcher<T, K> {
    private queue: { key: K; resolve: (value: T) => void; reject: (reason?: any) => void }[] = [];
    private timeout: NodeJS.Timeout | null = null;

    constructor(
        private batchFunction: (keys: K[]) => Promise<T[]>,
        private delay: number = 800
    ) { }

    load(key: K): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({ key, resolve, reject });
            this.scheduleBatch();
        });
    }

    private scheduleBatch() {
        if (!this.timeout) {
            this.timeout = setTimeout(() => this.executeBatch(), this.delay);
        }
    }

    private async executeBatch() {
        const currentQueue = this.queue;
        this.queue = [];
        this.timeout = null;

        const keys = currentQueue.map(item => item.key);

        try {
            const results = await this.batchFunction(keys);
            const resultMap = new Map<K, T>(results.map(result => [(result as any)._id, result]));

            currentQueue.forEach(item => {
                const result = resultMap.get(item.key);
                result ? item.resolve(result) : item.reject(new Error(`Not found: ${item.key}`));
            });
        } catch (error) {
            currentQueue.forEach(item => item.reject(error));
        }
    }
}

export default Smartbatcher;
