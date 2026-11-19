import { useState } from "react";
import { evaluateGate, GATE_RULES } from "./gate";
import { GATE_NOTE_LIMITS, GATE_SCENARIOS, RULE_STATUS_LABEL, VERDICTS } from "./ledgerContent";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function GateDemo() {
  const [selected, setSelected] = useState(0);
  const [touched, setTouched] = useState(false);
  const { proposal } = GATE_SCENARIOS[selected]!;
  const { statuses, outcome, fired } = evaluateGate(proposal);
  const verdict = VERDICTS[outcome];

  const pick = (i: number) => {
    setSelected(i);
    setTouched(true);
  };

  return (
    <>
      <div className="lg-gate__ui">
        <form onSubmit={(e) => e.preventDefault()}>
          <fieldset className="lg-pick">
            <legend>Proposed action (sample cases)</legend>
            {GATE_SCENARIOS.map((s, i) => (
              <label key={s.title} className="lg-opt">
                <input type="radio" name="lg-scenario" checked={selected === i} onChange={() => pick(i)} />
                <span>
                  <i className="lg-opt__dot" />
                  <b>{s.title}</b>
                  <small>{s.detail}</small>
                </span>
              </label>
            ))}
          </fieldset>
        </form>
        <div className="lg-board" aria-labelledby="lg-board-title">
          <p className="lg-eyebrow" id="lg-board-title">
            Gate readout <span className="lg-sample">Illustrative</span>
          </p>
          <p className="lg-board__facts">
            Sample case · {inr(proposal.amount)} · confidence {proposal.confidence} · attempt {proposal.attempt}
            {proposal.risk ? " · risk hold" : ""}
            {proposal.hardDecline ? " · hard decline" : ""}
          </p>
          <ol className="lg-rules">
            {GATE_RULES.map((rule, i) => {
              const status = statuses[i]!;
              const cls = status === "clamp" || status === "skip" ? `lg-rules__fire lg-rules__${status}` : `lg-rules__${status}`;
              return (
                <li key={rule.id} className={cls}>
                  <span>{rule.id}</span>
                  <span className="lg-rules__st">{RULE_STATUS_LABEL[status]}</span>
                </li>
              );
            })}
          </ol>
          <div className="lg-verdict" aria-live="polite" aria-atomic="true">
            <span key={selected} className={`lg-vstamp lg-vstamp--${outcome}${touched ? " lg-vstamp--pop" : ""}`}>
              {verdict.label}
            </span>
            <p>
              <b>{fired ? fired.id : "no rule fired"}</b>
              {fired ? fired.why : `All nine rules clear. ${verdict.text}`}
            </p>
          </div>
        </div>
      </div>
      <p className="lg-note">
        Illustrative inputs, real rule names. {GATE_NOTE_LIMITS} This page re-implements the checks for the demo; the real gate lives in <span className="lg-mono">src/safety/safety-gate.ts</span>.
      </p>
    </>
  );
}
