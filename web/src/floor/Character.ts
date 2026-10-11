import { Container, Graphics, Text, type Texture } from 'pixi.js';
import { CharacterSprite, type AnimState, type Direction } from './CharacterSprite';
import { findPath } from './pathfinding';
import { ThoughtBubble } from './ThoughtBubble';
import { colors } from './palette';
import type { FloorMap } from './FloorMap';
import { prefersReducedMotion, type Tile } from './layout';

export type Glyph = 'none' | 'blocked' | 'success';

const SPEED = 48;
const SIT_OFFSET = 12;
const SEAT_LEG_CROP = 8;
const NAME_FONT_SIZE = 6;
const NAME_Z = 50000;
const GLYPH_TOP = -36;
const SUCCESS_GLYPH_SECONDS = 1.2;
const BLOCKED_BLINK_SECONDS = 0.4;
const CHEER_SECONDS = 1.6;
const CONFETTI_COUNT = 14;
const CONFETTI_COLORS = [0xffd93d, 0xff6b6b, 0x6bcb77, 0x4d96ff, 0xf6a6ff];
const FADE_IN_SECONDS = 0.5;

type Confetti = { x: number; y: number; vx: number; vy: number; c: number };

export type CharacterOptions = {
  displayName: string;
  map: FloorMap;
  frames: Texture[][];
  seat: Tile;
  spawn: Tile;
  glow: number;
  onSelect?: () => void;
};

export class Character {
  private readonly sprite: CharacterSprite;
  private readonly bubble = new ThoughtBubble();
  private readonly nameTag = new Container();
  private readonly glow = new Graphics();
  private readonly overlay = new Graphics();
  private readonly ring = new Graphics();
  private readonly ringColor: number;
  private selected = false;
  private readonly fx = new Graphics();
  private readonly map: FloorMap;
  private readonly seat: Tile;

  private px: number;
  private py: number;
  private path: Tile[] = [];
  private direction: Direction = 'down';
  private anim: AnimState = 'idle';
  private sitting = false;
  private working = false;
  private arrival: (() => void) | null = null;
  private glyph: Glyph = 'none';
  private glyphT = 0;
  private glowT = 0;
  private fadeT = 0;
  private cheerT = -1;
  private confetti: Confetti[] = [];

  constructor(options: CharacterOptions) {
    this.map = options.map;
    this.ringColor = options.glow;
    this.seat = options.seat;
    this.sprite = new CharacterSprite(options.frames);
    const start = options.map.feetOf(options.spawn);
    this.px = start.x;
    this.py = start.y;
    this.sprite.setPosition(this.px, this.py);
    this.bubble.setBounds(options.map.width * options.map.tileSize, options.map.height * options.map.tileSize);

    this.glow.circle(0, 0, 14).fill({ color: options.glow });
    this.glow.alpha = 0;
    this.overlay.eventMode = 'none';
    this.fx.eventMode = 'none';
    this.sprite.container.addChild(this.overlay, this.fx);

    this.nameTag.eventMode = 'none';
    const label = new Text({
      text: options.displayName,
      style: {
        fontSize: NAME_FONT_SIZE,
        fontWeight: 'bold',
        fill: colors.cream[50],
        stroke: { color: colors.ink[900], width: 1, join: 'round' },
        fontFamily: 'monospace',
      },
    });
    label.anchor.set(0.5, 0);
    const plate = new Graphics()
      .roundRect(-label.width / 2 - 2, -1, label.width + 4, label.height + 2, 2)
      .fill({ color: colors.ink[900], alpha: 0.82 });
    this.nameTag.addChild(plate, label);
    this.sprite.setAlpha(0);

    if (options.onSelect) {
      const hit = this.sprite.container;
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.on('pointertap', (e) => {
        e.stopPropagation();
        options.onSelect?.();
      });
    }
  }

  setSelected(on: boolean): void {
    this.selected = on;
    this.ring.clear();
    if (on) this.ring.ellipse(0, 0, 11, 4).stroke({ color: this.ringColor, width: 1.5 });
  }

  show(layer: Container): void {
    layer.addChild(this.glow, this.ring, this.sprite.container, this.nameTag, this.bubble.container);
  }

  feet(): { x: number; y: number } {
    return { x: this.px, y: this.py };
  }

  setBubbleZoom(zoom: number): void {
    this.bubble.setZoom(zoom);
  }

  say(text: string): void {
    this.bubble.show(text);
  }

  quiet(): void {
    this.bubble.startLinger();
  }

  setGlyph(glyph: Glyph): void {
    if (glyph === this.glyph) return;
    this.glyph = glyph;
    this.glyphT = 0;
    if (glyph === 'none') this.overlay.clear();
  }

  setWorking(on: boolean): void {
    this.working = on;
    if (this.sitting) this.applySeatedAnimation();
  }

