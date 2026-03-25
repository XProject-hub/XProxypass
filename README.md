# ProxyXPass

**Software-based CDN & Reverse Proxy Service with IPTV Streaming**

Create proxy endpoints that route traffic through your own VPS servers to backend websites via subdomains. Full URL rewriting hides real server IPs. Built for web proxying, IPTV/Xtream Codes stream proxying, and reseller infrastructure.

**Website:** https://proxyxpass.com
**Discord:** https://discord.gg/mg6q9mgA
**Developed by:** X Project

---

## Changelog (v2.1 - March 2026)

### Security
- **Squid Proxy Locked Down** - Squid on VPS nodes now only accepts connections from the master server IP and localhost. Previously it was open to all (`acl all src 0.0.0.0/0`), allowing anyone to abuse VPS nodes as open proxies. ACL is auto-configured during install using master domain DNS resolution or SSH client IP fallback.
- **Secure Squid Button** - Admin panel Servers tab now has a shield icon to instantly lock down Squid on existing VPS servers without reinstalling. Rewrites squid.conf via SSH and restarts Squid.
- **HSTS SubDomain Fix** - Helmet HSTS header no longer includes `includeSubDomains`, preventing browsers from forcing HTTPS on VPS-hosted subdomains that use self-signed certificates.

### Streaming
- **VLC Tokenized Stream Fix** - Token stream handler now forwards client headers (Range, Accept, User-Agent, Accept-Encoding, If-Range, If-Modified-Since, Connection) to the origin server. VLC and IPTV players require Range headers for proper playback and 206 Partial Content responses.
- **Token Streams Route Through VPS** - When a proxy has a country set and Cloudflare DNS is configured, token URLs now use the proxy subdomain (e.g., `http://sub.domain.com/stream/TOKEN`) instead of the master domain. Traffic goes directly Client → VPS Node Agent → Origin, so bandwidth is consumed on the VPS only, not the master server.
- **Node Agent Token Handler** - VPS node agents now handle `/stream/TOKEN` routes. The node agent validates tokens with the master via `POST /api/node/validate-token`, receives the constructed target URL with credentials injected, and streams directly from the origin.
- **Redirect Fix for All Proxies** - Origin 301/302/307/308 redirects are now followed server-side for ALL proxy types, not just stream proxies. Previously DNS-only proxies passed redirects to the client, which broke IPTV backends that redirect to CDNs or load balancers.

### Admin Panel
- **Password Change** - Admins can now change any user's or reseller's password. Key icon button in the Users tab opens a password change modal. Minimum 6 characters, bcrypt hashed with 12 rounds. Logged to activity log.
- **VPS Active Users Fix** - Servers tab now shows actual active connections on VPS nodes. Previously only displayed master-side connections; now merges node-reported connections (`node_{id}_conns` from report-stats) into the server connections data.
- **Live Req/s Fix** - Requests per second counter no longer shows 0. The 1-second reset interval now captures a snapshot before clearing, so the 2-second Socket.IO broadcast always has the last known good value.
- **Live Mbps Fix** - Same snapshot approach for bandwidth per second. The live dashboard Mbps indicator no longer flickers to 0 between broadcast intervals.

### API
- `PATCH /api/admin/users/:id/password` - Admin change user password
- `POST /api/admin/servers/:id/secure-squid` - Lock Squid ACL to master IP
- `POST /api/node/validate-token` - Node agent token validation (returns target URL with credentials)

### VPS Node Agent
- Token stream handling with full credential injection, URL rewriting, header forwarding
- M3U URL rewriting for token streams (strips credentials from URLs, rewrites to token base URL)
- Xtream Codes `server_info` JSON rewriting on token responses
- `headersSent` guards to prevent double writeHead crashes
- Bandwidth tracking and stats reporting for token streams

### Manual Node Install
- `manual-node-install.sh` now resolves master IP and locks Squid ACL automatically

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

### DNS Proxy (Regular Web)
- User creates proxy: `mysite.proxyxpass.com` -> `https://backend.com`
- All URLs in HTML/JS/CSS responses rewritten to proxy domain
- Location headers, Set-Cookie domains, base tags rewritten
- CSP/HSTS headers removed to prevent blocking
- Gzip/Brotli responses decompressed before rewriting
- 50 Mbps auto bandwidth limit
- Streaming content blocked (requires Stream Proxy mode)

