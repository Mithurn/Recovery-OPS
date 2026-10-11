import type { Credentials, User } from "../api.js";
import { KeysForm } from "../auth/KeysForm.js";
import { KeysPanel } from "../auth/KeysPanel.js";
import { Link, PATHS } from "../routes.js";

export function SettingsPage({ user, creds, onCredsChange, onSignOut }: { user: User; creds: Credentials; onCredsChange: (c: Credentials) => void; onSignOut: () => Promise<void> }) {
  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2>Settings</h2>
          <p className="muted small">Your Razorpay connection and account.</p>
        </div>
      </header>
      <section className="settings">
        <h3>Razorpay test keys</h3>
        {creds.connected ? (
          <KeysPanel creds={creds} onChange={onCredsChange} />
        ) : (
          <>
            <p className="muted small">Test mode keys only. The secret is encrypted at rest and never sent back to the browser.</p>
            <KeysForm onConnected={onCredsChange} />
          </>
        )}
        <hr className="rule" />
        <h3>Account</h3>
        <div className="actions">
          <span className="muted">{user.email}</span>
          <button className="btn btn--sm" onClick={() => void onSignOut()}>
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}

export function DemoSettings() {
  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2>Settings</h2>
          <p className="muted small">Your Razorpay connection and account.</p>
        </div>
      </header>
      <section className="settings">
        <h3>Razorpay test keys</h3>
        <p className="muted small">Sign up to connect your own test mode keys. They are encrypted at rest and never sent back to the browser.</p>
        <label className="field-stack">
          <span className="muted small">Key ID</span>
          <input className="input" disabled placeholder="rzp_test_…" />
        </label>
        <label className="field-stack">
          <span className="muted small">Key secret</span>
          <input className="input" disabled type="password" placeholder="••••••••••••" />
        </label>
        <div className="actions">
          <Link to={PATHS.app} className="btn btn--primary">
            Sign up to connect keys
          </Link>
        </div>
      </section>
    </div>
  );
}
