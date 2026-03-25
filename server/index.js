const express = require('express');
const http = require('http');
const zlib = require('zlib');
const jwt = require('jsonwebtoken');
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
// const proxyPool = require('./proxy-pool');
const authRoutes = require('./routes/auth.routes');
const proxyRoutes = require('./routes/proxy.routes');
const statsRoutes = require('./routes/stats.routes');
const adminRoutes = require('./routes/admin.routes');
const paypalRoutes = require('./routes/paypal.routes');
const nodeRoutes = require('./routes/node.routes');
const resellerRoutes = require('./routes/reseller.routes');
const cryptoRoutes = require('./routes/crypto.routes');

const app = express();
const proxy = httpProxy.createProxyServer({ xfwd: true });
require('events').EventEmitter.defaultMaxListeners = 0;

// proxyPool disabled - using own servers only

const { checkServer } = require('./server-setup');
async function autoHealthCheck() {
  try {
    const servers = db.getAllServers();
    for (const server of servers) {
      if (server.status === 'installing') continue;
      const alive = await checkServer(server.ip, server.port);
      const newStatus = alive ? 'online' : 'offline';
      if (server.status !== newStatus) {
        db.updateServerStatus(server.id, newStatus);
        console.log(`[HealthCheck] ${server.ip} (${server.country}): ${server.status} -> ${newStatus}`);
      }
    }
  } catch (err) {
    console.error('[HealthCheck] Error:', err.message);
  }
}
setTimeout(autoHealthCheck, 10000);
setInterval(autoHealthCheck, 3 * 60 * 1000);

