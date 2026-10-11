import { Application, Container, Text } from 'pixi.js';
import { Camera } from './Camera';
import { Character } from './Character';
import { DeskView, FloorMap } from './FloorMap';
import { MessageEnvelope } from './MessageEnvelope';
import { agentFrames, type AgentId } from './sprites';
import {
  BEAT_BACKLOG_STEP,
  BEAT_SECONDS,
  COLS,
  DESKS,
  DOOR_TILE,
  ENTRANCE_STAGGER_SECONDS,
  FOCUS_HEIGHT,
  FOCUS_Y,
  HUMAN_TILE,
  MIN_BEAT_SECONDS,
  prefersReducedMotion,
  TILE,
} from './layout';
import type { FloorAction, Spot } from './floorModel';

const BACKGROUND = 0x121316;
const MAX_RESOLUTION = 3;
const QUIET_AFTER_SECONDS = 3.2;
const INTRO_SEEN_KEY = 'recoveryops.floor.intro';
const FLOAT_SECONDS = 2;
const FLOAT_RISE_PX = 26;
const MONEY_COLOR = 0x6bd68f;

function shouldPlayIntro(): boolean {
  if (prefersReducedMotion()) return false;
  try {
    if (sessionStorage.getItem(INTRO_SEEN_KEY)) return false;
    sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    return false;
  }
  return true;
}

export type FloorSceneOptions = { onSelectAgent?: (agent: AgentId) => void };

export class FloorScene {
  private readonly app = new Application();
  private readonly map = new FloorMap();
  private readonly world = new Container();
  private readonly actors = new Container();
  private readonly camera = new Camera(this.world);
  private readonly characters = new Map<AgentId, Character>();
  private readonly desks = new Map<AgentId, DeskView>();
  private readonly envelopes: MessageEnvelope[] = [];
  private readonly floaters: Array<{ text: Text; age: number; y0: number }> = [];
  private readonly lastSpoke = new Map<AgentId, number>();
  private queue: FloorAction[][] = [];
  private beat = 0;
  private clock = 0;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;

  private constructor(private readonly options: FloorSceneOptions) {}

  setSelected(agent: AgentId | null): void {
    for (const [id, character] of this.characters) character.setSelected(id === agent);
  }

  static async create(host: HTMLElement, options: FloorSceneOptions = {}): Promise<FloorScene> {
    const scene = new FloorScene(options);
    await scene.mount(host);
    return scene;
  }

  enqueue(batch: FloorAction[]): void {
    if (batch.length > 0) this.queue.push(batch);
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.app.destroy(true, { children: true });
  }

