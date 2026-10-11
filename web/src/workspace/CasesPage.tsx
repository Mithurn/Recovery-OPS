import { useMemo, useState } from "react";
import { AGENT_INFO, agentForLane } from "../floor/agents";
import type { RecoveryCase } from "../types.js";
import { customerLabel, rupees } from "../ui/format.js";
import { ReasonBars } from "./ReasonBars";
import { casePriority, countByStatus, facetsOf, filterCases, humanize, NO_FILTERS, STATUS_GROUPS, statusOf, timeAgo, type CaseFilters, type StatusGroup } from "./cases";

const STATUS_TONE: Record<StatusGroup, string> = {
  "In progress": "work",
  Waiting: "wait",
  "Needs you": "bad",
  Recovered: "ok",
  "Written off": "bad",
  Stopped: "idle",
};

export function CasesPage({ cases, selectedId, onOpen }: { cases: RecoveryCase[]; selectedId: string | null; onOpen: (id: string) => void }) {
  const [filters, setFilters] = useState<CaseFilters>(NO_FILTERS);
  const counts = useMemo(() => countByStatus(cases), [cases]);
  const facets = useMemo(() => facetsOf(cases), [cases]);
  const rows = useMemo(() => filterCases(cases, filters), [cases, filters]);
  const set = <K extends keyof CaseFilters>(key: K, value: CaseFilters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2>Cases</h2>
          <p className="muted small tnum">
            {rows.length} of {cases.length} cases
          </p>
        </div>
        <div className="filters">
          <input className="input" type="search" placeholder="Search customer, reason, bank" aria-label="Search cases" value={filters.query} onChange={(e) => set("query", e.target.value)} />
          <select className="input" aria-label="Failure reason" value={filters.reason} onChange={(e) => set("reason", e.target.value)}>
            <option value="">Any reason</option>
            {facets.reasons.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </select>
          <select className="input" aria-label="Method" value={filters.method} onChange={(e) => set("method", e.target.value)}>
            <option value="">Any method</option>
            {facets.methods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select className="input" aria-label="Bank" value={filters.bank} onChange={(e) => set("bank", e.target.value)}>
            <option value="">Any bank</option>
            {facets.banks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select className="input" aria-label="Priority" value={filters.priority} onChange={(e) => set("priority", e.target.value as CaseFilters["priority"])}>
            <option value="">Any priority</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>
      </header>

      <ReasonBars cases={cases} />

      <div className="segments" role="group" aria-label="Status">
        <button className="segment" aria-pressed={filters.status === ""} onClick={() => set("status", "")}>
          All <b className="tnum">{cases.length}</b>
        </button>
        {STATUS_GROUPS.map((g) => (
          <button key={g} className="segment" aria-pressed={filters.status === g} onClick={() => set("status", g)}>
            {g} <b className="tnum">{counts[g]}</b>
          </button>
        ))}
        {filtered && (
          <button className="segment segment--clear" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      <div className="table">
        <table>
          <thead>
            <tr>
              <th>Priority</th>
              <th>Customer</th>
              <th className="r">Amount</th>
              <th>Reason</th>
              <th>Bank</th>
              <th>Status</th>
              <th>With</th>
              <th className="r">Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const status = statusOf(c);
              const priority = casePriority(c);
              return (
                <tr key={c.id} tabIndex={0} aria-selected={selectedId === c.id} onClick={() => onOpen(c.id)} onKeyDown={(e) => e.key === "Enter" && onOpen(c.id)}>
                  <td>
                    <span className={`tag tag--${priority.toLowerCase()}`}>{priority}</span>
                  </td>
                  <td className="strong">{customerLabel(c.customerRef)}</td>
                  <td className="r tnum strong">{rupees(c.lane === "RECOVERED" ? c.recoveredPaise : c.amountPaise)}</td>
                  <td>{humanize(c.failureReason)}</td>
                  <td>{c.instrument?.issuer ?? c.method ?? "card"}</td>
                  <td>
                    <span className={`status status--${STATUS_TONE[status]}`}>
                      <i />
                      {status}
                    </span>
                  </td>
                  <td>{status === "Recovered" || status === "Written off" || status === "Stopped" ? "Closed" : AGENT_INFO[agentForLane(c.lane)].role}</td>
                  <td className="r tnum">{timeAgo(c.failedAt)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr className="table__empty">
                <td colSpan={8}>{cases.length === 0 ? "No cases yet. Failed payments appear here as they arrive." : "No cases match these filters."}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
