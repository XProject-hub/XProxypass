# ProxyXPass

Software-based CDN & Reverse Proxy Service. Users create proxy endpoints that route traffic through your server to their backend websites via subdomains.

## How It Works

```
User visits: mysite.yourdomain.com
    -> Nginx (SSL termination)
    -> ProxyXPass server (port 3000)
    -> Detects subdomain "mysite"
    -> Looks up target URL in database
    -> Forwards request to user's backend (e.g. https://actual-site.com)
    -> Returns response to visitor
```

Users register, get credits from admin, then create proxy services. Each proxy gets a subdomain (e.g. `mysite.yourdomain.com`) that routes to their backend URL.

## Features

- **Reverse Proxy Engine** - Dynamic subdomain routing via `http-proxy`
- **Country Selection** - Users pick a location when creating a proxy (US, UK, DE, NL, FR, CA, SG, AU, JP, BR, IN)
- **Credit System** - 1 credit = 1 proxy. Admin gives credits to users
- **Expiration Dates** - Proxies can have optional expiry dates
- **WebSocket Support** - Full WebSocket proxying for real-time apps
- **X-Forwarded-For** - Real visitor IP forwarded to backend
- **Admin Panel** with sidebar navigation:
  - **Proxies** - View/delete all proxies, see country, status, expiry
  - **Users** - View/delete users, toggle admin role, add credits
  - **Credit History** - Full log of all credit transactions
  - **Activity Log** - All user actions (login, register, proxy create/delete)
- **Dark Theme UI** - Modern glassmorphism design with Tailwind CSS
- **One-command install** - `sudo bash install.sh` on Ubuntu 22.04

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express |
| Frontend | React + Tailwind CSS v3 |
| Database | SQLite (better-sqlite3) |
| Proxy | http-proxy |
| Auth | JWT + bcrypt |
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

### Install

```bash
git clone https://github.com/XProject-hub/XProxypass.git /opt/xproxypass
cd /opt/xproxypass
sudo bash install.sh
```

The script will ask for your domain and email, then automatically install everything.

### Make First Admin

1. Go to `https://yourdomain.com/register` and create an account
2. On the server, run:

```bash
cd /opt/xproxypass
node -e "const db = require('./server/database'); db.setAdmin(1, 1); console.log('Done');"
```

This makes user ID 1 (first registered user) an admin.

## Usage

### For Users

1. Register at `https://yourdomain.com/register`
2. Ask admin for credits
3. Go to Dashboard -> Add Proxy
4. Enter: subdomain, backend URL, country, expiration date
5. Proxy is live at `subdomain.yourdomain.com`

### For Admins

1. Login and go to Dashboard -> Admin Panel
2. **Give credits**: Users tab -> click credit card icon -> enter amount
3. **View all proxies**: Proxies tab (with country, status, expiry, owner)
4. **Credit History**: See all credit transactions
5. **Activity Log**: See all user actions with IP addresses
6. **Manage users**: Toggle admin role, delete users

## API Reference

### Auth
- `POST /api/auth/register` - `{ username, email, password }`
- `POST /api/auth/login` - `{ email, password }`
- `POST /api/auth/logout`
- `GET /api/auth/me` - Get current user

### Proxies (requires auth)
- `GET /api/proxies` - List user's proxies
- `GET /api/proxies/countries` - Get available countries
- `POST /api/proxies` - `{ subdomain, target_url, country, expires_at }`
- `PATCH /api/proxies/:id/toggle` - Toggle active/paused
- `DELETE /api/proxies/:id` - Delete proxy

### Stats
- `GET /api/stats` - User stats (requires auth)
- `GET /api/stats/global` - Global stats (public)

### Admin (requires admin)
- `GET /api/admin/users` - All users
- `GET /api/admin/proxies` - All proxies
- `GET /api/admin/stats` - Global stats
- `GET /api/admin/credit-history` - Credit transaction log
- `GET /api/admin/activity-log` - Activity log
- `POST /api/admin/users/:id/credits` - `{ amount }` - Add credits
- `PATCH /api/admin/users/:id/admin` - `{ is_admin }` - Toggle admin
- `DELETE /api/admin/users/:id` - Delete user
- `DELETE /api/admin/proxies/:id` - Delete proxy

## Server Management

```bash
pm2 status                    # Check if running
pm2 logs xproxypass           # View logs
pm2 restart xproxypass        # Restart
pm2 stop xproxypass           # Stop
```

## Update

```bash
cd /opt/xproxypass
git pull
npm install
cd client && npm install && npm run build
cd ..
pm2 restart xproxypass
```

## File Structure

```
XProxypass/
  server/
    index.js              # Express server + proxy engine
    config.js             # Environment config
    database.js           # SQLite schema + queries
    auth.js               # JWT middleware
    routes/
      auth.routes.js      # Register, login, logout
      proxy.routes.js     # CRUD proxies + country
      stats.routes.js     # Statistics
      admin.routes.js     # Admin panel API
  client/
    src/
      pages/
        Landing.jsx       # Landing page
        Login.jsx         # Login
        Register.jsx      # Register
        Dashboard.jsx     # User dashboard
        AddProxy.jsx      # Create proxy form
        Admin.jsx         # Admin panel
      components/
        Navbar.jsx        # Navigation bar
        Footer.jsx        # Footer
        ProxyCard.jsx     # Proxy display card
        FeatureCard.jsx   # Landing feature card
        FAQItem.jsx       # FAQ accordion
        GlassCard.jsx     # Glass card wrapper
        StatsCard.jsx     # Animated stat counter
  install.sh              # VPS installer
  ecosystem.config.js     # PM2 config
  nginx.conf.template     # Nginx template
```
