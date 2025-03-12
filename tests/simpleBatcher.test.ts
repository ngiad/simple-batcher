import SmartBatcher from "../src";

describe("SmartBatcher", () => {
  test("should batch requests and resolve correctly", async () => {
    const batchFunction = async (keys: number[]) => {
      return keys.map(key => ({ _id: key, data: `Data for ${key}` }));
    };

    const batcher = new SmartBatcher(batchFunction, 100);

    const result1 = batcher.load(1);
    const result2 = batcher.load(2);

    await expect(result1).resolves.toEqual({ _id: 1, data: "Data for 1" });
    await expect(result2).resolves.toEqual({ _id: 2, data: "Data for 2" });
  });

  test("should reject if key is not found", async () => {
    const batchFunction = async (keys: number[]) => {
      const validKeys = keys.filter(key => key !== 404);
      return validKeys.map(key => ({ _id: key, data: `Data for ${key}` })); 
    };

    const batcher = new SmartBatcher(batchFunction, 100);

    const result1 = batcher.load(1);
    const result2 = batcher.load(404);

    await expect(result1).resolves.toEqual({ _id: 1, data: "Data for 1" });
    await expect(result2).rejects.toThrow("Not found: 404");
  });

  test("should handle batch execution delay", async () => {
    const batchFunction = async (keys: string[]) => {
      return keys.map(key => ({ _id: key, data: `Data for ${key}` })); 
    };

    const batcher = new SmartBatcher(batchFunction, 500);

    const start = Date.now();
    const result = batcher.load("test-key");

    await result;
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(500);
  });
});
