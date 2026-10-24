# Architecture

Recovery OPS recovers failed Razorpay payments. A `payment.failed` webhook opens a
case; an LLM investigator proposes one recovery action; a deterministic safety gate
decides what actually runs; an idempotent executor performs it; every step is
appended to an audit log and streamed to the UI.

## Stack

TypeScript (ESM, Node 22), Fastify API, BullMQ on Redis for the work queue,
Postgres for state, Vercel AI SDK for the model, and a React + Vite + PixiJS web app.

## Dependency rule

Enforced by `tests/architecture.test.ts`; arrows point down, never up.

```
api / worker / tenants  ->  agent · safety · execution · persistence  ->  domain
```

`domain` holds types and ports (interfaces) only. Nothing below the orchestration
tier knows which database, queue or HTTP client is in use.

## Server modules (`src/`)

| Module | Role |
|---|---|
| `domain/` | Case, attempt, event, gateway and recovery-action types; `ports.ts` defines `EventLog`, `OutcomeResolver`, `NotificationPort` |
| `agent/` | The investigator: prompt, tools (customer history, bank downtime, similar cases, playbook), step/cost budget, model selection and health |
| `safety/` | `safety-gate.ts`: nine pure rules that allow, clamp (escalate to a human) or skip the proposed action. The model cannot override it |
| `execution/` | `attempt-executor` (one Razorpay call per attempt, keyed by an idempotency key), `razorpay-client`, outcome resolver, webhook handler, notifier |
| `persistence/` | Postgres repositories for cases, attempts, events, webhook inbox and run history; the event table is insert-only by `GRANT` |
| `worker/` | `pipeline.ts` runs one turn (investigate, gate, execute); `recovery-worker` consumes the BullMQ queue and forwards progress to the event bus; `reconcile-sweep` settles attempts whose outcome was unknown; stop registry (Redis-backed) cancels runs |
| `tenants/` | Per-user runtime: encrypted Razorpay credentials (AES-256-GCM) and a pipeline wired with that user's gateway |
| `auth/` | Email one-time-code sign-in, vault key crypto, mailer (Resend or console) |
| `api/` | Fastify routes, SSE streaming, in-memory event bus, rate limiting, raw-body capture for webhook HMAC verification |
| `main.ts`, `config.ts` | Composition root and Zod-validated environment |

## Request flow

1. Webhook (`execution/webhook-handler`) verifies the HMAC against the raw body, records it in the inbox and opens a case.
2. A job is enqueued per case (deduplicated; a turn arriving during an active one runs afterwards, not dropped).
3. The worker runs the pipeline: the agent investigates and proposes; the gate applies its rules; the executor records the attempt, calls Razorpay at most once and settles it. Ambiguous gateway errors leave the attempt `AWAITING_RECONCILIATION` for the sweep.
4. Every step is appended to the event log; the publishing wrappers also push to the event bus, which feeds the SSE streams the UI subscribes to.
5. Escalated cases wait in "Needs you"; a human directive re-enters the pipeline and bypasses the model-confidence floor but not the other gate rules.

## Web app (`web/`)

Vite + React. Routes: landing, `/demo` (recorded replay driven by `demo/engine`), and the
authenticated workspace (`workspace/`: floor, cases, needs-you, settings). `floor/` is a
PixiJS pixel-office renderer; `loop/` turns SSE events into activity lines and timelines;
`api.ts` is the typed client.

## Data

`db/schema.sql` creates the tables and the least-privilege `recovery_app` role used at
runtime (no `UPDATE`/`DELETE` on the event table). Migrations are not versioned; the
schema file is the source of truth.

## Testing

Vitest. Unit tests need no services. `*.integration.test.ts` files need Postgres and
Redis and skip themselves when `DATABASE_URL`/`ADMIN_DATABASE_URL`/`REDIS_URL` are unset.
