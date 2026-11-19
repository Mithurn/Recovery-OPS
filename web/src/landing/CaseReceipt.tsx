import { RECEIPT } from "./ledgerContent";
import { useReplay } from "./useReplay";

export function CaseReceipt() {
  const [run, replay] = useReplay();

  return (
    <aside className="lg-receipt" aria-label="Sample failed payment passing through the five agents">
      <div className="lg-receipt__head">
        <span>Case receipt</span>
        <span className="lg-sample">Sample case</span>
      </div>
      <div key={run}>
        <div className="lg-receipt__amount">{RECEIPT.amount}</div>
        <p className="lg-receipt__sub">{RECEIPT.sub}</p>
        <span className="lg-receipt__status">{RECEIPT.status}</span>
        <ol className="lg-receipt__steps">
          {RECEIPT.steps.map((s, i) => (
            <li key={s.who} style={{ ["--i" as string]: i }}>
              <span className="lg-receipt__who">{s.who}</span>
              <span className="lg-receipt__out">{s.out}</span>
              <span className={`lg-stamp lg-tone-${s.tone}`}>{s.stamp}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="lg-receipt__foot">{RECEIPT.foot}</p>
      <button className="lg-receipt__replay" type="button" onClick={replay}>
        Replay
      </button>
    </aside>
  );
}
