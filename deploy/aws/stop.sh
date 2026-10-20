#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib.sh"
ID=$(iid); [ -n "$ID" ] || { echo "no instance"; exit 1; }
aws ec2 stop-instances --instance-ids "$ID" >/dev/null
echo "stopping $ID (only disk is billed while stopped)"
