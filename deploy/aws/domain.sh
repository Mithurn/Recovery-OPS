#!/usr/bin/env bash
# Attach a DuckDNS name. Token stays in SSM, not in the repo.
#   deploy/aws/domain.sh <name> <duckdns-token>
set -euo pipefail
. "$(dirname "$0")/lib.sh"
aws ssm put-parameter --name /$NAME/duckdns --type SecureString --overwrite --value "$1:$2" >/dev/null
ID=$(iid)
if [ "$(aws ec2 describe-instances --instance-ids "$ID" --query 'Reservations[0].Instances[0].State.Name' --output text)" = running ]; then
  aws ssm send-command --instance-ids "$ID" --document-name AWS-RunShellScript \
    --parameters 'commands=["systemctl restart recoveryops-boot"]' >/dev/null
fi
echo "domain set: https://$1.duckdns.org"
