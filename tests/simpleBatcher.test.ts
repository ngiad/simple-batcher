import SmartBatcher from "../src/index";

interface BatchResult {  
  key: string | number;
  data: string;
}

describe("SmartBatcher", () => {
  let batcher: SmartBatcher<BatchResult, string | number>; 

  beforeEach(() => {
    const batchFunction = async (keys: (string | number)[]): Promise<(BatchResult | null)[]> => { 
      return keys.map(key =>
        key === 404 ? null : { key, data: `Data for ${key}` }
      );
    };
    batcher = new SmartBatcher(batchFunction, 100);
  });

  test("should batch requests and resolve correctly", async () => {
    const result1 = batcher.load(1);
    const result2 = batcher.load(2);

    await expect(result1).resolves.toEqual({ key: 1, data: "Data for 1" });
    await expect(result2).resolves.toEqual({ key: 2, data: "Data for 2" });
  });

  test("should reject if key is not found", async () => {
    const result1 = batcher.load(1);
    const result2 = batcher.load(404);

    await expect(result1).resolves.toEqual({ key: 1, data: "Data for 1" });
    await expect(result2).rejects.toThrow("Not found: 404");
  });

  test("should handle batch execution delay", async () => {
    const result = batcher.load(1);
    await expect(result).resolves.toEqual({ key: 1, data: "Data for 1" });
  });
});