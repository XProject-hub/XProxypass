# ProxyXPass

Software-based CDN & Reverse Proxy Service. Create proxy endpoints that route traffic through 72+ countries to your backend websites via subdomains.

**Website:** https://proxyxpass.com
**Discord:** https://discord.gg/mg6q9mgA

## How It Works

```
User visits: mysite.proxyxpass.com
    -> Nginx (SSL termination)
    -> ProxyXPass server
    -> Detects subdomain "mysite"
    -> Routes through selected country proxy (if set)
    -> Forwards request to user's backend server
    -> Returns response to visitor
```

## Features

### Reverse Proxy Engine
- Dynamic subdomain routing via `http-proxy`
- HTTP, HTTPS, and WebSocket support
- X-Forwarded-For / X-Real-IP headers for real visitor IP
- Custom 502/404 error pages

### 72+ Country Locations
- Proxy pool with 3000+ proxies from 72 countries
- Auto-updated every 30 minutes from proxifly
- Health-checked and verified proxies
- Own VPS server support - add your own servers via admin panel
- Auto SSH install of Squid proxy on new servers

### Stream Proxy Mode
- URL rewriting for IPTV/Xtream Codes - hides real backend IP in M3U/API responses
- Requires admin approval (high bandwidth feature)
- Per-proxy bandwidth limiting (Mbps)
- Real-time bandwidth monitoring
- Streaming blocked on regular proxies (prevents abuse)
- Custom pricing via Discord contact

### Credit System
- EUR pricing with PayPal integration
- Credit packages: Starter (1 credit/7 EUR), Basic (5/30 EUR), Pro (10/50 EUR), Business (25/100 EUR)
- 1 credit = 1 proxy for 1 month
- Validity options: 1 month (1 credit), 3 months (2), 6 months (4), 12 months (6)
- Proxy renewal - extend duration anytime
- Full credit transaction history

### Admin Panel (sidebar navigation)
- **Proxies** - View/delete all proxies with country, status, expiry, bandwidth, owner
- **Users** - View/delete/create users, toggle admin role, add credits
- **Stream Requests** - Approve/deny stream proxy requests, set bandwidth limits, revoke access
- **Servers** - Add/remove VPS proxy nodes, auto SSH Squid install, health checks
- **Credit History** - Full log of all credit transactions (purchases, usage, admin additions)
- **Activity Log** - All user actions with IP addresses (login, register, proxy CRUD, admin actions)
- **Settings** - Registration open/close toggle
- **Create User** - Admin can manually create accounts with initial credits

### User Dashboard
- Proxy list with status, country, days remaining, bandwidth used
- Add Proxy form with subdomain, target URL, country (72+), validity period
- Buy Credits page with PayPal checkout
- Proxy renewal with validity selection
- Request Stream Proxy mode (requires admin approval)

### Security & Auth
- JWT authentication with httpOnly cookies
- bcrypt password hashing (12 rounds)
- Registration toggle (admin can close/open registration)
- Admin role system
- Rate limiting on stream proxy bandwidth

### Landing Page
- Modern dark theme with glassmorphism design
- Animated hero section with particle background
- Real-time stats from database
- Feature cards, pricing table, how-it-works section
- Stream Proxy pricing section with Discord contact
- FAQ accordion
- ProxyXPass logo and favicon

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express |
| Frontend | React + Tailwind CSS v3 |
| Database | SQLite (better-sqlite3) |
| Proxy Engine | http-proxy + https-proxy-agent |
| Proxy Pool | proxifly (3000+ proxies, 72 countries) |
| Auth | JWT + bcrypt |
| Payments | PayPal REST API v2 |
| SSH | ssh2 (auto server setup) |
| Icons | Lucide React |
| Process Manager | PM2 |
| Web Server | Nginx |
| SSL | Let's Encrypt (Certbot) |

## Installation (Ubuntu 22.04 LTS)

### Prerequisites

1. Fresh Ubuntu 22.04 VPS
2. Domain with DNS configured:
   - `A record`: `yourdomain.com` -> server IP
   - `A record`: `*.yourdomain.com` -> server IP
   - `TXT record`: `_acme-challenge` (for wildcard SSL)

### Install

```bash
git clone https://github.com/XProject-hub/XProxypass.git /opt/xproxypass
cd /opt/xproxypass
sudo bash install.sh
```

The script asks for domain and email, then automatically installs Node.js, Nginx, Certbot, PM2, builds the frontend, and starts the app.

### Wildcard SSL (for subdomains)

```bash
certbot certonly --manual --preferred-challenges dns -d yourdomain.com -d "*.yourdomain.com" --email you@email.com --agree-tos
```

Add the TXT record to DNS, wait for propagation, then confirm.

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

## Usage

### For Users
1. Register at the website
2. Buy credits via PayPal (or request from admin)
3. Dashboard -> Add Proxy
4. Enter: subdomain, backend URL, country, validity period
5. Proxy is live at `subdomain.yourdomain.com`
6. Renew anytime to extend duration
7. Request Stream Proxy mode for IPTV/streaming (requires admin approval)

### For Admins
1. **Admin Panel** - accessible from Dashboard when logged in as admin
2. **Manage Users** - create accounts, add credits, toggle admin, delete
3. **Manage Proxies** - view all, delete, see bandwidth/requests
4. **Stream Requests** - approve/deny, set bandwidth limits (Mbps), revoke
5. **Servers** - add VPS nodes (auto SSH Squid install), health check, delete
6. **Settings** - open/close registration
7. **Credit History** - audit all credit transactions
8. **Activity Log** - monitor all user actions with IPs

