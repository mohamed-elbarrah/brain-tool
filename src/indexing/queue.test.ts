/**
 * Tests for the IndexQueue.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { IndexQueue } from "./queue.ts";

describe("IndexQueue", () => {
  it("enqueues a path and processes it", async () => {
    const queue = new IndexQueue(10);
    const processed: string[] = [];
    queue.setHandler(async (event) => {
      processed.push(event.path);
    });
    queue.enqueue({ kind: "change", path: "src/test.ts" });
    // Wait for debounce + processing
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(processed.length, 1);
    assert.strictEqual(processed[0], "src/test.ts");
  });

  it("debounces rapid enqueues of the same path", async () => {
    const queue = new IndexQueue(50);
    const processed: string[] = [];
    queue.setHandler(async (event) => {
      processed.push(event.path);
    });
    queue.enqueue({ kind: "change", path: "src/test.ts" });
    queue.enqueue({ kind: "change", path: "src/test.ts" });
    queue.enqueue({ kind: "change", path: "src/test.ts" });
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(processed.length, 1);
  });

  it("processes different paths separately", async () => {
    const queue = new IndexQueue(10);
    const processed: string[] = [];
    queue.setHandler(async (event) => {
      processed.push(event.path);
    });
    queue.enqueue({ kind: "change", path: "src/a.ts" });
    queue.enqueue({ kind: "change", path: "src/b.ts" });
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(processed.length, 2);
  });

  it("processes delete events immediately (no debounce)", async () => {
    const queue = new IndexQueue(100);
    const processed: string[] = [];
    queue.setHandler(async (event) => {
      processed.push(event.path);
    });
    queue.enqueue({ kind: "delete", path: "src/test.ts" });
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(processed.length, 1);
  });

  it("drains all pending items", async () => {
    const queue = new IndexQueue(10);
    const processed: string[] = [];
    queue.setHandler(async (event) => {
      processed.push(event.path);
    });
    queue.enqueue({ kind: "change", path: "src/a.ts" });
    queue.enqueue({ kind: "change", path: "src/b.ts" });
    await queue.drain();
    assert.strictEqual(processed.length, 2);
  });

  it("clear() removes all pending items", async () => {
    const queue = new IndexQueue(50);
    const processed: string[] = [];
    queue.setHandler(async (event) => {
      processed.push(event.path);
    });
    queue.enqueue({ kind: "change", path: "src/a.ts" });
    queue.enqueue({ kind: "change", path: "src/b.ts" });
    queue.clear();
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(processed.length, 0);
  });

  it("reports correct size", () => {
    const queue = new IndexQueue(50);
    assert.strictEqual(queue.size, 0);
    queue.enqueue({ kind: "change", path: "src/a.ts" });
    // Size is 0 because debounce hasn't fired yet
    assert.strictEqual(queue.size, 0);
  });
});