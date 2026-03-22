#!/bin/bash

# ============================================================
#  XProxypass - One-Command VPS Installer
#  Supported: Ubuntu 22.04 LTS (fresh)
#  Usage:  git clone https://github.com/XProject-hub/XProxypass.git /opt/xproxypass
#          cd /opt/xproxypass && sudo bash install.sh
# ============================================================

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'
BOLD='\033[1m'

log()  { echo -e "  ${CYAN}[*]${NC} $1"; }
ok()   { echo -e "  ${GREEN}[+]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[!]${NC} $1"; }
fail() { echo -e "  ${RED}[x]${NC} $1"; exit 1; }

spinner() {
  local pid=$1 msg=$2
  local chars='|/-\'
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  ${CYAN}[*]${NC} %s %s " "$msg" "${chars:i++%4:1}"
    sleep 0.2
  done
  wait "$pid"
  local exit_code=$?
  printf "\r"
  if [ $exit_code -eq 0 ]; then
    ok "$msg"
  else
    fail "$msg - failed (exit code $exit_code)"
  fi
}

run() {
  local msg="$1"
  shift
  "$@" > /tmp/xproxypass_install.log 2>&1 &
  spinner $! "$msg"
}

if [ "$EUID" -ne 0 ]; then
  fail "Please run as root: sudo bash install.sh"
fi

clear
echo ""
echo -e "${CYAN}${BOLD}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║                                               ║"
echo "  ║   ██╗  ██╗██████╗ ██████╗  ██████╗ ██╗  ██╗  ║"
echo "  ║   ╚██╗██╔╝██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝  ║"
echo "  ║    ╚███╔╝ ██████╔╝██████╔╝██║   ██║ ╚███╔╝   ║"
echo "  ║    ██╔██╗ ██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗   ║"
echo "  ║   ██╔╝ ██╗██║     ██║  ██║╚██████╔╝██╔╝ ██╗  ║"
echo "  ║   ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ║"
echo "  ║                                               ║"
echo "  ║    Software-based CDN & Reverse Proxy         ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# ── Gather Info ──────────────────────────────────────────────

echo -e "  ${BOLD}Configuration${NC}"
echo -e "  ─────────────────────────────────────────"
echo ""
read -p "  Domain (e.g. proxy.example.com): " DOMAIN
[ -z "$DOMAIN" ] && fail "Domain is required"

read -p "  Email (for SSL certificate): " EMAIL
[ -z "$EMAIL" ] && fail "Email is required"

APP_DIR="$(pwd)"
JWT_SECRET=$(openssl rand -hex 32)

echo ""
echo -e "  ${BOLD}Starting Installation${NC}"
echo -e "  ─────────────────────────────────────────"
echo ""
log "Domain:    $DOMAIN"
log "Email:     $EMAIL"
log "Directory: $APP_DIR"
echo ""

# ── System Update ────────────────────────────────────────────

run "Updating system packages" apt-get update -y
run "Upgrading system packages" apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade

# ── Node.js 20 LTS ──────────────────────────────────────────

if ! command -v node &> /dev/null; then
  run "Adding Node.js 20 repository" bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
  run "Installing Node.js" apt-get install -y nodejs
else
  ok "Node.js $(node -v) already installed"
fi

# ── Build Tools ──────────────────────────────────────────────

run "Installing build tools" apt-get install -y build-essential python3

# ── Nginx ────────────────────────────────────────────────────

if ! command -v nginx &> /dev/null; then
  run "Installing Nginx" apt-get install -y nginx
else
  ok "Nginx already installed"
fi

# ── Certbot ──────────────────────────────────────────────────

if ! command -v certbot &> /dev/null; then
  run "Installing Certbot" apt-get install -y certbot python3-certbot-nginx
else
  ok "Certbot already installed"
fi

# ── PM2 ──────────────────────────────────────────────────────

if ! command -v pm2 &> /dev/null; then
  run "Installing PM2" npm install -g pm2
else
  ok "PM2 already installed"
fi

