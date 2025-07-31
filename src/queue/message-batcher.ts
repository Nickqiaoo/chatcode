import PQueue from 'p-queue';

export class MessageBatcher {
  private buffers = new Map<number, string[]>();      // chatId → message buffer
  private queues = new Map<number, PQueue>();        // chatId → serial queue  
  private scheduled = new Map<number, boolean>();    // chatId → whether task is scheduled
  private sendMessageCallback: (chatId: number, message: string) => Promise<void>;

  constructor(
    sendMessageCallback: (chatId: number, message: string) => Promise<void>
  ) {
    this.sendMessageCallback = sendMessageCallback;
  }


  /** ────────── 1. Message received ────────── */
  addMessage(chatId: number, text: string): void {
    const buf = this.buffers.get(chatId) ?? [];
    buf.push(text);
    this.buffers.set(chatId, buf);

    // Only schedule task on first push
    if (!this.scheduled.get(chatId)) {
      this.scheduled.set(chatId, true);
      this.getQueue(chatId)
        .add(() => this.processBatch(chatId))
        .catch(console.error);
    }
  }

  /** ────────── 2. Batch processing ────────── */
  private async processBatch(chatId: number): Promise<void> {
    // 2-a Take out and clear buffer
    const msgs = this.buffers.get(chatId) ?? [];
    if (msgs.length === 0) {         // In case cleared concurrently
      this.scheduled.set(chatId, false);
      return;
    }
    this.buffers.set(chatId, []);    // Atomic clear

    // 2-b Call Claude
    try {
      await this.sendMessageCallback(chatId, msgs.join('\n'));
    } catch (err) {
      console.error('[MessageBatcher] Claude call failed', err);
    }

    // 2-c Check if new messages accumulated in buffer
    console.debug(this.getStatus(chatId));
    if ((this.buffers.get(chatId) ?? []).length > 0) {
      // Still have new messages → continue scheduling (still only one in queue)
      this.getQueue(chatId)
        .add(() => this.processBatch(chatId))
        .catch(console.error);
    } else {
      // Buffer empty → release scheduled flag, next new message can trigger again
      this.scheduled.set(chatId, false);
    }
  }

  /** ────────── 3. lazy-init single user serial queue ────────── */
  private getQueue(chatId: number): PQueue {
    if (!this.queues.has(chatId)) {
      this.queues.set(chatId, new PQueue({ concurrency: 1 }));
    }
    return this.queues.get(chatId)!;
  }

  /** ────────── 4. Cleanup methods ────────── */
  cleanup(chatId: number): void {
    this.buffers.delete(chatId);
    this.scheduled.delete(chatId);
    const queue = this.queues.get(chatId);
    if (queue) {
      queue.clear();
      this.queues.delete(chatId);
    }
  }

  /** ────────── 5. Monitoring methods ────────── */
  getStatus(chatId: number): { 
    bufferedMessages: number; 
    queueSize: number; 
    queuePending: number; 
    isScheduled: boolean; 
  } {
    const queue = this.queues.get(chatId);
    return {
      bufferedMessages: (this.buffers.get(chatId) ?? []).length,
      queueSize: queue?.size ?? 0,
      queuePending: queue?.pending ?? 0,
      isScheduled: this.scheduled.get(chatId) ?? false,
    };
  }

  /** ────────── 6. Global cleanup ────────── */
  shutdown(): void {
    for (const [chatId] of this.queues) {
      this.cleanup(chatId);
    }
  }

  clear(chatId: number): void {
    this.buffers.delete(chatId);
    this.scheduled.delete(chatId);
    const queue = this.queues.get(chatId);
    if (queue) {
      queue.clear();
      this.queues.delete(chatId);
    }
  }
}