class Smartbatcher {
    constructor(batchFunction, delay = 800) {
        this.batchFunction = batchFunction;
        this.delay = delay;
        this.queue = [];
        this.timeout = null;
    }

    load(key) {
        return new Promise((resolve, reject) => {
            this.queue.push({ key, resolve, reject });
            this.scheduleBatch();
        });
    }

    scheduleBatch() {
        if (!this.timeout) {
            this.timeout = setTimeout(() => this.executeBatch(), this.delay);
        }
    }

    async executeBatch() {
        const currentQueue = this.queue;
        this.queue = [];
        this.timeout = null;

        const keys = currentQueue.map(item => item.key);

        try {
            const results = await this.batchFunction(keys);
            const resultMap = new Map(results.map(result => [result?.key, result]));

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
