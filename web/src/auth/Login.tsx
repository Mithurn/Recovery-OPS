import { useEffect, useRef, useState } from "react";
import { requestCode, verifyCode, type User } from "../api.js";
import { Spinner } from "../ui/motion.js";
import { CODE_LENGTH, RESEND_COOLDOWN_SECONDS } from "./config.js";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "something went wrong");

export function Login({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestCode(email.trim());
      setStep("code");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await verifyCode(email.trim(), value));
    } catch (err) {
      setError(errorText(err));
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void verify(digits);
  };

  return (
    <main className="auth">
      <section className="auth__card">
        <div className="auth__brand">
          <span className="auth__mark" aria-hidden />
          <span className="brand__name">Recovery OPS</span>
        </div>
        <h1 className="auth__title">{step === "email" ? "Sign in" : "Check your email"}</h1>
        <p className="auth__lede">
          {step === "email"
            ? "An agent that works out how to recover each failed payment, behind a safety gate it cannot override."
            : `We sent a ${CODE_LENGTH} digit code to ${email.trim()}.`}
        </p>

        {step === "email" ? (
          <form
            className="auth__form"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="field">
              <span className="field__label">Email</span>
              <input
                className="field__input"
                type="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button className="btn btn--primary auth__submit" type="submit" disabled={busy || !email.trim()}>
              {busy && <Spinner size={13} />} Send code
            </button>
          </form>
        ) : (
          <div className="auth__form">
            <label className="field">
              <span className="field__label">Code</span>
              <input
                ref={codeRef}
                className="field__input field__input--code mono tnum"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={CODE_LENGTH}
                value={code}
                disabled={busy}
                onChange={(e) => onCodeChange(e.target.value)}
              />
            </label>
            <div className="auth__row">
              <button className="auth__link" type="button" onClick={() => setStep("email")}>
                Use a different email
              </button>
              <button className="auth__link" type="button" disabled={cooldown > 0 || busy} onClick={() => void send()}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="auth__error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
