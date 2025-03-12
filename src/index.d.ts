declare module "simplebatcher" {
    export class SimpleBatcher<T> {
      constructor(
        batchFunction: (ids: string[]) => Promise<T[]>,
        delay?: number
      );
  
      load(id: string): Promise<T>;
    }
  }
  