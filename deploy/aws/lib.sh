NAME=recoveryops
REGION=${AWS_REGION:-$(aws configure get region)}
export AWS_DEFAULT_REGION=$REGION
iid() {
  aws ec2 describe-instances --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[].Instances[].InstanceId' --output text
}
ip() { aws ec2 describe-instances --instance-ids "$1" --query 'Reservations[].Instances[].PublicIpAddress' --output text; }
url() {
  local dd; dd=$(aws ssm get-parameter --name /$NAME/duckdns --with-decryption --query Parameter.Value --output text 2>/dev/null || true)
  if [ -n "$dd" ]; then echo "https://${dd%%:*}.duckdns.org"; else echo "http://$(ip "$1")"; fi
}
