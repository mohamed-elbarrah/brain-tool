/**
 * Indexing queue — debounced per-path FIFO queue with single in-flight worker.
 *
 * [HARD] §7.3: Single in-flight parse worker (MVP). Concurrency can be added
 * later behind the same queue interface. Debounce is per-path: rapid save
 * storms coalesce into one parse. Renames are handled as delete(old) +
 * add(new) sequenced correctly by the queue. The queue is in-memory; on
 * graceful shutdown it drains. On crash it is empty; the next startup
 * reconciles file mtime/hash vs DB and re-enqueues changed files.
 */

export type QueueEvent =
  | { kind: "add"; path: string }
  | { kind: "change"; path: string }
  | { kind: "delete"; path: string };

export type ProcessHandler = (event: QueueEvent) => Promise<void>;

export class IndexQueue {
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pending = new Set<string>();
  private queue: string[] = [];
  private inFlight = false;
  private processing = false;
  private handler: ProcessHandler | undefined;
  private debounceMs: number;
  private drainCallback: (() => void) | undefined;

  constructor(debounceMs = 150) {
    this.debounceMs = debounceMs;
  }

  /** Set the handler that processes each queued path. */
  setHandler(handler: ProcessHandler): void {
    this.handler = handler;
  }

  /** Enqueue a file system event. Debounces per path. */
  enqueue(event: QueueEvent): void {
    if (event.kind === "delete") {
      // Deletes are immediate — cancel any pending timer for this path.
      this.cancelDebounce(event.path);
      this.pushUnique(event.path);
      this.processNext();
      return;
    }

    // Add/change: debounce per path
    this.cancelDebounce(event.path);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(event.path);
      this.pushUnique(event.path);
      this.processNext();
    }, this.debounceMs);
    this.debounceTimers.set(event.path, timer);
  }

  /** Number of items waiting in the queue (not counting the in-flight item). */
  get size(): number {
    return this.pending.size;
  }

  /** Whether a task is currently being processed. */
  get isBusy(): boolean {
    return this.inFlight;
  }

  /** Drain all pending items and wait for the current task to finish. */
  async drain(): Promise<void> {
    // Cancel all pending debounce timers
    for (const [path, timer] of this.debounceTimers) {
      clearTimeout(timer);
      this.pushUnique(path);
    }
    this.debounceTimers.clear();

    if (!this.inFlight && this.queue.length === 0) return;

    // Kick off processing if it's not already running
    if (!this.inFlight && !this.processing) {
      this.processNext();
    }

    return new Promise<void>((resolve) => {
      this.drainCallback = resolve;
    });
  }

  /** Remove everything from the queue (for cleanup). */
  clear(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.pending.clear();
    this.queue = [];
  }

  // ---- Private ----

  private cancelDebounce(path: string): void {
    const timer = this.debounceTimers.get(path);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(path);
    }
  }

  private pushUnique(path: string): void {
    if (!this.pending.has(path)) {
      this.pending.add(path);
      this.queue.push(path);
    }
  }

  private async processNext(): Promise<void> {
    if (this.inFlight || this.processing || !this.handler) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const path = this.queue.shift()!;
      this.pending.delete(path);
      this.inFlight = true;

      try {
        const event: QueueEvent = { kind: "change", path };
        await this.handler(event);
      } catch {
        // Errors are handled by the caller (pipeline); we just continue.
      } finally {
        this.inFlight = false;
      }
    }

    this.processing = false;

    // Notify drain if someone is waiting
    if (this.drainCallback) {
      const cb = this.drainCallback;
      this.drainCallback = undefined;
      cb();
    }
  }
}