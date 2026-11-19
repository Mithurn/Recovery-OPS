import type { ReactNode } from "react";

type SectionHeadProps = { marker: string; eyebrow: string; title: string; children: ReactNode };

export function SectionHead({ marker, eyebrow, title, children }: SectionHeadProps) {
  return (
    <div className="lg-sechead">
      <div>
        <p className="lg-eyebrow">
          <b>{marker}</b> {eyebrow}
        </p>
        <h2>{title}</h2>
      </div>
      <p>{children}</p>
    </div>
  );
}
