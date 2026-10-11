import type { FeedEntry } from "./feed";

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function FeedList({ entries, empty }: { entries: FeedEntry[]; empty: string }) {
  if (entries.length === 0) return <p className="muted small">{empty}</p>;
  return (
    <ul className="feed">
      {entries.map((e) => (
        <li key={e.id} className={`feed__row feed__row--${e.tone}`}>
          <time className="feed__time mono tnum">{timeOf(e.at)}</time>
          <span className="feed__fn">{e.fn}</span>
          <span className="feed__detail">{e.detail}</span>
        </li>
      ))}
    </ul>
  );
}