### Stream Proxy (IPTV/Streaming)
- Gbps speed plans: 1-50 Gbps with fair use or dedicated bandwidth
- Full URL rewriting including M3U playlists and Xtream Codes API responses
- Line-by-line M3U parser with port preservation and catchup/EPG URL rewriting
- Xtream Codes `server_info` JSON rewriting (url, port fields)
- HLS .ts segment proxy with redirect following (302/307)
- Internal redirect following for stream URLs
- Per-proxy speed limiting (Gbps plan enforcement)
- Real-time bandwidth tracking
- Token-based stream authentication with expiry

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
- Custom 502/404 error pages

### IPTV / Xtream Codes Support
- M3U playlist URL rewriting with line-by-line parser
- Port preservation in M3U URLs (e.g., :8080, :25461)
- Catchup/EPG URL rewriting (`catchup-source`, `tvg-url`, `url-epg`)
- Multi-server rewriting (multiple backend servers in one M3U)
- `player_api.php` server_info rewriting (url, port fields)
- `get.php` M3U response rewriting
- Internal redirect following for stream URLs (302/307)
- HLS .ts segment proxy with redirect following
- Channel logos preserved (CDN domains excluded from rewriting)
- Works with Smarters Pro, TiviMate, XCIPTV, VLC, GSE Smart
- Support for Xtream Codes API login format (server:port + username/password)

### Gbps Streaming Plans
- **Streaming Plans** (fair use): 1-50 Gbps with burst support
- **Enterprise Plans** (dedicated): 1-50 Gbps, no throttling, priority routing
- Speed enforcement per-proxy via `bandwidthPerSecond` 1-second rolling window
- PayPal subscription (auto-renewing monthly)
- Crypto payment via NOWPayments (one-time for 1 month)
- Admin-configurable plan pricing from admin panel

### Token Authentication for Streams
- Generate time-limited tokens for stream access
- URL format: `http://subdomain.domain.com/stream/TOKEN` (routes to VPS when country set)
- Fallback: `http://domain.com/stream/TOKEN` (routes to master when country=auto)
- Token expiry enforcement
- IP lock compatible
- IPTV credential injection (username/password encrypted AES-256-CBC)
- Bandwidth and speed limit enforcement on token routes
- VLC/IPTV player compatible (Range, Accept, User-Agent headers forwarded)

### IP Lock
- User locks proxy to their current IP address
- All non-matching IPs get 403 (HTTP, WebSocket, and token routes)
- Set/remove from user dashboard
- Enforced on master server and node agents

### VPS Server Management
- Add your own VPS servers as proxy nodes
- Auto SSH install of Squid proxy + Node Agent on new servers
- Both Squid (port 3128) and Node Agent (port 3000) deployed together
- Squid ACL restricted to master server IP + localhost (auto-configured)
- Secure Squid button in admin panel to lock down existing servers
- Server controls via SSH: Start, Stop, Restart Squid, Reboot VPS
- Auto health check every 3 minutes (TCP check with retry)
- Real-time server monitoring: CPU, RAM, Disk usage, uptime
- Max connections limit per server (load balancing)
- Load balancing across multiple servers in same country

### Multi-Port Support
- Nginx listens on ports: 80, 443, 25461, 8080, 8880, 8443, 1935, 8000-8082, 9981-9982
- IPTV apps can connect using original port (e.g., `proxyxpass.com:25461`)
- SSL on port 443, non-SSL on all other ports

### Payment System
- **PayPal** - Credit packages (one-time) + Subscription plans (monthly auto-renew)
- **Crypto** - NOWPayments integration: BTC, ETH, USDT (TRC20) + 300 cryptocurrencies
- Credit packages: Starter (1/7EUR), Basic (5/30EUR), Pro (10/50EUR), Business (25/100EUR)
- Streaming plans: 1-50 Gbps (99-2799 EUR/month)
- Enterprise plans: 1-50 Gbps (249-6999 EUR/month)
- IPN webhook for crypto with HMAC-SHA512 verification
- PayPal webhook for subscription lifecycle events

### Reseller System
- Reseller role with sub-user management
- Gbps pool allocation: buy pool (5-50 Gbps), distribute to sub-users
- Reseller pools: 5 Gbps (399 EUR), 10 Gbps (699 EUR), 20 Gbps (1199 EUR), 50 Gbps (2499 EUR)
- Sub-user creation with credit transfer from reseller balance
- Stream proxy approval/denial for sub-users
- Per-proxy speed allocation from pool
- Bandwidth limit management
- Reseller statistics dashboard
- Auto-role assignment on reseller plan purchase

