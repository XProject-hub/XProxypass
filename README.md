# ProxyXPass

**Software-based CDN & Reverse Proxy Service**

Create proxy endpoints that route traffic through your own VPS servers to backend websites via subdomains. Full URL rewriting hides real server IPs. Built for web proxying and IPTV/Xtream Codes stream proxying.

**Website:** https://proxyxpass.com
**Discord:** https://discord.gg/mg6q9mgA
**Developed by:** X Project

---

## How It Works

```
User visits: mysite.proxyxpass.com
    -> Nginx (SSL termination, multi-port support)
    -> ProxyXPass Node.js server (port 3000)
    -> Detects subdomain "mysite"
    -> Looks up target URL in database
    -> Routes through VPS server if country selected (Squid proxy)
    -> Forwards request to backend server
    -> Rewrites ALL URLs in response (headers + body)
    -> Returns response with proxy URLs (real server IP hidden)
```

### DNS Proxy (Regular)
- User creates proxy: `mysite.proxyxpass.com` -> `https://backend.com`
- All URLs in HTML/JS/CSS responses rewritten to proxy domain
- Location headers, Set-Cookie domains, base tags rewritten
- CSP/HSTS headers removed to prevent blocking
- Gzip/Brotli responses decompressed before rewriting
- 50 Mbps auto bandwidth limit (prevents streaming abuse)
- Streaming content (.ts, .m3u8, .mp4) blocked

### Stream Proxy (IPTV/Streaming)
- Requires admin approval
- Full URL rewriting including M3U playlists and Xtream Codes API responses
- Xtream Codes `server_info` JSON rewritten (url, port fields)
- `application/octet-stream` M3U responses detected and rewritten
- Internal redirect following (302/307 redirects followed server-side)
- All stream traffic flows through proxy (real server completely hidden)
- Per-proxy bandwidth limiting (Mbps)
- Real-time bandwidth tracking (flushed to DB every 5 seconds)
- Active connection counting
- Admin can set bandwidth limits per proxy

---

## Features

### Reverse Proxy Engine
- Dynamic subdomain routing via `http-proxy`
- Full URL rewriting on ALL responses (not just stream proxies)
- HTTP, HTTPS, and WebSocket support
- X-Forwarded-For / X-Real-IP headers
- Gzip/Brotli decompression before URL rewriting
- `<base href>` tag rewriting
- JavaScript domain override injection
- Location/Set-Cookie/Refresh header rewriting
- CSP/HSTS/X-Frame-Options removal
- No-cache headers on all proxy responses
- www prefix stripping
- Custom 502/404 error pages

### VPS Server Management
- Add your own VPS servers as proxy nodes
- Auto SSH install of Squid proxy on new servers
- Server controls via SSH: Start, Stop, Restart Squid, Reboot VPS
- Server edit: change country, label, SSH password
- Auto health check every 3 minutes (TCP check with retry)
- Real-time server monitoring: CPU, RAM, Disk usage, uptime
- Server and Squid uptime display (auto-refresh every 10s)
- Max connections limit per server (load balancing)
- Load balancing across multiple servers in same country
- "No servers available" when all servers at capacity
- File descriptor limits configured for Squid stability

### Multi-Port Support
- Nginx listens on ports: 80, 443, 25461, 8080, 8880, 8443, 1935, 8000-8082, 9981-9982
- IPTV apps can connect using original port (e.g., `proxyxpass.com:25461`)
- SSL on port 443, non-SSL on all other ports

### IPTV / Xtream Codes Support
- M3U playlist URL rewriting (`application/octet-stream` detection)
- `player_api.php` server_info rewriting (url, port fields)
- `get.php` M3U response rewriting
- Internal redirect following for stream URLs (302/307)
- Channel logos preserved (CDN domains excluded from rewriting)
- Works with Smarters Pro, TiviMate, XCIPTV, VLC
- Support for Xtream Codes API login format (server:port + username/password)

### Stream Proxy Mode
- User requests stream proxy mode from dashboard
- Admin approves/denies in admin panel
- URL rewriting for ALL external URLs in responses
- Image/CDN domains excluded (png, jpg, m3uassets.com, etc.)
- Per-proxy bandwidth limit (Mbps) with save button
- Real-time stats: Connections, Mbps Live, Total Used
- Bandwidth bar with percentage of limit
- Admin can revoke stream proxy access
- Streaming blocked on regular proxies (403 error)

