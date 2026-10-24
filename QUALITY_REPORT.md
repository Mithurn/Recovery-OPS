# Quality report: Recovery-OPS

Branch: `chore/repo-quality-pass`. No behavior or public API changes.

## Baseline vs. final

Integration tests were run against a local Postgres 16 and Redis 7 (schema from `db/schema.sql`), matching `docker-compose.yml`.

| | Baseline | Final |
|---|---|---|
| Unit tests (`test:unit`) | 16 files / 121 passed | 25 files / 174 passed |
| Full suite (with Postgres + Redis) | 27 files / 206 passed, 9 skipped | 36 files / 259 passed, 9 skipped |
| Coverage, stmts / branches / funcs / lines (full suite, `src/` + `web/src/`) | 27.15 / 33.93 / 27.95 / 29.84 | 29.38 / 36.43 / 29.76 / 31.89 |
| Lint | none configured | ESLint: 0 errors, 0 warnings |
| Typecheck (server + tests, and web) | clean | clean |
| Web build | passes | passes |
| `npm audit` | 13 vulns (3 critical, 7 high, 3 moderate) | 9 (1 critical, 5 high, 3 moderate) |

The 9 skipped tests are the Razorpay test-mode client tests, which need real test keys.
Measured separately at the end: `src/` (server) 73.74% statements, `web/src` 13.45%. The overall figure is low mostly because the web app (PixiJS floor, React views, demo engine) has almost no tests. The combined run above uses one include list, so its totals differ slightly from the separate runs.

## Changes by phase

**Phase 1:** `docs/ARCHITECTURE.md`.

**Phase 2:** new unit tests for `action-codec`, `RazorpayOutcomeResolver`, `human-directive`, `loadConfig`, `FixedWindowLimiter`, `keepRawJsonBody`, `openSse`, web `format` helpers and `findPath`. Added `@vitest/coverage-v8` and a `test:coverage` script.

**Phase 3:** added ESLint (typescript-eslint, react-hooks) with a `lint` script. Removed verified-unused code: `compose`, `drawClothing`, `collarNeck`, `bodyShape` in `web/src/floor/sprites.ts` (no callers; portraits use `composeScene`), an unused `FeedList` import in `Workspace.tsx`, and a stale eslint-disable in `useTweenedNumber.ts`.

**Phase 4:** secrets scan found nothing hardcoded; `.env` is ignored and only `.env.example` is tracked. SQL is parameterised (the only interpolation is a constant column list). No `eval`/`innerHTML` use. Updated `fastify` (^5.12.7), `vite` (^6.4.5) and `concurrently` (^10.0.6) within their ranges.

**Phase 5:** CI now also runs lint and a new integration job (Postgres + Redis services); README gained test/lint commands and a contributing section. Dockerfile and `.gitignore` already existed and were left as is.

## Bugs found

None in application logic.

## Needs human review / skipped

- Major upgrades not applied: `@fastify/static` 8 to 10 (high advisory), `zod` 3 to 4 (high advisory; the `ai` and provider packages must be compatible first), `motion` 13 to 14, `@vitejs/plugin-react` 4 to 6, `vite` 6 to 8, `typescript`/`@types/node` newer majors.
- Remaining audit items: `next` (critical, only a peer dependency of the `geist` font package, not used at runtime), `vitest`/`@vitest/mocker`, `undici`, `fast-uri`, `source-map-js`. `npm update` and installing `vitest@^4` crash with an npm internal error (`edgesOut`), so they were not applied; retry with a newer npm.
- Prettier/formatter not added: it would reformat the whole codebase; agree on a style first.
- `sprites.ts` still has ~500 lines of hand-drawn pixel data with module-level mutable state (`CUR_W`, `CUR_H`); refactoring was out of scope.
- `routes.ts` (~330 lines) has 39% coverage; it is exercised by `product-api.integration.test.ts` only for auth and tenancy. Worth route-level tests for cases, runs and webhooks.
- `db/schema.sql` has no versioned migrations.
- `deploy/aws/env.sh` is a tracked script that writes env vars to SSM; it contains no secrets but was not reviewed beyond that.

## Next steps

Add UI tests (Testing Library) for `web/src/auth`, `workspace` and `loop`; test `demo/engine.ts`; add route-level tests; introduce a migration tool; plan the `zod` 4 and `@fastify/static` upgrades; enable Dependabot.