### Adding a Proxy Server (VPS node)
1. Buy a VPS in desired country
2. Admin Panel -> Servers -> Add Server
3. Enter: IP, SSH port, username, password, country code
4. System auto-connects via SSH and installs Squid proxy
5. Server status changes to "online" when ready
6. Traffic for that country now routes through your server

## API Reference

### Auth
- `GET /api/auth/registration-status` - Check if registration is open
- `POST /api/auth/register` - `{ username, email, password }`
- `POST /api/auth/login` - `{ email, password }`
- `POST /api/auth/logout`
- `GET /api/auth/me` - Get current user

### Proxies (requires auth)
- `GET /api/proxies` - List user's proxies
- `GET /api/proxies/countries` - Available countries (dynamic from proxy pool)
- `GET /api/proxies/validity-options` - Validity periods with credit costs
- `POST /api/proxies` - `{ subdomain, target_url, country, validity }`
- `POST /api/proxies/:id/renew` - `{ validity }` - Extend proxy duration
- `POST /api/proxies/:id/request-stream` - Request stream proxy mode
- `PATCH /api/proxies/:id/toggle` - Toggle active/paused
- `DELETE /api/proxies/:id` - Delete proxy

### PayPal
- `GET /api/paypal/packages` - Credit packages with EUR prices
- `POST /api/paypal/create-order` - `{ package_id }` - Create PayPal order
- `POST /api/paypal/capture-order` - `{ order_id }` - Capture payment, add credits

### Stats
- `GET /api/stats` - User stats (requires auth)
- `GET /api/stats/global` - Global stats (public)
- `GET /api/proxy-pool/stats` - Proxy pool statistics
- `GET /api/proxy-pool/countries` - Available proxy countries
- `GET /api/connections/:id` - Active connections and bandwidth for a proxy

### Admin (requires admin role)
- `GET /api/admin/users` - All users
- `POST /api/admin/users` - `{ username, email, password, credits }` - Create user
- `GET /api/admin/proxies` - All proxies
- `GET /api/admin/stats` - Global stats
- `GET /api/admin/settings` - Get settings
- `POST /api/admin/settings` - `{ key, value }` - Update setting
- `GET /api/admin/credit-history` - Credit transaction log
- `GET /api/admin/activity-log` - Activity log
- `GET /api/admin/stream-requests` - Pending stream proxy requests
- `GET /api/admin/servers` - All proxy servers
- `POST /api/admin/servers` - `{ ip, ssh_port, username, password, country, label }` - Add server (auto install)
- `POST /api/admin/servers/:id/check` - Health check server
- `DELETE /api/admin/servers/:id` - Delete server
- `POST /api/admin/users/:id/credits` - `{ amount }` - Add credits
- `PATCH /api/admin/users/:id/admin` - `{ is_admin }` - Toggle admin
- `DELETE /api/admin/users/:id` - Delete user
- `DELETE /api/admin/proxies/:id` - Delete proxy
- `POST /api/admin/proxies/:id/approve-stream` - Approve stream proxy
- `POST /api/admin/proxies/:id/deny-stream` - Deny/revoke stream proxy
- `POST /api/admin/proxies/:id/bandwidth-limit` - `{ limit_mbps }` - Set bandwidth limit
- `POST /api/admin/proxies/:id/reset-bandwidth` - Reset bandwidth counter

## Server Management

```bash
pm2 status                    # Check status
pm2 logs xproxypass           # View logs
pm2 restart xproxypass        # Restart
pm2 stop xproxypass           # Stop
```

## Update

```bash
cd /opt/xproxypass
git pull
npm install
cd client && npm install && npm run build && cd ..
pm2 delete xproxypass && pm2 start ecosystem.config.js && pm2 save
```

## File Structure

```
XProxypass/
  server/
    index.js              # Express server + proxy engine + stream blocking
    config.js             # Environment config (PayPal, domain, JWT)
    database.js           # SQLite schema + all queries
    auth.js               # JWT middleware
    proxy-pool.js         # Proxifly integration + health checks
    server-setup.js       # SSH auto-install Squid on VPS
    routes/
      auth.routes.js      # Register, login, logout, registration status
      proxy.routes.js     # CRUD proxies, countries, validity, renew, stream request
      stats.routes.js     # User and global statistics
      admin.routes.js     # Admin panel API (users, proxies, servers, streams, settings)
      paypal.routes.js    # PayPal create/capture orders, credit packages
  client/
    src/
      pages/
        Landing.jsx       # Landing page with pricing and stream proxy section
        Login.jsx         # Login page
        Register.jsx      # Register page (with registration closed notice)
        Dashboard.jsx     # User dashboard with credits and proxy management
        AddProxy.jsx      # Create proxy form (country, validity)
        BuyCredits.jsx    # PayPal credit purchase page
        Admin.jsx         # Admin panel (proxies, users, streams, servers, credits, activity, settings)
      components/
        Navbar.jsx        # Navigation with logo
        Footer.jsx        # Footer with Discord link
        ProxyCard.jsx     # Proxy card (renew, stream request, bandwidth)
        FeatureCard.jsx   # Landing feature card
        FAQItem.jsx       # FAQ accordion
        GlassCard.jsx     # Glass card wrapper
  install.sh              # One-command VPS installer
  ecosystem.config.js     # PM2 config
  nginx.conf.template     # Nginx template
  ProxyXPass_logo.png     # Logo
```

## License

Private software. All rights reserved.
