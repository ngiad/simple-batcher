# SimpleBatcher

SimpleBatcher is a lightweight batching utility for managing batched requests efficiently. It helps optimize request handling by grouping multiple requests and processing them together, reducing redundant operations.

## Installation

You can install SimpleBatcher via npm:

```sh
npm install simple-batcher
```

## Usage

Here is an example of how to use SimpleBatcher:

```typescript
import { SimpleBatcher } from "simple-batcher";

// Define batch function
const batchFunction = async (ids: string[]) => {
  return ids.map(id => ({ id, data: `Data for ${id}` }));
};

// Create a new batcher instance
const batcher = new SimpleBatcher(batchFunction, { delay: 100 });

// Use the batcher to fetch data
const fetchData = async () => {
  const result1 = batcher.fetch("id1");
  const result2 = batcher.fetch("id2");
  
  console.log(await result1); // { id: "id1", data: "Data for id1" }
  console.log(await result2); // { id: "id2", data: "Data for id2" }
};

fetchData();
```

## API

### `new SimpleBatcher(batchFunction, options?)`

Creates a new batcher instance.

- `batchFunction`: (required) An async function that takes an array of IDs and returns a promise resolving to the batched results.
- `options`: (optional) Configuration options:
  - `delay` (number) - Time in milliseconds to wait before processing the batch. Default is `50ms`.

### `.fetch(id: string): Promise<T>`

Queues a request and returns a promise that resolves when the batch is processed.

## License

MIT License.

devwebdainghia\@gmail.com
