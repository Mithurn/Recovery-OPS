import { useState } from "react";

const LABEL = "Recovery OPS product tour: five agents investigate a failed payment, the safety gate blocks a risky retry, and the case is handed to a person";

// Click-to-load: until the visitor presses play only a small poster is downloaded and no <video> exists.
// AV1 first (smallest), H.264 as the fallback for browsers that cannot decode it.
export function ProductVideo() {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="lg-device lg-tour">
      <div className="lg-chrome">
        <i />
        <i />
        <i />
        <span>product tour, 24s</span>
      </div>
      {playing ? (
        <video className="lg-tour__video" controls autoPlay playsInline aria-label={LABEL}>
          <source src="/media/recovery-tour-av1.mp4" type='video/mp4; codecs="av01.0.05M.08"' />
          <source src="/media/recovery-tour-h264.mp4" type="video/mp4" />
        </video>
      ) : (
        <button type="button" className="lg-play" onClick={() => setPlaying(true)} aria-label="Play the 24 second product tour">
          <img src="/media/recovery-tour-poster.webp" alt={LABEL} width={1280} height={720} loading="lazy" decoding="async" />
          <span className="lg-btn lg-play__cta">&#9654; Play the tour</span>
        </button>
      )}
    </div>
  );
}
