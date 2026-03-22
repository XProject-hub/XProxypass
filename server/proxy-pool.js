const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'proxy-cache.json');
const UPDATE_INTERVAL = 12 * 60 * 60 * 1000;
const PROXY_LIST_URL = 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.json';

let proxyCache = { proxies: {}, lastUpdate: 0 };

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      proxyCache = data;
      const count = Object.values(proxyCache.proxies).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`[ProxyPool] Loaded ${count} proxies from cache (${Object.keys(proxyCache.proxies).length} countries)`);
    }
  } catch (err) {
    console.error('[ProxyPool] Cache load error:', err.message);
  }
}

function saveCache() {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(proxyCache, null, 2));
  } catch (err) {
    console.error('[ProxyPool] Cache save error:', err.message);
  }
}

async function updateProxyList() {
  try {
    console.log('[ProxyPool] Fetching proxy list...');
    const data = await fetchJSON(PROXY_LIST_URL);

    const byCountry = {};
    let total = 0;

    if (Array.isArray(data)) {
      for (const proxy of data) {
        if (!proxy.ip || !proxy.port) continue;
        if (proxy.alive === false) continue;

        const country = (proxy.country || proxy.geolocation?.country || 'UNKNOWN').toUpperCase();
        const protocol = (proxy.protocol || 'http').toLowerCase();
        const url = `${protocol}://${proxy.ip}:${proxy.port}`;

        if (!byCountry[country]) byCountry[country] = [];
        byCountry[country].push({
          url,
          ip: proxy.ip,
          port: proxy.port,
          protocol,
          country,
          anonymity: proxy.anonymity || 'unknown',
        });
        total++;
      }
    }

    proxyCache = { proxies: byCountry, lastUpdate: Date.now() };
    saveCache();

    console.log(`[ProxyPool] Updated: ${total} proxies across ${Object.keys(byCountry).length} countries`);
    return true;
  } catch (err) {
    console.error('[ProxyPool] Update failed:', err.message);
    return false;
  }
}

function getProxiesForCountry(countryCode) {
  if (!countryCode || countryCode === 'auto') return [];
  const code = countryCode.toUpperCase();
  return proxyCache.proxies[code] || [];
}

function getRandomProxy(countryCode) {
  const proxies = getProxiesForCountry(countryCode);
  if (proxies.length === 0) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
}

function getAvailableCountries() {
  return Object.keys(proxyCache.proxies).sort().map(code => ({
    code,
    count: proxyCache.proxies[code].length,
  }));
}

function getStats() {
  const countries = Object.keys(proxyCache.proxies);
  const total = countries.reduce((sum, c) => sum + proxyCache.proxies[c].length, 0);
  return {
    total_proxies: total,
    total_countries: countries.length,
    last_update: proxyCache.lastUpdate ? new Date(proxyCache.lastUpdate).toISOString() : null,
  };
}

function init() {
  loadCache();

  const needsUpdate = !proxyCache.lastUpdate || (Date.now() - proxyCache.lastUpdate > UPDATE_INTERVAL);
  if (needsUpdate) {
    updateProxyList();
  }

  setInterval(updateProxyList, UPDATE_INTERVAL);
  console.log('[ProxyPool] Initialized (updates every 12h)');
}

module.exports = {
  init,
  getRandomProxy,
  getProxiesForCountry,
  getAvailableCountries,
  getStats,
  updateProxyList,
};
