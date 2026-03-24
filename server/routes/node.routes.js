const express = require('express');
const db = require('../database');
const config = require('../config');

const router = express.Router();

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
      },
    });
  } catch (err) {
    console.error('Node validate-proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/report-stats', (req, res) => {
  try {
    const { connections, bandwidth } = req.body;
    const nodeId = req.headers['x-node-id'];

    if (bandwidth) {
      for (const [proxyId, bytes] of Object.entries(bandwidth)) {
        if (bytes > 0) {
          try { db.addBandwidth(bytes, parseInt(proxyId)); } catch {}
          try { db.incrementRequests(parseInt(proxyId)); } catch {}
        }
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
