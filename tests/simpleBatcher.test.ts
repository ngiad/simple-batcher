// import SmartBatcher from "../src/index";

// interface BatchResult {
//   key: string | number;
//   data: string;
// }

// describe("SmartBatcher", () => {
//   let batcher: SmartBatcher<BatchResult, string | number>;

//   beforeEach(() => {
//     const batchFunction = async (keys: (string | number)[]): Promise<(BatchResult | null)[]> => {
//       return keys.map(key =>
//         key === 404 ? null : { key, data: `Data for ${key}` }
//       );
//     };
//     batcher = new SmartBatcher(batchFunction, 100);
//   });

//   test("should batch requests and resolve correctly", async () => {
//     const result1 = batcher.load(1);
//     const result2 = batcher.load(2);

//     await expect(result1).resolves.toEqual({ key: 1, data: "Data for 1" });
//     await expect(result2).resolves.toEqual({ key: 2, data: "Data for 2" });
//   });

//   test("should reject if key is not found", async () => {
//     const result1 = batcher.load(1);
//     const result2 = batcher.load(404);

//     await expect(result1).resolves.toEqual({ key: 1, data: "Data for 1" });
//     await expect(result2).rejects.toThrow("Not found: 404");
//   });

//   test("should handle batch execution delay", async () => {
//     const result = batcher.load(1);
//     await expect(result).resolves.toEqual({ key: 1, data: "Data for 1" });
//   });
// });

import SmartBatcher from "../src/index";