### Credit System
- EUR pricing with PayPal integration (REST API v2)
- Credit packages: Starter (1/7EUR), Basic (5/30EUR), Pro (10/50EUR), Business (25/100EUR)
- Validity options: 1 month (1 credit), 3 months (2), 6 months (4), 12 months (6)
- Proxy renewal - extend duration, time added on top of remaining
- Admin gives credits manually or user buys via PayPal
- Admin is exempt from credit charges
- Full credit transaction history log
- Stream proxy custom pricing via Discord contact

### Admin Panel (sidebar navigation)
- **Proxies** - All proxies with subdomain, target, owner, live connections, bandwidth used, requests, status (auto-refresh 5s)
- **Users** - All users, create user manually, add credits, toggle admin role, delete
- **Domains** - Add/remove/toggle proxy domains, multi-domain support
- **Streams** - Stream proxy requests: approve/deny/revoke, bandwidth limit with save button, used bandwidth
- **Servers** - VPS management: add/edit/delete, Start/Stop/Restart/Reboot via SSH, health check, uptime, CPU/RAM/Disk (auto-refresh 10s), max connections with save button, load balancing
- **Credits** - Full credit transaction history (amount, balance, action, detail)
- **Activity** - All user actions with IP addresses (login, register, proxy CRUD, admin actions, server operations)
- **Registration toggle** - Open/close registration in sidebar
- **Toast notifications** - Success/error feedback on all actions

### User Dashboard
- Proxy list with status, country, days remaining, stream badge
- Real-time stream stats (connections, Mbps, total used) for stream proxies
- Edit proxy: subdomain, target URL, country (without credit cost)
- Add Proxy form: subdomain, target URL, country dropdown with city labels, validity period, domain selection
- Buy Credits page with PayPal checkout
- Proxy renewal with validity selection
- Request Stream Proxy mode
- Credits display

### Multi-Domain Support
- Admin adds domains through admin panel
- Users choose domain when creating proxy (e.g., `.proxyxpass.com` or `.other-domain.com`)
- Each domain needs DNS A + wildcard A record + SSL certificate
- Proxy cards display correct domain

### Security & Auth
- JWT authentication with httpOnly cookies
- bcrypt password hashing (12 rounds)
- Registration toggle (admin can close/open)
- Registration closed page with Discord contact link
- Admin role system
- Stream proxy requires admin approval
- Bandwidth limiting on DNS and stream proxies

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express 5 |
| Frontend | React 18 + Tailwind CSS v3 |
| Database | SQLite (better-sqlite3, WAL mode) |
| Proxy Engine | http-proxy + https-proxy-agent v5 |
| URL Rewriting | Custom string replacement (split/join) |
| Decompression | Node.js zlib (gzip, deflate, brotli) |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Payments | PayPal REST API v2 |
| SSH | ssh2 (server setup + management) |
| Proxy Servers | Squid proxy on VPS nodes |
| Icons | Lucide React |
| Process Manager | PM2 (cluster mode) |
| Web Server | Nginx (SSL + multi-port) |
| SSL | Let's Encrypt (Certbot, wildcard) |

---

## Installation (Ubuntu 22.04 LTS)

### Prerequisites

1. Fresh Ubuntu 22.04 VPS (minimum 1GB RAM, 1 CPU)
2. Domain with DNS configured:
   - `A record`: `yourdomain.com` -> server IP
   - `A record`: `*.yourdomain.com` -> server IP

### Install

```bash
git clone https://github.com/XProject-hub/XProxypass.git /opt/xproxypass
cd /opt/xproxypass
sudo bash install.sh
```

The script asks for domain and email, then automatically installs Node.js 20, Nginx, Certbot, PM2, builds the frontend, and starts the app.

### Wildcard SSL

```bash
certbot certonly --manual --preferred-challenges dns -d yourdomain.com -d "*.yourdomain.com" --email you@email.com --agree-tos
```

Add TXT record to DNS when prompted, wait for propagation, then confirm.

### Multi-Port Nginx Config

```bash
# Add IPTV port support to Nginx
cat >> /etc/nginx/sites-available/xproxypass << 'EOF'
server {
    listen 25461;
    listen 8080;
    listen 8880;
    listen 8443;
    server_name yourdomain.com *.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
    client_max_body_size 50m;
    proxy_buffering off;
}
EOF
ufw allow 25461/tcp
ufw allow 8080/tcp
nginx -t && systemctl reload nginx
```

### Configure PayPal

Add to `/opt/xproxypass/.env`:
```
PAYPAL_CLIENT_ID=your-client-id
PAYPAL_SECRET=your-secret
PAYPAL_SANDBOX=false
```

