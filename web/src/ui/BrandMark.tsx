const MARK_SIZE_PX = 22;

type BrandMarkProps = { size?: number };

export function BrandMark({ size = MARK_SIZE_PX }: BrandMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false" style={{ flex: "none" }}>
      <rect x="0.5" y="0.5" width="31" height="31" rx="7" fill="#121316" stroke="rgba(255,255,255,0.16)" />
      <path
        d="M9 22V10h8a4 4 0 0 1 0 8h-8m7 0 6 4"
        fill="none"
        stroke="#6bd68f"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
