#!/bin/bash
# ProxyXPass Node Agent - Manual Install (no Nginx changes)
# Installs Node Agent + Squid without touching existing Nginx config.
# Safe to use on servers already running Xtream UI or other services.
#
# Usage: bash manual-node-install.sh <MASTER_URL> <NODE_SECRET> <NODE_ID>
# Example: bash manual-node-install.sh https://proxyxpass.com mysecret 7

MASTER_URL=$1
NODE_SECRET=$2
NODE_ID=$3

if [ -z "$MASTER_URL" ] || [ -z "$NODE_SECRET" ] || [ -z "$NODE_ID" ]; then
  echo "Usage: bash manual-node-install.sh <MASTER_URL> <NODE_SECRET> <NODE_ID>"
  echo "Example: bash manual-node-install.sh https://proxyxpass.com mysecret 7"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

echo "[1/6] Installing Node.js..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "  Node.js already installed: $(node -v)"
fi

echo "[2/6] Installing PM2..."
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
else
  echo "  PM2 already installed"
fi

echo "[3/6] Installing Squid proxy..."
if ! command -v squid &> /dev/null; then
  apt-get install -y squid 2>/dev/null || { apt-get update -y && apt-get install -y squid; }
fi

# Resolve master server IP for Squid ACL
MASTER_DOMAIN=$(echo "${MASTER_URL}" | sed -E 's|https?://||' | sed 's|/.*||')
MASTER_IP=$(dig +short "$MASTER_DOMAIN" A 2>/dev/null | head -1)
if [ -z "$MASTER_IP" ]; then
  MASTER_IP=$(getent hosts "$MASTER_DOMAIN" 2>/dev/null | awk '{print $1}' | head -1)
fi
if [ -z "$MASTER_IP" ]; then
  MASTER_IP=$(echo $SSH_CLIENT | awk '{print $1}')
fi
echo "  Master IP for Squid ACL: $MASTER_IP"

cat > /etc/squid/squid.conf << SQUIDCONF
http_port 3128
acl localnet src 127.0.0.1
acl localnet src ::1
acl master_server src $MASTER_IP
http_access allow localnet
http_access allow master_server
http_access deny all
forwarded_for on
via off
cache_mem 64 MB
cache deny all
max_filedescriptors 65535
visible_hostname proxyxpass-node
SQUIDCONF
systemctl enable squid
systemctl restart squid
echo "  Squid running on port 3128 (restricted to master: $MASTER_IP)"

echo "[4/6] Setting up Node Agent..."
mkdir -p /opt/proxyxpass-node
cd /opt/proxyxpass-node

cat > package.json << 'PKGJSON'
{
  "name": "proxyxpass-node",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "http-proxy": "^1.18.1"
  }
}
PKGJSON

npm install --production 2>&1 || { echo "  Retrying npm install..."; npm cache clean --force; npm install --production 2>&1; }

if [ ! -d "node_modules/http-proxy" ]; then
  echo "  Installing http-proxy directly..."
  npm install http-proxy@1.18.1 2>&1
fi

echo "[5/6] Downloading agent script from master..."
curl -sL ${MASTER_URL}/api/node/agent-script -H "X-Node-Secret: ${NODE_SECRET}" -o node-agent.js 2>/dev/null

if [ ! -s node-agent.js ]; then
  echo "ERROR: Failed to download node-agent.js from master"
  echo "Check that MASTER_URL and NODE_SECRET are correct"
  exit 1
fi
echo "  Agent script downloaded"

cat > ecosystem.config.js << PMCONF
module.exports = {
  apps: [{
    name: 'proxyxpass-node',
    script: 'node-agent.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      MASTER_URL: '${MASTER_URL}',
      NODE_SECRET: '${NODE_SECRET}',
      NODE_PORT: 3000,
      NODE_ID: '${NODE_ID}'
    }
  }]
};
PMCONF

echo "[6/6] Starting Node Agent..."
pm2 delete proxyxpass-node 2>/dev/null
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null

sleep 2
HEALTH=$(curl -s http://127.0.0.1:3000/health 2>/dev/null)

echo ""
echo "============================================"
echo "  ProxyXPass Node Agent - Install Complete"
echo "============================================"
echo ""
echo "  Node Agent: port 3000"
echo "  Squid Proxy: port 3128"
echo "  Nginx: NOT modified"
echo ""
echo "  Health: ${HEALTH}"
echo ""
echo "  NOTE: Since Nginx was not modified, you have two options:"
echo ""
echo "  Option A: Add a server block to your existing Nginx config"
echo "  that forwards ProxyXPass traffic to port 3000."
echo ""
echo "  Option B: If your existing Nginx already listens on IPTV"
echo "  ports (25461, 8080, etc.), add a location block:"
echo ""
echo '    location / {'
echo '        proxy_pass http://127.0.0.1:3000;'
echo '        proxy_http_version 1.1;'
echo '        proxy_set_header Host $host;'
echo '        proxy_set_header X-Real-IP $remote_addr;'
echo '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;'
echo '        proxy_set_header X-Forwarded-Proto $scheme;'
echo '        proxy_connect_timeout 300s;'
echo '        proxy_send_timeout 300s;'
echo '        proxy_read_timeout 300s;'
echo '    }'
echo ""
echo "============================================"
echo "PROXYXPASS_NODE_SETUP_COMPLETE"