### Make First Admin

1. Register at `https://yourdomain.com/register`
2. Run on server:
```bash
cd /opt/xproxypass
node -e "const db = require('./server/database'); db.setAdmin(1, 1); console.log('Done');"
```

---

## Usage

### For Users
1. Register at the website
2. Buy credits via PayPal or request from admin
3. Dashboard -> Add Proxy
4. Enter: subdomain, backend URL, country, validity period, domain
5. Proxy is live at `subdomain.yourdomain.com`
6. Renew anytime to extend duration
7. Edit subdomain, target URL, or country without extra cost
8. Request Stream Proxy mode for IPTV/streaming (requires admin approval)

### For Admins
1. **Admin Panel** - accessible from Dashboard
2. **Manage Users** - create accounts, add credits, toggle admin, delete
3. **Manage Proxies** - view all with live connections/bandwidth, delete
4. **Manage Domains** - add/remove proxy domains
5. **Stream Requests** - approve/deny, set bandwidth limits, revoke
6. **Manage Servers** - add VPS (auto SSH Squid install), edit, start/stop/restart/reboot, monitor CPU/RAM/Disk/uptime
7. **Settings** - open/close registration
8. **Credit History** - audit all transactions
9. **Activity Log** - monitor all actions with IPs

### Adding a VPS Proxy Server
1. Buy a VPS in desired country
2. Admin Panel -> Servers -> Add Server
3. Enter: IP, SSH port, username, password, country code, label, max connections
4. System auto-connects via SSH and installs Squid proxy
5. Server status monitored every 3 minutes
6. Traffic for that country routes through your server

### IPTV Setup
1. User creates proxy with target: `http://iptv-server:port`
2. User requests Stream Proxy mode
3. Admin approves and sets bandwidth limit
4. IPTV app settings: server `proxysubdomain.yourdomain.com`, port `original-port`, username, password
5. All M3U/API responses rewritten with proxy URLs
6. Real server IP completely hidden from end users

---

## API Reference

### Auth
- `GET /api/auth/registration-status` - Check if registration is open
- `POST /api/auth/register` - `{ username, email, password }`
- `POST /api/auth/login` - `{ email, password }`
- `POST /api/auth/logout`
- `GET /api/auth/me` - Get current user

### Proxies (requires auth)
- `GET /api/proxies` - List user's proxies
- `GET /api/proxies/countries` - Available countries (from own servers)
- `GET /api/proxies/domains` - Available proxy domains
- `GET /api/proxies/validity-options` - Validity periods with credit costs
- `POST /api/proxies` - `{ subdomain, target_url, country, validity, proxy_domain }`
- `PATCH /api/proxies/:id/edit` - `{ subdomain, target_url, country }`
- `POST /api/proxies/:id/renew` - `{ validity }`
- `POST /api/proxies/:id/request-stream` - Request stream proxy mode
- `PATCH /api/proxies/:id/toggle` - Toggle active/paused
- `DELETE /api/proxies/:id` - Delete proxy

### PayPal
- `GET /api/paypal/packages` - Credit packages with EUR prices
- `POST /api/paypal/create-order` - `{ package_id }`
- `POST /api/paypal/capture-order` - `{ order_id }`

### Stats
- `GET /api/stats` - User stats (requires auth)
- `GET /api/stats/global` - Global stats (public)
- `GET /api/connections/:id` - Active connections and live Mbps for a proxy

