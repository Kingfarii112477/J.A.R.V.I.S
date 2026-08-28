import { describe, it, expect, vi } from "vitest";
import { SpeechQueue, type SpeakOneFn } from "./queue";

function deferredSpeak(): { speak: SpeakOneFn; resolveAll: () => void; calls: string[] } {
  const pending: (() => void)[] = [];
  const calls: string[] = [];
  const speak: SpeakOneFn = (item, onEnd) => {
    calls.push(item.text);
    pending.push(onEnd);
  };
  return {
    speak,
    resolveAll: () => {
      while (pending.length) pending.shift()!();
    },
    calls,
  };
}

describe("SpeechQueue", () => {
  it("speaks a single enqueued item", () => {
    let finish = () => {};
    const queue = new SpeechQueue((item, end) => {
      finish = end;
    });
    queue.enqueue({ text: "hello" });
    expect(queue.isSpeaking()).toBe(true);
    finish();
    expect(queue.isSpeaking()).toBe(false);
  });

  it("plays items strictly in order, never overlapping", () => {
    const order: string[] = [];
    const finishers: (() => void)[] = [];
    const queue = new SpeechQueue((item, end) => {
      order.push(`start:${item.text}`);
      finishers.push(() => {
        order.push(`end:${item.text}`);
        end();
      });
    });
    queue.enqueue({ text: "one" });
    queue.enqueue({ text: "two" });
    queue.enqueue({ text: "three" });

    // Only "one" should have started — "two" and "three" are still queued
    // behind it, proving sequential (non-overlapping) playback.
    expect(order).toEqual(["start:one"]);
    finishers[0]();
    expect(order).toEqual(["start:one", "end:one", "start:two"]);
    finishers[1]();
    expect(order).toEqual(["start:one", "end:one", "start:two", "end:two", "start:three"]);
    finishers[2]();
    expect(order).toEqual(["start:one", "end:one", "start:two", "end:two", "start:three", "end:three"]);
  });

  it("continues to the next item after an error, never getting stuck", () => {
    const order: string[] = [];
    const queue = new SpeechQueue((item, end, onError) => {
      if (item.text === "bad") onError("synthesis failed");
      else {
        order.push(item.text);
        end();
      }
    });
    queue.enqueue({ text: "bad" });
    queue.enqueue({ text: "good" });
    expect(order).toEqual(["good"]);
  });

  it("clear() drops pending items but lets the current item keep playing", () => {
    let finish = () => {};
    const queue = new SpeechQueue((_item, end) => {
      finish = end;
    });
    queue.enqueue({ text: "current" });
    queue.enqueue({ text: "pending" });
    expect(queue.pendingCount()).toBe(1);
    queue.clear();
    expect(queue.pendingCount()).toBe(0);
    expect(queue.isSpeaking()).toBe(true); // "current" is still playing
    finish();
    expect(queue.isSpeaking()).toBe(false); // and "pending" never starts
  });

  it("interrupt() stops the queue from resuming anything, including what looked current", () => {
    const { speak } = deferredSpeak();
    const queue = new SpeechQueue(speak);
    queue.enqueue({ text: "a" });
    queue.enqueue({ text: "b" });
    queue.interrupt();
    expect(queue.isSpeaking()).toBe(false);
    expect(queue.currentItem()).toBeNull();
    expect(queue.pendingCount()).toBe(0);
  });

  it("pause() stops new items from starting; resume() continues where it left off", () => {
    const order: string[] = [];
    let finish = () => {};
    const queue = new SpeechQueue((item, end) => {
      order.push(item.text);
      finish = end;
    });
    queue.enqueue({ text: "one" });
    finish();
    queue.pause();
    queue.enqueue({ text: "two" });
    expect(order).toEqual(["one"]); // "two" queued but not started — paused
    queue.resume();
    expect(order).toEqual(["one", "two"]);
  });

  it("ignores an empty/whitespace-only item rather than queuing dead air", () => {
    const speak = vi.fn();
    const queue = new SpeechQueue(speak);
    queue.enqueue({ text: "   " });
    expect(speak).not.toHaveBeenCalled();
  });

  it("still fires onDrained for an empty enqueue when nothing was already playing — never leaves a caller waiting forever", () => {
    const onDrained = vi.fn();
    const queue = new SpeechQueue(vi.fn(), { onDrained });
    queue.enqueue({ text: "" });
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onDrained for an empty enqueue while something else is still playing", () => {
    const onDrained = vi.fn();
    let finish = () => {};
    const queue = new SpeechQueue(
      (_item, end) => {
        finish = end;
      },
      { onDrained }
    );
    queue.enqueue({ text: "still speaking" });
    queue.enqueue({ text: "" }); // e.g. a trailing-remainder call that turned out empty
    expect(onDrained).not.toHaveBeenCalled();
    finish();
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it("currentItem() reflects exactly what's playing right now", () => {
    let finish = () => {};
    const queue = new SpeechQueue((_item, end) => {
      finish = end;
    });
    expect(queue.currentItem()).toBeNull();
    queue.enqueue({ text: "hello", msgId: "m1" });
    expect(queue.currentItem()).toEqual({ text: "hello", msgId: "m1" });
    finish();
    expect(queue.currentItem()).toBeNull();
  });

  it("fires onDrained exactly once, only after the very last item finishes", () => {
    const onDrained = vi.fn();
    const finishers: (() => void)[] = [];
    const queue = new SpeechQueue(
      (_item, end) => finishers.push(end),
      { onDrained }
    );
    queue.enqueue({ text: "one" });
    queue.enqueue({ text: "two" });
    finishers[0]();
    expect(onDrained).not.toHaveBeenCalled(); // "two" is still pending
    finishers[1]();
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it("does not fire onDrained again for a later, separate turn until that one also finishes", () => {
    const onDrained = vi.fn();
    const finishers: (() => void)[] = [];
    const queue = new SpeechQueue(
      (_item, end) => finishers.push(end),
      { onDrained }
    );
    queue.enqueue({ text: "first turn" });
    finishers[0]();
    expect(onDrained).toHaveBeenCalledTimes(1);

    queue.enqueue({ text: "second turn" });
    expect(onDrained).toHaveBeenCalledTimes(1); // not yet — still speaking
    finishers[1]();
    expect(onDrained).toHaveBeenCalledTimes(2);
  });

  it("fires onStart/onEnd/onError callbacks for observability", () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const onError = vi.fn();
    const queue = new SpeechQueue(
      (item, end, error) => (item.text === "fail" ? error("nope") : end()),
      { onStart, onEnd, onError }
    );
    queue.enqueue({ text: "ok" });
    expect(onStart).toHaveBeenCalledWith({ text: "ok" });
    expect(onEnd).toHaveBeenCalledWith({ text: "ok" });
    queue.enqueue({ text: "fail" });
    expect(onError).toHaveBeenCalledWith({ text: "fail" }, "nope");
  });
});
