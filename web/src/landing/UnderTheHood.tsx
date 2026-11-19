import { HOOD_ITEMS, NOT_CLAIMED } from "./ledgerContent";

export function UnderTheHood() {
  return (
    <>
      <div className="lg-hood__grid">
        {HOOD_ITEMS.map((item) => (
          <article key={item.title}>
            <h3>{item.title}</h3>
            <p>
              {item.text}
              {item.code && (
                <>
                  {" "}
                  <code>{item.code}</code>
                  {item.rest}
                </>
              )}
            </p>
          </article>
        ))}
      </div>
      <div className="lg-limits">
        <h3>What it does not claim</h3>
        <ul>
          {NOT_CLAIMED.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
