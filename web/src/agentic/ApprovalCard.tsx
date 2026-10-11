import { useState, type ReactNode } from "react";

export type ApprovalOption = { id: string; label: string; hint?: string };

export function ApprovalCard({
  question,
  options,
  confirmLabel = "Continue",
  notePlaceholder = "Add a note for the audit log",
  secondary,
  onConfirm,
}: {
  question: string;
  options: ApprovalOption[];
  confirmLabel?: string;
  notePlaceholder?: string;
  secondary?: ReactNode;
  onConfirm: (optionId: string, note: string) => Promise<void> | void;
}) {
  const [choice, setChoice] = useState<string | null>(options[0]?.id ?? null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!choice) return;
    setBusy(true);
    try {
      await onConfirm(choice, note.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="approval" role="group" aria-label={question}>
      <p className="approval__q">{question}</p>
      <div className="approval__options" role="radiogroup">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={choice === o.id} className="approval__option" onClick={() => setChoice(o.id)}>
            <span className="approval__radio" aria-hidden>
              <span />
            </span>
            <span className="approval__label">{o.label}</span>
            {o.hint && <span className="approval__hint">{o.hint}</span>}
          </button>
        ))}
        <label className="approval__option approval__option--note">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={notePlaceholder} aria-label="Note" maxLength={500} />
        </label>
      </div>
      <div className="approval__foot">
        {secondary}
        <button className="btn btn--primary btn--sm" disabled={!choice || busy} onClick={() => void confirm()}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
