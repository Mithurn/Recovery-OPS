import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/fraunces/wght-italic.css";
import { Link, PATHS } from "../routes";
import { AuditDemo } from "./AuditDemo";
import { CaseReceipt } from "./CaseReceipt";
import { CaseTimeline } from "./CaseTimeline";
import { GateDemo } from "./GateDemo";
import { FACTS, GITHUB_URL, NAV_LINKS } from "./ledgerContent";
import { ProductShots } from "./ProductShots";
import { ProductVideo } from "./ProductVideo";
import { SectionHead } from "./SectionHead";
import { UnderTheHood } from "./UnderTheHood";
import "./ledger.css";

function Arrow() {
  return <span aria-hidden="true">&rarr;</span>;
}

function CtaRow() {
  return (
    <div className="lg-cta-row">
      <Link to={PATHS.demo} className="lg-btn">
        Watch the live demo <Arrow />
      </Link>
      <a className="lg-btn lg-btn--ghost" href={GITHUB_URL}>
        View source
      </a>
    </div>
  );
}

export function Landing() {
  return (
    <div className="ledger">
      <a className="lg-skip" href="#lg-main">
        Skip to content
      </a>
      <header className="lg-top">
        <div className="lg-wrap">
          <Link to={PATHS.landing} className="lg-brand">
            <i aria-hidden="true" />
            Recovery OPS
          </Link>
          <nav aria-label="Primary">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
            <Link to={PATHS.app} className="lg-keep">
              Sign up
            </Link>
            <a className="lg-keep" href={GITHUB_URL}>
              Source
            </a>
          </nav>
        </div>
      </header>

      <main id="lg-main">
        <section className="lg-hero">
          <div className="lg-wrap lg-hero__grid">
            <div>
              <p className="lg-eyebrow">
                <b>Razorpay</b> failed payment recovery
              </p>
              <h1>
                Failed payments, recovered inside limits <em>the model can't override.</em>
              </h1>
              <p className="lg-lede">
                Five agents work out why each payment failed and propose one recovery action. Nine rules written in code decide what actually runs. The model proposes, the gate disposes, and every step lands in an audit log nobody can edit.
              </p>
              <CtaRow />
              <p className="lg-muted lg-mono lg-small">The demo is a recorded replay. No sign-in.</p>
              <div className="lg-facts" role="list">
                {FACTS.map((f) => (
                  <div key={f.label} role="listitem">
                    <b>{f.value}</b>
                    <span>{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <CaseReceipt />
          </div>
        </section>

        <section id="case">
          <div className="lg-wrap">
            <SectionHead marker="01" eyebrow="The case, start to finish" title="One failed payment, five hands, one paper trail.">
              A <span className="lg-mono">payment.failed</span> webhook opens a case. It moves through each agent in order and every hop is written down.
            </SectionHead>
            <div className="lg-case">
              <div className="lg-case__side">
                <p>The model reasons. Code decides. Only one agent is allowed to touch money, and it is allowed to do it once.</p>
              </div>
              <CaseTimeline />
            </div>
          </div>
        </section>

        <section id="tour">
          <div className="lg-wrap">
            <SectionHead marker="→" eyebrow="The tour" title="A failed payment, start to finish, in 24 seconds.">
              A recording of the product handling one case. Nothing loads until you press play.
            </SectionHead>
            <ProductVideo />
          </div>
        </section>

        <section id="gate" className="lg-gate">
          <div className="lg-wrap">
            <SectionHead marker="02" eyebrow="The safety gate" title="Pick a proposal. Watch the rules answer.">
              The investigator can propose anything. These nine rules run in order and the first one that fires decides the verdict. Try the cases below with the keyboard or a pointer.
            </SectionHead>
            <GateDemo />
          </div>
        </section>

        <section id="audit">
          <div className="lg-wrap">
            <SectionHead marker="03" eyebrow="Audit log" title="An audit log you can't edit.">
              The audit tables grant the app role SELECT and INSERT, nothing else. The database refuses UPDATE and DELETE, so the guarantee does not depend on application code behaving.
            </SectionHead>
            <AuditDemo />
          </div>
        </section>

        <section id="product" className="lg-product">
          <div className="lg-wrap">
            <SectionHead marker="04" eyebrow="The product" title="A workspace you can watch work.">
              Everything streams live over server-sent events. The screenshots below are the real app running the recorded demo replay.
            </SectionHead>
            <ProductShots />
          </div>
        </section>

        <section id="hood" className="lg-hood">
          <div className="lg-wrap">
            <SectionHead marker="05" eyebrow="Under the hood" title="Boring on purpose.">
              The guarantees come from constraints in the database and in code, not from asking the model nicely.
            </SectionHead>
            <UnderTheHood />
          </div>
        </section>

        <section className="lg-final">
          <div className="lg-wrap">
            <p className="lg-eyebrow">
              <b>06</b> See it run
            </p>
            <h2>Watch a case get stamped, clamped or skipped.</h2>
            <p className="lg-lede">The replay needs no sign-in and is always up. If you want your own account, sign up there and paste Razorpay test keys.</p>
            <div className="lg-cta-row">
              <Link to={PATHS.demo} className="lg-btn">
                Watch the live demo <Arrow />
              </Link>
              <Link to={PATHS.app} className="lg-btn lg-btn--ghost">
                Sign up
              </Link>
              <a className="lg-btn lg-btn--ghost" href={GITHUB_URL}>
                View source
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lg-footer">
        <div className="lg-wrap">
          <span>Recovery OPS · MIT licensed · Razorpay test mode only</span>
          <span>
            <a href={GITHUB_URL}>GitHub</a> · <Link to={PATHS.demo}>Live demo</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
