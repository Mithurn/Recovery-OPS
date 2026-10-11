import { useEffect, useState } from "react";

const CHEVRON = Array.from({ length: 9 }, (_, i) => {
  const row = Math.floor(i / 3);
  const col = i % 3;
  return (col + Math.abs(row - 1)) * 90;
});
const CYCLE_MS = 650;
const TICK_MS = 100;
const SECONDS_PER_MINUTE = 60;

function formatElapsed(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m ${(seconds % SECONDS_PER_MINUTE).toFixed(1)}s`;
}

export function PixelGrid() {
  return (
    <span className="px-grid" aria-hidden>
      {CHEVRON.map((delay, i) => (
        <span key={i} className="px-grid__cell" style={{ animationDuration: `${CYCLE_MS}ms`, animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

export function useElapsed(): string {
  const [tenths, setTenths] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTenths((n) => n + 1), TICK_MS);
    return () => clearInterval(t);
  }, []);
  return formatElapsed(tenths / 10);
}

export function AgentLoader({ label, elapsedMs }: { label: string; elapsedMs?: number }) {
  const own = useElapsed();
  const elapsed = elapsedMs === undefined ? own : formatElapsed(elapsedMs / 1000);
  return (
    <span className="loader" role="status">
      <PixelGrid />
      <span className="shimmer">{label}</span>
      <span className="loader__time mono tnum">{elapsed}</span>
    </span>
  );
}
