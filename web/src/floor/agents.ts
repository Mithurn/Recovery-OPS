import type { Lane, RecoveryCase } from '../types.js';
import type { AgentId } from './sprites';

export const AGENT_INFO: Record<AgentId, { role: string; duty: string; tools: string }> = {
  intake: {
    role: 'Intake',
    duty: 'Receives the payment.failed webhook, verifies its signature, and opens a recovery case.',
    tools: 'webhook ingest, case creation',
  },
  investigator: {
    role: 'Investigator',
    duty: 'Works out why the payment failed using customer history, bank downtime, similar cases and the playbook, then proposes one action.',
    tools: 'customer history, bank downtime, similar cases, playbook, prior attempts',
  },
  gate: {
    role: 'Safety Gate',
    duty: 'Applies nine deterministic rules to every proposal. It can allow, clamp to escalation, or skip. The agent cannot override it.',
    tools: 'risk hold, hard decline, attempt cap, exposure cap, confidence, cooldowns',
  },
  executor: {
    role: 'Executor',
    duty: 'Carries out the approved action against Razorpay exactly once per attempt, then settles the outcome from webhooks.',
    tools: 'retry, payment link, customer nudge, settlement',
  },
  ledger: {
    role: 'Audit Log',
    duty: 'Records every step in an append only log the application role cannot modify or delete.',
    tools: 'append only event log',
  },
};

const LANE_AGENT: Record<Lane, AgentId> = {
  INCOMING: 'intake',
  DIAGNOSING: 'investigator',
  DECIDING: 'gate',
  ATTEMPTING: 'executor',
  RETRY_SCHEDULED: 'executor',
  RECOVERED: 'ledger',
  ESCALATED: 'ledger',
  WRITTEN_OFF: 'ledger',
  STOPPED: 'ledger',
};

export const RETRYABLE_LANES: readonly Lane[] = ['INCOMING', 'DIAGNOSING', 'DECIDING', 'ATTEMPTING', 'RETRY_SCHEDULED'];

export const agentForLane = (lane: Lane): AgentId => LANE_AGENT[lane];

export const casesAtAgent = (cases: RecoveryCase[], agent: AgentId): RecoveryCase[] =>
  cases.filter((c) => agentForLane(c.lane) === agent);
