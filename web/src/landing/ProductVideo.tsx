import { useState } from "react";

const LABEL = "Recovery OPS product tour: a failed payment is investigated, checked by the safety gate and recovered";

// Click-to-load: until the visitor presses play only a small poster is downloaded and no <video> exists.
// AV1 first (smallest), H.264 as the fallback for browsers that cannot decode it.
export function ProductVideo() {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="lp-window">
      <div className="lp-window__bar">
        <span className="lp-window__dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="lp-window__title">product tour · 35 seconds</span>
      </div>
      <div className="lp-window__screen lp-window__screen--video">
        {playing ? (
          <video controls autoPlay playsInline aria-label={LABEL}>
            <source src="/media/recovery-ad-av1.mp4" type='video/mp4; codecs="av01.0.05M.08"' />
            <source src="/media/recovery-ad-h264.mp4" type="video/mp4" />
          </video>
        ) : (
          <button type="button" className="lp-play" onClick={() => setPlaying(true)} aria-label="Play the 35 second product tour">
            <img src="/media/recovery-ad-poster.webp" alt={LABEL} width={1280} height={720} loading="lazy" decoding="async" />
            <span className="lp-btn lp-btn--primary lp-btn--lg lp-play__cta">&#9654; Play the tour</span>
          </button>
        )}
      </div>
    </div>
  );
}
