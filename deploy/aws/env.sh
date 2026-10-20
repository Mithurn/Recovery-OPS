#!/usr/bin/env bash
# Set server env vars from your shell and restart the app.
#   RESEND_API_KEY=... deploy/aws/env.sh RESEND_API_KEY [OTHER_VAR ...]
set -euo pipefail
. "$(dirname "$0")/lib.sh"
[ $# -gt 0 ] || { echo "usage: VAR=value $0 VAR [VAR...]"; exit 1; }

CUR=$(aws ssm get-parameter --name /$NAME/env --with-decryption --query Parameter.Value --output text)
for k in "$@"; do
  v=${!k:?$k is not set in your shell}
  CUR=$(printf '%s\n' "$CUR" | grep -v "^$k=")
  CUR=$(printf '%s\n%s=%s' "$CUR" "$k" "$v")
done
printf '%s\n' "$CUR" > /tmp/recoveryops.env
aws ssm put-parameter --name /$NAME/env --type SecureString --overwrite --value file:///tmp/recoveryops.env >/dev/null
rm -f /tmp/recoveryops.env

ID=$(iid)
if [ "$(aws ec2 describe-instances --instance-ids "$ID" --query 'Reservations[0].Instances[0].State.Name' --output text)" = running ]; then
  aws ssm send-command --instance-ids "$ID" --document-name AWS-RunShellScript --parameters 'commands=["cd /opt/recoveryops && /snap/bin/aws ssm get-parameter --region '"$REGION"' --name /recoveryops/env --with-decryption --query Parameter.Value --output text > .env && docker compose -f compose.prod.yml up -d"]' >/dev/null
  echo "updated and restarting"
else
  echo "updated; applies on next start"
fi
