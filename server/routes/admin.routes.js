const express = require('express');
const { authenticate } = require('../auth');
const db = require('../database');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const user = db.getUserById(req.user.id);
  if (!user || !user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.use(authenticate);
router.use(requireAdmin);

router.get('/users', (req, res) => {
  try { res.json({ users: db.getAllUsers() }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/proxies', (req, res) => {
  try { res.json({ proxies: db.getAllProxies() }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/credit-history', (req, res) => {
  try { res.json({ history: db.getCreditHistory() }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/activity-log', (req, res) => {
  try { res.json({ logs: db.getActivityLogs() }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/users/:id/credits', (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    if (!amount || amount < 1 || amount > 10000) {
      return res.status(400).json({ error: 'Amount must be between 1 and 10000' });
    }
    const user = db.getUserById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.addCredits(Math.floor(amount), id);
    const updated = db.getUserById(id);

    db.addCreditHistory(parseInt(id), user.username, Math.floor(amount), updated.credits, 'admin_added', `Added by admin: ${req.user.username}`);
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Credits', 'Add', `+${amount} credits to ${user.username} (balance: ${updated.credits})`);

    res.json({ user: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.patch('/users/:id/admin', (req, res) => {
  try {
    const { id } = req.params;
    const { is_admin } = req.body;
    const user = db.getUserById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.setAdmin(is_admin ? 1 : 0, id);
    const updated = db.getUserById(id);

    db.addActivityLog(req.user.id, req.user.username, req.ip, 'User', 'RoleChange', `${user.username} -> ${is_admin ? 'Admin' : 'User'}`);

    res.json({ user: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    const user = db.getUserById(id);
    const result = db.deleteUserAdmin(id);
    if (result.changes === 0) return res.status(404).json({ error: 'User not found' });

    db.addActivityLog(req.user.id, req.user.username, req.ip, 'User', 'Delete', user ? user.username : `ID ${id}`);

    res.json({ message: 'User deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/proxies/:id', (req, res) => {
  try {
    const { id } = req.params;
    const proxy = db.getProxyById(id);
    const result = db.deleteProxyAdmin(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Proxy not found' });

    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Proxy', 'AdminDelete', proxy ? proxy.subdomain : `ID ${id}`);

    res.json({ message: 'Proxy deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/stats', (req, res) => {
  try { res.json({ stats: db.getGlobalStats() }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Settings ───────────────────────────────────────

router.get('/settings', (req, res) => {
  try {
    res.json({
      registration_open: db.getSetting('registration_open') !== 'false',
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/settings', (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required' });
    db.setSetting(key, String(value));
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Settings', 'Update', `${key} = ${value}`);
    res.json({ message: 'Setting updated' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Domain Management ──────────────────────────────

router.get('/domains', (req, res) => {
  try { res.json({ domains: db.getAllDomains() }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/domains', (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain is required' });
    const clean = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (db.getAllDomains().find(d => d.domain === clean)) {
      return res.status(409).json({ error: 'Domain already exists' });
    }
    const result = db.addDomain(clean);
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Domain', 'Add', clean);
    res.status(201).json({ domain: { id: result.lastInsertRowid, domain: clean, is_active: 1 } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.patch('/domains/:id/toggle', (req, res) => {
  try {
    db.toggleDomain(req.params.id);
    res.json({ message: 'Domain toggled' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/domains/:id', (req, res) => {
  try {
    const result = db.deleteDomain(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Domain not found' });
    res.json({ message: 'Domain deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Admin Create User ──────────────────────────────

const bcrypt = require('bcryptjs');

router.post('/users', (req, res) => {
  try {
    const { username, email, password, credits } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    if (db.getUserByEmail(email)) return res.status(409).json({ error: 'Email already exists' });
    if (db.getUserByUsername(username)) return res.status(409).json({ error: 'Username already exists' });

    const hash = bcrypt.hashSync(password, 12);
    const result = db.createUser(username, email, hash);
    if (credits && credits > 0) {
      db.addCredits(credits, result.lastInsertRowid);
      db.addCreditHistory(result.lastInsertRowid, username, credits, credits, 'admin_added', 'Initial credits from admin');
    }

    db.addActivityLog(req.user.id, req.user.username, req.ip, 'User', 'AdminCreate', `${username} (${email})`);

    const user = db.getUserById(result.lastInsertRowid);
    res.status(201).json({ user });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Stream Proxy Management ────────────────────────

router.get('/stream-requests', (req, res) => {
  try { res.json({ requests: db.getPendingStreamProxies() }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/proxies/:id/approve-stream', (req, res) => {
  try {
    const proxy = db.getProxyById(req.params.id);
    if (!proxy) return res.status(404).json({ error: 'Proxy not found' });

    db.approveStreamProxy(req.params.id);
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Stream', 'Approved', `${proxy.subdomain} (owner: ${proxy.user_id})`);

    res.json({ message: 'Stream proxy approved', proxy: db.getProxyById(req.params.id) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/proxies/:id/bandwidth-limit', (req, res) => {
  try {
    const { limit_mbps } = req.body;
    const proxy = db.getProxyById(req.params.id);
    if (!proxy) return res.status(404).json({ error: 'Proxy not found' });

    db.setBandwidthLimit(req.params.id, parseInt(limit_mbps) || 0);
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Stream', 'BandwidthLimit', `${proxy.subdomain}: ${limit_mbps || 'unlimited'} Mbps`);

    res.json({ message: 'Bandwidth limit updated', proxy: db.getProxyById(req.params.id) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/proxies/:id/reset-bandwidth', (req, res) => {
  try {
    const proxy = db.getProxyById(req.params.id);
    if (!proxy) return res.status(404).json({ error: 'Proxy not found' });

    db.resetBandwidth(req.params.id);
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Stream', 'BandwidthReset', proxy.subdomain);

    res.json({ message: 'Bandwidth counter reset' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/proxies/:id/deny-stream', (req, res) => {
  try {
    const proxy = db.getProxyById(req.params.id);
    if (!proxy) return res.status(404).json({ error: 'Proxy not found' });

    db.denyStreamProxy(req.params.id);
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Stream', 'Denied', `${proxy.subdomain} (owner: ${proxy.user_id})`);

    res.json({ message: 'Stream proxy denied' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Server Management ──────────────────────────────

const { setupServer, checkServer } = require('../server-setup');

router.get('/servers', (req, res) => {
  try { res.json({ servers: db.getAllServers() }); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/servers', async (req, res) => {
  try {
    const { ip, ssh_port, username, password, country, label } = req.body;

    if (!ip || !password || !country) {
      return res.status(400).json({ error: 'IP, password, and country are required' });
    }

    const result = db.addServer(ip, 3128, country.toUpperCase(), label || `${country} Server`, 'installing');
    const server = db.getServerById(result.lastInsertRowid);

    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Server', 'AddStart', `${ip} (${country})`);

    res.status(201).json({ server, message: 'Server added. Installation starting...' });

    try {
      await setupServer(ip, ssh_port || 22, username || 'root', password);
      db.updateServerStatus(server.id, 'online');
      db.addActivityLog(req.user.id, req.user.username, req.ip, 'Server', 'InstallSuccess', `${ip} (${country}) - Squid installed`);
      console.log(`[Admin] Server ${ip} setup complete`);
    } catch (err) {
      db.updateServerStatus(server.id, 'error');
      db.addActivityLog(req.user.id, req.user.username, req.ip, 'Server', 'InstallFailed', `${ip}: ${err.message}`);
      console.error(`[Admin] Server ${ip} setup failed:`, err.message);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/servers/:id/check', async (req, res) => {
  try {
    const server = db.getServerById(req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const alive = await checkServer(server.ip, server.port);
    const status = alive ? 'online' : 'offline';
    db.updateServerStatus(server.id, status);

    res.json({ server: { ...server, status, last_check: new Date().toISOString() } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/servers/:id', (req, res) => {
  try {
    const server = db.getServerById(req.params.id);
    const result = db.deleteServer(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Server not found' });

    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Server', 'Delete', server ? `${server.ip} (${server.country})` : req.params.id);

    res.json({ message: 'Server deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
