import { SimpleBatcher } from "../src/index";

describe("SimpleBatcher", () => {
  test("should batch requests and resolve correctly", async () => {
    const batchFunction = async (ids: string[]) => {
      return ids.map(id => ({ _id: id, data: `Data for ${id}` }));
    };

    const batcher = new SimpleBatcher(batchFunction, 100);

    const result1 = batcher.load("123");
    const result2 = batcher.load("456");

    await expect(result1).resolves.toEqual({ _id: "123", data: "Data for 123" });
    await expect(result2).resolves.toEqual({ _id: "456", data: "Data for 456" });
  });

  test("should reject if ID is not found", async () => {
    const batchFunction = async (ids: string[]) => {
      return ids.filter(id => id !== "404").map(id => ({ _id: id, data: `Data for ${id}` }));
    };

    const batcher = new SimpleBatcher(batchFunction, 100);

    const result1 = batcher.load("123");
    const result2 = batcher.load("404"); 

    await expect(result1).resolves.toEqual({ _id: "123", data: "Data for 123" });
    await expect(result2).rejects.toThrow("Not found: 404");
  });

  test("should handle batch execution delay", async () => {
    const batchFunction = async (ids: string[]) => {
      return ids.map(id => ({ _id: id, data: `Data for ${id}` }));
    };

    const batcher = new SimpleBatcher(batchFunction, 500);

    const start = Date.now();
    const result = batcher.load("789");

    await result;
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(500);
  });
});
