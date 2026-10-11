import type { AgentId } from './sprites';
import type { MessageAct } from './MessageEnvelope';

export type Spot = AgentId | 'door' | 'human';

export type FloorAction =
  | { kind: 'envelope'; from: Spot; to: Spot; act: MessageAct; needsHuman?: boolean }
  | { kind: 'say'; agent: AgentId; text: string }
  | { kind: 'work'; agent: AgentId; working: boolean }
  | { kind: 'glyph'; agent: AgentId; glyph: 'blocked' | 'success' | 'none' }
  | { kind: 'cheer'; agent: AgentId }
  | { kind: 'money'; agent: AgentId; text: string };

export type FloorEvent = {
  eventType: string;
  payload: Record<string, unknown>;
  caseId?: string;
  at?: string;
};

const MAX_TEXT = 48;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const kindOf = (v: unknown): string | null =>
  str(v) ?? (v && typeof v === 'object' ? str((v as Record<string, unknown>).kind) : null);
const words = (s: string): string => s.replace(/_/g, ' ').toLowerCase();
const clip = (s: string): string => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s);
const rupees = (paise: number): string => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

export function actionsFor(event: FloorEvent): FloorAction[] {
  const p = event.payload;
  const out: FloorAction[] = [];

  switch (event.eventType) {
    case 'CASE_CREATED': {
      const amount = typeof p.amountPaise === 'number' ? `${rupees(p.amountPaise)} ` : '';
      out.push(
        { kind: 'envelope', from: 'door', to: 'intake', act: 'inform' },
        { kind: 'say', agent: 'intake', text: clip(`${amount}${words(str(p.failureReason) ?? 'payment failed')}`) },
        { kind: 'envelope', from: 'intake', to: 'investigator', act: 'request' },
      );
      break;
    }
    case 'INVESTIGATION_STARTED':
      out.push({ kind: 'work', agent: 'investigator', working: true }, { kind: 'say', agent: 'investigator', text: '' });
      break;
    case 'TOOL_CALLED':
      out.push(
        { kind: 'work', agent: 'investigator', working: true },
        { kind: 'say', agent: 'investigator', text: clip(words(str(p.name) ?? 'checking')) },
      );
      break;
    case 'AGENT_PROPOSED':
    case 'AGENT_SKIPPED_HUMAN_DIRECTED':
      out.push(
        { kind: 'say', agent: 'investigator', text: clip(`propose ${words(kindOf(p.action) ?? 'action')}`) },
        { kind: 'work', agent: 'investigator', working: false },
        { kind: 'envelope', from: 'investigator', to: 'gate', act: 'propose' },
        { kind: 'work', agent: 'gate', working: true },
      );
      break;
    case 'AGENT_DEGRADED':
      out.push(
        { kind: 'glyph', agent: 'investigator', glyph: 'blocked' },
        { kind: 'say', agent: 'investigator', text: 'model unavailable, safe fallback' },
        { kind: 'work', agent: 'investigator', working: false },
        { kind: 'envelope', from: 'investigator', to: 'gate', act: 'propose' },
        { kind: 'work', agent: 'gate', working: true },
      );
      break;
    case 'GATE_APPLIED': {
      const outcome = str(p.outcome) ?? 'allow';
      const rule = str(p.rule);
      if (outcome === 'allow') {
        out.push(
          { kind: 'say', agent: 'gate', text: 'all limits clear' },
          { kind: 'work', agent: 'gate', working: false },
          { kind: 'envelope', from: 'gate', to: 'executor', act: 'agree' },
        );
      } else if (outcome === 'clamp') {
        out.push(
          { kind: 'glyph', agent: 'gate', glyph: 'blocked' },
          { kind: 'say', agent: 'gate', text: clip(`blocked: ${words(rule ?? 'limit')}`) },
          { kind: 'work', agent: 'gate', working: false },
          { kind: 'envelope', from: 'gate', to: 'human', act: 'refuse', needsHuman: true },
        );
      } else {
        out.push(
          { kind: 'say', agent: 'gate', text: clip(`not now: ${words(rule ?? 'wait')}`) },
          { kind: 'work', agent: 'gate', working: false },
        );
      }
      break;
    }
    case 'ATTEMPT_STARTED':
      out.push(
        { kind: 'work', agent: 'executor', working: true },
        { kind: 'say', agent: 'executor', text: clip(words(kindOf(p.action) ?? 'executing')) },
      );
      break;
    case 'ATTEMPT_OUTCOME': {
      const status = str(p.status) ?? 'done';
      out.push({ kind: 'say', agent: 'executor', text: clip(words(status)) }, { kind: 'work', agent: 'executor', working: false });
      if (status === 'RECOVERED') {
        const gained = typeof p.recoveredPaise === 'number' && p.recoveredPaise > 0 ? `+${rupees(p.recoveredPaise)}` : null;
        out.push({ kind: 'glyph', agent: 'executor', glyph: 'success' }, { kind: 'cheer', agent: 'executor' });
        if (gained) out.push({ kind: 'money', agent: 'executor', text: gained });
      }
      break;
    }
    case 'NUDGE_QUEUED':
      out.push({ kind: 'say', agent: 'executor', text: 'customer nudge queued' });
      break;
    case 'CASE_RESOLVED':
    case 'CASE_STOPPED': {
      const lane = str(p.lane) ?? (event.eventType === 'CASE_STOPPED' ? 'STOPPED' : 'done');
      out.push(
        { kind: 'envelope', from: 'executor', to: 'ledger', act: 'done' },
        { kind: 'say', agent: 'ledger', text: clip(`closed: ${words(lane)}`) },
      );
      if (lane === 'RECOVERED') out.push({ kind: 'cheer', agent: 'ledger' });
      break;
    }
    default:
      break;
  }

  if (event.eventType !== 'CASE_RESOLVED' && event.eventType !== 'CASE_STOPPED') {
    out.push({ kind: 'say', agent: 'ledger', text: clip(`log ${words(event.eventType)}`) });
  }
  return out;
}

