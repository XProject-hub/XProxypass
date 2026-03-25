const express = require('express');
const db = require('../database');
const config = require('../config');

const router = express.Router();

const nodeStats = {};

function getNodeStats() { return nodeStats; }

function authenticateNode(req, res, next) {
  const secret = req.headers['x-node-secret'];
  if (!secret || secret !== config.nodeSecret) {
    return res.status(401).json({ error: 'Invalid node secret' });
  }
  next();
}

router.use(authenticateNode);

router.post('/validate-proxy', (req, res) => {
  try {
    const { subdomain, domain } = req.body;
    if (!subdomain) return res.status(400).json({ error: 'Subdomain required' });

    const proxy = db.getProxyBySubdomain(subdomain);
    if (!proxy) return res.json({ proxy: null });

    res.json({
      proxy: {
        id: proxy.id,
        subdomain: proxy.subdomain,
        target_url: proxy.target_url,
        country: proxy.country,
        is_active: proxy.is_active,
        stream_proxy: proxy.stream_proxy,
        bandwidth_limit: proxy.bandwidth_limit,
        bandwidth_used: proxy.bandwidth_used,
        expires_at: proxy.expires_at,
        proxy_domain: proxy.proxy_domain,
        requests_count: proxy.requests_count,
        ip_lock: proxy.ip_lock || null,
        speed_limit_mbps: proxy.speed_limit_mbps || 0,
      },
    });
  } catch (err) {
    console.error('Node validate-proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/report-stats', (req, res) => {
  try {
    const { connections, bandwidth, bandwidth_live, requests_per_sec } = req.body;
    const nodeId = req.headers['x-node-id'];

    if (bandwidth) {
      for (const [proxyId, bytes] of Object.entries(bandwidth)) {
        if (bytes > 0) {
          try { db.addBandwidth(bytes, parseInt(proxyId)); } catch {}
          try { db.incrementRequests(parseInt(proxyId)); } catch {}
        }
      }
    }

    if (connections) {
      for (const [proxyId, count] of Object.entries(connections)) {
        nodeStats[`conn_${proxyId}`] = count;
      }
    }
    if (bandwidth_live) {
      for (const [proxyId, bps] of Object.entries(bandwidth_live)) {
        nodeStats[`bw_${proxyId}`] = bps;
      }
    }
    if (nodeId) {
      nodeStats[`node_${nodeId}_time`] = Date.now();
      if (connections) {
        const totalConns = Object.values(connections).reduce((s, v) => s + v, 0);
        nodeStats[`node_${nodeId}_conns`] = totalConns;
      }
      if (requests_per_sec !== undefined) {
        nodeStats[`node_${nodeId}_rps`] = requests_per_sec;
      }
    }

    if (nodeId && connections) {
      const server = db.getServerById(parseInt(nodeId));
      if (server) {
        const totalConns = Object.values(connections).reduce((s, v) => s + v, 0);
        db.updateServerStatus(server.id, totalConns > 0 ? 'online' : server.status);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Node report-stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/validate-token', (req, res) => {
  try {
    const { token, remaining_path, client_ip } = req.body;
    if (!token) return res.status(400).json({ valid: false, error: 'Token required' });

    const tokenRecord = db.getStreamToken(token);
    if (!tokenRecord || tokenRecord.expires_at < Math.floor(Date.now() / 1000)) {
      return res.json({ valid: false, error: 'Token expired or invalid' });
    }
    if (!tokenRecord.is_active || tokenRecord.stream_proxy !== 2) {
      return res.json({ valid: false, error: 'Stream not found or not active' });
    }
    if (tokenRecord.proxy_expires_at && new Date(tokenRecord.proxy_expires_at) < new Date()) {
      return res.json({ valid: false, error: 'Proxy expired' });
    }
    if (tokenRecord.ip_lock && client_ip) {
      let allowed = true;
      try {
        const ips = JSON.parse(tokenRecord.ip_lock);
        if (Array.isArray(ips) && ips.length > 0) allowed = ips.includes(client_ip);
      } catch { allowed = tokenRecord.ip_lock === client_ip; }
      if (!allowed) return res.json({ valid: false, error: 'Access denied. Your IP is not whitelisted.' });
    }

    let creds = null;
    if (tokenRecord.credentials) {
      const crypto = require('crypto');
      try {
        const [ivHex, encrypted] = tokenRecord.credentials.split(':');
        const key = crypto.createHash('sha256').update(config.jwtSecret).digest();
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        creds = JSON.parse(decrypted);
      } catch {}
    }

    const remaining = String(remaining_path || '');
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

    const targetUrl = tokenRecord.target_url.replace(/\/$/, '') + streamPath;

    res.json({
      valid: true,
      target_url: targetUrl,
      proxy_id: tokenRecord.proxy_id,
      subdomain: tokenRecord.subdomain,
      proxy_domain: tokenRecord.proxy_domain,
      speed_limit_mbps: tokenRecord.speed_limit_mbps || 0,
      bandwidth_limit: tokenRecord.bandwidth_limit || 0,
      has_credentials: !!creds,
      creds_username: creds?.username || null,
      creds_password: creds?.password || null,
    });
  } catch (err) {
    console.error('Node validate-token error:', err);
    res.status(500).json({ valid: false, error: 'Internal server error' });
  }
});

router.post('/increment-requests', (req, res) => {
  try {
    const { proxy_id } = req.body;
    if (proxy_id) db.incrementRequests(proxy_id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
module.exports.getNodeStats = getNodeStats;
