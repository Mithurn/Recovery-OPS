import { useState } from "react";
import { saveCredentials, type Credentials } from "../api.js";
import { Spinner } from "../ui/motion.js";
import { KEY_PREFIX } from "./config.js";

export function KeysForm({ onConnected }: { onConnected: (creds: Credentials) => void }) {
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onConnected(await saveCredentials(keyId.trim(), keySecret.trim()));
      setKeySecret("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not connect");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="auth__form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="field">
        <span className="field__label">Key ID</span>
        <input
          className="field__input mono"
          autoComplete="off"
          spellCheck={false}
          placeholder={`${KEY_PREFIX}…`}
          value={keyId}
          onChange={(e) => setKeyId(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">Key secret</span>
        <input
          className="field__input mono"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={keySecret}
          onChange={(e) => setKeySecret(e.target.value)}
        />
      </label>
      <button className="btn btn--primary auth__submit" type="submit" disabled={busy || !keyId.trim() || !keySecret.trim()}>
        {busy && <Spinner size={13} />} Connect Razorpay
      </button>
      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
