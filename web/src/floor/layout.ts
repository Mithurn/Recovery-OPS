import type { AgentId } from './sprites';

export const TILE = 16;
export const COLS = 34;
export const ROWS = 15;
export const WALL_ROWS = 4;

export type Tile = { x: number; y: number };

export type DeskSpec = {
  agent: AgentId;
  name: string;
  accent: number;
  seat: Tile;
};

const SEAT_Y = 8;
const DESK_SPACING = 6;
const FIRST_SEAT_X = 5;

const AGENTS: Array<Omit<DeskSpec, 'seat'>> = [
  { agent: 'intake', name: 'Intake', accent: 0x4f9faf },
  { agent: 'investigator', name: 'Investigator', accent: 0x9482d3 },
  { agent: 'gate', name: 'Safety Gate', accent: 0xd96a62 },
  { agent: 'executor', name: 'Executor', accent: 0x5ca97a },
  { agent: 'ledger', name: 'Audit Log', accent: 0xdcab3c },
];

export const DESKS: readonly DeskSpec[] = AGENTS.map((a, i) => ({
  ...a,
  seat: { x: FIRST_SEAT_X + i * DESK_SPACING, y: SEAT_Y },
}));

export const DESK_HALF_WIDTH = 1;
export const DESK_ROWS = 2;
export const DOOR_TILE: Tile = { x: 1, y: ROWS - 3 };
export const HUMAN_TILE: Tile = { x: COLS - 3, y: ROWS - 3 };
export const BEAT_SECONDS = 0.6;
export const MIN_BEAT_SECONDS = 0.15;
export const BEAT_BACKLOG_STEP = 0.05;
export const ENTRANCE_STAGGER_SECONDS = 0.7;

export const deskFor = (agent: AgentId): DeskSpec => DESKS.find((d) => d.agent === agent)!;

export const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const FOCUS_Y = 140;
export const FOCUS_HEIGHT = 200;
export const BACKDROP_PAD_X = 48;
export const BACKDROP_PAD_TOP = 40;
export const BACKDROP_PAD_BOTTOM = 40;
