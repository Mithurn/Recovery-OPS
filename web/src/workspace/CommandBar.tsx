import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "../ui/motion.js";
import { suggest, type CommandContext, type Suggestion } from "./commands";

export function CommandBar({ ctx, disabled, onError }: { ctx: CommandContext; disabled: boolean; onError: (message: string) => void }) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => (focused && !disabled ? suggest(value, ctx) : []), [focused, disabled, value, ctx]);

  useEffect(() => setActive(0), [value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target as HTMLElement).closest("input, textarea, select")) {
        e.preventDefault();
        inputRef.current?.focus();
        setValue("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const choose = async (option: Suggestion | undefined) => {
    if (!option) return;
    if (option.fill !== undefined) {
      setValue(option.fill);
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await option.run?.();
      setValue("");
      inputRef.current?.blur();
    } catch (err) {
      onError(err instanceof Error ? err.message : "command failed");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void choose(options[active]);
    } else if (e.key === "Escape") {
      setValue("");
      inputRef.current?.blur();
    } else if (e.key === "Tab" && options[active]?.fill !== undefined) {
      e.preventDefault();
      void choose(options[active]);
    }
  };

  return (
    <div
      className="command"
      ref={rootRef}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setFocused(false);
      }}
    >
      {options.length > 0 && (
        <ul className="command__menu" role="listbox" aria-label="Suggestions">
          {options.map((o, i) => (
            <li key={o.key} role="option" aria-selected={i === active}>
              <button tabIndex={-1} className="command__option" data-active={i === active} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => void choose(o)}>
                <span className="command__label">{o.label}</span>
                {o.hint && <span className="command__hint">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="command__bar">
        {busy ? <Spinner size={14} /> : <span className="command__slash mono" aria-hidden>/</span>}
        <input
          ref={inputRef}
          className="command__input"
          value={value}
          disabled={disabled}
          placeholder={disabled ? "Connect your Razorpay keys to give the agents work" : "Give the agents a command. Try /simulate or /retry"}
          aria-label="Command"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
        />
        {!value && !disabled && <kbd className="command__key">/</kbd>}
      </div>
    </div>
  );
}