### Credit System
- EUR pricing with PayPal + Crypto
- Validity options: 1 month (1 credit), 3 months (2), 6 months (4), 12 months (6)
- Proxy renewal - extend duration, time added on top of remaining
- Admin gives credits manually or user buys
- Admin exempt from credit charges
- Full credit transaction history log

### Admin Panel (sidebar navigation)
- **Proxies** - All proxies with subdomain, target, owner, live connections, bandwidth used, requests, status (auto-refresh 5s)
- **Users** - All users, create user manually, add credits, change password, role dropdown (user/reseller/admin), delete
- **Domains** - Add/remove/toggle proxy domains, multi-domain support
- **Streams** - Stream proxy requests: approve/deny/revoke, bandwidth limit, used bandwidth
- **Servers** - VPS management: add/edit/delete, Start/Stop/Restart/Reboot via SSH, Secure Squid, health check, uptime, CPU/RAM/Disk (auto-refresh 10s)
- **Plans** - Stream plan CRUD (create/edit/toggle/delete), subscription overview with cancel
- **Credits** - Full credit transaction history
- **Activity** - All user actions with IP addresses
- **Live Dashboard** - Real-time WebSocket: Active users, Bandwidth Mbps, Requests/sec
- **Registration toggle** - Open/close registration

### User Dashboard
- Proxy list with status, country, days remaining, stream badge
- Real-time stream stats (connections, Mbps, total used) for stream proxies
- Gbps plan speed bar with percentage
- Edit proxy: subdomain, target URL, country
- IP lock set/remove
- Stream token generation
- Plans & Credits page: PayPal + Crypto for credits and streaming plans
- Proxy renewal with validity selection
- Request Stream Proxy mode

### Reseller Panel
- Sub-Users tab: create, give credits, delete
- Proxies tab: view all sub-user proxies with stats
- Streams tab: approve/deny stream requests, bandwidth limits
- Gbps Pool tab: total/allocated/available, per-proxy speed allocation
- Stats tab: aggregate usage with pool info

### Live WebSocket Dashboard
- Real-time stats via socket.io: Active users, Bandwidth Mbps, Requests/sec
- Per-proxy live bandwidth and connections
- Admin and reseller access (JWT cookie auth)
- 2-second update interval

### Multi-Domain Support
- Admin adds domains through admin panel
- Users choose domain when creating proxy
- Each domain needs DNS A + wildcard A record + SSL certificate

### Security & Auth
- JWT authentication with httpOnly cookies
- bcrypt password hashing (12 rounds)
- Registration toggle (admin can close/open)
- Admin, Reseller, User role system
- Stream proxy requires admin/reseller approval
- IP lock per-proxy
- Token-based stream access with expiry
- IPN webhook HMAC-SHA512 verification

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express 5 |
| Frontend | React 19 + Tailwind CSS v3 |
| Database | SQLite (better-sqlite3, WAL mode) |
| Proxy Engine | http-proxy + https-proxy-agent v5 |
| URL Rewriting | Custom string replacement + line-by-line M3U parser |
| Decompression | Node.js zlib (gzip, deflate, brotli) |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Payments | PayPal REST API v2 (orders + subscriptions) |
| Crypto Payments | NOWPayments API (BTC, ETH, USDT + 300 coins) |
| SSH | ssh2 (server setup + management) |
| Proxy Servers | Squid proxy + Node Agent on VPS nodes |
| WebSocket | socket.io (live dashboard) |
| Icons | Lucide React |
| Process Manager | PM2 (cluster mode) |
| Web Server | Nginx (SSL + multi-port) |
| SSL | Let's Encrypt (Certbot, wildcard) |
| DNS | Cloudflare API (optional auto-management) |

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

### Environment Variables

Create `/opt/xproxypass/.env`:
```
PORT=3000
DOMAIN=yourdomain.com
NODE_ENV=production
JWT_SECRET=your-random-secret-string
JWT_EXPIRY=7d
NODE_SECRET=your-node-agent-secret

# PayPal
PAYPAL_CLIENT_ID=your-client-id
PAYPAL_SECRET=your-secret
PAYPAL_SANDBOX=false
PAYPAL_WEBHOOK_ID=your-webhook-id

# Cloudflare DNS (optional)
CLOUDFLARE_TOKEN=
CLOUDFLARE_ZONE_ID=

# NOWPayments Crypto
NOWPAYMENTS_API_KEY=your-api-key
NOWPAYMENTS_IPN_SECRET=your-ipn-secret
```

