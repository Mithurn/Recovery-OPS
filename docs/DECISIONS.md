# Design decisions

Short records of the tradeoffs behind the main choices.

## 1. The gate decides, the model proposes
The investigator returns a `RecoveryAction`; `safetyGate` is a pure function that allows, clamps to `ESCALATE` or skips it. Risk hold and hard decline are read from case data, not from the model's diagnosis. Cost: the gate is conservative and sends some recoverable cases to a human. Benefit: a prompt-injected or wrong model cannot move money outside the rules.

## 2. Audit immutability by database GRANT
The app role gets only SELECT and INSERT on `recovery_events` and `razorpay_webhooks`, and a test proves the database refuses UPDATE. Cost: no hash chain, so it does not defend against a database admin. Benefit: no application code path, including a bug, can rewrite history, and it needs no extra infrastructure.

## 3. BullMQ over in-process timers
Recovery work is queued in Redis with retries and exponential backoff, and a reconcile sweep re-enqueues stranded cases. Cost: Redis is a required dependency. Benefit: jobs survive restarts and a crashed worker does not lose a case.

## 4. Idempotency key per attempt, enforced by a unique index
One attempt has one key, and the key is sent to Razorpay. A retried job or a gateway timeout cannot create a second charge request. Cost: a crash between the call and the write parks the attempt as `AWAITING_RECONCILIATION` until the sweep resolves it.

## 5. Tenant isolation in queries, not row-level security
Each case is filtered by the signed-in user's merchant reference in repository queries, and each tenant has its own credentials and webhook token. Cost: one missed filter is a leak, and Postgres will not catch it. Benefit: simple, testable repositories. Row-level security is the next step.

## 6. Server-Sent Events over WebSockets
The UI only receives events; commands are plain POSTs. SSE needs no extra protocol and reconnects on its own. Subscribing before the snapshot read avoids a gap.

## 7. One container, test mode only
The API serves the built web app from one container behind Caddy, and only `rzp_test_` keys are accepted. Cost: no high availability and no live money. Benefit: a safe, cheap demo that can be stopped to save cost.

## 8. Layering enforced by a test
The dependency rule is checked by `tests/architecture.test.ts` instead of a document that can drift.
