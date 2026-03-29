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
// const paypalRoutes = require('./routes/paypal.routes');
const nodeRoutes = require('./routes/node.routes');
const resellerRoutes = require('./routes/reseller.routes');
const cryptoRoutes = require('./routes/crypto.routes');

const app = express();
const proxy = httpProxy.createProxyServer({ xfwd: true });
require('events').EventEmitter.defaultMaxListeners = 0;

function isIpAllowed(ipLockValue, clientIp) {
  if (!ipLockValue) return true;
  try {
    const ips = JSON.parse(ipLockValue);
    if (!Array.isArray(ips) || ips.length === 0) return true;
    return ips.includes(clientIp);
  } catch {
    return ipLockValue === clientIp;
  }
}

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

function serverMatchesType(server, requiredType) {
  const st = server.server_type || 'all';
  if (st === 'all') return true;
  try {
    const types = JSON.parse(st);
    if (Array.isArray(types)) return types.includes('all') || types.includes(requiredType);
  } catch {}
  return st === requiredType || st === 'all';
}

function getProxyAgent(country, proxyType) {
  if (!country || country === 'auto') return { agent: undefined, serverId: null };
  const requiredType = proxyType || 'dns';

  const ownServers = db.getServersByCountry(country.toUpperCase());
  if (ownServers.length > 0) {
    const available = ownServers.filter(s => {
      const current = serverConnections[s.id] || 0;
      const max = s.max_connections || 100;
      return current < max && serverMatchesType(s, requiredType);
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
    strictTransportSecurity: {
      maxAge: 15552000,
      includeSubDomains: false,
    },
  })
);

const activeConnections = {};
const bandwidthPerSecond = {};
let globalRequestsPerSec = 0;
const proxyRequestsPerSec = {};

let lastBandwidthSnapshot = {};
let lastGlobalReqsSnapshot = 0;
let lastProxyReqsSnapshot = {};

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
  lastBandwidthSnapshot = { ...bandwidthPerSecond };
  lastGlobalReqsSnapshot = globalRequestsPerSec;
  lastProxyReqsSnapshot = { ...proxyRequestsPerSec };
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

    if (!isIpAllowed(record.ip_lock, req.ip)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Access denied. Your IP is not whitelisted.' }));
    }

    const DNS_BW_LIMIT_MBPS = 50;

    if (record.stream_proxy !== 2 && isStreamRequest(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Streaming is not enabled for this proxy.' }));
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

    const proxyType = record.stream_proxy === 2 ? 'stream' : 'dns';
    const { agent, serverId } = getProxyAgent(record.country, proxyType);

    if (serverId === 'full') {
      activeConnections[record.id]--;
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'No servers available at the moment. All servers for this location are at capacity. Please try again later.' }));
    }

    addServerConnection(serverId);
    let connClosed = false;
    const closeConn = () => {
      if (!connClosed) { connClosed = true; if (activeConnections[record.id] > 0) activeConnections[record.id]--; removeServerConnection(serverId); }
    };
    res.on('close', closeConn);
    res.on('error', closeConn);
    req.on('close', closeConn);
    req.on('aborted', closeConn);

    const proxyHost = `${subdomain}.${record.proxy_domain || domain || config.domain}`;
    const proxyOptions = {
      target: record.target_url,
      changeOrigin: true,
      selfHandleResponse: true,
    };
    if (agent) proxyOptions.agent = agent;

    proxy.once('proxyRes', (proxyRes, _req, _res) => {
      if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
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
        (contentType.includes('octet-stream') && isM3URequest);

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

          if (record.stream_proxy === 2) {
            body = rewriteAllExternalUrls(body);
          } else {
            const trimmedBody = body.trimStart();
            const isM3UBody = trimmedBody.startsWith('#EXTM3U') || trimmedBody.startsWith('#EXTINF');

            if (isM3UBody) {
              // DNS proxy: keep original stream URLs - streams go directly from user's panel
            } else if (body.includes('"server_info"') || (body.includes('"url"') && body.includes('"port"'))) {
              try {
                const json = JSON.parse(body);
                if (json.server_info) {
                  json.server_info.url = proxyHostname;
                  json.server_info.port = req.headers['x-forwarded-port'] || '80';
                  if (json.server_info.https_port) json.server_info.https_port = '443';
                }
                body = JSON.stringify(json);
              } catch {
                body = rewriteUrl(body);
              }
            } else {
              body = rewriteUrl(body);
            }
          }

          const isHtmlResponse = contentType.includes('text/html') || (body.includes('<html') && body.includes('<head'));
          if (isHtmlResponse) {
            body = body.replace(/<base\s+href=["'][^"']*["']/gi, `<base href="https://${proxyHost}/"`);
            body = body.replace(
              /(<head[^>]*>)/i,
              `$1<script>Object.defineProperty(document,'domain',{get:function(){return '${proxyHost}';}});` +
              `if(window.location.hostname!=='${proxyHost}'){window.location.hostname='${proxyHost}';}</script>`
            );
          }

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

// Token-based stream access: /stream/TOKEN or /stream/TOKEN/path
const cryptoModule = require('crypto');

function decryptCredentials(encryptedCreds) {
  try {
    const [ivHex, encrypted] = encryptedCreds.split(':');
    const key = cryptoModule.createHash('sha256').update(config.jwtSecret).digest();
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = cryptoModule.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch { return null; }
}

function streamTokenPipe(srcRes, res, record, flush) {
  let pendingBytes = 0;
  const flushInterval = setInterval(() => { if (pendingBytes > 0) { try { db.addBandwidth(pendingBytes, record.id); } catch {} pendingBytes = 0; } }, 5000);
  srcRes.on('data', chunk => { res.write(chunk); pendingBytes += chunk.length; if (!bandwidthPerSecond[record.id]) bandwidthPerSecond[record.id] = 0; bandwidthPerSecond[record.id] += chunk.length; });
  srcRes.on('end', () => { clearInterval(flushInterval); res.end(); if (pendingBytes > 0) try { db.addBandwidth(pendingBytes, record.id); } catch {} });
  res.on('close', () => { clearInterval(flushInterval); srcRes.destroy(); if (pendingBytes > 0) try { db.addBandwidth(pendingBytes, record.id); } catch {} });
}

const streamTokenHandler = (req, res) => {
  try {
    const tokenStr = req.params.token;
    if (!tokenStr) {
      return res.status(401).json({ error: 'Token required' });
    }

    const tokenRecord = db.getStreamToken(tokenStr);
    if (!tokenRecord || tokenRecord.expires_at < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ error: 'Token expired or invalid' });
    }

    if (!tokenRecord.is_active || tokenRecord.stream_proxy !== 2) {
      return res.status(404).json({ error: 'Stream not found or not active' });
    }

    if (tokenRecord.proxy_expires_at && new Date(tokenRecord.proxy_expires_at) < new Date()) {
      return res.status(404).json({ error: 'Proxy expired' });
    }

    if (!isIpAllowed(tokenRecord.ip_lock, req.ip)) {
      return res.status(403).json({ error: 'Access denied. Your IP is not whitelisted.' });
    }

    const record = {
      id: tokenRecord.proxy_id,
      subdomain: tokenRecord.subdomain,
      target_url: tokenRecord.target_url,
      stream_proxy: tokenRecord.stream_proxy,
      bandwidth_limit: tokenRecord.bandwidth_limit,
      proxy_domain: tokenRecord.proxy_domain,
      country: tokenRecord.country,
      speed_limit_mbps: tokenRecord.speed_limit_mbps || 0,
    };

    const speedLimit = record.speed_limit_mbps || record.bandwidth_limit || 0;
    if (speedLimit > 0 && !checkBandwidthLimit(record.id, speedLimit)) {
      return res.status(429).json({ error: 'Speed limit reached.' });
    }

    db.incrementRequests(record.id);
    globalRequestsPerSec++;
    if (!proxyRequestsPerSec[record.id]) proxyRequestsPerSec[record.id] = 0;
    proxyRequestsPerSec[record.id]++;

    if (!activeConnections[record.id]) activeConnections[record.id] = 0;
    activeConnections[record.id]++;

    const { agent, serverId } = getProxyAgent(record.country, 'stream');
    if (serverId === 'full') {
      activeConnections[record.id]--;
      return res.status(503).json({ error: 'No servers available.' });
    }

    addServerConnection(serverId);
    let tokenConnClosed = false;
    const closeTokenConn = () => {
      if (!tokenConnClosed) { tokenConnClosed = true; if (activeConnections[record.id] > 0) activeConnections[record.id]--; removeServerConnection(serverId); }
    };
    res.on('close', closeTokenConn);
    res.on('error', closeTokenConn);
    req.on('close', closeTokenConn);
    req.on('aborted', closeTokenConn);

    let creds = null;
    if (tokenRecord.credentials) {
      creds = decryptCredentials(tokenRecord.credentials);
    }

    const remaining = String(req.params.remainingPath || '');
    let streamPath = '/' + remaining;

    if (creds && !remaining) {
      streamPath = `/get.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&type=m3u_plus&output=mpegts`;
    } else if (creds && remaining) {
      if (remaining.includes('get.php')) {
        if (!remaining.includes('username=')) {
          const sep = remaining.includes('?') ? '&' : '?';
          streamPath = `/${remaining}${sep}username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
        }
      } else if (remaining.includes('player_api')) {
        if (!remaining.includes('username=')) {
          const sep = remaining.includes('?') ? '&' : '?';
          streamPath = `/${remaining}${sep}username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
        }
      } else if (!remaining.includes(creds.username)) {
        const cleanRemaining = remaining.replace(/^(live|movie|series)\//, '$1/');
        if (cleanRemaining.match(/^(live|movie|series)\//)) {
          const parts = cleanRemaining.split('/');
          const prefix = parts[0];
          const rest = parts.slice(1).join('/');
          streamPath = `/${prefix}/${creds.username}/${creds.password}/${rest}`;
        } else {
          streamPath = `/${creds.username}/${creds.password}/${remaining}`;
        }
      }
    }

    const extraQuery = Object.entries(req.query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    if (extraQuery) {
      streamPath += (streamPath.includes('?') ? '&' : '?') + extraQuery;
    }

    const targetUrl = record.target_url.replace(/\/$/, '') + streamPath;
    const tokenBaseUrl = `http://${config.domain}/stream/${tokenStr}`;

    const parsedTarget = new URL(targetUrl);
    const httpClient = targetUrl.startsWith('https') ? require('https') : require('http');
    const proxyReqOpts = {
      hostname: parsedTarget.hostname,
      port: parsedTarget.port || (targetUrl.startsWith('https') ? 443 : 80),
      path: parsedTarget.pathname + parsedTarget.search,
      timeout: 30000,
      headers: {},
    };
    if (agent) proxyReqOpts.agent = agent;

    const fwdHeaders = ['range', 'accept', 'user-agent', 'accept-encoding',
      'accept-language', 'if-range', 'if-none-match', 'if-modified-since', 'connection'];
    for (const h of fwdHeaders) {
      if (req.headers[h]) proxyReqOpts.headers[h] = req.headers[h];
    }
    proxyReqOpts.headers['host'] = parsedTarget.host;

    const proxyReq = httpClient.get(proxyReqOpts, (proxyRes) => {
      if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
        proxyRes.resume();
        const rdUrl = new URL(proxyRes.headers.location);
        const rdOpts = {
          hostname: rdUrl.hostname,
          port: rdUrl.port || (proxyRes.headers.location.startsWith('https') ? 443 : 80),
          path: rdUrl.pathname + rdUrl.search,
          timeout: 30000,
          headers: { ...proxyReqOpts.headers, host: rdUrl.host },
        };
        if (agent) rdOpts.agent = agent;
        const cl2 = proxyRes.headers.location.startsWith('https') ? require('https') : require('http');
        cl2.get(rdOpts, (finalRes) => {
          const hdrs = { ...finalRes.headers };
          delete hdrs['content-security-policy'];
          hdrs['cache-control'] = 'no-store, no-cache';
          if (finalRes.statusCode === 206) {
            hdrs['accept-ranges'] = 'bytes';
          }
          res.writeHead(finalRes.statusCode, hdrs);
          streamTokenPipe(finalRes, res, record);
        }).on('error', () => { res.writeHead(502); res.end('Stream unavailable'); });
        return;
      }

      const contentType = proxyRes.headers['content-type'] || '';
      const fullPath = streamPath.toLowerCase();
      const isTextResponse = contentType.includes('text') || contentType.includes('json') ||
        contentType.includes('mpegurl') || contentType.includes('xml') || contentType.includes('javascript') ||
        (contentType.includes('octet-stream') && (fullPath.includes('get.php') || fullPath.includes('.m3u') || fullPath.includes('player_api')));

      if (isTextResponse && creds) {
        const chunks = [];
        proxyRes.on('data', c => chunks.push(c));
        proxyRes.on('end', () => {
          let raw = Buffer.concat(chunks);
          const encoding = proxyRes.headers['content-encoding'];
          if (encoding) {
            try {
              if (encoding === 'gzip') raw = zlib.gunzipSync(raw);
              else if (encoding === 'deflate') raw = zlib.inflateSync(raw);
              else if (encoding === 'br') raw = zlib.brotliDecompressSync(raw);
            } catch {}
          }

          let body = raw.toString('utf8');

          let targetHost;
          try { targetHost = new URL(record.target_url).host; } catch { targetHost = ''; }

          body = body.replace(/https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?\/[^\s"'<>)]+/g, (match) => {
            try {
              const u = new URL(match);
              if (u.hostname === 'logo.m3uassets.com' || /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(match)) return match;
              let cleanPath = u.pathname;
              if (creds) {
                cleanPath = cleanPath.replace(`/${creds.username}/${creds.password}`, '');
                cleanPath = cleanPath.replace(`/${creds.username}`, '');
              }
              if (!cleanPath || cleanPath === '/') cleanPath = '';
              return tokenBaseUrl + cleanPath + u.search;
            } catch { return match; }
          });

          if (body.includes('"url"') && body.includes('"port"')) {
            try {
              const json = JSON.parse(body);
              if (json.server_info) {
                json.server_info.url = req.headers.host || config.domain;
                json.server_info.port = req.headers['x-forwarded-port'] || '80';
              }
              body = JSON.stringify(json);
            } catch {}
          }

          const hdrs = { ...proxyRes.headers };
          delete hdrs['content-security-policy'];
          delete hdrs['content-length'];
          delete hdrs['content-encoding'];
          hdrs['cache-control'] = 'no-store, no-cache';
          hdrs['transfer-encoding'] = 'chunked';

          res.writeHead(proxyRes.statusCode, hdrs);
          res.end(body);

          const bytes = Buffer.byteLength(body);
          if (!bandwidthPerSecond[record.id]) bandwidthPerSecond[record.id] = 0;
          bandwidthPerSecond[record.id] += bytes;
          try { db.addBandwidth(bytes, record.id); } catch {}
        });
      } else {
        const hdrs = { ...proxyRes.headers };
        delete hdrs['content-security-policy'];
        hdrs['cache-control'] = 'no-store, no-cache';
        if (proxyRes.statusCode === 206) {
          hdrs['accept-ranges'] = 'bytes';
        }
        res.writeHead(proxyRes.statusCode, hdrs);
        streamTokenPipe(proxyRes, res, record);
      }
    });
    proxyReq.on('error', () => { res.writeHead(502); res.end('Stream unavailable'); });
  } catch (err) {
    console.error('[StreamToken] Error:', err);
    res.writeHead(500); res.end('Internal error');
  }
};
app.get('/stream/:token', streamTokenHandler);
app.get('/stream/:token/{*remainingPath}', streamTokenHandler);

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
// app.use('/api/paypal', paypalRoutes);
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
  const mergedServers = { ...serverConnections };
  for (const [key, val] of Object.entries(ns)) {
    if (key.startsWith('conn_')) {
      const pid = key.slice(5);
      mergedProxies[pid] = (mergedProxies[pid] || 0) + val;
    }
    if (key.startsWith('node_') && key.endsWith('_conns')) {
      const nodeId = key.replace('node_', '').replace('_conns', '');
      mergedServers[nodeId] = (mergedServers[nodeId] || 0) + val;
    }
  }
  res.json({ servers: mergedServers, proxies: mergedProxies });
});

app.get('/api/live-stats', (req, res) => {
  const { getNodeStats } = require('./routes/node.routes');
  const ns = getNodeStats();
  let totalActive = Object.values(activeConnections).reduce((s, v) => s + v, 0);
  const bwSource = Object.values(lastBandwidthSnapshot).some(v => v > 0) ? lastBandwidthSnapshot : bandwidthPerSecond;
  let totalBW = Object.values(bwSource).reduce((s, v) => s + v, 0);
  let reqsValue = lastGlobalReqsSnapshot || globalRequestsPerSec;
  for (const [key, val] of Object.entries(ns)) {
    if (key.startsWith('conn_')) totalActive += val;
    if (key.startsWith('bw_')) totalBW += val;
    if (key.endsWith('_rps')) reqsValue += val;
  }
  res.json({
    active_users: totalActive,
    bandwidth_mbps: (totalBW / 125000).toFixed(2),
    requests_per_sec: reqsValue,
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

  const bwSource = Object.values(lastBandwidthSnapshot).some(v => v > 0) ? lastBandwidthSnapshot : bandwidthPerSecond;

  let totalActiveUsers = Object.values(activeConnections).reduce((s, v) => s + v, 0);
  let totalBandwidthBytes = Object.values(bwSource).reduce((s, v) => s + v, 0);

  const mergedConns = { ...activeConnections };
  const mergedBw = { ...bwSource };
  let nodeReqs = 0;
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
    if (key.endsWith('_rps')) nodeReqs += val;
  }

  const reqsValue = (lastGlobalReqsSnapshot || globalRequestsPerSec) + nodeReqs;

  io.to('dashboard').emit('stats', {
    active_users: totalActiveUsers,
    bandwidth_mbps: (totalBandwidthBytes / 125000).toFixed(2),
    requests_per_sec: reqsValue,
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
      if (!isIpAllowed(record.ip_lock, clientIp)) { socket.destroy(); return; }

      const wsProxyType = record.stream_proxy === 2 ? 'stream' : 'dns';
      const { agent, serverId } = getProxyAgent(record.country, wsProxyType);
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
