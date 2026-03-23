const express = require('express');
const http = require('http');
const zlib = require('zlib');
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
require('events').EventEmitter.defaultMaxListeners = 0;

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
  hostname = hostname.replace(/^www\./, '');

  function extractSub(host, baseDomain) {
    if (host === baseDomain) return null;
    if (host.endsWith('.' + baseDomain)) {
      let sub = host.slice(0, -(baseDomain.length + 1));
      sub = sub.replace(/^www\./, '');
      return { subdomain: sub, domain: baseDomain };
    }
    return null;
  }

  const main = config.domain;
  const mainResult = extractSub(hostname, main);
  if (mainResult) return mainResult;
  if (hostname === main) return null;

  try {
    const domains = db.getActiveDomains();
    for (const d of domains) {
      const r = extractSub(hostname, d.domain);
      if (r) return r;
      if (hostname === d.domain) return null;
    }
  } catch {}

  return null;
}

const serverConnections = {};

function getProxyAgent(country) {
  if (!country || country === 'auto') return { agent: undefined, serverId: null };

  const ownServers = db.getServersByCountry(country.toUpperCase());
  if (ownServers.length > 0) {
    const available = ownServers.filter(s => {
      const current = serverConnections[s.id] || 0;
      const max = s.max_connections || 100;
      return current < max;
    });

    if (available.length > 0) {
      available.sort((a, b) => (serverConnections[a.id] || 0) - (serverConnections[b.id] || 0));
      const server = available[0];
      try {
        if (HttpsProxyAgent) {
          return { agent: new HttpsProxyAgent(`http://${server.ip}:${server.port}`), serverId: server.id };
        }
      } catch {}
    } else if (ownServers.length > 0) {
      return { agent: null, serverId: 'full' };
    }
  }

  if (!HttpsProxyAgent) return { agent: undefined, serverId: null };
  const upstream = proxyPool.getRandomProxy(country);
  if (!upstream) return { agent: undefined, serverId: null };
  try {
    return { agent: new HttpsProxyAgent(upstream.url), serverId: null };
  } catch {
    return { agent: undefined, serverId: null };
  }
}

function addServerConnection(serverId) {
  if (!serverId) return;
  if (!serverConnections[serverId]) serverConnections[serverId] = 0;
  serverConnections[serverId]++;
}

