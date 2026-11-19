import { TIMELINE } from "./ledgerContent";

export function CaseTimeline() {
  return (
    <ol className="lg-timeline">
      {TIMELINE.map((step, i) => (
        <li key={step.name} data-n={i + 1} className={`lg-tone-${step.tone}`}>
          <h3>
            {step.name} <span className={`lg-tag lg-tone-${step.tone}`}>{step.tag}</span>
          </h3>
          <p>{step.text}</p>
          {step.calls && (
            <ul className="lg-calls" aria-label="Investigator tool calls">
              {step.calls.map((c) => (
                <li key={c}>
                  <span>{c}</span>
                  <span>tool</span>
                </li>
              ))}
            </ul>
          )}
          {step.branches && (
            <div className="lg-branches">
              {step.branches.map((b) => (
                <span key={b.label} className={`lg-tone-${b.tone}`}>
                  {b.label}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
