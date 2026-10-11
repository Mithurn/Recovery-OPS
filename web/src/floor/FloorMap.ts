import { Container, Graphics, Text } from 'pixi.js';
import { BACKDROP_PAD_BOTTOM, BACKDROP_PAD_TOP, BACKDROP_PAD_X, COLS, DESKS, DESK_HALF_WIDTH, DESK_ROWS, DOOR_TILE, HUMAN_TILE, ROWS, TILE, WALL_ROWS, type DeskSpec, type Tile } from './layout';

const FLOOR_A = 0x17181b;
const FLOOR_B = 0x1a1b1f;
const WALL = 0x101113;
const WALL_TRIM = 0x232428;
const WINDOW = 0x1d2026;
const WINDOW_LIT = 0x2b2f37;
const DESK_TOP = 0x2c2e34;
const DESK_EDGE = 0x3d4048;
const DESK_FRONT = 0x1c1d21;
const MONITOR = 0x0b0c0e;
const CHAIR = 0x25272c;
const LABEL = 0x72767f;

const key = (x: number, y: number) => `${x},${y}`;

export class DeskView {
  readonly container = new Container();
  readonly agent: DeskSpec['agent'];
  private readonly glow = new Graphics();
  private level = 0;
  private target = 0;

  constructor(private readonly desk: DeskSpec) {
    this.agent = desk.agent;
    const x0 = (desk.seat.x - DESK_HALF_WIDTH) * TILE;
    const y0 = (desk.seat.y + 1) * TILE;
    const w = (DESK_HALF_WIDTH * 2 + 1) * TILE;
    const g = new Graphics();
    g.rect(x0, y0, w, DESK_ROWS * TILE).fill(DESK_FRONT);
    g.rect(x0, y0, w, 22).fill(DESK_TOP);
    g.rect(x0, y0, w, 1).fill(DESK_EDGE);
    g.rect(x0 + 17, y0 + 12, 14, 4).fill(0x3a4358);
    g.rect(x0 + 14, y0 - 9, 20, 13).fill(MONITOR).stroke({ color: DESK_EDGE, width: 1 });
    g.rect(x0 + 22, y0 + 4, 4, 3).fill(DESK_EDGE);
    g.circle(x0 + 24, y0 - 3, 1).fill(desk.accent);
    this.container.addChild(this.glow, g);
    this.container.zIndex = y0 + 1;
  }

  setActive(on: boolean): void {
    this.target = on ? 1 : 0;
  }

  update(dt: number, clock: number): void {
    this.level += (this.target - this.level) * Math.min(1, dt * 6);
    const x0 = (this.desk.seat.x - DESK_HALF_WIDTH) * TILE;
    const y0 = (this.desk.seat.y + 1) * TILE;
    const flicker = this.target ? 0.75 + 0.25 * Math.sin(clock * 9) : 1;
    this.glow.clear();
    if (this.level > 0.02) {
      this.glow.rect(x0 + 4, y0 - 12, 40, 30).fill({ color: this.desk.accent, alpha: 0.1 * this.level * flicker });
      this.glow.rect(x0 + 15, y0 - 8, 18, 11).fill({ color: this.desk.accent, alpha: 0.55 * this.level * flicker });
    }
  }
}

export class FloorMap {
  readonly width = COLS;
  readonly height = ROWS;
  readonly tileSize = TILE;
  private readonly blocked = new Set<string>();

  constructor() {
    for (let y = 0; y < WALL_ROWS; y++) for (let x = 0; x < COLS; x++) this.blocked.add(key(x, y));
    for (const d of DESKS) {
      for (let dx = -DESK_HALF_WIDTH; dx <= DESK_HALF_WIDTH; dx++) {
        for (let dy = 1; dy <= DESK_ROWS; dy++) this.blocked.add(key(d.seat.x + dx, d.seat.y + dy));
      }
    }
  }

  isWalkable(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS && !this.blocked.has(key(x, y));
  }

  tileToPixel(x: number, y: number): { x: number; y: number } {
    return { x: x * TILE, y: y * TILE };
  }

  pixelToTile(px: number, py: number): Tile {
    return { x: Math.floor(px / TILE), y: Math.floor(py / TILE) };
  }