echo ""
echo -e "  ${BOLD}Deploying Application${NC}"
echo -e "  ─────────────────────────────────────────"
echo ""

# ── .env ─────────────────────────────────────────────────────

cat > "$APP_DIR/.env" << EOF
PORT=3000
DOMAIN=$DOMAIN
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=7d
NODE_ENV=production
EOF

ok ".env configured (JWT secret generated)"

# ── Install Dependencies ────────────────────────────────────

run "Installing server dependencies" npm install --production
run "Installing client dependencies" bash -c "cd $APP_DIR/client && npm install"
run "Building frontend" bash -c "cd $APP_DIR/client && npm run build"

# ── Nginx Config ────────────────────────────────────────────

echo ""
echo -e "  ${BOLD}Configuring Services${NC}"
echo -e "  ─────────────────────────────────────────"
echo ""

cat > /etc/nginx/sites-available/xproxypass << NGINXCONF
server {
    listen 80;
    server_name $DOMAIN *.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    client_max_body_size 50m;
    proxy_buffering off;
}
NGINXCONF

rm -f /etc/nginx/sites-enabled/default 2>/dev/null
ln -sf /etc/nginx/sites-available/xproxypass /etc/nginx/sites-enabled/xproxypass

nginx -t > /dev/null 2>&1 || fail "Nginx configuration test failed"
systemctl restart nginx
ok "Nginx configured and running"

# ── SSL ──────────────────────────────────────────────────────

log "Obtaining SSL certificate..."
if certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --redirect > /tmp/xproxypass_install.log 2>&1; then
  ok "SSL certificate installed for $DOMAIN"
else
  warn "SSL failed - you can set it up later with:"
  warn "  certbot --nginx -d $DOMAIN --email $EMAIL --agree-tos"
fi

# ── Start App ────────────────────────────────────────────────

cd "$APP_DIR"
pm2 delete xproxypass > /dev/null 2>&1 || true
pm2 start ecosystem.config.js > /dev/null 2>&1
pm2 save > /dev/null 2>&1
pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true
ok "Application started with PM2 (auto-restart enabled)"

# ── Firewall ─────────────────────────────────────────────────

ufw allow 22/tcp > /dev/null 2>&1
ufw allow 80/tcp > /dev/null 2>&1
ufw allow 443/tcp > /dev/null 2>&1
ufw --force enable > /dev/null 2>&1
ok "Firewall configured (22, 80, 443)"

# ── Done ─────────────────────────────────────────────────────

echo ""
echo ""
echo -e "  ${GREEN}${BOLD}╔═══════════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}${BOLD}║                                               ║${NC}"
echo -e "  ${GREEN}${BOLD}║   Installation Complete!                      ║${NC}"
echo -e "  ${GREEN}${BOLD}║                                               ║${NC}"
echo -e "  ${GREEN}${BOLD}╚═══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Your Site${NC}"
echo -e "  ─────────────────────────────────────────"
echo -e "  URL:       ${CYAN}https://$DOMAIN${NC}"
echo -e "  Directory: ${CYAN}$APP_DIR${NC}"
echo -e "  Config:    ${CYAN}$APP_DIR/.env${NC}"
echo ""
echo -e "  ${BOLD}Useful Commands${NC}"
echo -e "  ─────────────────────────────────────────"
echo -e "  Status:    ${CYAN}pm2 status${NC}"
echo -e "  Logs:      ${CYAN}pm2 logs xproxypass${NC}"
echo -e "  Restart:   ${CYAN}pm2 restart xproxypass${NC}"
echo -e "  Stop:      ${CYAN}pm2 stop xproxypass${NC}"
echo ""
echo -e "  ${BOLD}DNS Records Required${NC}"
echo -e "  ─────────────────────────────────────────"
echo -e "  ${YELLOW}A record:   $DOMAIN       -> YOUR_SERVER_IP${NC}"
echo -e "  ${YELLOW}A record:   *.$DOMAIN     -> YOUR_SERVER_IP${NC}"
echo ""
