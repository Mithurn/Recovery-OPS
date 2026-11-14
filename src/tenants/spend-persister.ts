import type { BudgetState } from "../agent/budget.js";
import type { SpendStore } from "../persistence/spend-repository.js";

export const SPEND_FLUSH_INTERVAL_MS = 5_000;

export class SpendPersister {
  private readonly dirty = new Map<string, BudgetState>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: SpendStore,
    private readonly intervalMs: number = SPEND_FLUSH_INTERVAL_MS,
    private readonly onError: (error: unknown) => void = (error) => console.error("spend flush failed", error),
  ) {}

  attach(userId: string, budget: BudgetState): void {
    budget.onChange = () => {
      this.dirty.set(userId, budget);
      this.timer ??= setTimeout(() => void this.flush(), this.intervalMs).unref();
    };
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const batch = [...this.dirty];
    this.dirty.clear();
    await Promise.all(
      batch.map(async ([userId, b]) => {
        try {
          await this.store.save(userId, {
            usdUsed: b.usdUsed,
            calls: b.calls,
            inputTokens: b.inputTokens,
            outputTokens: b.outputTokens,
            callsWithoutUsage: b.callsWithoutUsage,
          });
        } catch (error) {
          this.dirty.set(userId, b);
          this.onError(error);
        }
      }),
    );
  }
}
