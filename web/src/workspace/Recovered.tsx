import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomBus } from "../room/roomBus";
import { rupees } from "../ui/format.js";
import { Check, X } from "../ui/icons.js";

export type Recovery = { id: number; caseId: string | undefined; paise: number };

const AUTO_DISMISS_MS = 7000;
const MAX_VISIBLE = 3;

export function useRecoveries(bus: RoomBus) {
  const [items, setItems] = useState<Recovery[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((r) => r.id !== id)), []);

  useEffect(
    () =>
      bus.subscribe((event) => {
        if (event.eventType !== "ATTEMPT_OUTCOME" || event.payload.status !== "RECOVERED") return;
        const paise = typeof event.payload.recoveredPaise === "number" ? event.payload.recoveredPaise : 0;
        if (paise <= 0) return;
        const id = nextId.current++;
        setItems((prev) => [...prev, { id, caseId: event.caseId, paise }].slice(-MAX_VISIBLE));
        window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      }),
    [bus, dismiss],
  );

  return { items, dismiss };
}

export function RecoveredCards({
  items,
  nameOf,
  onOpen,
  onDismiss,
}: {
  items: Recovery[];
  nameOf: (caseId: string | undefined) => string;
  onOpen: (caseId: string) => void;
  onDismiss: (id: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="recovered" role="status" aria-live="polite">
      {items.map((r) => (
        <div key={r.id} className="recovered__card">
          <span className="recovered__badge" aria-hidden>
            <Check size={14} />
          </span>
          <div className="recovered__text">
            <span className="recovered__label">Recovered</span>
            <strong className="recovered__amount tnum">{rupees(r.paise)}</strong>
            <span className="recovered__who">{nameOf(r.caseId)}</span>
          </div>
          {r.caseId && (
            <button
              className="btn btn--sm"
              onClick={() => {
                onOpen(r.caseId!);
                onDismiss(r.id);
              }}
            >
              View case
            </button>
          )}
          <button className="btn btn--icon btn--ghost" onClick={() => onDismiss(r.id)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useRecoveredPop(paise: number): { popKey: number; delta: number } {
  const previous = useRef<number | null>(null);
  const [state, setState] = useState({ popKey: 0, delta: 0 });
  useEffect(() => {
    const before = previous.current;
    previous.current = paise;
    if (before !== null && paise > before) setState((s) => ({ popKey: s.popKey + 1, delta: paise - before }));
  }, [paise]);
  return state;
}
