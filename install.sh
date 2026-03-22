#!/bin/bash
set -e

# ============================================================
#  XProxypass - One-Command VPS Installer
#  Supported: Ubuntu 22.04 LTS
#  Usage: sudo bash install.sh
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${CYAN}[XProxypass]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

if [ "$EUID" -ne 0 ]; then
  err "Please run as root: sudo bash install.sh"
fi

echo ""
echo -e "${CYAN}"
echo "  ██╗  ██╗██████╗ ██████╗  ██████╗ ██╗  ██╗██╗   ██╗"
echo "  ╚██╗██╔╝██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝╚██╗ ██╔╝"
echo "   ╚███╔╝ ██████╔╝██████╔╝██║   ██║ ╚███╔╝  ╚████╔╝ "
echo "   ██╔██╗ ██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗   ╚██╔╝  "
echo "  ██╔╝ ██╗██║     ██║  ██║╚██████╔╝██╔╝ ██╗   ██║   "
echo "  ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   "
echo -e "${NC}"
echo "  Software-based CDN & Reverse Proxy Service"
echo "  ──────────────────────────────────────────"
echo ""

# ── Gather Info ──────────────────────────────────────────────

read -p "Enter your domain (e.g., example.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
  err "Domain is required"
fi

read -p "Enter email for SSL certificate: " EMAIL
if [ -z "$EMAIL" ]; then
  err "Email is required for Let's Encrypt"
fi

APP_DIR="/opt/xproxypass"
JWT_SECRET=$(openssl rand -hex 32)

log "Domain: $DOMAIN"
log "Email: $EMAIL"
log "Install directory: $APP_DIR"
echo ""

# ── System Update ────────────────────────────────────────────

log "Updating system packages..."
apt-get update -y > /dev/null 2>&1
apt-get upgrade -y > /dev/null 2>&1
ok "System updated"

# ── Install Node.js 20 LTS ──────────────────────────────────

if ! command -v node &> /dev/null; then
  log "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y nodejs > /dev/null 2>&1
  ok "Node.js $(node -v) installed"
else
  ok "Node.js $(node -v) already installed"
fi

# ── Install Nginx ────────────────────────────────────────────

if ! command -v nginx &> /dev/null; then
  log "Installing Nginx..."
  apt-get install -y nginx > /dev/null 2>&1
  ok "Nginx installed"
else
  ok "Nginx already installed"
fi

# ── Install Certbot ──────────────────────────────────────────

if ! command -v certbot &> /dev/null; then
  log "Installing Certbot..."
  apt-get install -y certbot python3-certbot-nginx > /dev/null 2>&1
  ok "Certbot installed"
else
  ok "Certbot already installed"
fi

# ── Install PM2 ─────────────────────────────────────────────

if ! command -v pm2 &> /dev/null; then
  log "Installing PM2..."
  npm install -g pm2 > /dev/null 2>&1
  ok "PM2 installed"
else
  ok "PM2 already installed"
fi

# ── Install build tools ─────────────────────────────────────

log "Installing build essentials..."
apt-get install -y build-essential python3 > /dev/null 2>&1
ok "Build tools installed"

# ── Deploy Application ──────────────────────────────────────

log "Setting up application..."

if [ -d "$APP_DIR" ]; then
  warn "Directory $APP_DIR exists. Backing up..."
  mv "$APP_DIR" "${APP_DIR}.backup.$(date +%s)"
fi

mkdir -p "$APP_DIR"
cp -r . "$APP_DIR/"
cd "$APP_DIR"

# Create .env
cat > .env << EOF
PORT=3000
DOMAIN=$DOMAIN
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=7d
NODE_ENV=production
EOF

ok ".env configured"

# Install dependencies
log "Installing server dependencies..."
npm install --production > /dev/null 2>&1
ok "Server dependencies installed"

log "Installing client dependencies..."
cd client
npm install > /dev/null 2>&1
ok "Client dependencies installed"

log "Building client..."
npm run build > /dev/null 2>&1
ok "Client built"

cd "$APP_DIR"

# ── Configure Nginx ─────────────────────────────────────────

log "Configuring Nginx..."

cat > /etc/nginx/sites-available/xproxypass << NGINX
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
NGINX

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/xproxypass /etc/nginx/sites-enabled/xproxypass

nginx -t > /dev/null 2>&1
systemctl restart nginx
ok "Nginx configured"

# ── SSL Certificate ─────────────────────────────────────────

log "Obtaining SSL certificate..."
certbot --nginx -d "$DOMAIN" -d "*.$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --redirect 2>/dev/null || {
  warn "Wildcard SSL requires DNS challenge. Trying single domain..."
  certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --redirect 2>/dev/null || {
    warn "SSL setup failed. You can run it manually later:"
    warn "  certbot --nginx -d $DOMAIN -d *.$DOMAIN --email $EMAIL"
  }
}
ok "SSL configured"

# ── Start Application ───────────────────────────────────────

log "Starting XProxypass..."
cd "$APP_DIR"
pm2 delete xproxypass 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true
ok "Application started"

# ── Firewall ─────────────────────────────────────────────────

log "Configuring firewall..."
ufw allow 22/tcp > /dev/null 2>&1
ufw allow 80/tcp > /dev/null 2>&1
ufw allow 443/tcp > /dev/null 2>&1
ufw --force enable > /dev/null 2>&1
ok "Firewall configured"

# ── Done ─────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  XProxypass installed successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo -e "  URL:        ${CYAN}https://$DOMAIN${NC}"
echo -e "  App Dir:    ${CYAN}$APP_DIR${NC}"
echo -e "  Config:     ${CYAN}$APP_DIR/.env${NC}"
echo ""
echo -e "  PM2 Status: ${CYAN}pm2 status${NC}"
echo -e "  PM2 Logs:   ${CYAN}pm2 logs xproxypass${NC}"
echo -e "  Restart:    ${CYAN}pm2 restart xproxypass${NC}"
echo ""
echo -e "  ${YELLOW}NOTE: Make sure your DNS has these records:${NC}"
echo -e "  ${YELLOW}  A record:  $DOMAIN -> YOUR_SERVER_IP${NC}"
echo -e "  ${YELLOW}  A record:  *.$DOMAIN -> YOUR_SERVER_IP${NC}"
echo ""
