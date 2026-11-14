# Benchmark

`npm run bench` regenerates the README results table. It needs no services and no API keys.

## What it does

- `bench/corpus.ts` builds failed-payment cases from a seed. Each case has a hidden root cause (the taxonomy in `src/agent/prompt.ts`) and ground truth: when a retry would clear, whether a link on each rail or a nudge on each channel would recover it, and whether a human could. Observable signals (failure reason, payment history, downtime feed) are causally tied to the hidden cause but noisy.
- `bench/simulator.ts` runs a proposal through the real `safetyGate` (via `buildGateContext`), then decides recovery from ground truth. A clamp becomes `ESCALATE`; a nudge outside the contact window is deferred to the window opening; other skips recover nothing.
- Arms: a fixed 24 hour retry, a hand-tuned rules table, and the agent arm. All three pass through the gate.
- Output is mean, standard deviation and range of recovery rate over seeds, root-cause accuracy where an arm diagnoses, and how often the gate changed the proposal.

## The agent arm

The committed arm replays `bench/transcripts/scripted-standin-seed-N.json`. A deterministic scripted policy generated them, not a language model, and each file says so in its `meta.notice`. Run `npm run bench:record` to regenerate them.

With `OPENROUTER_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` set, `npm run bench -- --live` runs the real `runRecoveryAgent` against each case, with tool data served from the synthetic case, and records `bench/transcripts/live-seed-N.json`. Later runs with `--transcripts live` replay them without calling a model.

## Limits

- One decision per case. The fixed schedule gets a single retry, so multi-retry schedules are understated.
- The corpus encodes the author's assumptions about how recoveries behave. Absolute rates are not predictions for real traffic.
- The rules table reads the same signals the generator uses, so its 100% root-cause accuracy is by construction.
- Human recovery after `ESCALATE` is a per-case coin flip from ground truth, so clamping is not free of credit.
