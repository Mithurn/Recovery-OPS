import { Container, Graphics } from 'pixi.js';
import { colors } from './palette';

export type MessageAct = 'request' | 'inform' | 'propose' | 'query' | 'agree' | 'refuse' | 'done';

const ACT_COLOR: Record<MessageAct, number> = {
  request: colors.accent.sky,
  query:   colors.accent.lilac,
  propose: colors.accent.lemon,
  inform:  colors.cream[200],
  agree:   colors.accent.mint,
  done:    colors.accent.mint,
  refuse:  colors.accent.coral
};

const OUTLINE = colors.ink[900];
const HUMAN_COLOR = colors.accent.coral;

const FLY_HEIGHT = 22;
const ARC_LIFT = 38;
const SPEED = 230;
const MIN_DURATION = 0.8;
const MAX_DURATION = 2.0;
const FADE_IN = 0.14;
const FADE_OUT = 0.22;
const BURST_DURATION = 0.34;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export class MessageEnvelope {
  readonly container: Container;
  private body: Graphics;
  private burst: Graphics;

  private sx: number; private sy: number;
  private ex: number; private ey: number;
  private duration: number;
  private elapsed = 0;
  private bursting = false;
  private burstElapsed = 0;
  private finished = false;

  constructor(
    start: { x: number; y: number },
    end: { x: number; y: number },
    act: MessageAct,
    needsHuman: boolean
  ) {
    this.sx = start.x; this.sy = start.y - FLY_HEIGHT;
    this.ex = end.x;   this.ey = end.y - FLY_HEIGHT;
    const dist = Math.hypot(this.ex - this.sx, this.ey - this.sy);
    this.duration = Math.min(MAX_DURATION, Math.max(MIN_DURATION, dist / SPEED));

    const fill = needsHuman ? HUMAN_COLOR : (ACT_COLOR[act] ?? colors.cream[200]);

    this.container = new Container();
    this.container.zIndex = 1_000_000;
    this.container.eventMode = 'none';
    this.container.alpha = 0;

    this.body = new Graphics();
    const w = 14, h = 10;
    this.body.rect(-w / 2, -h / 2, w, h).fill({ color: fill }).stroke({ color: OUTLINE, width: 1 });
    this.body.moveTo(-w / 2, -h / 2).lineTo(0, h / 2 - 3).lineTo(w / 2, -h / 2)
      .stroke({ color: OUTLINE, width: 1 });
    this.container.addChild(this.body);

    this.burst = new Graphics();
    this.burst.visible = false;
    this.container.addChild(this.burst);

    this.setPos(this.sx, this.sy);
  }

  private setPos(x: number, y: number): void {
    this.container.x = Math.round(x);
    this.container.y = Math.round(y);
  }

  update(dt: number): boolean {
    if (this.finished) return true;

    if (!this.bursting) {
      this.elapsed += dt;
      const t = Math.min(this.elapsed / this.duration, 1);
      const e = easeInOut(t);
      const x = this.sx + (this.ex - this.sx) * e;
      const lift = -ARC_LIFT * Math.sin(Math.PI * e);
      const y = this.sy + (this.ey - this.sy) * e + lift;
      this.setPos(x, y);

      const fadeIn = Math.min(this.elapsed / FADE_IN, 1);
      const fadeOut = t > 1 - FADE_OUT / this.duration
        ? Math.max(0, (1 - t) / (FADE_OUT / this.duration))
        : 1;
      this.container.alpha = Math.min(fadeIn, fadeOut);
      this.body.rotation = Math.sin(this.elapsed * 6) * 0.12;

      if (t >= 1) {
        this.bursting = true;
        this.body.visible = false;
        this.burst.visible = true;
        this.container.alpha = 1;
        this.setPos(this.ex, this.ey);
      }
      return false;
    }

    this.burstElapsed += dt;
    const bt = Math.min(this.burstElapsed / BURST_DURATION, 1);
    const r = 3 + bt * 12;
    this.burst.clear();
    this.burst.circle(0, 0, r).stroke({ color: colors.accent.lemon, width: 2, alpha: 1 - bt });
    this.container.alpha = 1 - bt;
    if (bt >= 1) {
      this.finished = true;
      return true;
    }
    return false;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
