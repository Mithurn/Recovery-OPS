#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib.sh"
ID=$(iid); [ -n "$ID" ] || { echo "no instance"; exit 1; }
aws ec2 describe-instances --instance-ids "$ID" --query 'Reservations[0].Instances[0].State.Name' --output text
aws ec2 get-console-output --instance-id "$ID" --latest --output text 2>/dev/null | grep -E "RECOVERYOPS_READY|recoveryops" | tail -3 || true
echo "$(url "$ID")"
curl -s -m5 "$(url "$ID")/api/health" || echo "(not answering yet)"
