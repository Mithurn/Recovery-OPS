import { useMemo } from "react";
import type { RecoveryCase } from "../types.js";
import { humanize, recoveryByReason } from "./cases";

const MAX_BARS = 5;

export function ReasonBars({ cases }: { cases: RecoveryCase[] }) {
  const rows = useMemo(() => recoveryByReason(cases).slice(0, MAX_BARS), [cases]);
  if (rows.length === 0) return null;
  return (
    <section className="card bars" aria-label="Recovery by failure reason">
      <h3 className="bars__title">Recovery by reason</h3>
      <ul className="bars__list">
        {rows.map((r) => (
          <li key={r.reason} className="bars__row">
            <span className="bars__label">{humanize(r.reason)}</span>
            <span className="bars__track" role="img" aria-label={`${Math.round(r.rate * 100)} percent recovered`}>
              <span className="bars__fill" style={{ width: `${Math.round(r.rate * 100)}%` }} />
            </span>
            <span className="bars__value tnum">
              {r.recovered}/{r.total}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
