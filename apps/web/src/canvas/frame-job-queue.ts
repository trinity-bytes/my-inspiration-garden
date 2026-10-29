/**
 * A FIFO of main-thread jobs drained under a per-frame time budget (`run`, called once per frame
 * from the render loop). Spreads bursty work, such as painting and uploading the textures of a
 * whole row of cards entering the viewport at once, over several frames instead of stalling one
 * (owner feedback, 2026-10-29: small consecutive hitches during fast panning).
 */
export class FrameJobQueue {
  private jobs: Array<() => void> = [];
  private readonly now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  get size(): number {
    return this.jobs.length;
  }

  enqueue(job: () => void): void {
    this.jobs.push(job);
  }

  /** Runs jobs in order until `budgetMs` has elapsed. Always runs at least one, so the queue never starves. */
  run(budgetMs: number): void {
    const start = this.now();
    let job = this.jobs.shift();
    while (job) {
      job();
      if (this.now() - start >= budgetMs) {
        return;
      }
      job = this.jobs.shift();
    }
  }

  clear(): void {
    this.jobs = [];
  }
}
