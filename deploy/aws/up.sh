#!/usr/bin/env bash
# Create the RecoveryOps EC2 instance (one time). Reads keys from the local .env.
#   deploy/aws/up.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
. deploy/aws/lib.sh
REPO=${REPO:-https://github.com/Mithurn/Recovery-OPS.git}
INSTANCE_TYPE=${INSTANCE_TYPE:-t4g.small}

[ -z "$(iid)" ] || { echo "instance already exists: $(iid)"; exit 1; }
[ -f .env ] || { echo "no .env"; exit 1; }

rand() { head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9'; }
DD=$(aws ssm get-parameter --name /$NAME/duckdns --with-decryption --query Parameter.Value --output text 2>/dev/null || true)
PUBLIC=${PUBLIC_URL:-http://localhost}; SITE=:80
if [ -n "$DD" ]; then PUBLIC="https://${DD%%:*}.duckdns.org"; SITE="${DD%%:*}.duckdns.org"; fi
{
  grep -vE '^(#|$|HOST=|PORT=|DATABASE_URL=|ADMIN_DATABASE_URL=|REDIS_URL=|NODE_ENV=|PUBLIC_URL=|VAULT_KEY=|SESSION_SECRET=|ADMIN_DB_PASSWORD=|APP_DB_PASSWORD=|SITE_ADDRESS=)' .env
  echo "NODE_ENV=production"
  echo "PUBLIC_URL=$PUBLIC"
  echo "VAULT_KEY=$(openssl rand -base64 32)"
  echo "SESSION_SECRET=$(openssl rand -hex 24)"
  echo "ADMIN_DB_PASSWORD=$(rand)"
  echo "APP_DB_PASSWORD=$(rand)"
  echo "SITE_ADDRESS=$SITE"
} > /tmp/recoveryops.env
aws ssm put-parameter --name /$NAME/env --type SecureString --overwrite --value file:///tmp/recoveryops.env >/dev/null
rm -f /tmp/recoveryops.env

if ! aws iam get-role --role-name $NAME >/dev/null 2>&1; then
  aws iam create-role --role-name $NAME --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name $NAME --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
  aws iam put-role-policy --role-name $NAME --policy-name read-params --policy-document \
    "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"ssm:GetParameter\",\"kms:Decrypt\"],\"Resource\":\"*\"}]}"
  aws iam create-instance-profile --instance-profile-name $NAME >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name $NAME --role-name $NAME
  sleep 12
fi

VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=$NAME Name=vpc-id,Values="$VPC" --query 'SecurityGroups[0].GroupId' --output text)
if [ "$SG" = "None" ]; then
  SG=$(aws ec2 create-security-group --group-name $NAME --description RecoveryOps --vpc-id "$VPC" --query GroupId --output text)
  for p in 80 443; do aws ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port $p --cidr 0.0.0.0/0 >/dev/null; done
fi

AMI=$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text)
sed -e "s|__REGION__|$REGION|g" -e "s|__REPO__|$REPO|g" deploy/aws/user-data.sh > /tmp/recoveryops-user-data.sh

ID=$(aws ec2 run-instances --image-id "$AMI" --instance-type "$INSTANCE_TYPE" --security-group-ids "$SG" \
  --iam-instance-profile Name=$NAME --user-data file:///tmp/recoveryops-user-data.sh \
  --metadata-options HttpTokens=required \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3,DeleteOnTermination=true}' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" --query 'Instances[0].InstanceId' --output text)
rm -f /tmp/recoveryops-user-data.sh
echo "created $ID. First boot builds the app (~10 min). Watch: deploy/aws/status.sh"
