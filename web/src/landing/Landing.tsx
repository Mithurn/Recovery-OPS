import { DemoScope } from "../demo/DemoScope";
import { DESKS } from "../floor/layout";
import { Link, PATHS } from "../routes";
import { AgentPortrait } from "./AgentPortrait";
import { HeroFloor } from "./HeroFloor";
import "./landing.css";

const toHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

const BAND = [
  { value: "5", label: "agents on every case" },
  { value: "9", label: "hard limits, always on" },
  { value: "1", label: "Razorpay call per attempt" },
  { value: "0", label: "edits to the audit trail" },
];

const STEPS: Record<string, { title: string; text: string }> = {
  intake: { title: "Spots the failure", text: "Picks up the failed payment from Razorpay and opens a case." },
  investigator: { title: "Finds the cause", text: "Checks history, bank downtime and similar cases, then picks a fix." },
  gate: { title: "Checks the limits", text: "Nine fixed rules approve, block or hold every proposal." },
  executor: { title: "Acts once", text: "Retries or sends a link, once, with no risk of a double charge." },
  ledger: { title: "Writes it down", text: "Every step is saved to a log nobody can edit." },
};

const SHOTS = [
  { src: "/shots/workspace.jpg", alt: "The agent workspace with five agents and a live run log", title: "Agent workspace", text: "Watch the agents work. Every tool call is logged as it happens." },
  { src: "/shots/case.jpg", alt: "A case with its investigation trace and attempt", title: "Case story", text: "See what the agent checked, what it proposed, and what the gate decided." },
  { src: "/shots/needs.jpg", alt: "A needs-you queue with approval cards", title: "Needs you", text: "When the gate stops the agents, you decide, and it's audited." },
];

const RULES = [
  ["Risk holds", "always go to a person"],
  ["Expired cards", "never retried automatically"],
  ["Four attempts", "then it stops"],
  ["₹5,000 cap", "per case"],
  ["Low confidence", "escalates"],
  ["Cooldowns", "6 hours between charges"],
  ["Contact hours", "8:00 to 19:00 IST"],
  ["Write offs", "need a person"],
];

function Nav() {
  return (
    <header className="lp-nav">
      <Link to={PATHS.landing} className="lp-brand">
        <span className="lp-brand__mark" aria-hidden />
        Recovery OPS
      </Link>
      <nav className="lp-nav__links" aria-label="Sections">
        <a href="#how">How it works</a>
        <a href="#product">Product</a>
        <a href="#safety">Safety</a>
      </nav>
      <div className="lp-nav__cta">
        <Link to={PATHS.demo} className="lp-btn lp-btn--ghost">
          Live demo
        </Link>
        <Link to={PATHS.app} className="lp-btn lp-btn--primary">
          Sign up
        </Link>
      </div>
    </header>
  );
}

export function Landing() {
  return (
    <DemoScope>
      <div className="lp">
        <Nav />

        <section className="lp-hero">
          <p className="lp-eyebrow">For Razorpay merchants</p>
          <h1 className="lp-title">Failed payments, recovered while you sleep.</h1>
          <p className="lp-lede">Five AI agents work out why each payment failed and fix it, inside limits they can't override.</p>
          <div className="lp-hero__cta">
            <Link to={PATHS.demo} className="lp-btn lp-btn--primary lp-btn--lg">
              Watch the live demo
            </Link>
            <Link to={PATHS.app} className="lp-btn lp-btn--ghost lp-btn--lg">
              Sign up
            </Link>
          </div>
          <HeroFloor />
        </section>

        <section className="lp-band" aria-label="Highlights">
          {BAND.map((s) => (
            <div key={s.label} className="lp-band__item">
              <span className="lp-band__value">{s.value}</span>
              <span className="lp-band__label">{s.label}</span>
            </div>
          ))}
        </section>

        <section id="how" className="lp-section">
          <p className="lp-eyebrow">How it works</p>
          <h2 className="lp-h2">From failed to fixed in five steps</h2>
          <ol className="lp-steps">
            {DESKS.map((d, i) => (
              <li key={d.agent} className="lp-card lp-step" style={{ ["--accent-c" as string]: toHex(d.accent) }}>
                <span className="lp-step__no">0{i + 1}</span>
                <AgentPortrait agent={d.agent} />
                <h3 className="lp-step__role">{d.name}</h3>
                <h4 className="lp-step__title">{STEPS[d.agent]!.title}</h4>
                <p className="lp-step__text">{STEPS[d.agent]!.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="product" className="lp-section">
          <p className="lp-eyebrow">The product</p>
          <h2 className="lp-h2">See every decision, as it happens</h2>
          <div className="lp-shots">
            {SHOTS.map((s) => (
              <figure key={s.src} className="lp-card lp-shot">
                <img src={s.src} alt={s.alt} loading="lazy" />
                <figcaption>
                  <b>{s.title}</b>
                  <span>{s.text}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="safety" className="lp-section lp-section--split">
          <div>
            <p className="lp-eyebrow">Safety</p>
            <h2 className="lp-h2">The AI proposes. The rules decide.</h2>
            <p className="lp-body">Models are good at diagnosing and bad at being trusted with money. So the agent only suggests. Nine rules written in plain code decide what actually runs.</p>
            <div className="lp-card lp-verdict" aria-label="Example gate verdict">
              <span className="lp-verdict__tag">Gate blocked it</span>
              <p>
                The agent wanted to retry a ₹4,999 payment with a risk flag, 66% sure.
              </p>
              <p className="lp-verdict__result">The rules sent it to a person instead.</p>
            </div>
          </div>
          <ul className="lp-rules">
            {RULES.map(([name, note]) => (
              <li key={name} className="lp-rule">
                <b>{name}</b>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-cta">
          <h2 className="lp-h2">See it handle a bad day.</h2>
          <div className="lp-hero__cta">
            <Link to={PATHS.demo} className="lp-btn lp-btn--primary lp-btn--lg">
              Watch the live demo
            </Link>
            <Link to={PATHS.app} className="lp-btn lp-btn--ghost lp-btn--lg">
              Sign up
            </Link>
          </div>
        </section>

        <footer className="lp-footer">
          <div className="lp-footer__top">
            <div className="lp-footer__brand">
              <Link to={PATHS.landing} className="lp-brand">
                <span className="lp-brand__mark" aria-hidden />
                Recovery OPS
              </Link>
              <p>AI agents that recover failed Razorpay payments, inside limits they can't override.</p>
            </div>
            <nav className="lp-footer__col" aria-label="Product">
              <h4>Product</h4>
              <Link to={PATHS.demo}>Live demo</Link>
              <Link to={PATHS.app}>Sign up</Link>
              <a href="#product">Screenshots</a>
            </nav>
            <nav className="lp-footer__col" aria-label="Learn">
              <h4>Learn</h4>
              <a href="#how">How it works</a>
              <a href="#safety">Safety</a>
              <a href="https://github.com/Mithurn/Recovery-OPS" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </nav>
          </div>
          <div className="lp-footer__bottom">
            <span>© 2026 Recovery OPS</span>
          </div>
        </footer>
      </div>
    </DemoScope>
  );
}
