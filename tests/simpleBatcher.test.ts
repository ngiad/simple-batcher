import SmartBatcher, { CacheError, BatchFunctionError, MemoryLimitError, NotFoundError } from '../src';

describe('SmartBatcher', () => {
  // Mock data and functions
  const mockData = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
    { id: '3', name: 'Item 3' },
  ];

  const mockBatchFunction = jest.fn().mockImplementation(async (queries: string[]) => {
    return queries.map(id => {
      const item = mockData.find(item => item.id === id);
      return item || null;
    });
  });

  const mockErrorBatchFunction = jest.fn().mockImplementation(async () => {
    throw new Error('Batch function error');
  });

  const mockNonArrayBatchFunction = jest.fn().mockImplementation(async () => {
    return 'not an array' as any;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a SmartBatcher instance with default options', () => {
      const batcher = new SmartBatcher(mockBatchFunction);
      expect(batcher).toBeInstanceOf(SmartBatcher);
    });

    it('should create a SmartBatcher instance with custom options', () => {
      const batcher = new SmartBatcher(mockBatchFunction, {
        delay: 100,
        memoryLimitMB: 50,
        expirationTime: 1000,
        debugMode: true,
      });
      expect(batcher).toBeInstanceOf(SmartBatcher);
    });
  });

  describe('load', () => {
    it('should load data from batch function', async () => {
      const batcher = new SmartBatcher(mockBatchFunction);
      const result = await batcher.load('1');
      expect(result).toEqual(mockData[0]);
      expect(mockBatchFunction).toHaveBeenCalledTimes(1);
    });

    it('should return cached data on subsequent calls', async () => {
      const batcher = new SmartBatcher(mockBatchFunction);
      
      // First call should call the batch function
      await batcher.load('1');
      expect(mockBatchFunction).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      const result = await batcher.load('1');
      expect(result).toEqual(mockData[0]);
      expect(mockBatchFunction).toHaveBeenCalledTimes(1); // Should not call batch function again
    });

    it('should batch multiple calls within the delay period', async () => {
      const batcher = new SmartBatcher(mockBatchFunction, { delay: 50 });
      
      // Start multiple load operations
      const promise1 = batcher.load('1');
      const promise2 = batcher.load('2');
      const promise3 = batcher.load('3');
      
      // Wait for all to complete
      const results = await Promise.all([promise1, promise2, promise3]);
      
      // Check results
      expect(results).toEqual([mockData[0], mockData[1], mockData[2]]);
      
      // Should only call batch function once for all three items
      expect(mockBatchFunction).toHaveBeenCalledTimes(1);
      expect(mockBatchFunction).toHaveBeenCalledWith(['1', '2', '3']);
    });

    it('should handle batch function errors', async () => {
      const batcher = new SmartBatcher(mockErrorBatchFunction);
      
      await expect(batcher.load('1')).rejects.toThrow(BatchFunctionError);
    });

    it('should handle non-array batch function results', async () => {
      const batcher = new SmartBatcher(mockNonArrayBatchFunction);
      
      await expect(batcher.load('1')).rejects.toThrow(BatchFunctionError);
    });

    it('should use the query normalizer', async () => {
      const queryNormalizer = jest.fn((query) => query.toString());
      const batcher = new SmartBatcher(mockBatchFunction, { queryNormalizer });
      
      await batcher.load(1);
      
      expect(queryNormalizer).toHaveBeenCalledWith(1);
      expect(mockBatchFunction).toHaveBeenCalledWith(['1']);
    });
  });

  describe('loadMany', () => {
    it('should load multiple items at once', async () => {
      const batcher = new SmartBatcher(mockBatchFunction);
      const results = await batcher.loadMany(['1', '2', '3']);
      
      expect(results).toEqual([mockData[0], mockData[1], mockData[2]]);
      expect(mockBatchFunction).toHaveBeenCalledTimes(1);
      expect(mockBatchFunction).toHaveBeenCalledWith(['1', '2', '3']);
    });

    it('should use cache for some items', async () => {
      const batcher = new SmartBatcher(mockBatchFunction);
      
      // First load item 1
      await batcher.load('1');
      
      // Then load items 1, 2, and 3
      const results = await batcher.loadMany(['1', '2', '3']);
      
      expect(results).toEqual([mockData[0], mockData[1], mockData[2]]);
      
      // Should call batch function only for items 2 and 3
      expect(mockBatchFunction).toHaveBeenCalledTimes(2);
      expect(mockBatchFunction).toHaveBeenNthCalledWith(2, ['2', '3']);
    });

    it('should handle batch function errors', async () => {
      const batcher = new SmartBatcher(mockErrorBatchFunction);
      
      const results = await batcher.loadMany(['1', '2', '3']);
      
      // Should return errors for all items
      expect(results[0]).toBeInstanceOf(BatchFunctionError);
      expect(results[1]).toBeInstanceOf(BatchFunctionError);
      expect(results[2]).toBeInstanceOf(BatchFunctionError);
    });

    it('should handle non-array batch function results', async () => {
      const batcher = new SmartBatcher(mockNonArrayBatchFunction);
      
      const results = await batcher.loadMany(['1', '2', '3']);
      
      // Should return errors for all items
      expect(results[0]).toBeInstanceOf(BatchFunctionError);
      expect(results[1]).toBeInstanceOf(BatchFunctionError);
      expect(results[2]).toBeInstanceOf(BatchFunctionError);
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', async () => {
      const batcher = new SmartBatcher(mockBatchFunction);
      
      // Load data into cache
      await batcher.load('1');
      expect(mockBatchFunction).toHaveBeenCalledTimes(1);
      
      // Clear cache
      await batcher.clearCache();
      
      // Load same data again
      await batcher.load('1');
      
      // Should call batch function again
      expect(mockBatchFunction).toHaveBeenCalledTimes(2);
    });
  });

  describe('setValue and get', () => {
    it('should manually set and get values from cache', async () => {
      const batcher = new SmartBatcher(mockBatchFunction);
      
      // Set value directly
      await batcher.setValue('customKey', { id: 'custom', name: 'Custom Item' });
      
      // Get value
      const result = await batcher.get('customKey');
      
      expect(result).toEqual({ id: 'custom', name: 'Custom Item' });
      expect(mockBatchFunction).not.toHaveBeenCalled();
    });

    it('should throw MemoryLimitError when memory limit is exceeded', async () => {
      // Create a batcher with a small memory limit
      const batcher = new SmartBatcher(mockBatchFunction, { memoryLimitMB: 0.00001 });
      
      // Large data
      const largeData = { id: 'large', data: Array(1000000).fill('x') };
      
      // Attempt to set value
      await expect(batcher.setValue('largeKey', largeData)).rejects.toThrow(MemoryLimitError);
    });
  });

  describe('has', () => {
    it('should check if a key exists in cache', async () => {
      const batcher = new SmartBatcher(mockBatchFunction);
      
      // Set value directly
      await batcher.setValue('existingKey', { id: 'existing', name: 'Existing Item' });
      
      // Check if keys exist
      const existsResult = await batcher.has('existingKey');
      const notExistsResult = await batcher.has('nonExistingKey');
      
      expect(existsResult).toBe(true);
      expect(notExistsResult).toBe(false);
    });
  });

  describe('deleteValue', () => {
    it('should delete a value from cache', async () => {
      const batcher = new SmartBatcher(mockBatchFunction);
      
      // Set value directly
      await batcher.setValue('keyToDelete', { id: 'toDelete', name: 'To Delete Item' });
      
      // Check if key exists
      const existsBeforeDelete = await batcher.has('keyToDelete');
      expect(existsBeforeDelete).toBe(true);
      
      // Delete value
      await batcher.deleteValue('keyToDelete');
      
      // Check if key exists after delete
      const existsAfterDelete = await batcher.has('keyToDelete');
      expect(existsAfterDelete).toBe(false);
    });
  });

  describe('expirationTime', () => {
    it('should expire cache items after specified time', async () => {
      jest.useFakeTimers();
      
      const batcher = new SmartBatcher(mockBatchFunction, { expirationTime: 1000 });
      
      // Set value
      await batcher.setValue('expiringKey', { id: 'expiring', name: 'Expiring Item' });
      
      // Check if key exists
      const existsBeforeExpire = await batcher.has('expiringKey');
      expect(existsBeforeExpire).toBe(true);
      
      // Fast forward time
      jest.advanceTimersByTime(1500);
      
      // Check if key still exists
      const existsAfterExpire = await batcher.has('expiringKey');
      expect(existsAfterExpire).toBe(false);
      
      jest.useRealTimers();
    });
  });

  describe('events', () => {
    it('should emit events', async () => {
      const batcher = new SmartBatcher(mockBatchFunction);
      
      // Event listeners
      const cacheHitListener = jest.fn();
      const cacheMissListener = jest.fn();
      const setValueListener = jest.fn();
      const getValueListener = jest.fn();
      const hasListener = jest.fn();
      const deleteValueListener = jest.fn();
      const deleteAllsListener = jest.fn();
      
      // Register listeners
      batcher.on('cacheHit', cacheHitListener);
      batcher.on('cacheMiss', cacheMissListener);
      batcher.on('setValue', setValueListener);
      batcher.on('getValue', getValueListener);
      batcher.on('has', hasListener);
      batcher.on('deleteValue', deleteValueListener);
      batcher.on('deleteAlls', deleteAllsListener);
      
      // Trigger events
      await batcher.setValue('eventKey', { id: 'event', name: 'Event Item' });
      await batcher.get('eventKey');
      await batcher.get('nonExistingKey');
      await batcher.has('eventKey');
      await batcher.deleteValue('eventKey');
      await batcher.load('1');
      await batcher.load('1'); // Cache hit
      await batcher.clearCache();
      
      // Check if listeners were called
      expect(setValueListener).toHaveBeenCalled();
      expect(getValueListener).toHaveBeenCalled();
      expect(hasListener).toHaveBeenCalled();
      expect(deleteValueListener).toHaveBeenCalled();
      expect(cacheMissListener).toHaveBeenCalledTimes(1);
      expect(cacheHitListener).toHaveBeenCalledTimes(1);
      expect(deleteAllsListener).toHaveBeenCalled();
    });
  });


  describe('complex query support', () => {
    it('should handle complex queries with objects and arrays', async () => {
      const complexQueryBatcher = new SmartBatcher(
        async (queries) => queries.map(q => ({ result: q.filter, id: q.id })),
        { delay: 10 }
      );
      
      const complexQuery1 = {
        id: 'complex1',
        filter: {
          name: { $regex: 'test', $options: 'i' },
          age: { $gt: 18 },
          tags: ['important', 'urgent']
        },
        sort: { createdAt: -1 },
        page: 1
      };
      
      const complexQuery2 = {
        id: 'complex2',
        filter: {
          status: 'active',
          type: { $in: ['A', 'B', 'C'] }
        },
        sort: { updatedAt: -1 },
        page: 1
      };
      
      const results = await Promise.all([
        complexQueryBatcher.load(complexQuery1),
        complexQueryBatcher.load(complexQuery2)
      ]);
      
      expect(results[0]).toEqual({ result: complexQuery1.filter, id: 'complex1' });
      expect(results[1]).toEqual({ result: complexQuery2.filter, id: 'complex2' });
    });
  });

  describe('error handling', () => {
    it('should handle errors in batch function for individual items', async () => {
      const errorForSomeBatcher = new SmartBatcher(
        async (queries) => {
          return queries.map(id => {
            if (id === '2') {
              return new Error('Item 2 error');
            }
            return mockData.find(item => item.id === id) || null;
          });
        }
      );
      
      const results = await errorForSomeBatcher.loadMany(['1', '2', '3']);
      
      expect(results[0]).toEqual(mockData[0]);
      expect(results[1]).toBeInstanceOf(Error);
      expect(results[2]).toEqual(mockData[2]);
    });
  });
});