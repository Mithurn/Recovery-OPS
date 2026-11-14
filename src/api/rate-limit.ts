export const DEFAULT_LIMITER_MAX_KEYS = 10_000;

export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = DEFAULT_LIMITER_MAX_KEYS,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.delete(key);
      this.makeRoom(now);
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  get size(): number {
    return this.hits.size;
  }

  private makeRoom(now: number): void {
    if (this.hits.size < this.maxKeys) return;
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
    while (this.hits.size >= this.maxKeys) {
      const oldest = this.hits.keys().next();
      if (oldest.done) return;
      this.hits.delete(oldest.value);
    }
  }
}