### Make First Admin

1. Register at `https://yourdomain.com/register`
2. Run on server:
```bash
cd /opt/xproxypass
node -e "const db = require('./server/database'); db.setAdmin(1, 1); console.log('Done');"
```

---

## API Reference

### Auth
- `GET /api/auth/registration-status`
- `POST /api/auth/register` - `{ username, email, password }`
- `POST /api/auth/login` - `{ email, password }`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Proxies (requires auth)
- `GET /api/proxies` - List user's proxies
- `GET /api/proxies/countries` - Available countries
- `GET /api/proxies/domains` - Available proxy domains
- `GET /api/proxies/validity-options` - Validity periods with costs
- `POST /api/proxies` - Create proxy
- `PATCH /api/proxies/:id/edit` - Edit proxy
- `POST /api/proxies/:id/renew` - Renew proxy
- `POST /api/proxies/:id/request-stream` - Request stream mode
- `PATCH /api/proxies/:id/toggle` - Toggle active/paused
- `DELETE /api/proxies/:id` - Delete proxy
- `POST /api/proxies/:id/ip-lock` - Set IP lock
- `DELETE /api/proxies/:id/ip-lock` - Remove IP lock
- `POST /api/proxies/:id/generate-token` - Generate stream token
- `GET /api/proxies/:id/tokens` - List tokens
- `DELETE /api/proxies/:id/tokens/:tokenId` - Revoke token

### Payments
- `GET /api/paypal/packages` - Credit packages
- `POST /api/paypal/create-order` - PayPal credit purchase
- `POST /api/paypal/capture-order` - Capture PayPal order
- `GET /api/paypal/stream-plans` - Streaming/Enterprise/Reseller plans
- `POST /api/paypal/create-subscription` - PayPal subscription
- `POST /api/paypal/activate-subscription` - Activate subscription
- `POST /api/paypal/cancel-subscription` - Cancel subscription
- `GET /api/paypal/my-subscription` - Active subscription
- `POST /api/crypto/create-invoice` - Crypto credit purchase
- `POST /api/crypto/create-subscription-invoice` - Crypto plan purchase
- `POST /api/crypto/ipn` - NOWPayments IPN webhook
- `GET /api/crypto/payment-status/:orderId` - Check crypto payment
- `GET /api/crypto/my-payments` - Crypto payment history

### Reseller (requires reseller role)
- `GET /api/reseller/users` - Sub-users
- `POST /api/reseller/users` - Create sub-user
- `POST /api/reseller/users/:id/credits` - Transfer credits
- `DELETE /api/reseller/users/:id` - Delete sub-user
- `GET /api/reseller/proxies` - Sub-user proxies
- `GET /api/reseller/stream-requests` - Stream requests
- `POST /api/reseller/proxies/:id/approve-stream` - Approve stream
- `POST /api/reseller/proxies/:id/deny-stream` - Deny stream
- `POST /api/reseller/proxies/:id/bandwidth-limit` - Set bandwidth limit
- `POST /api/reseller/proxies/:id/allocate-speed` - Allocate Gbps from pool
- `GET /api/reseller/pool` - Pool status
- `GET /api/reseller/stats` - Reseller stats

