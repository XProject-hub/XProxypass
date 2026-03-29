#!/usr/bin/env node

/**
 * ProxyXPass Node Agent
 * Runs on VPS proxy nodes. Handles proxy traffic using own bandwidth.
 * Validates proxies via Master API. Reports stats back to Master.
 */

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const httpProxy = require('http-proxy');
require('events').EventEmitter.defaultMaxListeners = 0;

const net = require('net');

const MASTER_URL = process.env.MASTER_URL || 'https://proxyxpass.com';
const NODE_SECRET = process.env.NODE_SECRET || '';
const NODE_PORT = parseInt(process.env.NODE_PORT, 10) || 3000;
const NODE_ID = process.env.NODE_ID || '';

function checkLocalSquid() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(3128, '127.0.0.1');
  });
}

const proxy = httpProxy.createProxyServer({ xfwd: true });
const proxyCache = {};
const CACHE_TTL = 60000;
const activeConnections = {};
const bandwidthPerSecond = {};
const bandwidthTotal = {};
let requestsPerSecond = 0;
let lastRequestsSnapshot = 0;

proxy.on('error', (err, req, res) => {
  if (res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'text/html' });
    res.end('<html><body style="background:#06060a;color:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif"><div style="text-align:center"><h1 style="font-size:4rem;background:linear-gradient(135deg,#06b6d4,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">502</h1><p style="color:#94a3b8">Backend unavailable</p></div></body></html>');
  }
});

async function masterAPI(endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, MASTER_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    const postData = JSON.stringify(body);

    const req = client.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Node-Secret': NODE_SECRET,
        'X-Node-ID': NODE_ID,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(postData);
    req.end();
  });
}

async function getProxy(subdomain, domain) {
  const key = `${subdomain}.${domain}`;
  const cached = proxyCache[key];
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }

  try {
    const result = await masterAPI('/api/node/validate-proxy', { subdomain, domain });
    if (result && result.proxy) {
      proxyCache[key] = { data: result.proxy, time: Date.now() };
      return result.proxy;
    }
  } catch (err) {
    console.error(`[NodeAgent] Master API error: ${err.message}`);
    if (cached) return cached.data;
  }
  return null;
}

function getSubdomain(hostname) {
  if (!hostname) return null;
  hostname = hostname.replace(/^www\./, '');
  const parts = hostname.split('.');
  if (parts.length < 3) return null;
  const sub = parts[0].replace(/^www\./, '');
  const domain = parts.slice(1).join('.');
  return { subdomain: sub, domain };
}

const STREAM_EXTENSIONS = /\.(ts|m3u8|m3u|mpd|mp4|mkv|avi|flv|wmv|mov|webm|mpg|mpeg)(\?|$)/i;

function isStreamRequest(req) {
  const url = req.url || '';
  if (STREAM_EXTENSIONS.test(url)) return true;
  if (url.includes('/live/') || url.includes('/movie/') || url.includes('/series/')) return true;
  return false;
}

function checkBandwidthLimit(proxyId, limitMbps) {
  if (!limitMbps || limitMbps <= 0) return true;
  return (bandwidthPerSecond[proxyId] || 0) < limitMbps * 125000;
}

const lastBwActivity = {};
setInterval(() => {
  for (const id in bandwidthPerSecond) {
    if (bandwidthPerSecond[id] > 0) lastBwActivity[id] = Date.now();
    bandwidthPerSecond[id] = 0;
  }
  lastRequestsSnapshot = requestsPerSecond;
  requestsPerSecond = 0;
}, 1000);

setInterval(() => {
  const now = Date.now();
  for (const id in activeConnections) {
    if (activeConnections[id] > 0 && (!lastBwActivity[id] || now - lastBwActivity[id] > 60000)) {
      activeConnections[id] = 0;
    }
  }
}, 30000);

setInterval(async () => {
  try {
    await masterAPI('/api/node/report-stats', {
      connections: activeConnections,
      bandwidth: bandwidthTotal,
      bandwidth_live: { ...bandwidthPerSecond },
      requests_per_sec: lastRequestsSnapshot || requestsPerSecond,
    });
    for (const id in bandwidthTotal) bandwidthTotal[id] = 0;
  } catch {}
}, 10000);

const tokenCache = {};
const TOKEN_CACHE_TTL = 30000;

