#!/bin/bash
set -euxo pipefail
exec > /var/log/recoveryops-init.log 2>&1
export HOME=/root
REGION=__REGION__
REPO=__REPO__
APP=/opt/recoveryops
COMPOSE="docker compose -f compose.prod.yml"

fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
apt-get update -y && apt-get install -y git curl
snap install aws-cli --classic
curl -fsSL https://get.docker.com | sh

git clone "$REPO" "$APP"
/snap/bin/aws ssm get-parameter --region "$REGION" --name /recoveryops/env --with-decryption \
  --query Parameter.Value --output text > "$APP/.env"

cat > /usr/local/bin/recoveryops-boot.sh <<'B'
#!/bin/bash
set -uo pipefail
REGION=__REGION__
cd /opt/recoveryops
TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
DD=$(/snap/bin/aws ssm get-parameter --region "$REGION" --name /recoveryops/duckdns --with-decryption \
  --query Parameter.Value --output text 2>/dev/null || true)
if [ -n "$DD" ]; then
  NAME=${DD%%:*}; DTOKEN=${DD#*:}
  curl -s "https://www.duckdns.org/update?domains=$NAME&token=$DTOKEN&ip=$IP" >/dev/null
  sed -i "s|^SITE_ADDRESS=.*|SITE_ADDRESS=$NAME.duckdns.org|; s|^PUBLIC_URL=.*|PUBLIC_URL=https://$NAME.duckdns.org|" .env
fi
docker compose -f compose.prod.yml up -d
B
chmod +x /usr/local/bin/recoveryops-boot.sh
sed -i "s|__REGION__|$REGION|" /usr/local/bin/recoveryops-boot.sh

cat > /etc/systemd/system/recoveryops-boot.service <<'U'
[Unit]
Description=RecoveryOps DNS update and stack start
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/recoveryops-boot.sh

[Install]
WantedBy=multi-user.target
U
systemctl daemon-reload
systemctl enable recoveryops-boot.service

cd "$APP"
$COMPOSE up -d --build
until $COMPOSE exec -T app node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"; do sleep 3; done
/usr/local/bin/recoveryops-boot.sh
echo RECOVERYOPS_READY