### Admin (requires admin role)
- `GET /api/admin/users` - All users
- `POST /api/admin/users` - `{ username, email, password, credits }` - Create user
- `POST /api/admin/users/:id/credits` - `{ amount }` - Add credits
- `PATCH /api/admin/users/:id/admin` - `{ is_admin }` - Toggle admin
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/proxies` - All proxies
- `DELETE /api/admin/proxies/:id` - Delete proxy
- `GET /api/admin/domains` - All domains
- `POST /api/admin/domains` - `{ domain }` - Add domain
- `PATCH /api/admin/domains/:id/toggle` - Toggle domain
- `DELETE /api/admin/domains/:id` - Delete domain
- `GET /api/admin/settings` - Get settings
- `POST /api/admin/settings` - `{ key, value }` - Update setting
- `GET /api/admin/credit-history` - Credit transaction log
- `GET /api/admin/activity-log` - Activity log
- `GET /api/admin/stream-requests` - All stream proxy requests (pending + approved)
- `POST /api/admin/proxies/:id/approve-stream` - Approve stream proxy
- `POST /api/admin/proxies/:id/deny-stream` - Deny/revoke stream proxy
- `POST /api/admin/proxies/:id/bandwidth-limit` - `{ limit_mbps }`
- `POST /api/admin/proxies/:id/reset-bandwidth` - Reset counter
- `GET /api/admin/servers` - All proxy servers
- `POST /api/admin/servers` - `{ ip, ssh_port, username, password, country, label, max_connections }`
- `PATCH /api/admin/servers/:id` - `{ country, label, ssh_pass }`
- `GET /api/admin/servers/:id/uptime` - Server uptime, CPU, RAM, Disk via SSH
- `POST /api/admin/servers/:id/check` - Health check
- `POST /api/admin/servers/:id/max-connections` - `{ max }`
- `POST /api/admin/servers/:id/start` - Start Squid via SSH
- `POST /api/admin/servers/:id/stop` - Stop Squid via SSH
- `POST /api/admin/servers/:id/restart` - Restart Squid via SSH
- `POST /api/admin/servers/:id/reboot` - Reboot VPS via SSH
- `DELETE /api/admin/servers/:id` - Delete server
- `GET /api/admin/stats` - Global stats

---

## Database Schema

### users
`id, username, email, password_hash, is_admin, credits, created_at`

### proxies
`id, user_id, subdomain, target_url, country, is_active, requests_count, expires_at, stream_proxy (0/1/2), bandwidth_used, bandwidth_limit, proxy_domain, created_at`

### proxy_servers
`id, ip, port, country, label, max_connections, bandwidth_limit, ssh_port, ssh_user, ssh_pass, status, last_check, created_at`

### domains
`id, domain, is_active, created_at`

### credit_history
`id, user_id, username, amount, balance_after, action, detail, created_at`

### activity_logs
`id, user_id, username, ip_address, module, operation, detail, created_at`

### settings
`key, value` (registration_open)

### request_logs
`id, proxy_id, method, path, status_code, ip_address, created_at`

---

## Server Management

```bash
pm2 status                    # Check status
pm2 logs xproxypass           # View logs
pm2 logs xproxypass --err     # Error logs only
pm2 restart xproxypass        # Restart
pm2 delete all && pm2 start ecosystem.config.js && pm2 save  # Clean restart
```

## Update

```bash
cd /opt/xproxypass
git pull
npm install
cd client && npm install && npm run build && cd ..
pm2 delete all && pm2 start ecosystem.config.js && pm2 save
```

---

## File Structure

```
XProxypass/
  server/
    index.js              # Express server + proxy engine + URL rewriting + stream handling
    config.js             # Environment config (PayPal, domain, JWT)
    database.js           # SQLite schema + all queries + migrations
    auth.js               # JWT middleware
    proxy-pool.js         # (disabled) Free proxy pool from proxifly
    server-setup.js       # SSH auto-install Squid + health check + server commands
    routes/
      auth.routes.js      # Register, login, logout, registration status
      proxy.routes.js     # CRUD proxies, countries, domains, validity, renew, stream request, edit
      stats.routes.js     # User and global statistics
      admin.routes.js     # Admin panel API (users, proxies, servers, streams, domains, settings, SSH commands)
      paypal.routes.js    # PayPal create/capture orders, credit packages
  client/
    src/
      pages/
        Landing.jsx       # Landing page with pricing and stream proxy section
        Login.jsx         # Login page
        Register.jsx      # Register page (with registration closed notice)
        Dashboard.jsx     # User dashboard with credits, proxy management, stream stats
        AddProxy.jsx      # Create proxy form (country with cities, validity, domain selection)
        BuyCredits.jsx    # PayPal credit purchase page
        Admin.jsx         # Admin panel (proxies, users, domains, streams, servers, credits, activity, settings, modals, toast notifications)
      components/
        Navbar.jsx        # Navigation with logo, context-aware links
        Footer.jsx        # Footer with Discord link, Developed by X Project
        ProxyCard.jsx     # Proxy card (edit, renew, stream request, live stats, bandwidth bar)
        FeatureCard.jsx   # Landing feature card
        FAQItem.jsx       # FAQ accordion
        GlassCard.jsx     # Glass card wrapper
  install.sh              # One-command VPS installer
  ecosystem.config.js     # PM2 config
  nginx.conf.template     # Nginx template
  ProxyXPass_logo.png     # Logo
```

---

## License

Private software. Developed by X Project. All rights reserved.
