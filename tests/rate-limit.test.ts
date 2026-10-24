import { describe, expect, it } from "vitest";
import { FixedWindowLimiter } from "../src/api/rate-limit.js";

describe("FixedWindowLimiter", () => {
  it("allows up to the limit within a window, then blocks", () => {
    const limiter = new FixedWindowLimiter(2, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 1)).toBe(true);
    expect(limiter.allow("a", 2)).toBe(false);
    expect(limiter.allow("a", 999)).toBe(false);
  });

  it("starts a fresh window once the previous one has expired", () => {
    const limiter = new FixedWindowLimiter(1, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 500)).toBe(false);
    expect(limiter.allow("a", 1000)).toBe(true);
    expect(limiter.allow("a", 1001)).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = new FixedWindowLimiter(1, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("b", 0)).toBe(true);
    expect(limiter.allow("a", 1)).toBe(false);
  });
});
