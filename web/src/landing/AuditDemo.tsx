import { useState } from "react";
import { AUDIT_IDLE_TEXT, AUDIT_ROWS, SQL_ATTEMPTS } from "./ledgerContent";

export function AuditDemo() {
  const [attempt, setAttempt] = useState<(typeof SQL_ATTEMPTS)[number] | null>(null);

  return (
    <div className="lg-audit__grid">
      <div className="lg-scroll" tabIndex={0} role="region" aria-label="Sample audit log table">
        <table>
          <caption>recovery_events · sample rows</caption>
          <thead>
            <tr>
              <th>#</th>
              <th>Agent</th>
              <th>Event</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {AUDIT_ROWS.map(([n, agent, event, detail]) => (
              <tr key={n}>
                <td className="lg-n">{n}</td>
                <td>{agent}</td>
                <td>{event}</td>
                <td>{detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <div className="lg-term" role="group" aria-label="Demo of an UPDATE attempt as the app role">
          <div className="lg-term__bar">
            <span>psql · app role</span>
            <span>demo</span>
          </div>
          <pre aria-live="polite">
            {attempt ? (
              <>
                app=&gt; {attempt.query}
                {"\n"}
                {attempt.error ? <span className="lg-term__err">ERROR:  {attempt.error}</span> : <span className="lg-term__ok">{attempt.ok}</span>}
              </>
            ) : (
              AUDIT_IDLE_TEXT
            )}
          </pre>
        </div>
        <div className="lg-term__btns">
          {SQL_ATTEMPTS.map((a) => (
            <button key={a.key} type="button" onClick={() => setAttempt(a)}>
              Attempt {a.key}
            </button>
          ))}
        </div>
        <p className="lg-caveat">
          A recreation of what the repo's <span className="lg-mono">verify-audit</span> check does against a real database. This protects against the application, not against a database admin. There is no hash chain.
        </p>
      </div>
    </div>
  );
}
