const express = require('express');
const http = require('http');
const httpProxy = require('http-proxy');
let HttpsProxyAgent;
try {
  HttpsProxyAgent = require('https-proxy-agent');
  if (HttpsProxyAgent.HttpsProxyAgent) HttpsProxyAgent = HttpsProxyAgent.HttpsProxyAgent;
} catch {}
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
    return { subdomain: hostname.slice(0, -(main.length + 1)), domain: main };
  }

  try {
    const domains = db.getActiveDomains();
    for (const d of domains) {
      if (hostname === d.domain) return null;
      if (hostname.endsWith('.' + d.domain)) {
        return { subdomain: hostname.slice(0, -(d.domain.length + 1)), domain: d.domain };
      }
    }
  } catch {}

  return null;
}

function getProxyAgent(country) {
  if (!country || country === 'auto') return undefined;

  const ownServers = db.getServersByCountry(country.toUpperCase());
  if (ownServers.length > 0) {
    const server = ownServers[Math.floor(Math.random() * ownServers.length)];
    try {
      if (HttpsProxyAgent) return new HttpsProxyAgent(`http://${server.ip}:${server.port}`);
    } catch {}
  }

  if (!HttpsProxyAgent) return undefined;
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

const activeConnections = {};
const bandwidthPerSecond = {};

const STREAM_EXTENSIONS = /\.(ts|m3u8|m3u|mpd|mp4|mkv|avi|flv|wmv|mov|webm|mpg|mpeg)(\?|$)/i;
const STREAM_CONTENT_TYPES = /(video|audio|mpegurl|octet-stream|x-mpegURL|mp2t)/i;

function isStreamRequest(req) {
  const url = req.url || '';
  const accept = req.headers?.accept || '';
  if (STREAM_EXTENSIONS.test(url)) return true;
  if (url.includes('/live/') || url.includes('/movie/') || url.includes('/series/')) return true;
  if (STREAM_CONTENT_TYPES.test(accept)) return true;
  return false;
}

function checkBandwidthLimit(proxyId, limitMbps) {
  if (!limitMbps || limitMbps <= 0) return true;
  const currentBps = bandwidthPerSecond[proxyId] || 0;
  const limitBps = limitMbps * 125000;
  return currentBps < limitBps;
}

setInterval(() => {
  for (const id in bandwidthPerSecond) {
    bandwidthPerSecond[id] = 0;
  }
}, 1000);

app.use((req, res, next) => {
  const result = getSubdomain(req.hostname);

  if (result) {
    const { subdomain, domain } = result;
    const record = db.getProxyBySubdomain(subdomain);
    if (!record || !record.is_active || (record.expires_at && new Date(record.expires_at) < new Date())) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end(NOT_FOUND_PAGE);
    }

    const DNS_BW_LIMIT_MBPS = 50;

    if (record.stream_proxy !== 2 && isStreamRequest(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Streaming is not enabled for this proxy. Contact admin to enable Stream Proxy mode.' }));
    }

    if (record.stream_proxy === 2 && record.bandwidth_limit > 0) {
      if (!checkBandwidthLimit(record.id, record.bandwidth_limit)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Bandwidth limit exceeded.' }));
      }
    }

    if (record.stream_proxy !== 2) {
      if (!checkBandwidthLimit(record.id, DNS_BW_LIMIT_MBPS)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Bandwidth limit exceeded. This proxy is using too much traffic.' }));
      }
    }

    db.incrementRequests(record.id);

    if (!activeConnections[record.id]) activeConnections[record.id] = 0;
    activeConnections[record.id]++;
    res.on('close', () => { if (activeConnections[record.id] > 0) activeConnections[record.id]--; });

    const agent = getProxyAgent(record.country);
    const proxyHost = `${subdomain}.${record.proxy_domain || domain || config.domain}`;
    const proxyOptions = {
      target: record.target_url,
      changeOrigin: true,
      selfHandleResponse: true,
    };
    if (agent) proxyOptions.agent = agent;

    proxy.once('proxyRes', (proxyRes, _req, _res) => {
      const contentType = proxyRes.headers['content-type'] || '';
      let targetHost, targetOrigin;
      try {
        const targetUrl = new URL(record.target_url);
        targetHost = targetUrl.host;
        targetOrigin = targetUrl.origin;
      } catch { targetHost = ''; targetOrigin = ''; }

      const escHost = targetHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escOrigin = targetOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      function rewriteUrl(str) {
        if (!str || !targetHost) return str;
        str = str.replace(new RegExp(escOrigin, 'g'), `https://${proxyHost}`);
        str = str.replace(new RegExp(`http://${escHost}`, 'g'), `https://${proxyHost}`);
        str = str.replace(new RegExp(escHost, 'g'), proxyHost);
        return str;
      }

      const newHeaders = { ...proxyRes.headers };

      if (newHeaders.location) {
        newHeaders.location = rewriteUrl(newHeaders.location);
      }
      if (newHeaders['content-location']) {
        newHeaders['content-location'] = rewriteUrl(newHeaders['content-location']);
      }
      if (newHeaders['set-cookie']) {
        newHeaders['set-cookie'] = (Array.isArray(newHeaders['set-cookie']) ? newHeaders['set-cookie'] : [newHeaders['set-cookie']])
          .map(c => rewriteUrl(c.replace(new RegExp(`domain=\\.?${escHost}`, 'gi'), `domain=.${proxyHost}`)));
      }
      if (newHeaders.refresh) {
        newHeaders.refresh = rewriteUrl(newHeaders.refresh);
      }

      const isRewritable = contentType.includes('text') || contentType.includes('json') ||
        contentType.includes('mpegurl') || contentType.includes('x-mpegURL') ||
        contentType.includes('xml') || contentType.includes('vnd.apple') ||
        contentType.includes('javascript');

      if (isRewritable) {
        const chunks = [];
        proxyRes.on('data', chunk => chunks.push(chunk));
        proxyRes.on('end', () => {
          let body = Buffer.concat(chunks).toString('utf8');
          body = rewriteUrl(body);

          delete newHeaders['content-length'];
          delete newHeaders['content-encoding'];
          newHeaders['transfer-encoding'] = 'chunked';

          res.writeHead(proxyRes.statusCode, newHeaders);
          res.end(body);

          const bytes = Buffer.byteLength(body);
          if (!bandwidthPerSecond[record.id]) bandwidthPerSecond[record.id] = 0;
          bandwidthPerSecond[record.id] += bytes;
          try { db.addBandwidth(bytes, record.id); } catch {}
        });
      } else {
        res.writeHead(proxyRes.statusCode, newHeaders);
        proxyRes.on('data', chunk => {
          res.write(chunk);
          if (!bandwidthPerSecond[record.id]) bandwidthPerSecond[record.id] = 0;
          bandwidthPerSecond[record.id] += chunk.length;
        });
        proxyRes.on('end', () => {
          res.end();
          try { db.addBandwidth(bandwidthPerSecond[record.id] || 0, record.id); } catch {}
        });
      }
    });

    return proxy.web(req, res, proxyOptions);
  }

  next();
});

app.get('/api/connections/:id', (req, res) => {
  res.json({
    connections: activeConnections[req.params.id] || 0,
    bandwidth_mbps: ((bandwidthPerSecond[req.params.id] || 0) / 125000).toFixed(2),
  });
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
  const result = getSubdomain(host);

  if (result) {
    const record = db.getProxyBySubdomain(result.subdomain);
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
