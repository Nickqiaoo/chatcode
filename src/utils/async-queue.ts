export class AsyncQueue<T> {
  private queue: T[] = [];
  private resolvers: ((value: T) => void)[] = [];
  private rejectors: ((error: Error) => void)[] = [];
  private closed = false;

  enqueue(item: T): void {
    if (this.closed) {
      throw new Error('Queue is closed');
    }

    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve(item);
    } else {
      this.queue.push(item);
    }
  }

  async dequeue(): Promise<T> {
    if (this.closed && this.queue.length === 0) {
      throw new Error('Queue is closed and empty');
    }

    return new Promise((resolve, reject) => {
      if (this.queue.length > 0) {
        resolve(this.queue.shift()!);
      } else if (this.closed) {
        reject(new Error('Queue is closed and empty'));
      } else {
        this.resolvers.push(resolve);
        this.rejectors.push(reject);
      }
    });
  }

  clear(): void {
    this.queue.length = 0;
    
    // Reject all pending resolvers
    while (this.rejectors.length > 0) {
      const reject = this.rejectors.shift()!;
      reject(new Error('Queue cleared'));
    }
    this.resolvers.length = 0;
  }

  close(): void {
    this.closed = true;
    
    // Reject all pending resolvers
    while (this.rejectors.length > 0) {
      const reject = this.rejectors.shift()!;
      reject(new Error('Queue is closed'));
    }
    this.resolvers.length = 0;
  }

  get size(): number {
    return this.queue.length;
  }

  get pendingResolvers(): number {
    return this.resolvers.length;
  }

  get isClosed(): boolean {
    return this.closed;
  }
}