const express = require('express');
const http = require('http');
const httpProxy = require('http-proxy');
const { HttpsProxyAgent } = require('https-proxy-agent');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const db = require('./database');
const proxyPool = require('./proxy-pool');
const authRoutes = require('./routes/auth.routes');
const proxyRoutes = require('./routes/proxy.routes');
const statsRoutes = require('./routes/stats.routes');
const adminRoutes = require('./routes/admin.routes');
const paypalRoutes = require('./routes/paypal.routes');

const app = express();
const proxy = httpProxy.createProxyServer({ xfwd: true });

proxyPool.init();

const ERROR_PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Backend Unavailable - ProxyXPass</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#06060a;color:#f1f5f9;font-family:'Inter',system-ui,-apple-system,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{text-align:center;padding:2rem}
h1{font-size:6rem;font-weight:800;background:linear-gradient(135deg,#06b6d4,#3b82f6);
-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
p{color:#94a3b8;font-size:1.1rem;margin-top:1rem}
.s{margin-top:3rem;font-size:.85rem;opacity:.4}
</style></head>
<body><div class="c"><h1>502</h1><p>The backend server is currently unavailable.</p>
<p class="s">Powered by ProxyXPass</p></div></body></html>`;

const NOT_FOUND_PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not Found - ProxyXPass</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#06060a;color:#f1f5f9;font-family:'Inter',system-ui,-apple-system,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{text-align:center;padding:2rem}
h1{font-size:6rem;font-weight:800;background:linear-gradient(135deg,#06b6d4,#3b82f6);
-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
p{color:#94a3b8;font-size:1.1rem;margin-top:1rem}
.s{margin-top:3rem;font-size:.85rem;opacity:.4}
</style></head>
<body><div class="c"><h1>404</h1><p>This proxy service does not exist or has been disabled.</p>
<p class="s">Powered by ProxyXPass</p></div></body></html>`;

proxy.on('error', (err, req, res) => {
  if (res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'text/html' });
    res.end(ERROR_PAGE);
  }
});

function getSubdomain(hostname) {
  if (!hostname) return null;
  const main = config.domain;
  if (hostname === main) return null;
  if (hostname.endsWith('.' + main)) {
    return hostname.slice(0, -(main.length + 1));
  }
  return null;
}

function getProxyAgent(country) {
  if (!country || country === 'auto') return undefined;
  const upstream = proxyPool.getRandomProxy(country);
  if (!upstream) return undefined;
  try {
    return new HttpsProxyAgent(upstream.url);
  } catch {
    return undefined;
  }
}

app.set('trust proxy', true);
app.use(cookieParser());
app.use(express.json());
app.use(morgan('short'));
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use((req, res, next) => {
  const subdomain = getSubdomain(req.hostname);

  if (subdomain) {
    const record = db.getProxyBySubdomain(subdomain);
    if (!record || !record.is_active || (record.expires_at && new Date(record.expires_at) < new Date())) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end(NOT_FOUND_PAGE);
    }

    db.incrementRequests(record.id);

    const agent = getProxyAgent(record.country);
    const proxyOptions = {
      target: record.target_url,
      changeOrigin: true,
    };
    if (agent) proxyOptions.agent = agent;

    return proxy.web(req, res, proxyOptions);
  }

  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/proxies', proxyRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/paypal', paypalRoutes);

app.get('/api/proxy-pool/stats', (req, res) => {
  res.json(proxyPool.getStats());
});

app.get('/api/proxy-pool/countries', (req, res) => {
  res.json({ countries: proxyPool.getAvailableCountries() });
});

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  const host = (req.headers.host || '').split(':')[0];
  const subdomain = getSubdomain(host);

  if (subdomain) {
    const record = db.getProxyBySubdomain(subdomain);
    if (record && record.is_active && !(record.expires_at && new Date(record.expires_at) < new Date())) {
      const agent = getProxyAgent(record.country);
      const opts = { target: record.target_url, changeOrigin: true };
      if (agent) opts.agent = agent;
      proxy.ws(req, socket, head, opts);
      return;
    }
  }
  socket.destroy();
});

server.listen(config.port, () => {
  console.log(`[ProxyXPass] Server running on port ${config.port}`);
  console.log(`[ProxyXPass] Domain: ${config.domain}`);
  console.log(`[ProxyXPass] Environment: ${config.nodeEnv}`);
});