async function validateToken(token, remainingPath, clientIp) {
  const cacheKey = `${token}:${remainingPath || ''}`;
  const cached = tokenCache[cacheKey];
  if (cached && Date.now() - cached.time < TOKEN_CACHE_TTL) return cached.data;
  try {
    const result = await masterAPI('/api/node/validate-token', { token, remaining_path: remainingPath, client_ip: clientIp });
    if (result && result.valid) {
      tokenCache[cacheKey] = { data: result, time: Date.now() };
    }
    return result;
  } catch (err) {
    console.error(`[NodeAgent] Token validation error: ${err.message}`);
    if (cached) return cached.data;
    return null;
  }
}

function handleTokenStream(req, res, tokenData) {
  const proxyId = tokenData.proxy_id;
  const targetUrl = tokenData.target_url;
  const speedLimit = tokenData.speed_limit_mbps || tokenData.bandwidth_limit || 0;

  if (speedLimit > 0 && !checkBandwidthLimit(proxyId, speedLimit)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Speed limit reached.' }));
  }

  if (!activeConnections[proxyId]) activeConnections[proxyId] = 0;
  activeConnections[proxyId]++;
  requestsPerSecond++;
  let connClosed = false;
  const closeConn = () => { if (!connClosed) { connClosed = true; if (activeConnections[proxyId] > 0) activeConnections[proxyId]--; } };
  res.on('close', closeConn);
  res.on('error', closeConn);
  req.on('close', closeConn);
  req.on('aborted', closeConn);
  req.socket?.on('close', closeConn);

  const record = { id: proxyId };
  const tokenStr = req.url.split('/stream/')[1]?.split('/')[0] || '';
  const host = req.headers.host || '';
  const tokenBaseUrl = `http://${host}/stream/${tokenStr}`;

  const parsedTarget = new URL(targetUrl);
  const httpClient = targetUrl.startsWith('https') ? https : http;
  const proxyReqOpts = {
    hostname: parsedTarget.hostname,
    port: parsedTarget.port || (targetUrl.startsWith('https') ? 443 : 80),
    path: parsedTarget.pathname + parsedTarget.search,
    timeout: 30000,
    headers: {},
  };

  const fwdHeaders = ['range', 'accept', 'user-agent', 'accept-encoding',
    'accept-language', 'if-range', 'if-none-match', 'if-modified-since', 'connection'];
  for (const h of fwdHeaders) {
    if (req.headers[h]) proxyReqOpts.headers[h] = req.headers[h];
  }
  proxyReqOpts.headers['host'] = parsedTarget.host;

  const proxyReq = httpClient.get(proxyReqOpts, (proxyRes) => {
    if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
      proxyRes.resume();
      const rdUrl = proxyRes.headers.location;
      const cl2 = rdUrl.startsWith('https') ? https : http;
      cl2.get(rdUrl, { timeout: 30000 }, (finalRes) => {
        streamResponse(finalRes, res, record);
      }).on('error', () => {
        if (!res.headersSent) { res.writeHead(502); res.end('Stream unavailable'); }
      });
      return;
    }

    const contentType = proxyRes.headers['content-type'] || '';
    const fullPath = (parsedTarget.pathname || '').toLowerCase();
    const isTextResponse = contentType.includes('text') || contentType.includes('json') ||
      contentType.includes('mpegurl') || contentType.includes('xml') || contentType.includes('javascript') ||
      (contentType.includes('octet-stream') && (fullPath.includes('get.php') || fullPath.includes('.m3u') || fullPath.includes('player_api')));

    if (isTextResponse && tokenData.has_credentials) {
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
        try { targetHost = new URL(tokenData.target_url || targetUrl).host; } catch { targetHost = ''; }

        body = body.replace(/https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?\/[^\s"'<>)]+/g, (match) => {
          try {
            const u = new URL(match);
            if (u.hostname === 'logo.m3uassets.com' || /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(match)) return match;
            let cleanPath = u.pathname;
            if (tokenData.creds_username) {
              cleanPath = cleanPath.replace(`/${tokenData.creds_username}/${tokenData.creds_password}`, '');
              cleanPath = cleanPath.replace(`/${tokenData.creds_username}`, '');
            }
            if (!cleanPath || cleanPath === '/') cleanPath = '';
            return tokenBaseUrl + cleanPath + u.search;
          } catch { return match; }
        });

        if (body.includes('"url"') && body.includes('"port"')) {
          try {
            const json = JSON.parse(body);
            if (json.server_info) {
              json.server_info.url = host.split(':')[0];
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
        if (!bandwidthPerSecond[proxyId]) bandwidthPerSecond[proxyId] = 0;
        bandwidthPerSecond[proxyId] += bytes;
        addBW(proxyId, bytes);
      });
    } else {
      const hdrs = { ...proxyRes.headers };
      delete hdrs['content-security-policy'];
      hdrs['cache-control'] = 'no-store, no-cache';
      if (proxyRes.statusCode === 206) hdrs['accept-ranges'] = 'bytes';
      if (!res.headersSent) res.writeHead(proxyRes.statusCode, hdrs);
      let pending = 0;
      const flush = setInterval(() => { if (pending > 0) { addBW(proxyId, pending); pending = 0; } }, 5000);
      proxyRes.on('data', chunk => {
        res.write(chunk);
        pending += chunk.length;
        if (!bandwidthPerSecond[proxyId]) bandwidthPerSecond[proxyId] = 0;
        bandwidthPerSecond[proxyId] += chunk.length;
      });
      proxyRes.on('end', () => { clearInterval(flush); res.end(); if (pending > 0) addBW(proxyId, pending); });
      res.on('close', () => { clearInterval(flush); proxyRes.destroy(); if (pending > 0) addBW(proxyId, pending); });
    }
  });
  proxyReq.on('error', () => { if (!res.headersSent) { res.writeHead(502); res.end('Stream unavailable'); } });
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    const squidOk = await checkLocalSquid();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok', node_id: NODE_ID,
      connections: activeConnections,
      squid: squidOk ? 'running' : 'down',
      uptime: process.uptime(),
    }));
  }

  // Handle token-based streams: /stream/TOKEN or /stream/TOKEN/path
  const streamMatch = req.url.match(/^\/stream\/([a-f0-9]+)(?:\/(.*))?$/);
  if (streamMatch) {
    const token = streamMatch[1];
    const remainingPath = streamMatch[2] || '';
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.socket?.remoteAddress;
    const tokenData = await validateToken(token, remainingPath, clientIp);
    if (!tokenData || !tokenData.valid) {
      res.writeHead(tokenData?.error?.includes('IP') ? 403 : 401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: tokenData?.error || 'Token invalid' }));
    }
    return handleTokenStream(req, res, tokenData);
  }

  const result = getSubdomain(req.headers.host?.split(':')[0]);
  if (!result) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not a proxy request');
  }

  const { subdomain, domain } = result;
  const record = await getProxy(subdomain, domain);

  if (!record || !record.is_active || (record.expires_at && new Date(record.expires_at) < new Date())) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    return res.end('<html><body style="background:#06060a;color:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif"><div style="text-align:center"><h1 style="font-size:4rem;background:linear-gradient(135deg,#06b6d4,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">404</h1><p style="color:#94a3b8">Proxy not found or inactive</p></div></body></html>');
  }

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.socket?.remoteAddress;
  if (record.ip_lock) {
    let allowed = true;
    try {
      const ips = JSON.parse(record.ip_lock);
      if (Array.isArray(ips) && ips.length > 0) allowed = ips.includes(clientIp);
    } catch { allowed = record.ip_lock === clientIp; }
    if (!allowed) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Access denied. Your IP is not whitelisted.' }));
    }
  }

  const DNS_BW_LIMIT = 50;

  if (record.stream_proxy === 2) {
    const speedLimit = record.speed_limit_mbps || record.bandwidth_limit || 0;
    if (speedLimit > 0 && !checkBandwidthLimit(record.id, speedLimit)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Speed limit reached.' }));
    }
  }

  if (record.stream_proxy !== 2 && !checkBandwidthLimit(record.id, DNS_BW_LIMIT)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Bandwidth limit exceeded.' }));
  }

  if (!activeConnections[record.id]) activeConnections[record.id] = 0;
  activeConnections[record.id]++;
  requestsPerSecond++;
  let connClosed2 = false;
  const closeConn2 = () => { if (!connClosed2) { connClosed2 = true; if (activeConnections[record.id] > 0) activeConnections[record.id]--; } };
  res.on('close', closeConn2);
  res.on('error', closeConn2);
  req.on('close', closeConn2);
  req.on('aborted', closeConn2);
  req.socket?.on('close', closeConn2);

  const proxyHost = `${subdomain}.${record.proxy_domain || domain}`;

  const proxyOptions = {
    target: record.target_url,
    changeOrigin: true,
    selfHandleResponse: true,
  };

  proxy.once('proxyRes', (proxyRes) => {
    if (record.stream_proxy === 2 && [301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
      proxyRes.resume();
      const redirectUrl = proxyRes.headers.location;
      const cl = redirectUrl.startsWith('https') ? https : http;
      cl.get(redirectUrl, { timeout: 30000 }, (rRes) => {
        if ([301, 302, 307, 308].includes(rRes.statusCode) && rRes.headers.location) {
          rRes.resume();
          const cl2 = rRes.headers.location.startsWith('https') ? https : http;
          cl2.get(rRes.headers.location, { timeout: 30000 }, (fRes) => {
            streamResponse(fRes, res, record, proxyHost);
          }).on('error', () => { res.writeHead(502); res.end('Stream unavailable'); });
          return;
        }
        streamResponse(rRes, res, record, proxyHost);
      });
      return;
    }

    handleProxyResponse(proxyRes, req, res, record, proxyHost);
  });

  proxy.web(req, res, proxyOptions);
});

