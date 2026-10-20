#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib.sh"
ID=$(iid); [ -n "$ID" ] || { echo "no instance, run up.sh"; exit 1; }
aws ec2 start-instances --instance-ids "$ID" >/dev/null
aws ec2 wait instance-running --instance-ids "$ID"
echo "starting, ready in ~2 min: $(url "$ID")"
