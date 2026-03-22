const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'proxy-cache.json');
const UPDATE_INTERVAL = 30 * 60 * 1000; // 30 minutes
const PROXY_LIST_URL = 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.json';
const HEALTH_CHECK_TIMEOUT = 5000;
const MAX_HEALTH_CHECKS = 50; // check max 50 proxies per country to avoid overload

let proxyCache = { proxies: {}, verified: {}, lastUpdate: 0 };

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

function checkProxy(ip, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(HEALTH_CHECK_TIMEOUT);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, ip);
  });
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      proxyCache = data;
      if (!proxyCache.verified) proxyCache.verified = {};
      const count = Object.values(proxyCache.proxies).reduce((sum, arr) => sum + arr.length, 0);
      const verifiedCount = Object.values(proxyCache.verified).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`[ProxyPool] Loaded ${count} proxies (${verifiedCount} verified) from ${Object.keys(proxyCache.proxies).length} countries`);
    }
  } catch (err) {
    console.error('[ProxyPool] Cache load error:', err.message);
  }
}

function saveCache() {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(proxyCache));
  } catch (err) {
    console.error('[ProxyPool] Cache save error:', err.message);
  }
}

async function verifyProxies(countryCode, proxies) {
  const toCheck = proxies.slice(0, MAX_HEALTH_CHECKS);
  const results = await Promise.all(
    toCheck.map(async (p) => {
      const alive = await checkProxy(p.ip, p.port);
      return alive ? p : null;
    })
  );
  return results.filter(Boolean);
}

async function updateProxyList() {
  try {
    console.log('[ProxyPool] Fetching proxy list from proxifly...');
    const data = await fetchJSON(PROXY_LIST_URL);

    const byCountry = {};
    let total = 0;

    if (Array.isArray(data)) {
      for (const proxy of data) {
        if (!proxy.ip || !proxy.port) continue;

        const country = (proxy.geolocation?.country || proxy.country || 'UNKNOWN').toUpperCase();
        const protocol = (proxy.protocol || 'http').toLowerCase();

        if (!['http', 'https', 'socks4', 'socks5'].includes(protocol)) continue;

        const url = protocol.startsWith('socks')
          ? `socks${protocol === 'socks5' ? '5' : '4'}://${proxy.ip}:${proxy.port}`
          : `http://${proxy.ip}:${proxy.port}`;

        if (!byCountry[country]) byCountry[country] = [];
        byCountry[country].push({
          url,
          ip: proxy.ip,
          port: proxy.port,
          protocol,
          country,
          anonymity: proxy.anonymity || 'unknown',
          https: proxy.https || false,
        });
        total++;
      }
    }

    proxyCache.proxies = byCountry;
    proxyCache.lastUpdate = Date.now();

    console.log(`[ProxyPool] Fetched ${total} proxies from ${Object.keys(byCountry).length} countries`);
    console.log('[ProxyPool] Verifying top proxies per country...');

    const verified = {};
    const countries = Object.keys(byCountry);

    for (let i = 0; i < countries.length; i += 10) {
      const batch = countries.slice(i, i + 10);
      await Promise.all(batch.map(async (cc) => {
        const httpProxies = byCountry[cc].filter(p => p.protocol === 'http' || p.protocol === 'https');
        if (httpProxies.length > 0) {
          const alive = await verifyProxies(cc, httpProxies);
          if (alive.length > 0) verified[cc] = alive;
        }
      }));
    }

    proxyCache.verified = verified;
    saveCache();

    const verifiedTotal = Object.values(verified).reduce((s, a) => s + a.length, 0);
    console.log(`[ProxyPool] Verified: ${verifiedTotal} working proxies from ${Object.keys(verified).length} countries`);

    return true;
  } catch (err) {
    console.error('[ProxyPool] Update failed:', err.message);
    return false;
  }
}

function getProxiesForCountry(countryCode) {
  if (!countryCode || countryCode === 'auto') return [];
  const code = countryCode.toUpperCase();
  return proxyCache.verified[code] || proxyCache.proxies[code] || [];
}

function getRandomProxy(countryCode) {
  const verified = proxyCache.verified[countryCode?.toUpperCase()];
  if (verified && verified.length > 0) {
    return verified[Math.floor(Math.random() * verified.length)];
  }
  const all = getProxiesForCountry(countryCode);
  if (all.length === 0) return null;
  const httpOnly = all.filter(p => p.protocol === 'http' || p.protocol === 'https');
  const pool = httpOnly.length > 0 ? httpOnly : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getAvailableCountries() {
  const allCodes = new Set([
    ...Object.keys(proxyCache.proxies),
    ...Object.keys(proxyCache.verified),
  ]);
  return Array.from(allCodes).sort().map(code => ({
    code,
    total: (proxyCache.proxies[code] || []).length,
    verified: (proxyCache.verified[code] || []).length,
  }));
}

function getStats() {
  const countries = Object.keys(proxyCache.proxies);
  const total = countries.reduce((sum, c) => sum + proxyCache.proxies[c].length, 0);
  const verifiedTotal = Object.values(proxyCache.verified || {}).reduce((s, a) => s + a.length, 0);
  return {
    total_proxies: total,
    verified_proxies: verifiedTotal,
    total_countries: countries.length,
    verified_countries: Object.keys(proxyCache.verified || {}).length,
    last_update: proxyCache.lastUpdate ? new Date(proxyCache.lastUpdate).toISOString() : null,
    next_update: proxyCache.lastUpdate ? new Date(proxyCache.lastUpdate + UPDATE_INTERVAL).toISOString() : null,
  };
}

function init() {
  loadCache();
  const needsUpdate = !proxyCache.lastUpdate || (Date.now() - proxyCache.lastUpdate > UPDATE_INTERVAL);
  if (needsUpdate) updateProxyList();
  setInterval(updateProxyList, UPDATE_INTERVAL);
  console.log('[ProxyPool] Initialized (updates every 30min, verifies proxies)');
}

module.exports = { init, getRandomProxy, getProxiesForCountry, getAvailableCountries, getStats, updateProxyList };
