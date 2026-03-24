const https = require('https');
const config = require('./config');

function cloudflareRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    if (!config.cloudflareToken || !config.cloudflareZoneId) {
      return reject(new Error('Cloudflare not configured'));
    }

    const postData = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'api.cloudflare.com',
      port: 443,
      path: `/client/v4/zones/${config.cloudflareZoneId}${path}`,
      method,
      timeout: 15000,
      headers: {
        'Authorization': `Bearer ${config.cloudflareToken}`,
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ success: false, errors: [{ message: 'Invalid response' }] }); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (postData) req.write(postData);
    req.end();
  });
}

async function createARecord(subdomain, domain, ip) {
  try {
    const name = `${subdomain}.${domain}`;
    console.log(`[DNS] Creating A record: ${name} -> ${ip}`);

    const existing = await findRecord(name);
    if (existing) {
      const result = await cloudflareRequest('PUT', `/dns_records/${existing.id}`, {
        type: 'A',
        name,
        content: ip,
        ttl: 1,
        proxied: false,
      });
      console.log(`[DNS] Updated: ${name} -> ${ip} (${result.success ? 'OK' : 'FAILED'})`);
      return result.success;
    }

    const result = await cloudflareRequest('POST', '/dns_records', {
      type: 'A',
      name,
      content: ip,
      ttl: 1,
      proxied: false,
    });

    console.log(`[DNS] Created: ${name} -> ${ip} (${result.success ? 'OK' : 'FAILED'})`);
    return result.success;
  } catch (err) {
    console.error(`[DNS] Error creating record: ${err.message}`);
    return false;
  }
}

async function deleteARecord(subdomain, domain) {
  try {
    const name = `${subdomain}.${domain}`;
    const record = await findRecord(name);
    if (!record) {
      console.log(`[DNS] Record not found: ${name}`);
      return true;
    }

    const result = await cloudflareRequest('DELETE', `/dns_records/${record.id}`);
    console.log(`[DNS] Deleted: ${name} (${result.success ? 'OK' : 'FAILED'})`);
    return result.success;
  } catch (err) {
    console.error(`[DNS] Error deleting record: ${err.message}`);
    return false;
  }
}

async function findRecord(name) {
  try {
    const result = await cloudflareRequest('GET', `/dns_records?type=A&name=${encodeURIComponent(name)}`);
    if (result.success && result.result && result.result.length > 0) {
      return result.result[0];
    }
  } catch {}
  return null;
}

function isConfigured() {
  return !!(config.cloudflareToken && config.cloudflareZoneId);
}

async function getNodeIPForCountry(country, db) {
  const servers = db.getAllServers().filter(s => s.country === country && s.status === 'online');
  if (servers.length === 0) return null;
  servers.sort((a, b) => {
    const aConn = 0;
    const bConn = 0;
    return aConn - bConn;
  });
  return servers[0].ip;
}

module.exports = { createARecord, deleteARecord, isConfigured, getNodeIPForCountry };
