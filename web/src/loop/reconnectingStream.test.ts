import { describe, expect, it, vi } from "vitest";
import { backoffDelay, runReconnectingStream } from "./reconnectingStream";

async function* failing(): AsyncGenerator<never> {
  yield* [];
  throw new Error("dropped");
}

describe("backoffDelay", () => {
  it("doubles per failure and caps at the max", () => {
    expect(backoffDelay(0, 1000, 8000)).toBe(1000);
    expect(backoffDelay(2, 1000, 8000)).toBe(4000);
    expect(backoffDelay(10, 1000, 8000)).toBe(8000);
  });
});

describe("runReconnectingStream", () => {
  it("reports exhaustion after the attempt budget is spent", async () => {
    const onExhausted = vi.fn();
    const open = vi.fn(() => failing());
    await runReconnectingStream(new AbortController().signal, open, () => undefined, { baseMs: 0, maxMs: 0, maxAttempts: 2, onExhausted });
    expect(open).toHaveBeenCalledTimes(3);
    expect(onExhausted).toHaveBeenCalledOnce();
  });

  it("does not report exhaustion once the stream signals done", async () => {
    const onExhausted = vi.fn();
    async function* one() {
      yield { type: "done" };
    }
    await runReconnectingStream(new AbortController().signal, () => one(), () => true, { baseMs: 0, maxAttempts: 1, onExhausted });
    expect(onExhausted).not.toHaveBeenCalled();
  });
});