  cheer(): void {
    if (prefersReducedMotion()) return;
    this.cheerT = 0;
    this.confetti = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      x: (Math.random() - 0.5) * 8,
      y: -22 - Math.random() * 6,
      vx: (Math.random() - 0.5) * 46,
      vy: -30 - Math.random() * 40,
      c: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
    }));
  }

  skipFade(): void {
    this.fadeT = FADE_IN_SECONDS;
    this.sprite.setAlpha(1);
  }

  sitAtDesk(onSeated?: () => void): void {
    this.arrival = onSeated ?? null;
    const here = this.map.pixelToTile(this.px, this.py - 1);
    if (here.x === this.seat.x && here.y === this.seat.y) {
      this.applySit();
      return;
    }
    const path = findPath(this.map, here, this.seat);
    if (!path || path.length === 0) {
      this.applySit();
      return;
    }
    this.sitting = false;
    this.sprite.setSeatedCrop(0);
    this.path = path;
    this.anim = 'walk';
    this.sprite.setAnimation('walk', this.direction);
  }

  update(dt: number): void {
    if (this.fadeT < FADE_IN_SECONDS) {
      this.fadeT += dt;
      this.sprite.setAlpha(Math.min(this.fadeT / FADE_IN_SECONDS, 1));
    }
    if (this.anim === 'walk') this.stepAlongPath(dt);

    this.sprite.container.zIndex = this.py;
    this.bubble.update(dt);
    this.bubble.setPosition(this.px, this.py);
    this.nameTag.x = Math.round(this.px);
    this.nameTag.y = Math.round(this.py - 4);
    this.nameTag.zIndex = NAME_Z + this.py;
    this.nameTag.alpha = this.sprite.container.alpha;

    this.ring.visible = this.selected;
    this.ring.x = this.px;
    this.ring.y = this.py - 1;
    this.ring.zIndex = this.py - 1;
    this.glow.x = this.px;
    this.glow.y = this.py - this.map.tileSize / 2;
    this.glow.zIndex = this.py - 1;
    if (this.working) {
      this.glowT += dt;
      const phase = (Math.sin((this.glowT * Math.PI) / 0.6) + 1) / 2;
      this.glow.alpha = (0.18 + 0.27 * phase) * this.sprite.container.alpha;
      this.glow.scale.set(0.95 + 0.15 * phase);
    } else {
      this.glow.alpha = 0;
      this.glowT = 0;
    }

    this.drawGlyph(dt);
    this.drawCheer(dt);
  }

  destroy(): void {
    this.sprite.destroy();
    this.bubble.destroy();
    this.nameTag.destroy({ children: true });
    this.glow.destroy();
  }

  private applySit(): void {
    this.anim = 'idle';
    this.path = [];
    this.sitting = true;
    this.direction = 'down';
    this.sprite.setPosition(this.px, this.py + SIT_OFFSET);
    this.sprite.setSeatedCrop(SEAT_LEG_CROP);
    this.applySeatedAnimation();
    const done = this.arrival;
    this.arrival = null;
    done?.();
  }

  private applySeatedAnimation(): void {
    this.anim = this.working ? 'type' : 'idle';
    this.sprite.setAnimation(this.anim, 'down');
  }

  private stepAlongPath(dt: number): void {
    const next = this.path[0];
    if (!next) {
      this.applySit();
      return;
    }
    const ts = this.map.tileSize;
    const tx = next.x * ts + ts / 2;
    const ty = next.y * ts + ts;
    const dx = tx - this.px;
    const dy = ty - this.py;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) {
      this.px = tx;
      this.py = ty;
      this.path.shift();
      return;
    }
    const step = Math.min(SPEED * dt, dist);
    this.px += (dx / dist) * step;
    this.py += (dy / dist) * step;
    this.direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    this.sprite.setAnimation('walk', this.direction);
    this.sprite.setPosition(this.px, this.py);
  }

  private drawGlyph(dt: number): void {
    if (this.glyph === 'none') return;
    this.glyphT += dt;
    const g = this.overlay;
    g.clear();
    if (this.glyph === 'blocked') {
      if (Math.floor(this.glyphT / BLOCKED_BLINK_SECONDS) % 2 === 0) {
        g.rect(-1, GLYPH_TOP, 2, 5).fill(0xff6b6b);
        g.rect(-1, GLYPH_TOP + 6, 2, 2).fill(0xff6b6b);
      }
      return;
    }
    const s = 2 + ((Math.sin(this.glyphT * 18) + 1) / 2) * 2;
    g.rect(-0.5, GLYPH_TOP - s, 1, s * 2).fill(0xffd93d);
    g.rect(-s, GLYPH_TOP - 0.5, s * 2, 1).fill(0xffd93d);
    if (this.glyphT > SUCCESS_GLYPH_SECONDS) this.setGlyph('none');
  }

  private drawCheer(dt: number): void {
    if (this.cheerT < 0) return;
    this.cheerT += dt;
    this.fx.clear();
    if (this.cheerT >= CHEER_SECONDS) {
      this.cheerT = -1;
      return;
    }
    const alpha = Math.max(0, Math.min(1, (CHEER_SECONDS - 0.15 - this.cheerT) / 0.5));
    for (const p of this.confetti) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 110 * dt;
      this.fx.rect(Math.round(p.x), Math.round(p.y), 2, 2).fill({ color: p.c, alpha });
    }
  }
}
