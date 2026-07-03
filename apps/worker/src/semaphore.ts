/**
 * Minimal counting semaphore for bounding how many jobs this worker process
 * executes concurrently. Deliberately hand-rolled rather than a library
 * (e.g. p-limit) — the whole point of this service is a from-scratch queue
 * engine, and this is ~20 lines once you strip the comments.
 */
export class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly capacity: number) {
    this.available = capacity;
  }

  get freeSlots(): number {
    return this.available;
  }

  get totalCapacity(): number {
    return this.capacity;
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.available -= 1;
    return () => this.release();
  }

  private release(): void {
    this.available += 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}
