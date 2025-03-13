```markdown
# smart-batcher

`smart-batcher` is a lightweight and powerful TypeScript utility for efficiently managing batched requests with integrated, configurable in-memory caching. It optimizes request handling by:

1.  **Batching:** Grouping multiple requests for the same resource type and processing them together, reducing redundant operations (like database queries).
2.  **Caching:** Storing results in a configurable in-memory cache to avoid repeated calls to your batch function for the same keys.
3.  **Events:** Emitting events when actions are executing.

It's ideal for scenarios like fetching data from a database or an external API where you want to minimize the number of requests.

## Installation

```bash
npm install smart-batcher
```

## Usage

```typescript
import SmartBatcher from "smart-batcher";

// 1. Define your batch function.  This function takes an array of
//    STRING keys and returns a Promise that resolves to an array of results.
//    The results array MUST be the same length as the keys array, and the
//    results MUST be in the same order as the keys.  If a key cannot be
//    found, return null at the corresponding index.  If an error occurs,
//    return an Error object at the corresponding index.
const batchFunction = async (ids: string[]): Promise<(string | Error | null)[]> => {
    console.log("batchFunction called with ids:", ids);
    // Simulate fetching data from a database or API.
    const results = ids.map(id => {
        if (id === "error") {
            return new Error("Simulated batch function error");
        }
        if (id === "missing") {
          return null; // Simulate a missing item
        }
        return `Data for ${id}`;
    });
    return results;
};

// 2. Create a SmartBatcher instance.
const batcher = new SmartBatcher(batchFunction, {
    delay: 50,         // Optional: Wait 50ms before executing the batch (default: 0 - setImmediate)
    memoryLimitMB: 10,  // Optional: Cache size limit in MB (default: 1024)
    expirationTime: 0, // Optional: Cache expiration time in ms (default: 0 - no expiration)
});

// 3. Use the batcher to load data.
async function fetchData() {
    const promise1 = batcher.load("id1");
    const promise2 = batcher.load("id2");
    const promise3 = batcher.load("id3");

    // Fetch same data: Will get in cache.
    const promise4 = batcher.load("id1");

    // Example with error
    const promise5 = batcher.load("error");
    // Example with missing
    const promise6 = batcher.load("missing");


    console.log(await promise1); // Output: Data for id1
    console.log(await promise2); // Output: Data for id2
    console.log(await promise3); // Output: Data for id3
    console.log(await promise4); // Output: Data for id1 (from cache!)
    await promise5.catch(err => console.error(err));  //Output Error: Simulated batch function error
    await promise6.catch(err => console.error(err)) // Output Error: Not found: missing

    // Using loadMany
    const results = await batcher.loadMany(["id4", "id5", "id1", "error"]);
    console.log(results); // Output: ['Data for id4', 'Data for id5', 'Data for id1', Error: Simulated batch function error]
    const results2 = await batcher.loadMany(["id4", "id5", "id1", "error"]); //Output: [ 'Data for id4', 'Data for id5', 'Data for id1', Error: Simulated batch function error] (id4 and id5 from cache)
}

fetchData();

// Clear the cache
async function clear() {
  await batcher.clearCache();
  console.log("Cache cleared");
}
//clear();

