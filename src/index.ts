class Smartbatcher<T> {
    private queue: { id: string; resolve: (value: T) => void; reject: (reason?: any) => void }[] = [];
    private timeout: NodeJS.Timeout | null = null;

    constructor(
        private batchFunction: (ids: string[]) => Promise<T[]>,
        private delay: number = 800
    ) { }

    load(id: string): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({ id, resolve, reject });
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

        const ids = currentQueue.map(item => item.id);

        try {
            const results = await this.batchFunction(ids);
            const resultMap = new Map<string, T>(results.map(result => [(result as any)._id, result]));

            currentQueue.forEach(item => {
                const result = resultMap.get(item.id);
                result ? item.resolve(result) : item.reject(new Error(`Not found: ${item.id}`));
            });
        } catch (error) {
            currentQueue.forEach(item => item.reject(error));
        }
    }
}


export default Smartbatcher;