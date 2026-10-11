import { useEffect, useRef, useState } from "react";
import { useRoomStream } from "../room/useRoomStream";
import { RecoveryFloor } from "../floor/RecoveryFloor";
import { describeEvent, type FeedLine } from "../floor/floorModel";

const TICKER_LINES = 3;

export function HeroFloor() {
  const [lines, setLines] = useState<Array<FeedLine & { id: number }>>([]);
  const { bus } = useRoomStream();
  const nextId = useRef(0);
  useEffect(
    () =>
      bus.subscribe((event) => {
        const line = describeEvent(event);
        if (line) setLines((prev) => [{ ...line, id: nextId.current++ }, ...prev].slice(0, TICKER_LINES));
      }),
    [bus],
  );

  return (
    <div className="lp-window">
      <div className="lp-window__bar">
        <span className="lp-window__dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="lp-window__title">agent workspace · recorded replay</span>
      </div>
      <div className="lp-window__screen">
        <RecoveryFloor bus={bus} selected={null} />
        <ul className="lp-ticker" aria-live="off">
          {lines.map((l) => (
            <li key={l.id} className={`lp-ticker__line lp-ticker__line--${l.tone}`}>
              <b>{l.fn}</b> {l.detail}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
