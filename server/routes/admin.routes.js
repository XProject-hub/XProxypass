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

module.exports = router;