describe("SmartBatcher", () => {
  let batchFunction: jest.Mock;
  let batcher: SmartBatcher<number>;

  beforeEach(() => {
    batchFunction = jest.fn();
    batcher = new SmartBatcher<number>(batchFunction, { delay: 10 });
  });

  it("should batch multiple load calls", async () => {
    batchFunction.mockResolvedValue([1, 2, 3]);

    const promise1 = batcher.load("1");
    const promise2 = batcher.load("2");
    const promise3 = batcher.load("3");

    const results = await Promise.all([promise1, promise2, promise3]);

    expect(results).toEqual([1, 2, 3]);
    expect(batchFunction).toHaveBeenCalledTimes(1);
    expect(batchFunction).toHaveBeenCalledWith(["1", "2", "3"]);
  });

  it("should handle batchFunction returning errors", async () => {
    batchFunction.mockResolvedValue([1, new Error("Test Error"), 3]);

    const promise1 = batcher.load("1");
    const promise2 = batcher.load("2");
    const promise3 = batcher.load("3");

    await expect(promise1).resolves.toBe(1);
    await expect(promise2).rejects.toThrow("Test Error");
    await expect(promise3).resolves.toBe(3);

    expect(batchFunction).toHaveBeenCalledTimes(1);
    expect(batchFunction).toHaveBeenCalledWith(["1", "2", "3"]);
  });

  it("should handle batchFunction throwing an error", async () => {
    batchFunction.mockRejectedValue(new Error("Batch Function Error"));

    const promise1 = batcher.load("1");
    const promise2 = batcher.load("2");

    await expect(promise1).rejects.toThrow("Batch Function Error");
    await expect(promise2).rejects.toThrow("Batch Function Error");

    expect(batchFunction).toHaveBeenCalledTimes(1);
    expect(batchFunction).toHaveBeenCalledWith(["1", "2"]);
  });

  it("should handle batchFunction not returning an array", async () => {
    batchFunction.mockResolvedValue("not an array" as any);

    const promise1 = batcher.load("1");
    await expect(promise1).rejects.toThrow(
      "batchFunction must return an array"
    );
  });

  it("should return cached values if available", async () => {
    await batcher.setValue("1", 10);
    await batcher.setValue("2", 20);

    const result1 = await batcher.load("1");
    const result2 = await batcher.load("2");

    expect(result1).toBe(10);
    expect(result2).toBe(20);
    expect(batchFunction).not.toHaveBeenCalled();
  });

  it("should handle cache errors gracefully (reject load promise)", async () => {
    const originalGet = batcher.get;
    batcher.get = jest
      .fn()
      .mockRejectedValue(new Error("Simulated cache error"));
    batchFunction.mockResolvedValue([1]);

    await expect(batcher.load("1")).rejects.toThrow("Simulated cache error");
    batcher.get = originalGet;

    expect(batchFunction).not.toHaveBeenCalled();
  });

  it("should use loadMany correctly", async () => {
    batchFunction.mockResolvedValue([1, 3]);
    await batcher.setValue("2", 2);

    const results = await batcher.loadMany(["1", "2", "3"]);

    expect(results[0]).toBe(1);
    expect(results[1]).toBe(2);
    expect(results[2]).toBe(3);

    expect(batchFunction).toHaveBeenCalledTimes(1);
    expect(batchFunction).toHaveBeenCalledWith(["1", "3"]);
  });

  it("should handle all cache hits with loadMany", async () => {
    await batcher.setValue("1", 1);
    await batcher.setValue("2", 2);
    await batcher.setValue("3", 3);

    const results = await batcher.loadMany(["1", "2", "3"]);

    expect(results).toEqual([1, 2, 3]);
    expect(batchFunction).not.toHaveBeenCalled();
  });

  it("should handle all cache misses with loadMany", async () => {
    batchFunction.mockResolvedValue([1, 2, 3]);

    const results = await batcher.loadMany(["1", "2", "3"]);
    expect(results).toEqual([1, 2, 3]);

    expect(batchFunction).toHaveBeenCalledTimes(1);
    expect(batchFunction).toHaveBeenCalledWith(["1", "2", "3"]);
  });

  it("should handle batchFunction errors with loadMany", async () => {
    batchFunction.mockRejectedValue(new Error("Batch error"));

    const results = await batcher.loadMany(["1", "2", "3"]);

    expect(results).toEqual([
      expect.any(Error),
      expect.any(Error),
      expect.any(Error),
    ]);

    expect(batchFunction).toHaveBeenCalledTimes(1);
    expect(batchFunction).toHaveBeenCalledWith(["1", "2", "3"]);
  });

  it("should handle non-array result from batchFunction with loadMany", async () => {
    batchFunction.mockResolvedValue("invalid result" as any);

    const results = await batcher.loadMany(["1", "2"]);
    expect(results[0]).toBeInstanceOf(Error);
    expect(results[1]).toBeInstanceOf(Error);
  });

  it("should loadMany check null result", async () => {
    batchFunction.mockResolvedValue([1, null]);
    const results = await batcher.loadMany(["1", "2"]);

    expect(results[0]).toBe(1);
    expect(results[1]).toBeInstanceOf(Error);
  });

  it("should clear the cache using clearCache", async () => {
    await batcher.setValue("1", 1);
    await batcher.setValue("2", 2);

    expect(await batcher.get("1")).toBe(1);
    expect(await batcher.get("2")).toBe(2);

    await batcher.clearCache();

    expect(await batcher.get("1")).toBeUndefined();
    expect(await batcher.get("2")).toBeUndefined();
  });

  it("should respect memory limit", async () => {
    const largeData = "a".repeat(2 * 1024 * 1024);
    const smallBatcher = new SmartBatcher<string>(batchFunction, {
      memoryLimitMB: 1,
    });

    await expect(smallBatcher.setValue("large", largeData)).rejects.toThrow(
      "Not enough memory"
    );
    expect(await smallBatcher.get("large")).toBeUndefined();
  });

  it("should respect expiration time", async () => {
    const batcherWithExpiration = new SmartBatcher<number>(batchFunction, {
      expirationTime: 50,
    });
    await batcherWithExpiration.setValue("expiring", 42);
    expect(await batcherWithExpiration.get("expiring")).toBe(42);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await batcherWithExpiration.get("expiring")).toBeUndefined();
  });

  it("should update value and reset expiration", async () => {
    const batcherWithExpiration = new SmartBatcher(batchFunction, {
      expirationTime: 50,
    });
    await batcherWithExpiration.setValue("key1", "value1");
    expect(await batcherWithExpiration.get("key1")).toBe("value1");

    await new Promise((resolve) => setTimeout(resolve, 30));

    await batcherWithExpiration.setValue("key1", "value2");

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await batcherWithExpiration.get("key1")).toBe("value2");

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(await batcherWithExpiration.get("key1")).toBeUndefined();
  });
  it("should emit events", async () => {
    const setValueCallback = jest.fn();
    const getValueCallback = jest.fn();
    const deleteValueCallback = jest.fn();
    const expiredValueCallback = jest.fn();
    const deleteAllsCallback = jest.fn();
    const hasCallBack = jest.fn();

    batcher.on("setValue", setValueCallback);
    batcher.on("getValue", getValueCallback);
    batcher.on("deleteValue", deleteValueCallback);
    batcher.on("expiredValue", expiredValueCallback);
    batcher.on("deleteAlls", deleteAllsCallback);
    batcher.on("has", hasCallBack);

    await batcher.setValue("eventKey", 123);
    expect(setValueCallback).toHaveBeenCalledWith({
      key: "eventKey",
      value: 123,
    });

    await batcher.get("eventKey");
    expect(getValueCallback).toHaveBeenCalledWith({
      key: "eventKey",
      value: 123,
    });

    await batcher.has("eventKey");
    expect(hasCallBack).toBeCalledWith({ key: "eventKey", exists: true });

    await batcher.deleteValue("eventKey");
    expect(deleteValueCallback).toHaveBeenCalledWith({
      key: "eventKey",
      deletedValue: { eventKey: 123 },
    });

    const batcherWithExpiration = new SmartBatcher(batchFunction, {
      expirationTime: 50,
    });
    batcherWithExpiration.on("expiredValue", expiredValueCallback);
    await batcherWithExpiration.setValue("expire", "soon");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(expiredValueCallback).toBeCalled();

    await batcher.restartAllValues();
    expect(deleteAllsCallback).toHaveBeenCalledWith({});
  });
});
