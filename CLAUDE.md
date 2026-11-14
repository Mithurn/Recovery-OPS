# Recovery OPS

Razorpay failed-payment recovery. Fastify + BullMQ + Postgres server in `src/`, React + Vite web app in `web/`. Architecture: `docs/ARCHITECTURE.md`. Tradeoffs: `docs/DECISIONS.md`.

## Commands

- `npm run dev` API on :3000 and web on :5173 (needs `docker compose up -d` for Postgres and Redis)
- `npm run typecheck` and `npx tsc --noEmit -p web/tsconfig.json`
- `npm run test:unit` no services needed; `npm test` adds the `*.integration.test.ts` files (Postgres and Redis)
- `npm run verify-audit` checks the app role cannot UPDATE the audit log
- `npm run web:build`, `npm run db:schema`

## Dependency rule

Enforced by `tests/architecture.test.ts`. Arrows point down, never up.

```
api / worker / tenants  ->  agent · safety · execution · persistence  ->  domain
```

- `domain/` imports only `zod` and itself. It holds types, zod schemas and the ports (interfaces).
- `safety/` is pure policy: imports `domain/` only, no I/O library.
- `pg` is imported only in `persistence/`. `bullmq` and `ioredis` only in `api/`, `worker/`, `tenants/` and the root.
- Adapters talk to ports in `domain/ports.ts`; `worker/` and `main.ts` wire concrete classes.

## Layout

- `src/agent` investigator, tools, prompt, token budget, model health
- `src/safety` the gate (`safety-gate.ts`)
- `src/execution` attempt executor, Razorpay client, webhook handler, notifier
- `src/persistence` Postgres repositories, event log, webhook inbox, audit verification
- `src/worker` pipeline, BullMQ queue and worker, stop registry, reconcile sweep
- `src/api` Fastify routes, auth routes, SSE, rate limiter
- `src/auth`, `src/tenants` email-code auth, per-user Razorpay credentials and runtime
- `db/schema.sql` schema and GRANTs; `deploy/` Caddy and AWS scripts; `web/src` UI

## Conventions

- Named constants and config over inline numbers. Limits live in `DEFAULT_LIMITS`, auth timings in `src/auth/config.ts`.
- No code comments unless a constraint is non-obvious; one short line.
- Money is integer paise. Time goes through the injected `Clock`.
- Smallest correct change, reuse existing abstractions, no new dependencies without need.

## Safety invariants

- The model only proposes a `RecoveryAction`; `safetyGate` decides, and its result is what executes.
- The gate has nine rules: `risk_hold`, `write_off_unsupported`, `hard_decline`, `max_attempts`, `contact_window`, `contact_cooldown`, `exposure_cap`, `low_confidence`, `cooldown`. A clamp becomes `ESCALATE`; a skip reschedules.
- `humanAuthorization` is null for every agent proposal and only satisfies `risk_hold`, `exposure_cap` and the write-off sign-off. Never `hard_decline`, the attempt cap, the contact window or the cooldowns.
- `hard_decline` and `risk_hold` come from case data, never from the model's diagnosis.
- One attempt, one idempotency key (`recovery_attempts.idempotency_key` is UNIQUE), at most one Razorpay call.
- `recovery_events` and `razorpay_webhooks` are insert-only for the app role by GRANT. Never add UPDATE or DELETE grants on them.
- Razorpay secrets are AES-256-GCM encrypted at rest and never returned to the browser. Live keys are rejected.
- Migrations and production deploys are run by a human, not by an agent.
