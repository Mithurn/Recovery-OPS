import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The landing page streams its tour from /media. A renamed or missing file would only show up as a broken
// player in production, so check every path the component references against web/public.
describe("landing tour media", () => {
  const source = readFileSync(new URL("./ProductVideo.tsx", import.meta.url), "utf8");
  const paths = [...source.matchAll(/"(\/media\/[^"]+)"/g)].map((m) => m[1]!);

  it("references a poster and both video encodes", () => {
    expect(paths).toEqual(expect.arrayContaining(["/media/recovery-ad-av1.mp4", "/media/recovery-ad-h264.mp4", "/media/recovery-ad-poster.webp"]));
  });

  it.each([...new Set(paths)])("ships %s", (path) => {
    expect(existsSync(new URL(`../../public${path}`, import.meta.url))).toBe(true);
  });
});
