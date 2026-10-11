import { describe, expect, it } from 'vitest';
import { actionsFor, describeEvent } from './floorModel';

const kinds = (e: string, payload: Record<string, unknown> = {}) => actionsFor({ eventType: e, payload }).map((a) => a.kind);

describe('actionsFor', () => {
  it('sends a new case from the door to intake and on to the investigator', () => {
    const actions = actionsFor({ eventType: 'CASE_CREATED', payload: { amountPaise: 129900, failureReason: 'card_declined' } });
    expect(actions[0]).toMatchObject({ kind: 'envelope', from: 'door', to: 'intake' });
    expect(actions).toContainEqual({ kind: 'say', agent: 'intake', text: '₹1,299 card declined' });
    expect(actions).toContainEqual(expect.objectContaining({ kind: 'envelope', from: 'intake', to: 'investigator' }));
  });

  it('routes a clamped gate verdict to a human and flags the gate as blocked', () => {
    const actions = actionsFor({ eventType: 'GATE_APPLIED', payload: { outcome: 'clamp', rule: 'risk_hold' } });
    expect(actions).toContainEqual({ kind: 'glyph', agent: 'gate', glyph: 'blocked' });
    expect(actions).toContainEqual({ kind: 'envelope', from: 'gate', to: 'human', act: 'refuse', needsHuman: true });
  });

  it('passes an allowed proposal on to the executor', () => {
    expect(actionsFor({ eventType: 'GATE_APPLIED', payload: { outcome: 'allow' } })).toContainEqual(
      expect.objectContaining({ kind: 'envelope', from: 'gate', to: 'executor' }),
    );
  });

  it('celebrates only a recovered attempt', () => {
    expect(kinds('ATTEMPT_OUTCOME', { status: 'RECOVERED' })).toContain('cheer');
    expect(kinds('ATTEMPT_OUTCOME', { status: 'FAILED' })).not.toContain('cheer');
  });

  it('logs every event on the ledger and ignores unknown types otherwise', () => {
    expect(actionsFor({ eventType: 'SOMETHING_NEW', payload: {} })).toEqual([{ kind: 'say', agent: 'ledger', text: 'log something new' }]);
  });

  it('reads an action given as an object', () => {
    expect(actionsFor({ eventType: 'AGENT_PROPOSED', payload: { action: { kind: 'PAYMENT_LINK' } } })).toContainEqual({
      kind: 'say',
      agent: 'investigator',
      text: 'propose payment link',
    });
  });

  it('truncates long text', () => {
    const text = (actionsFor({ eventType: 'TOOL_CALLED', payload: { name: 'x'.repeat(200) } }).find((a) => a.kind === 'say') as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(48);
  });

  it('pops the recovered amount above the executor', () => {
    expect(actionsFor({ eventType: 'ATTEMPT_OUTCOME', payload: { status: 'RECOVERED', recoveredPaise: 129900 } })).toContainEqual({
      kind: 'money',
      agent: 'executor',
      text: '+₹1,299',
    });
  });
});

describe('describeEvent', () => {
  it('names the function and timing of a tool result', () => {
    expect(describeEvent({ eventType: 'TOOL_RESULT', payload: { name: 'get_customer_payment_history', source: 'local', ms: 12.4 } })).toEqual({
      agent: 'investigator',
      tone: 'clear',
      fn: 'get customer payment history',
      detail: 'local 12ms',
    });
  });

  it('marks a clamped gate verdict as a denial and a recovery as money in', () => {
    expect(describeEvent({ eventType: 'GATE_APPLIED', payload: { outcome: 'clamp', rule: 'risk_hold' } })).toMatchObject({ tone: 'deny', detail: 'risk hold' });
    expect(describeEvent({ eventType: 'ATTEMPT_OUTCOME', payload: { status: 'RECOVERED', recoveredPaise: 50000 } })).toMatchObject({ tone: 'clear', detail: '+₹500' });
  });

  it('ignores events with nothing worth showing', () => {
    expect(describeEvent({ eventType: 'CASE_LANE_CHANGED', payload: {} })).toBeNull();
  });
});