function streamResponse(srcRes, clientRes, record, proxyHost) {
  const hdrs = { ...srcRes.headers };
  delete hdrs['content-security-policy'];
  hdrs['cache-control'] = 'no-store, no-cache';
  clientRes.writeHead(srcRes.statusCode, hdrs);
  let pending = 0;
  const flush = setInterval(() => {
    if (pending > 0) { addBW(record.id, pending); pending = 0; }
  }, 5000);
  srcRes.on('data', chunk => {
    clientRes.write(chunk);
    pending += chunk.length;
    if (!bandwidthPerSecond[record.id]) bandwidthPerSecond[record.id] = 0;
    bandwidthPerSecond[record.id] += chunk.length;
  });
  srcRes.on('end', () => { clearInterval(flush); clientRes.end(); if (pending > 0) addBW(record.id, pending); });
  clientRes.on('close', () => { clearInterval(flush); srcRes.destroy(); if (pending > 0) addBW(record.id, pending); });
}

function addBW(id, bytes) {
  if (!bandwidthTotal[id]) bandwidthTotal[id] = 0;
  bandwidthTotal[id] += bytes;
}

function handleProxyResponse(proxyRes, req, res, record, proxyHost) {
  const contentType = proxyRes.headers['content-type'] || '';
  let targetHost, targetOrigin;
  try {
    const u = new URL(record.target_url);
    targetHost = u.host;
    targetOrigin = u.origin;
  } catch { targetHost = ''; targetOrigin = ''; }

  const targetHostname = targetHost ? targetHost.split(':')[0] : '';
  const proxyHostname = proxyHost.split(':')[0];

  const proxyProto = req.headers['x-forwarded-proto'] || 'http';

  function rewriteUrl(str) {
    if (!str) return str;
    if (targetHost) {
      str = str.split(`https://www.${targetHost}`).join(`${proxyProto}://${proxyHost}`);
      str = str.split(`http://www.${targetHost}`).join(`${proxyProto}://${proxyHost}`);
      str = str.split(targetOrigin).join(`${proxyProto}://${proxyHost}`);
      str = str.split(`http://${targetHost}`).join(`${proxyProto}://${proxyHost}`);
      str = str.split(`www.${targetHost}`).join(proxyHost);
      str = str.split(targetHost).join(proxyHost);
    }
    if (targetHostname && targetHostname !== targetHost) {
      str = str.split(`"url":"${targetHostname}"`).join(`"url":"${proxyHostname}"`);
    }
    str = str.split(`www.${proxyHost}`).join(proxyHost);
    return str;
  }

  const SKIP_EXT = /\.(png|jpg|jpeg|gif|svg|ico|webp|bmp|css|woff|woff2|ttf|eot)$/i;
  const SKIP_HOST = /m3uassets\.com|imgur\.com|googleusercontent\.com|cloudinary\.com|cdn\./i;

  function rewriteExternalUrl(match) {
    try {
      if (SKIP_EXT.test(match)) return match;
      const u = new URL(match);
      if (u.host === proxyHost || u.hostname === 'localhost') return match;
      if (SKIP_HOST.test(u.hostname)) return match;
      const port = u.port && u.port !== '80' && u.port !== '443' ? `:${u.port}` : '';
      return `${proxyProto}://${proxyHostname}${port}${u.pathname}${u.search}${u.hash}`;
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

  function rewriteAll(str) {
    if (!str) return str;
    str = rewriteUrl(str);
    if (record.stream_proxy === 2) {
      const isM3U = str.trimStart().startsWith('#EXTM3U') || str.trimStart().startsWith('#EXTINF');
      if (isM3U) return rewriteM3UContent(str);
      str = str.replace(/https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[^\s"'<>)]*)?/g, rewriteExternalUrl);
    }
    return str;
  }

  const newHeaders = { ...proxyRes.headers };
  if (newHeaders.location) newHeaders.location = rewriteUrl(newHeaders.location);
  if (newHeaders['content-location']) newHeaders['content-location'] = rewriteUrl(newHeaders['content-location']);
  if (newHeaders['set-cookie']) {
    const escHost = targetHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    newHeaders['set-cookie'] = (Array.isArray(newHeaders['set-cookie']) ? newHeaders['set-cookie'] : [newHeaders['set-cookie']])
      .map(c => rewriteUrl(c.replace(new RegExp(`domain=\\.?${escHost}`, 'gi'), `domain=.${proxyHost}`)));
  }
  if (newHeaders.refresh) newHeaders.refresh = rewriteUrl(newHeaders.refresh);

  delete newHeaders['content-security-policy'];
  delete newHeaders['content-security-policy-report-only'];
  delete newHeaders['x-frame-options'];
  delete newHeaders['strict-transport-security'];
  newHeaders['cache-control'] = 'no-store, no-cache, must-revalidate';
  newHeaders['pragma'] = 'no-cache';
  newHeaders['expires'] = '0';
  delete newHeaders['etag'];
  delete newHeaders['last-modified'];

  const reqPath = (req.url || '').toLowerCase();
  const isM3U = reqPath.includes('get.php') || reqPath.includes('.m3u') || reqPath.includes('.m3u8') || reqPath.includes('player_api') || reqPath.includes('xmltv') || reqPath.includes('epg');

  const isRewritable = contentType.includes('text') || contentType.includes('json') ||
    contentType.includes('mpegurl') || contentType.includes('x-mpegURL') ||
    contentType.includes('xml') || contentType.includes('vnd.apple') ||
    contentType.includes('javascript') ||
    (contentType.includes('octet-stream') && isM3U);

  if (isRewritable) {
    const chunks = [];
    proxyRes.on('data', chunk => chunks.push(chunk));
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

      body = record.stream_proxy === 2 ? rewriteAll(body) : rewriteUrl(body);

      if (body.includes('"server_info"') && body.includes('"url"')) {
        try {
          const json = JSON.parse(body);
          if (json.server_info) {
            json.server_info.url = proxyHostname;
            json.server_info.port = req.headers['x-forwarded-port'] || '80';
            if (json.server_info.https_port) json.server_info.https_port = '443';
          }
          body = JSON.stringify(json);
        } catch {}
      }

      const isHtmlResponse = contentType.includes('text/html') || (body.includes('<html') && body.includes('<head'));
      if (isHtmlResponse) {
        body = body.replace(/<base\s+href=["'][^"']*["']/gi, `<base href="https://${proxyHost}/"`);
        body = body.replace(/(<head[^>]*>)/i, `$1<script>if(window.location.hostname!=='${proxyHost}'){window.location.hostname='${proxyHost}';}</script>`);
      }

      delete newHeaders['content-length'];
      delete newHeaders['content-encoding'];
      newHeaders['transfer-encoding'] = 'chunked';

      res.writeHead(proxyRes.statusCode, newHeaders);
      res.end(body);

      const bytes = Buffer.byteLength(body);
      if (!bandwidthPerSecond[record.id]) bandwidthPerSecond[record.id] = 0;
      bandwidthPerSecond[record.id] += bytes;
      addBW(record.id, bytes);
    });
  } else {
    res.writeHead(proxyRes.statusCode, newHeaders);
    let pending = 0;
    const flush = setInterval(() => { if (pending > 0) { addBW(record.id, pending); pending = 0; } }, 5000);
    proxyRes.on('data', chunk => {
      res.write(chunk);
      pending += chunk.length;
      if (!bandwidthPerSecond[record.id]) bandwidthPerSecond[record.id] = 0;
      bandwidthPerSecond[record.id] += chunk.length;
    });
    proxyRes.on('end', () => { clearInterval(flush); res.end(); if (pending > 0) addBW(record.id, pending); });
    res.on('close', () => { clearInterval(flush); if (pending > 0) addBW(record.id, pending); });
  }
}

server.on('upgrade', async (req, socket, head) => {
  const result = getSubdomain(req.headers.host?.split(':')[0]);
  if (!result) { socket.destroy(); return; }
  const record = await getProxy(result.subdomain, result.domain);
  if (record && record.is_active) {
    proxy.ws(req, socket, head, { target: record.target_url, changeOrigin: true });
  } else {
    socket.destroy();
  }
});

server.listen(NODE_PORT, () => {
  console.log(`[NodeAgent] Running on port ${NODE_PORT}`);
  console.log(`[NodeAgent] Master: ${MASTER_URL}`);
  console.log(`[NodeAgent] Node ID: ${NODE_ID}`);
});