// Expire subscriptions every minute
setInterval(() => { try { db.expireSubscriptions(); } catch {} }, 60 * 1000);

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

  return { agent: undefined, serverId: null };
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
let globalRequestsPerSec = 0;
const proxyRequestsPerSec = {};

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
  for (const id in bandwidthPerSecond) bandwidthPerSecond[id] = 0;
  globalRequestsPerSec = 0;
  for (const id in proxyRequestsPerSec) proxyRequestsPerSec[id] = 0;
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

    if (record.ip_lock && record.ip_lock !== req.ip) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Access denied. This proxy is locked to a specific IP.' }));
    }

    const DNS_BW_LIMIT_MBPS = 50;

    if (record.stream_proxy !== 2 && isStreamRequest(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Streaming is not enabled for this proxy. Contact admin to enable Stream Proxy mode.' }));
    }

    if (record.stream_proxy === 2) {
      const speedLimit = record.speed_limit_mbps || record.bandwidth_limit || 0;
      if (speedLimit > 0 && !checkBandwidthLimit(record.id, speedLimit)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Speed limit reached. Your plan allows ' + speedLimit + ' Mbps.' }));
      }
    }

    if (record.stream_proxy !== 2) {
      if (!checkBandwidthLimit(record.id, DNS_BW_LIMIT_MBPS)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Bandwidth limit exceeded. This proxy is using too much traffic.' }));
      }
    }

    db.incrementRequests(record.id);
    globalRequestsPerSec++;
    if (!proxyRequestsPerSec[record.id]) proxyRequestsPerSec[record.id] = 0;
    proxyRequestsPerSec[record.id]++;

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

        const redirectOpts = { timeout: 30000 };
        if (agent) redirectOpts.agent = agent;
        const client = redirectUrl.startsWith('https') ? require('https') : require('http');
        const redirectReq = client.get(redirectUrl, redirectOpts, (redirectRes) => {
          if ([301, 302, 307, 308].includes(redirectRes.statusCode) && redirectRes.headers.location) {
            redirectRes.resume();
            const redirect2Opts = { timeout: 30000 };
            if (agent) redirect2Opts.agent = agent;
            const client2 = redirectRes.headers.location.startsWith('https') ? require('https') : require('http');
            client2.get(redirectRes.headers.location, redirect2Opts, (finalRes) => {
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

      const targetHostname = targetHost ? targetHost.split(':')[0] : '';
      const targetPort = targetHost && targetHost.includes(':') ? targetHost.split(':')[1] : '';
      const proxyHostname = proxyHost.split(':')[0];

      function rewriteUrl(str) {
        if (!str) return str;
        if (targetHost) {
          str = str.split(`https://www.${targetHost}`).join(`https://${proxyHost}`);
          str = str.split(`http://www.${targetHost}`).join(`https://${proxyHost}`);
          str = str.split(targetOrigin).join(`https://${proxyHost}`);
          str = str.split(`http://${targetHost}`).join(`https://${proxyHost}`);
          str = str.split(`www.${targetHost}`).join(proxyHost);
          str = str.split(targetHost).join(proxyHost);
        }
        if (targetHostname && targetHostname !== targetHost) {
          str = str.split(`"url":"${targetHostname}"`).join(`"url":"${proxyHostname}"`);
        }
        str = str.split(`www.${proxyHost}`).join(proxyHost);
        return str;
      }

      const SKIP_REWRITE_DOMAINS = /\.(png|jpg|jpeg|gif|svg|ico|webp|bmp|css|woff|woff2|ttf|eot)$/i;
      const SKIP_REWRITE_HOSTS = /m3uassets\.com|imgur\.com|googleusercontent\.com|cloudinary\.com|wp\.com|githubusercontent\.com|cdn\./i;

      function rewriteExternalUrl(match) {
        try {
          if (SKIP_REWRITE_DOMAINS.test(match)) return match;
          const u = new URL(match);
          if (u.host === proxyHost) return match;
          if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return match;
          if (SKIP_REWRITE_HOSTS.test(u.hostname)) return match;
          const port = u.port && u.port !== '80' && u.port !== '443' ? `:${u.port}` : '';
          return `https://${proxyHostname}${port}${u.pathname}${u.search}${u.hash}`;
        } catch { return match; }
      }

      function rewriteM3UContent(str) {
        if (!str) return str;
        const lines = str.split('\n');
        const result = [];
        for (let i = 0; i < lines.length; i++) {
          let line = lines[i];
          if (line.startsWith('#EXTINF') || line.startsWith('#EXTM3U') || line.startsWith('#EXT')) {
            line = line.replace(/tvg-url="([^"]*)"/g, (m, url) => `tvg-url="${rewriteUrl(url)}"`);
            line = line.replace(/catchup-source="([^"]*)"/g, (m, url) => `catchup-source="${rewriteUrl(url)}"`);
            line = line.replace(/url-epg="([^"]*)"/g, (m, url) => `url-epg="${rewriteUrl(url)}"`);
            result.push(line);
          } else if (line.match(/^https?:\/\//)) {
            result.push(line.replace(/https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[^\s]*)?/g, rewriteExternalUrl));
          } else {
            result.push(rewriteUrl(line));
          }
        }
        return result.join('\n');
      }

      function rewriteAllExternalUrls(str) {
        if (!str) return str;
        str = rewriteUrl(str);
        if (record.stream_proxy === 2) {
          const isM3UContent = str.trimStart().startsWith('#EXTM3U') || str.trimStart().startsWith('#EXTINF');
          if (isM3UContent) {
            return rewriteM3UContent(str);
          }
          str = str.replace(/https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[^\s"'<>)]*)?/g, rewriteExternalUrl);
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

      const reqPath = (req.url || '').toLowerCase();
      const isM3URequest = reqPath.includes('get.php') || reqPath.includes('.m3u') || reqPath.includes('.m3u8') ||
        reqPath.includes('player_api') || reqPath.includes('xmltv') || reqPath.includes('epg');

      const isRewritable = contentType.includes('text') || contentType.includes('json') ||
        contentType.includes('mpegurl') || contentType.includes('x-mpegURL') ||
        contentType.includes('xml') || contentType.includes('vnd.apple') ||
        contentType.includes('javascript') ||
        (record.stream_proxy === 2 && contentType.includes('octet-stream') && isM3URequest);

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

// Token-based stream access: /stream/:subdomain?token=xyz
app.get('/stream-test', (req, res) => res.json({ ok: true }));

const streamTokenHandler = (req, res) => {
  console.log('[StreamToken] Hit:', req.url, req.params, req.query);
  try {
    const { token } = req.query;
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Token required' }));
    }

    const tokenRecord = db.getStreamToken(token);
    if (!tokenRecord || tokenRecord.expires_at < Math.floor(Date.now() / 1000)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Token expired or invalid' }));
    }

    if (!tokenRecord.is_active || tokenRecord.stream_proxy !== 2) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Stream not found or not active' }));
    }

    if (tokenRecord.proxy_expires_at && new Date(tokenRecord.proxy_expires_at) < new Date()) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Proxy expired' }));
    }

    if (tokenRecord.ip_lock && tokenRecord.ip_lock !== req.ip) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Access denied. This proxy is locked to a specific IP.' }));
    }

    const record = {
      id: tokenRecord.proxy_id,
      subdomain: tokenRecord.subdomain,
      target_url: tokenRecord.target_url,
      stream_proxy: tokenRecord.stream_proxy,
      bandwidth_limit: tokenRecord.bandwidth_limit,
      bandwidth_used: tokenRecord.bandwidth_used,
      proxy_domain: tokenRecord.proxy_domain,
      country: tokenRecord.country,
      is_active: tokenRecord.is_active,
      speed_limit_mbps: tokenRecord.speed_limit_mbps || 0,
    };

    const speedLimit = record.speed_limit_mbps || record.bandwidth_limit || 0;
    if (speedLimit > 0 && !checkBandwidthLimit(record.id, speedLimit)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Bandwidth limit exceeded.' }));
    }

    db.incrementRequests(record.id);
    globalRequestsPerSec++;
    if (!proxyRequestsPerSec[record.id]) proxyRequestsPerSec[record.id] = 0;
    proxyRequestsPerSec[record.id]++;

    if (!activeConnections[record.id]) activeConnections[record.id] = 0;
    activeConnections[record.id]++;

    const { agent, serverId } = getProxyAgent(record.country);
    if (serverId === 'full') {
      activeConnections[record.id]--;
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'No servers available.' }));
    }

    addServerConnection(serverId);
    res.on('close', () => {
      if (activeConnections[record.id] > 0) activeConnections[record.id]--;
      removeServerConnection(serverId);
    });

    const proxyHost = `${record.subdomain}.${record.proxy_domain || config.domain}`;
    const remaining = req.params.remainingPath || '';
    const streamPath = '/' + remaining;
    const targetUrl = record.target_url.replace(/\/$/, '') + streamPath;

    const client = targetUrl.startsWith('https') ? require('https') : require('http');
    const proxyReqOpts = { timeout: 30000 };
    if (agent) proxyReqOpts.agent = agent;

    const proxyReq = client.get(targetUrl, proxyReqOpts, (proxyRes) => {
      if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
        proxyRes.resume();
        const tokenRedirectOpts = { timeout: 30000 };
        if (agent) tokenRedirectOpts.agent = agent;
        const cl2 = proxyRes.headers.location.startsWith('https') ? require('https') : require('http');
        cl2.get(proxyRes.headers.location, tokenRedirectOpts, (finalRes) => {
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
      const hdrs = { ...proxyRes.headers };
      delete hdrs['content-security-policy'];
      hdrs['cache-control'] = 'no-store, no-cache';
      res.writeHead(proxyRes.statusCode, hdrs);
      let pendingBytes = 0;
      const flush = setInterval(() => { if (pendingBytes > 0) { try { db.addBandwidth(pendingBytes, record.id); } catch {} pendingBytes = 0; } }, 5000);
      proxyRes.on('data', chunk => { res.write(chunk); pendingBytes += chunk.length; if (!bandwidthPerSecond[record.id]) bandwidthPerSecond[record.id] = 0; bandwidthPerSecond[record.id] += chunk.length; });
      proxyRes.on('end', () => { clearInterval(flush); res.end(); if (pendingBytes > 0) try { db.addBandwidth(pendingBytes, record.id); } catch {} });
      res.on('close', () => { clearInterval(flush); proxyRes.destroy(); if (pendingBytes > 0) try { db.addBandwidth(pendingBytes, record.id); } catch {} });
    });
    proxyReq.on('error', () => { res.writeHead(502); res.end('Stream unavailable'); });
  } catch (err) {
    console.error('[StreamToken] Error:', err);
    res.writeHead(500); res.end('Internal error');
  }
};
app.get('/stream/:proxySubdomain', streamTokenHandler);
app.get('/stream/:proxySubdomain/{*remainingPath}', streamTokenHandler);

// Cleanup expired stream tokens every 5 minutes
setInterval(() => { try { db.deleteExpiredTokens(); } catch {} }, 5 * 60 * 1000);

app.get('/api/connections/:id', (req, res) => {
  const { getNodeStats } = require('./routes/node.routes');
  const ns = getNodeStats();
  const localConns = activeConnections[req.params.id] || 0;
  const nodeConns = ns[`conn_${req.params.id}`] || 0;
  const localBw = bandwidthPerSecond[req.params.id] || 0;
  const nodeBw = ns[`bw_${req.params.id}`] || 0;
  res.json({
    connections: localConns + nodeConns,
    bandwidth_mbps: ((localBw + nodeBw) / 125000).toFixed(2),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/proxies', proxyRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/paypal', paypalRoutes);
app.use('/api/node', nodeRoutes);
app.use('/api/reseller', resellerRoutes);
app.use('/api/crypto', cryptoRoutes);

app.get('/api/node/agent-script', (req, res) => {
  const secret = req.headers['x-node-secret'];
  if (!secret || secret !== config.nodeSecret) {
    return res.status(401).send('Unauthorized');
  }
  const fs = require('fs');
  const agentPath = path.join(__dirname, 'node-agent.js');
  if (fs.existsSync(agentPath)) {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(fs.readFileSync(agentPath, 'utf8'));
  } else {
    res.status(404).send('Agent script not found');
  }
});

app.get('/api/server-connections', (req, res) => {
  const { getNodeStats } = require('./routes/node.routes');
  const ns = getNodeStats();
  const mergedProxies = { ...activeConnections };
  for (const [key, val] of Object.entries(ns)) {
    if (key.startsWith('conn_')) {
      const pid = key.slice(5);
      mergedProxies[pid] = (mergedProxies[pid] || 0) + val;
    }
  }
  res.json({ servers: serverConnections, proxies: mergedProxies });
});

app.get('/api/live-stats', (req, res) => {
  const { getNodeStats } = require('./routes/node.routes');
  const ns = getNodeStats();
  let totalActive = Object.values(activeConnections).reduce((s, v) => s + v, 0);
  let totalBW = Object.values(bandwidthPerSecond).reduce((s, v) => s + v, 0);
  for (const [key, val] of Object.entries(ns)) {
    if (key.startsWith('conn_')) totalActive += val;
    if (key.startsWith('bw_')) totalBW += val;
  }
  res.json({
    active_users: totalActive,
    bandwidth_mbps: (totalBW / 125000).toFixed(2),
    requests_per_sec: globalRequestsPerSec,
  });
});

app.get('/api/proxy-pool/stats', (req, res) => {
  res.json({ total_proxies: 0, verified_proxies: 0, total_countries: 0, message: 'Using own servers only' });
});

app.get('/api/proxy-pool/countries', (req, res) => {
  res.json({ countries: [] });
});

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const server = http.createServer(app);

// WebSocket dashboard with socket.io
const { Server: SocketServer } = require('socket.io');
const io = new SocketServer(server, {
  path: '/ws',
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

function parseCookies(cookieStr) {
  const cookies = {};
  if (!cookieStr) return cookies;
  cookieStr.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) cookies[k] = v.join('=');
  });
  return cookies;
}

io.use((socket, next) => {
  try {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const token = cookies.token;
    if (!token) return next(new Error('Auth required'));
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = db.getUserById(decoded.id);
    if (!user) return next(new Error('User not found'));
    if (user.role !== 'admin' && user.role !== 'reseller' && !user.is_admin) {
      return next(new Error('Unauthorized'));
    }
    socket.user = user;
    next();
  } catch {
    next(new Error('Auth failed'));
  }
});

io.on('connection', (socket) => {
  socket.join('dashboard');
});

setInterval(() => {
  const { getNodeStats } = require('./routes/node.routes');
  const ns = getNodeStats();

  let totalActiveUsers = Object.values(activeConnections).reduce((s, v) => s + v, 0);
  let totalBandwidthBytes = Object.values(bandwidthPerSecond).reduce((s, v) => s + v, 0);

  const mergedConns = { ...activeConnections };
  const mergedBw = { ...bandwidthPerSecond };
  for (const [key, val] of Object.entries(ns)) {
    if (key.startsWith('conn_')) {
      const pid = key.slice(5);
      mergedConns[pid] = (mergedConns[pid] || 0) + val;
      totalActiveUsers += val;
    }
    if (key.startsWith('bw_')) {
      const pid = key.slice(3);
      mergedBw[pid] = (mergedBw[pid] || 0) + val;
      totalBandwidthBytes += val;
    }
  }

  io.to('dashboard').emit('stats', {
    active_users: totalActiveUsers,
    bandwidth_mbps: (totalBandwidthBytes / 125000).toFixed(2),
    requests_per_sec: globalRequestsPerSec,
    server_connections: serverConnections,
    proxy_connections: mergedConns,
    proxy_bandwidth: Object.fromEntries(
      Object.entries(mergedBw).map(([k, v]) => [k, (v / 125000).toFixed(2)])
    ),
  });
}, 2000);

server.on('upgrade', (req, socket, head) => {
  if (req.url && req.url.startsWith('/ws')) return;

  const host = (req.headers.host || '').split(':')[0];
  const result = getSubdomain(host);

  if (result) {
    const record = db.getProxyBySubdomain(result.subdomain);
    if (record && record.is_active && !(record.expires_at && new Date(record.expires_at) < new Date())) {
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.socket?.remoteAddress;
      if (record.ip_lock && record.ip_lock !== clientIp) { socket.destroy(); return; }

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