  feetOf(tile: Tile): { x: number; y: number } {
    return { x: tile.x * TILE + TILE / 2, y: tile.y * TILE + TILE };
  }

  buildBackground(): Container {
    const root = new Container();
    const g = new Graphics();
    for (let y = WALL_ROWS; y < ROWS + BACKDROP_PAD_BOTTOM; y++) {
      for (let x = 0; x < COLS; x++) g.rect(x * TILE, y * TILE, TILE, TILE).fill((x + y) % 2 ? FLOOR_A : FLOOR_B);
    }
    const left = -BACKDROP_PAD_X * TILE;
    const fullWidth = (COLS + BACKDROP_PAD_X * 2) * TILE;
    g.rect(left, -BACKDROP_PAD_TOP * TILE, fullWidth, (WALL_ROWS + BACKDROP_PAD_TOP) * TILE).fill(WALL);
    g.rect(left, WALL_ROWS * TILE - 6, fullWidth, 6).fill(WALL_TRIM);
    const floorBottom = (ROWS + BACKDROP_PAD_BOTTOM - WALL_ROWS) * TILE;
    g.rect(left, WALL_ROWS * TILE, BACKDROP_PAD_X * TILE, floorBottom).fill(WALL);
    g.rect(COLS * TILE, WALL_ROWS * TILE, BACKDROP_PAD_X * TILE, floorBottom).fill(WALL);
    for (const d of DESKS) {
      const wx = d.seat.x * TILE + TILE / 2 - 28;
      g.rect(wx, 10, 56, 28).fill(WINDOW);
      g.rect(wx, 10, 56, 3).fill(WINDOW_LIT);
      g.rect(wx + 27, 10, 2, 28).fill(WALL);
      g.roundRect(d.seat.x * TILE - 4, d.seat.y * TILE + 2, TILE + 8, 12, 3).fill(CHAIR);
      g.rect(d.seat.x * TILE - 20, WALL_ROWS * TILE - 10, 56, 2).fill(d.accent);
    }
    this.drawDoor(g);
    this.drawTray(g);
    this.drawPlant(g, COLS * TILE - 22, WALL_ROWS * TILE + 8);
    this.drawPlant(g, 6, WALL_ROWS * TILE + 8);
    root.addChild(g);
    root.addChild(this.label('PAYMENTS IN', 10, (DOOR_TILE.y + 2) * TILE - 2));
    root.addChild(this.label('HUMAN REVIEW', HUMAN_TILE.x * TILE - 28, (HUMAN_TILE.y + 1) * TILE + 6));
    return root;
  }

  buildDesks(): DeskView[] {
    return DESKS.map((d) => new DeskView(d));
  }

  private drawDoor(g: Graphics): void {
    const x = 0;
    const y = (DOOR_TILE.y - 1) * TILE;
    g.rect(x, y, 6, TILE * 3).fill(0x2b3245);
    g.rect(x, y, 2, TILE * 3).fill(0x4f9faf);
  }

  private drawTray(g: Graphics): void {
    const x = HUMAN_TILE.x * TILE - 8;
    const y = HUMAN_TILE.y * TILE - 6;
    g.rect(x, y, 30, 18).fill(DESK_FRONT).stroke({ color: DESK_EDGE, width: 1 });
    g.rect(x + 3, y + 4, 24, 3).fill(0xd96a62);
    g.rect(x + 3, y + 10, 24, 3).fill(0x39425a);
  }

  private drawPlant(g: Graphics, x: number, y: number): void {
    g.rect(x + 3, y + 12, 10, 8).fill(0x2b3245);
    g.circle(x + 8, y + 7, 7).fill(0x2f6b4f);
    g.circle(x + 4, y + 9, 4).fill(0x3d8a64);
    g.circle(x + 12, y + 9, 4).fill(0x3d8a64);
  }

  private label(text: string, x: number, y: number): Text {
    const t = new Text({ text, style: { fontSize: 6, fontFamily: 'monospace', fontWeight: 'bold', fill: LABEL, letterSpacing: 1 } });
    t.x = x;
    t.y = y;
    return t;
  }
}
