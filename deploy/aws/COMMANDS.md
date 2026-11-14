# AWS start and stop

Run from the repo root. The public site (landing and `/demo`) is on Vercel and always up. These commands control only the live backend that `/app` needs.

| Do | Command |
| --- | --- |
| Start (waits until the app answers, about 2 minutes) | `deploy/aws/start.sh` |
| Stop (only the disk is billed while stopped) | `deploy/aws/stop.sh` |
| Check state and health | `deploy/aws/status.sh` |
| Set a server env var and restart | `VAR=value deploy/aws/env.sh VAR` |

Live app: https://recovery-opsagents.vercel.app/app

Backend health: https://recovery-opsagents.vercel.app/api/health