  private async mount(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: BACKGROUND,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(Math.max(window.devicePixelRatio || 1, 2), MAX_RESOLUTION),
    });
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    host.appendChild(this.app.canvas);
    this.app.canvas.style.display = 'block';

    this.world.addChild(this.map.buildBackground(), this.actors);
    this.actors.sortableChildren = true;
    this.app.stage.addChild(this.world);

    for (const view of this.map.buildDesks()) {
      this.actors.addChild(view.container);
      this.desks.set(view.agent, view);
    }
    this.camera.setFocus({ x: (COLS * TILE) / 2, y: FOCUS_Y, width: COLS * TILE, height: FOCUS_HEIGHT });
    this.fit(host);
    this.resizeObserver = new ResizeObserver(() => this.fit(host));
    this.resizeObserver.observe(host);

    this.spawnCast();
    this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000));
  }

  private fit(host: HTMLElement): void {
    if (host.clientWidth === 0 || host.clientHeight === 0) return;
    this.app.renderer.resize(host.clientWidth, host.clientHeight);
    this.camera.setViewSize(host.clientWidth, host.clientHeight);
  }

  private spawnCast(): void {
    const intro = shouldPlayIntro();
    DESKS.forEach((desk, i) => {
      const character = new Character({
        displayName: desk.name,
        map: this.map,
        frames: agentFrames(desk.agent),
        seat: desk.seat,
        spawn: intro ? DOOR_TILE : desk.seat,
        glow: desk.accent,
        onSelect: () => this.options.onSelectAgent?.(desk.agent),
      });
      character.show(this.actors);
      this.characters.set(desk.agent, character);
      if (intro) {
        window.setTimeout(() => !this.destroyed && character.sitAtDesk(), i * ENTRANCE_STAGGER_SECONDS * 1000);
      } else {
        character.skipFade();
        character.sitAtDesk();
      }
    });
  }

  private update(dt: number): void {
    this.clock += dt;
    this.camera.update(dt);
    const zoom = this.world.scale.x;
    this.drainQueue(dt);
    for (const [agent, character] of this.characters) {
      character.setBubbleZoom(zoom);
      character.update(dt);
      const spoke = this.lastSpoke.get(agent);
      if (spoke !== undefined && this.clock - spoke > QUIET_AFTER_SECONDS) {
        character.quiet();
        this.lastSpoke.delete(agent);
      }
    }
    for (const desk of this.desks.values()) desk.update(dt, this.clock);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const floater = this.floaters[i]!;
      floater.age += dt;
      const t = floater.age / FLOAT_SECONDS;
      floater.text.y = floater.y0 - FLOAT_RISE_PX * t;
      floater.text.alpha = Math.max(0, 1 - t * t);
      if (t >= 1) {
        floater.text.destroy();
        this.floaters.splice(i, 1);
      }
    }
    for (let i = this.envelopes.length - 1; i >= 0; i--) {
      const envelope = this.envelopes[i]!;
      if (envelope.update(dt)) {
        envelope.destroy();
        this.envelopes.splice(i, 1);
      }
    }
  }

  private drainQueue(dt: number): void {
    if (this.queue.length === 0) return;
    this.beat -= dt;
    if (this.beat > 0) return;
    const batch = this.queue.shift()!;
    for (const action of batch) this.apply(action);
    this.beat = Math.max(MIN_BEAT_SECONDS, BEAT_SECONDS - this.queue.length * BEAT_BACKLOG_STEP);
  }

  private apply(action: FloorAction): void {
    switch (action.kind) {
      case 'say':
        this.characters.get(action.agent)?.say(action.text);
        this.lastSpoke.set(action.agent, this.clock);
        break;
      case 'work':
        this.characters.get(action.agent)?.setWorking(action.working);
        this.desks.get(action.agent)?.setActive(action.working);
        break;
      case 'glyph':
        this.characters.get(action.agent)?.setGlyph(action.glyph);
        break;
      case 'cheer':
        this.characters.get(action.agent)?.cheer();
        break;
      case 'money': {
        const feet = this.spotPosition(action.agent);
        const text = new Text({
          text: action.text,
          style: { fontSize: 10, fontWeight: 'bold', fontFamily: 'monospace', fill: MONEY_COLOR, stroke: { color: 0x0a0c11, width: 2, join: 'round' } },
        });
        text.anchor.set(0.5, 1);
        text.x = feet.x;
        text.y = feet.y - 40;
        text.zIndex = 1_000_001;
        this.actors.addChild(text);
        this.floaters.push({ text, age: 0, y0: text.y });
        break;
      }
      case 'envelope': {
        const envelope = new MessageEnvelope(this.spotPosition(action.from), this.spotPosition(action.to), action.act, action.needsHuman ?? false);
        this.actors.addChild(envelope.container);
        this.envelopes.push(envelope);
        break;
      }
    }
  }

  private spotPosition(spot: Spot): { x: number; y: number } {
    if (spot === 'door') return this.map.feetOf(DOOR_TILE);
    if (spot === 'human') return this.map.feetOf(HUMAN_TILE);
    return this.characters.get(spot)?.feet() ?? this.map.feetOf(DOOR_TILE);
  }
}
