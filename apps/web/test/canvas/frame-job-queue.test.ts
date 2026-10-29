import { describe, expect, it } from "vitest";
import { FrameJobQueue } from "../../src/canvas/frame-job-queue";

/** A fake clock where every job advances time by `costMs`. */
function queueWithJobCost(costMs: number) {
  let time = 0;
  const queue = new FrameJobQueue(() => time);
  const ran: number[] = [];
  const enqueue = (id: number) =>
    queue.enqueue(() => {
      ran.push(id);
      time += costMs;
    });
  return { queue, ran, enqueue };
}

describe("FrameJobQueue", () => {
  it("runs jobs in order until the frame budget is spent, leaving the rest for later frames", () => {
    const { queue, ran, enqueue } = queueWithJobCost(2);
    for (const id of [1, 2, 3, 4, 5]) enqueue(id);

    queue.run(4);
    expect(ran).toEqual([1, 2]);
    expect(queue.size).toBe(3);

    queue.run(4);
    expect(ran).toEqual([1, 2, 3, 4]);
  });

  it("always runs at least one job, even when that job alone exceeds the budget", () => {
    const { queue, ran, enqueue } = queueWithJobCost(10);
    enqueue(1);
    enqueue(2);

    queue.run(4);
    expect(ran).toEqual([1]);
  });

  it("runs a job enqueued by another job in a later slot, after the jobs already waiting", () => {
    const { queue, ran, enqueue } = queueWithJobCost(0);
    queue.enqueue(() => {
      ran.push(1);
      enqueue(3);
    });
    enqueue(2);

    queue.run(4);
    expect(ran).toEqual([1, 2, 3]);
  });

  it("drops every pending job on clear", () => {
    const { queue, ran, enqueue } = queueWithJobCost(0);
    enqueue(1);
    queue.clear();

    queue.run(4);
    expect(ran).toEqual([]);
    expect(queue.size).toBe(0);
  });
});