### Admin (requires admin role)
- `GET /api/admin/users` - All users
- `POST /api/admin/users` - Create user
- `POST /api/admin/users/:id/credits` - Add credits
- `PATCH /api/admin/users/:id/role` - Change role (user/reseller/admin)
- `POST /api/admin/users/:id/reseller-limits` - Set reseller limits
- `PATCH /api/admin/users/:id/password` - Change password
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/proxies` - All proxies
- `DELETE /api/admin/proxies/:id` - Delete proxy
- `GET /api/admin/stream-plans` - All plans
- `POST /api/admin/stream-plans` - Create plan
- `PATCH /api/admin/stream-plans/:id` - Edit plan
- `DELETE /api/admin/stream-plans/:id` - Delete plan
- `GET /api/admin/subscriptions` - All subscriptions
- `POST /api/admin/subscriptions/:id/cancel` - Cancel subscription
- `POST /api/admin/servers/:id/secure-squid` - Lock Squid ACL to master IP
- Server management, domain management, settings, credits, activity endpoints

### Stream Token Access
- `GET /stream/:token` - Access stream via token (M3U download)
- `GET /stream/:token/*path` - Stream content via token (video/audio)

### Live Stats
- `GET /api/connections/:id` - Active connections for proxy
- `GET /api/server-connections` - Server connection counts
- `GET /api/live-stats` - Global live stats (active, bandwidth, req/s)
- WebSocket `ws://` path `/ws` - Real-time dashboard events

---

## Database Schema

### users
`id, username, email, password_hash, is_admin, credits, role, parent_id, max_proxies, max_users, max_bandwidth, gbps_pool, gbps_allocated, created_at`

### proxies
`id, user_id, subdomain, target_url, country, is_active, requests_count, expires_at, stream_proxy, bandwidth_used, bandwidth_limit, proxy_domain, ip_lock, speed_limit_mbps, created_at`

### proxy_servers
`id, ip, port, country, label, max_connections, bandwidth_limit, ssh_port, ssh_user, ssh_pass, status, last_check, created_at`

### stream_plans
`id, name, type, speed_mbps, price_eur, is_active, description, paypal_plan_id, created_at`

### subscriptions
`id, user_id, plan_id, paypal_subscription_id, status, speed_mbps, plan_type, started_at, expires_at, created_at`

### stream_tokens
`id, token, proxy_id, expires_at, created_at`

### crypto_payments
`id, user_id, nowpayments_id, invoice_id, type, package_id, plan_id, amount_eur, status, pay_currency, pay_amount, order_id, created_at`

### domains
`id, domain, is_active, created_at`

### credit_history
`id, user_id, username, amount, balance_after, action, detail, created_at`

### activity_logs
`id, user_id, username, ip_address, module, operation, detail, created_at`

### settings
`key, value` (registration_open)

---

## File Structure

```
XProxypass/
  server/
    index.js              # Express server + proxy engine + WebSocket dashboard + stream token route
    config.js             # Environment config
    database.js           # SQLite schema + queries + migrations + plan seeding
    auth.js               # JWT middleware
    node-agent.js         # Deployable agent for VPS nodes (proxy + speed enforcement)
    server-setup.js       # SSH auto-install Squid + Node Agent + health check
    dns-manager.js        # Cloudflare DNS auto-management
    routes/
      auth.routes.js      # Register, login, logout
      proxy.routes.js     # CRUD proxies, IP lock, stream tokens
      stats.routes.js     # User and global statistics
      admin.routes.js     # Admin panel API (users, proxies, servers, plans, subscriptions)
      paypal.routes.js    # PayPal orders + subscriptions + webhooks + plan sync
      crypto.routes.js    # NOWPayments crypto invoices + IPN webhook
      node.routes.js      # Node agent validation + stats reporting
      reseller.routes.js  # Reseller sub-user + pool management
  client/
    src/
      pages/
        Landing.jsx       # Landing page with pricing (DNS, Streaming, Enterprise, Reseller)
        Login.jsx         # Login page
        Register.jsx      # Register page
        Dashboard.jsx     # User dashboard with proxy management
        AddProxy.jsx      # Create proxy form
        BuyCredits.jsx    # Plans & Credits (PayPal + Crypto for credits and plans)
        Admin.jsx         # Admin panel (8 tabs + live stats bar)
        Reseller.jsx      # Reseller panel (5 tabs including Gbps pool)
      components/
        Navbar.jsx        # Navigation
        Footer.jsx        # Footer
        ProxyCard.jsx     # Proxy card with live stats, speed bar, edit, tokens
        FeatureCard.jsx   # Landing feature card
        FAQItem.jsx       # FAQ accordion
        GlassCard.jsx     # Glass card wrapper
  install.sh              # One-command VPS installer
  ecosystem.config.js     # PM2 config
  nginx.conf.template     # Nginx template
```

---

## Server Management

```bash
pm2 status                    # Check status
pm2 logs xproxypass           # View logs
pm2 restart xproxypass        # Restart
pm2 delete all && pm2 start ecosystem.config.js && pm2 save  # Clean restart
```

## Update

### Master Server
```bash
cd /opt/xproxypass
git pull origin main
npm install --prefix client
npm run build --prefix client
pm2 restart all
```

### VPS Node Agent
```bash
cd /opt/proxyxpass-node
curl -sL https://yourdomain.com/api/node/agent-script -H 'X-Node-Secret: YOUR_NODE_SECRET' -o node-agent.js
pm2 restart proxyxpass-node
```
Note: Use single quotes for the `-H` header if your NODE_SECRET contains `!` characters (bash history expansion).

---

## License

Private software. Developed by X Project. All rights reserved.