function removeServerConnection(serverId) {
  if (!serverId) return;
  if (serverConnections[serverId] > 0) serverConnections[serverId]--;
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

    const { agent, serverId } = getProxyAgent(record.country);

    if (serverId === 'full') {
      activeConnections[record.id]--;
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'No servers available at the moment. All servers for this location are at capacity. Please try again later.' }));
    }

    addServerConnection(serverId);
    res.on('close', () => {
      if (activeConnections[record.id] > 0) activeConnections[record.id]--;
      removeServerConnection(serverId);
    });

    const proxyHost = `${subdomain}.${record.proxy_domain || domain || config.domain}`;
    const proxyOptions = {
      target: record.target_url,
      changeOrigin: true,
      selfHandleResponse: true,
    };
    if (agent) proxyOptions.agent = agent;

    proxy.once('proxyRes', (proxyRes, _req, _res) => {
      if (record.stream_proxy === 2 && [301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
        const redirectUrl = proxyRes.headers.location;
        proxyRes.resume();

        const client = redirectUrl.startsWith('https') ? require('https') : require('http');
        const redirectReq = client.get(redirectUrl, { timeout: 30000 }, (redirectRes) => {
          if ([301, 302, 307, 308].includes(redirectRes.statusCode) && redirectRes.headers.location) {
            redirectRes.resume();
            const client2 = redirectRes.headers.location.startsWith('https') ? require('https') : require('http');
            client2.get(redirectRes.headers.location, { timeout: 30000 }, (finalRes) => {
              const hdrs = { ...finalRes.headers };
              delete hdrs['content-security-policy'];
              hdrs['cache-control'] = 'no-store, no-cache';
              res.writeHead(finalRes.statusCode, hdrs);
              let pendingBytes = 0;
              const flush = setInterval(() => { if (pendingBytes > 0) { try { db.addBandwidth(pendingBytes, record.id); } catch {} pendingBytes = 0; } }, 5000);
              finalRes.on('data', chunk => { res.write(chunk); pendingBytes += chunk.length; if (!bandwidthPerSecond[record.id]) bandwidthPerSecond[record.id] = 0; bandwidthPerSecond[record.id] += chunk.length; });
              finalRes.on('end', () => { clearInterval(flush); res.end(); if (pendingBytes > 0) try { db.addBandwidth(pendingBytes, record.id); } catch {} });
              res.on('close', () => { clearInterval(flush); finalRes.destroy(); if (pendingBytes > 0) try { db.addBandwidth(pendingBytes, record.id); } catch {} });
            }).on('error', () => { res.writeHead(502); res.end('Stream unavailable'); });
            return;
          }
          const hdrs = { ...redirectRes.headers };
          delete hdrs['content-security-policy'];
          hdrs['cache-control'] = 'no-store, no-cache';
          res.writeHead(redirectRes.statusCode, hdrs);
          let pendingBytes = 0;
          const flush = setInterval(() => { if (pendingBytes > 0) { try { db.addBandwidth(pendingBytes, record.id); } catch {} pendingBytes = 0; } }, 5000);
          redirectRes.on('data', chunk => { res.write(chunk); pendingBytes += chunk.length; if (!bandwidthPerSecond[record.id]) bandwidthPerSecond[record.id] = 0; bandwidthPerSecond[record.id] += chunk.length; });
          redirectRes.on('end', () => { clearInterval(flush); res.end(); if (pendingBytes > 0) try { db.addBandwidth(pendingBytes, record.id); } catch {} });
          res.on('close', () => { clearInterval(flush); redirectRes.destroy(); if (pendingBytes > 0) try { db.addBandwidth(pendingBytes, record.id); } catch {} });
        });
        redirectReq.on('error', () => { res.writeHead(502); res.end('Stream unavailable'); });
        return;
      }

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
        if (!str) return str;
        if (targetHost) {
          str = str.replace(new RegExp(`https?://www\\.${escHost}`, 'g'), `https://${proxyHost}`);
          str = str.replace(new RegExp(escOrigin, 'g'), `https://${proxyHost}`);
          str = str.replace(new RegExp(`http://${escHost}`, 'g'), `https://${proxyHost}`);
          str = str.replace(new RegExp(`www\\.${escHost}`, 'g'), proxyHost);
          str = str.replace(new RegExp(escHost, 'g'), proxyHost);
        }
        str = str.replace(new RegExp(`www\\.${proxyHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), proxyHost);
        return str;
      }

      function rewriteAllExternalUrls(str) {
        if (!str) return str;
        str = rewriteUrl(str);
        if (record.stream_proxy === 2) {
          str = str.replace(/https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?/g, (match) => {
            try {
              const u = new URL(match);
              if (u.host === proxyHost) return match;
              if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return match;
              return `https://${proxyHost}`;
            } catch { return match; }
          });
        }
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

      delete newHeaders['content-security-policy'];
      delete newHeaders['content-security-policy-report-only'];
      delete newHeaders['x-frame-options'];
      delete newHeaders['strict-transport-security'];

      newHeaders['cache-control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate';
      newHeaders['pragma'] = 'no-cache';
      newHeaders['expires'] = '0';
      delete newHeaders['etag'];
      delete newHeaders['last-modified'];

      const isRewritable = contentType.includes('text') || contentType.includes('json') ||
        contentType.includes('mpegurl') || contentType.includes('x-mpegURL') ||
        contentType.includes('xml') || contentType.includes('vnd.apple') ||
        contentType.includes('javascript');

      function decompress(buffer, encoding) {
        try {
          if (encoding === 'gzip') return zlib.gunzipSync(buffer);
          if (encoding === 'deflate') return zlib.inflateSync(buffer);
          if (encoding === 'br') return zlib.brotliDecompressSync(buffer);
        } catch {}
        return buffer;
      }

      if (isRewritable) {
        const chunks = [];
        proxyRes.on('data', chunk => chunks.push(chunk));
        proxyRes.on('end', () => {
          let raw = Buffer.concat(chunks);
          const encoding = proxyRes.headers['content-encoding'];
          if (encoding) raw = decompress(raw, encoding);

          let body = raw.toString('utf8');
          body = record.stream_proxy === 2 ? rewriteAllExternalUrls(body) : rewriteUrl(body);

          body = body.replace(/<base\s+href=["'][^"']*["']/gi, `<base href="https://${proxyHost}/"`);

          body = body.replace(
            /(<head[^>]*>)/i,
            `$1<script>Object.defineProperty(document,'domain',{get:function(){return '${proxyHost}';}});` +
            `if(window.location.hostname!=='${proxyHost}'){window.location.hostname='${proxyHost}';}</script>`
          );

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
        let pendingBytes = 0;
        const flushInterval = setInterval(() => {
          if (pendingBytes > 0) {
            try { db.addBandwidth(pendingBytes, record.id); } catch {}
            pendingBytes = 0;
          }
        }, 5000);
        proxyRes.on('data', chunk => {
          res.write(chunk);
          pendingBytes += chunk.length;
          if (!bandwidthPerSecond[record.id]) bandwidthPerSecond[record.id] = 0;
          bandwidthPerSecond[record.id] += chunk.length;
        });
        proxyRes.on('end', () => {
          clearInterval(flushInterval);
          res.end();
          if (pendingBytes > 0) {
            try { db.addBandwidth(pendingBytes, record.id); } catch {}
          }
        });
        res.on('close', () => {
          clearInterval(flushInterval);
          if (pendingBytes > 0) {
            try { db.addBandwidth(pendingBytes, record.id); } catch {}
          }
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

app.get('/api/server-connections', (req, res) => {
  res.json({ servers: serverConnections, proxies: activeConnections });
});

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
      const { agent, serverId } = getProxyAgent(record.country);
      if (serverId === 'full') { socket.destroy(); return; }
      addServerConnection(serverId);
      socket.on('close', () => removeServerConnection(serverId));
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
