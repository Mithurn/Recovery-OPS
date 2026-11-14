import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBudget } from "../src/agent/budget.js";
import type { SpendSnapshot, SpendStore } from "../src/persistence/spend-repository.js";
import { SpendPersister } from "../src/tenants/spend-persister.js";

const INTERVAL_MS = 1_000;

function memoryStore() {
  const rows = new Map<string, SpendSnapshot>();
  const saves: string[] = [];
  const store: SpendStore = {
    load: async (id) => rows.get(id) ?? null,
    save: async (id, snapshot) => {
      saves.push(id);
      rows.set(id, snapshot);
    },
  };
  return { store, rows, saves };
}

describe("SpendPersister", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("batches changes into one write per interval", async () => {
    const { store, rows, saves } = memoryStore();
    const persister = new SpendPersister(store, INTERVAL_MS);
    const budget = createBudget(5);
    persister.attach("u1", budget);

    budget.calls = 1;
    budget.onChange?.();
    budget.calls = 2;
    budget.usdUsed = 0.3;
    budget.onChange?.();
    expect(saves).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(saves).toEqual(["u1"]);
    expect(rows.get("u1")).toMatchObject({ calls: 2, usdUsed: 0.3 });
  });

  it("flush writes immediately and cancels the pending timer", async () => {
    const { store, saves } = memoryStore();
    const persister = new SpendPersister(store, INTERVAL_MS);
    const budget = createBudget(5);
    persister.attach("u1", budget);
    budget.onChange?.();

    await persister.flush();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2);
    expect(saves).toEqual(["u1"]);
  });

  it("keeps a failed write dirty and retries it", async () => {
    const { store, rows } = memoryStore();
    const errors: unknown[] = [];
    let failing = true;
    const flaky: SpendStore = {
      load: store.load,
      save: async (id, s) => {
        if (failing) throw new Error("down");
        await store.save(id, s);
      },
    };
    const persister = new SpendPersister(flaky, INTERVAL_MS, (e) => errors.push(e));
    const budget = createBudget(5);
    persister.attach("u1", budget);
    budget.calls = 7;
    budget.onChange?.();

    await persister.flush();
    expect(errors).toHaveLength(1);
    failing = false;
    await persister.flush();
    expect(rows.get("u1")?.calls).toBe(7);
  });
});