export type FeedTone = 'info' | 'clear' | 'deny' | 'wait';

export type FeedLine = {
  agent: AgentId;
  tone: FeedTone;
  fn: string;
  detail: string;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function describeEvent(event: FloorEvent): FeedLine | null {
  const p = event.payload;
  switch (event.eventType) {
    case 'CASE_CREATED': {
      const amount = num(p.amountPaise);
      return { agent: 'intake', tone: 'info', fn: 'payment.failed', detail: `${amount === null ? '' : `${rupees(amount)} `}${words(str(p.failureReason) ?? 'failed')}` };
    }
    case 'TOOL_CALLED':
      return null;
    case 'TOOL_RESULT': {
      const ms = num(p.ms);
      return { agent: 'investigator', tone: 'clear', fn: words(str(p.name) ?? 'tool'), detail: `${str(p.source) ?? 'result'}${ms === null ? '' : ` ${Math.round(ms)}ms`}` };
    }
    case 'AGENT_PROPOSED': {
      const confidence = num(p.confidence);
      return { agent: 'investigator', tone: 'info', fn: 'propose', detail: `${words(kindOf(p.action) ?? 'action')}${confidence === null ? '' : ` ${Math.round(confidence * 100)}%`}` };
    }
    case 'AGENT_DEGRADED':
      return { agent: 'investigator', tone: 'wait', fn: 'fallback', detail: 'model unavailable' };
    case 'GATE_APPLIED': {
      const outcome = str(p.outcome) ?? 'allow';
      return { agent: 'gate', tone: outcome === 'allow' ? 'clear' : 'deny', fn: `gate ${outcome}`, detail: words(str(p.rule) ?? 'all limits clear') };
    }
    case 'ATTEMPT_STARTED':
      return { agent: 'executor', tone: 'info', fn: words(kindOf(p.action) ?? 'attempt'), detail: 'started' };
    case 'ATTEMPT_OUTCOME': {
      const status = str(p.status) ?? 'done';
      const gained = num(p.recoveredPaise);
      return { agent: 'executor', tone: status === 'RECOVERED' ? 'clear' : status === 'FAILED' ? 'deny' : 'wait', fn: words(status), detail: gained ? `+${rupees(gained)}` : str(p.detail) ?? '' };
    }
    case 'NUDGE_QUEUED':
      return { agent: 'executor', tone: 'wait', fn: 'customer nudge', detail: 'queued' };
    case 'CASE_RESOLVED':
    case 'CASE_STOPPED':
      return { agent: 'ledger', tone: str(p.lane) === 'RECOVERED' ? 'clear' : 'wait', fn: 'case closed', detail: words(str(p.lane) ?? 'done') };
    default:
      return null;
  }
}
