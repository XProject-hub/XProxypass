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
