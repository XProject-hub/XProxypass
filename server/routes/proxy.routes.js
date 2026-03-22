const express = require('express');
const { authenticate } = require('../auth');
const db = require('../database');

const router = express.Router();

const RESERVED = new Set([
  'api', 'www', 'mail', 'admin', 'ftp', 'smtp', 'pop', 'imap',
  'ns1', 'ns2', 'cdn', 'static', 'assets', 'panel', 'dashboard',
  'login', 'register', 'app', 'dev', 'staging', 'test',
]);

const VALID_COUNTRIES = new Set(db.COUNTRIES.map(c => c.code));

router.use(authenticate);

router.get('/countries', (req, res) => {
  res.json({ countries: db.COUNTRIES });
});

router.get('/', (req, res) => {
  try {
    const proxies = db.getProxiesByUser(req.user.id);
    res.json({ proxies });
  } catch (err) {
    console.error('Get proxies error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', (req, res) => {
  try {
    const { subdomain, target_url, country, expires_at } = req.body;

    if (!subdomain || !target_url) {
      return res.status(400).json({ error: 'Subdomain and target URL are required' });
    }

    const user = db.getUserById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (user.credits < 1 && !user.is_admin) {
      return res.status(403).json({ error: 'Insufficient credits. You need at least 1 credit to create a proxy.' });
    }

    const sub = subdomain.toLowerCase().trim();

    if (sub.length < 2 || sub.length > 32) {
      return res.status(400).json({ error: 'Subdomain must be 2-32 characters' });
    }

    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sub)) {
      return res.status(400).json({ error: 'Subdomain can only contain lowercase letters, numbers, and hyphens' });
    }

    if (RESERVED.has(sub)) {
      return res.status(400).json({ error: 'This subdomain is reserved' });
    }

    if (db.subdomainExists(sub)) {
      return res.status(409).json({ error: 'Subdomain already taken' });
    }

    try { new URL(target_url); } catch {
      return res.status(400).json({ error: 'Invalid target URL' });
    }

    const selectedCountry = (country && VALID_COUNTRIES.has(country)) ? country : 'auto';

    let expiry = null;
    if (expires_at) {
      const d = new Date(expires_at);
      if (isNaN(d.getTime()) || d <= new Date()) {
        return res.status(400).json({ error: 'Expiration date must be in the future' });
      }
      expiry = d.toISOString();
    }

    if (!user.is_admin) {
      db.deductCredit(req.user.id);
      const after = db.getUserById(req.user.id);
      db.addCreditHistory(req.user.id, user.username, -1, after.credits, 'proxy_created', `Created proxy: ${sub}`);
    }

    const result = db.createProxy(req.user.id, sub, target_url, selectedCountry, expiry);
    const proxy = db.getProxyById(result.lastInsertRowid);

    db.addActivityLog(req.user.id, user.username, req.ip, 'Proxy', 'Create', `${sub} -> ${target_url} [${selectedCountry}]`);

    res.status(201).json({ proxy });
  } catch (err) {
    console.error('Create proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.toggleProxy(id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Proxy not found' });

    const proxy = db.getProxyById(id);
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Proxy', 'Toggle', `${proxy.subdomain} -> ${proxy.is_active ? 'active' : 'paused'}`);

    res.json({ proxy });
  } catch (err) {
    console.error('Toggle proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const proxy = db.getProxyById(id);
    const result = db.deleteProxy(id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Proxy not found' });

    if (proxy) {
      db.addActivityLog(req.user.id, req.user.username, req.ip, 'Proxy', 'Delete', proxy.subdomain);
    }

    res.json({ message: 'Proxy deleted' });
  } catch (err) {
    console.error('Delete proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