```

## API

### `new SmartBatcher<T>(batchFunction, options?)`

Creates a new `SmartBatcher` instance.

*   **`batchFunction: (keys: string[]) => Promise<(T | Error | null)[]>`**  (required)

    An asynchronous function that takes an array of *string* keys and returns a promise that resolves to an array of results.  The result array *must* have the same length as the input `keys` array, and the results *must* be in the same order.

    *   If a value for a key is found, put the value at the corresponding index in the result array.
    *   If a value for a key is *not* found, put `null` at the corresponding index.
    *   If an error occurs while fetching a particular key, put an `Error` object at the corresponding index.
    *   If an error occurs that prevents *any* keys from being fetched (e.g., a database connection error), it's recommended to *reject* the promise returned by `batchFunction` with that error. The `SmartBatcher` will then reject all pending `load` and `loadMany` calls with that error.

*   **`options: { delay?: number; memoryLimitMB?: number; expirationTime?: number; }`** (optional)

    *   **`delay?: number`**:  The time, in milliseconds, to wait before executing the batch function.  This delay allows multiple `load` calls made in quick succession to be grouped into a single batch.  Defaults to `0`, which means the batch is executed on the next tick of the event loop using `setImmediate`.
    *   **`memoryLimitMB?: number`**:  The maximum size of the in-memory cache, in megabytes.  Defaults to `1024` (1GB).  If adding a new value to the cache would exceed this limit, an error will be thrown, and the value will *not* be cached.  Existing cached values are *not* evicted; the limit only applies to *new* additions.
    *   **`expirationTime?: number`**:  The time, in milliseconds, after which a cached value is considered expired and will be removed from the cache. Defaults to `0`, which means cached values do not expire.

### `.load(key: string): Promise<T>`

Loads a single value by its key.

*   **`key: string`** (required): The key of the value to load.  Keys must be strings.

Returns a promise that:

*   Resolves with the value if it's found (either from the cache or the batch function).
*   Rejects with an `Error` if the batch function returns an `Error` for that key, if the batch function throws an error, or if there is a cache error.

### `.loadMany(keys: string[]): Promise<(T | Error)[]>`

Loads multiple values by their keys.

*   **`keys: string[]`** (required): An array of string keys.

Returns a promise that resolves to an array of results.  Each element in the result array will be either:

*   The value associated with the corresponding key (if found).
*   An `Error` object if the batch function returned an error for that key, or the batch function throws an error.

### `.clearCache(): Promise<void>`

Clears the entire in-memory cache.  Returns a promise that resolves when the cache is cleared.

### `.setValue(key: string, value: T): Promise<Record<string, T>>`
Sets value into cache
- `key` (string): The key to associate with the value.
- `value` (T): The value to be stored.
- Return: `Promise<Record<string, T>>`

### `.getValue(key: string): Promise<T | undefined>`

get value from cache.
- `key` (string): The key to get.
- Return: Promise<T | undefined>

### `.deleteValue(key: string): Promise<Record<string, T>>`

Delete value.
- `key` (string): The key to delete.
- Return: Promise<Record<string, T>>

### `.has(key: string): Promise<boolean>`

Check whether a key in cache.
- `key` (string): The key to check
- Return: Promise<boolean>

### `.restartAllValues(): Promise<Record<string, T>>`

Reset All Cache
- Return: `Promise<Record<string, T>>`

### Events

The SmartBatcher class extends EventEmitter and emits the following events:

-   **`setValue`**: Emitted when a value is successfully set in the cache.  The event data is an object: `{ key: string, value: T }`.
-   **`getValue`**: Emitted when get value in cache.  The event data is an object: `{ key: string, value: T | undefined }`.
-   **`deleteValue`**: Emitted when a value is deleted.  The event data is an object: `{ key: string, deletedValue: T }`.
-   **`expiredValue`**: Emitted when a value is expired.  The event data is an object: `{ key: string }`.
-   **`deleteAlls`**: Emitted when clear all cache. The event data is an object: `Record<string, T>`.
-   **`has`**: Emitted check exits key in cache. The event data is an object: `{key: string, exists: boolean}`.

You can listen to these events using the standard `on` method:
```typescript
batcher.on('setValue', ({key, value}) => {
    console.log(`Cached value for key '${key}':`, value);
});
```

## Error Handling

`smart-batcher` handles errors robustly:

*   **Batch Function Errors:** If the `batchFunction` returns an `Error` object for a specific key, the `load` or `loadMany` promise for that key will reject with that error.
*   **Batch Function Throws:** If the `batchFunction` itself throws an error, *all* pending `load` and `loadMany` promises will reject with that error.
*   **Cache Errors:** If an error occurs while interacting with the cache (e.g., during `get` or `setValue`), the `load` promise will reject with that error.
*   **Not Array:** If your batchFunction return not an array, all promises in `load` and `loadMany` will reject with an `Error`("batchFunction must return an array").

## License

MIT License

devwebdainghia@gmail.com

