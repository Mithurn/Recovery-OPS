import { useState } from "react";
import { removeCredentials, type Credentials } from "../api.js";
import { Check, Copy } from "../ui/icons.js";
import { COPY_FEEDBACK_MS } from "./config.js";
import { KeysForm } from "./KeysForm.js";

type Connected = Extract<Credentials, { connected: true }>;

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!secret);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="copyfield">
        <code className="copyfield__value">{shown ? value : "•".repeat(24)}</code>
        {secret && (
          <button className="btn btn--ghost" type="button" onClick={() => setShown((v) => !v)}>
            {shown ? "Hide" : "Show"}
          </button>
        )}
        <button className="btn btn--ghost" type="button" onClick={() => void copy()} aria-label={`Copy ${label}`}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

export function KeysPanel({ creds, onChange }: { creds: Connected; onChange: (creds: Credentials) => void }) {
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disconnect = async () => {
    setError(null);
    try {
      onChange(await removeCredentials());
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not disconnect");
    }
  };

  return (
    <div className="keys">
      <CopyField label="Key ID" value={creds.keyId} />
      <p className="keys__hint">
        To receive real test payment events, add this webhook in Razorpay (Test mode, Settings, Webhooks) for the
        <span className="mono"> payment.failed</span> and <span className="mono">payment.captured</span> events. Simulated
        failures work without it.
      </p>
      <CopyField label="Webhook URL" value={creds.webhookUrl} />
      <CopyField label="Webhook secret" value={creds.webhookSecret} secret />
      {replacing ? (
        <KeysForm
          onConnected={(next) => {
            setReplacing(false);
            onChange(next);
          }}
        />
      ) : (
        <div className="keys__actions">
          <button className="btn btn--ghost" onClick={() => setReplacing(true)}>
            Replace keys
          </button>
          <button className="btn btn--stop" onClick={() => void disconnect()}>
            Disconnect
          </button>
        </div>
      )}
      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
