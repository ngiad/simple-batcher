declare class Smartbatcher<T, K = any> {
    constructor(batchFunction: (keys: K[]) => Promise<T[]>, delay?: number);

    load(key: K): Promise<T>;

    private scheduleBatch(): void;
    private executeBatch(): Promise<void>;
}

export default Smartbatcher;
