# Brag Plan: Recovery OPS

## What is this app?
A multi-agent workspace that recovers failed Razorpay payments: five agents work out why a payment failed and fix it, inside nine hard limits the AI cannot override.

## The angle
Everyone else shows AI as magic. Recovery OPS is the opposite: the funniest, most impressive claim is *restraint*. "The AI proposes. The rules decide." The film plays like a quiet, expensive product launch where the climax is the machine being told **no**: a ₹4,999 retry the agent was 66% sure about gets stopped by plain code and handed to a human.

## Hook (0 – 4s)
A `payment.failed` card slams in (₹4,999, "payment risk check failed"), then the site's own line resolves over it: **"Failed payments, recovered while you sleep."**

## Key moments
1. **Five agents, five steps** — Intake, Investigator, Safety Gate, Executor, Audit Log light up one by one while a ₹4,999 packet travels desk to desk.
2. **The gate says no** — the run log types out tool calls (history 13ms, similar cases 29ms, propose retry now 66%), then `gate clamp: risk hold` lands on a hard impact and the verdict card appears: "Gate blocked it. The rules sent it to a person instead."
3. **Nine hard limits** — the rules snap in as a grid next to a giant 9.

## Outro / punchline
The real product (recorded-replay workspace) tilts in, ₹6,096 Recovered gets spotlighted, then the wordmark: **Recovery OPS. Failed payments, recovered while you sleep.**

## User flow worth showing
Failure arrives → agents investigate (tool calls) → gate decides → human or Razorpay acts → logged. Entry → key action → result.

## Tone
- Preset: cinematic (with polished restraint)
- Creative direction: "a quiet premium product film where the hero is the safety rail"
- Interpretation: big type, long confident holds, dark ground, one hard impact (the gate), no jokes except the deadpan of the product's own copy.

## Format: landscape — 1920x1080
## Duration: ~23.5s

## Visual identity (from the project: landing.css, palette.ts)
- Background: #17181b (oklch 19.5% .004 264), panels #1d1e22 / #24262b, lines #34363d
- Text: #f2f3f5, muted #a9adb6
- Accents (one per agent): sky #4f9faf, lilac #9482d3, coral #d96a62, mint #5ca97a, lemon #dcab3c
- Display font: Geist (600/700); mono: Geist Mono; pixel: Press Start 2P (role labels, as in the product)
- Strongest visual element: the pixel agent floor + the white square with the sky offset shadow (brand mark)

## Share copy (draft)
See share-copy.txt

## Audio direction
- Role: cinematic support, restrained
- Music: Happy Beats / Business Moves vol. 10 (~110 BPM)
- Music treatment: in at 0 (fade 0.4s), steady bed ~0.55, fade-out from 21.6s
- Music cue guidance: preset `vol-10`; strong cues locked: 15.82 (rules grid), 18.55 (product reveal), 20.74 (wordmark). Beat grid used for agent activations (4.64, 5.74, 6.82, 8.22, 9.29) and log lines.
- Audio-reactive treatment: subtle; bass/RMS breathes the background aura and the accent glows, no waveform graphics
- SFX posture: sparse, motion-matched: one error sting on the failure, soft clicks on each agent/log line, one heavy impact on `gate clamp`, a bell on the wordmark
- Restraint rule: nothing louder than the gate impact except the final bell

## Storyboard

### Scene 1 — Failure — 4.0s
`payment.failed` card, ₹4,999, shakes in; shrinks up; headline lines land (verbatim from landing hero).
Audio intent: tension → settle. Transition: soft crossfade → Scene 2

### Scene 2 — Five agents — 6.3s
"From failed to fixed in five steps". Five desks light one by one on beats with the landing page step titles. Packet travels between them. Hold ≥ 0.8s per title; full set held to the end.
Sequential/interaction: yes — desks activate on consecutive beats, packet hops desk to desk.
Transition: crossfade → Scene 3

### Scene 3 — The gate says no — 6.3s
"The AI proposes. The rules decide." Run log lines type in; at 13.64 `gate clamp risk hold` hits with impact + verdict card.
Sequential/interaction: yes — log lines appear on beats, simulated typing.
Transition: hard-ish wipe on the strong cue → Scene 4

### Scene 4 — Nine hard limits — 3.0s
Giant 9, eight rule cards snap in (name + note), copy verbatim from landing.
Transition: push into product → Scene 5

### Scene 5 — The real thing — 4.9s
Product screenshot (recorded replay) tilts in, "₹6,096 Recovered" spotlight, then wordmark + tagline + CTA.

**Music mood:** cinematic, forward-moving. **Audio summary:** a steady pulse, one deliberate hit when the gate says no, one bell at the end.

## Notes on grounding and privacy
- All on-screen copy is quoted from `web/src/landing/Landing.tsx`, `web/src/floor/agents.ts`, the README, or the product's run log.
- No emails, keys or customer data on screen. The replay screenshot's placeholder `customer+…@example…` rows are cropped out; ₹ figures come from the recorded replay and are labelled as such.
