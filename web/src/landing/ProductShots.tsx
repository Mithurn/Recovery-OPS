import { PRODUCT_PAGES, SHOTS } from "./ledgerContent";

type ShotProps = { src: string; chrome: string; alt: string };

function Shot({ src, chrome, alt }: ShotProps) {
  return (
    <div className="lg-device">
      <div className="lg-chrome">
        <i />
        <i />
        <i />
        <span>{chrome}</span>
      </div>
      <img src={src} width={SHOTS.width} height={SHOTS.height} alt={alt} loading="lazy" />
    </div>
  );
}

export function ProductShots() {
  return (
    <>
      <div className="lg-shots">
        <Shot {...SHOTS.main} />
        <ul className="lg-pages">
          {PRODUCT_PAGES.map((p) => (
            <li key={p.title}>
              <b>{p.title}</b>
              <p>{p.text}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="lg-minis">
        {SHOTS.minis.map((m) => (
          <figure key={m.src}>
            <Shot src={m.src} chrome={m.chrome} alt={m.alt} />
            <figcaption>{m.caption}</figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
