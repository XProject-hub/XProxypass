const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate } = require('../auth');
const db = require('../database');

const router = express.Router();

function requireReseller(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const user = db.getUserById(req.user.id);
  if (!user || (user.role !== 'reseller' && user.role !== 'admin')) {
    return res.status(403).json({ error: 'Reseller access required' });
  }
  req.reseller = user;
  next();
}

function isOwnSubUser(resellerId, userId) {
  const user = db.getUserById(userId);
  return user && user.parent_id === resellerId;
}

router.use(authenticate);
router.use(requireReseller);

// ── Sub-Users ──────────────────────────────────────

router.get('/users', (req, res) => {
  try {
    res.json({ users: db.getUsersByParent(req.user.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/users', (req, res) => {
  try {
    const { username, email, password, credits } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const reseller = req.reseller;
    if (reseller.max_users > 0) {
      const count = db.countUsersByParent(req.user.id);
      if (count >= reseller.max_users) {
        return res.status(403).json({ error: `Sub-user limit reached (${reseller.max_users})` });
      }
    }

    if (db.getUserByEmail(email)) return res.status(409).json({ error: 'Email already exists' });
    if (db.getUserByUsername(username)) return res.status(409).json({ error: 'Username already exists' });

    const hash = bcrypt.hashSync(password, 12);
    const result = db.createUser(username, email, hash);
    const newUserId = result.lastInsertRowid;

    db.setParentId(newUserId, req.user.id);

    if (credits && credits > 0) {
      const transferAmount = Math.min(Math.floor(credits), reseller.credits);
      if (transferAmount > 0) {
        db.addCredits(-transferAmount, req.user.id);
        db.addCredits(transferAmount, newUserId);
        db.addCreditHistory(req.user.id, reseller.username, -transferAmount, reseller.credits - transferAmount, 'reseller_transfer', `To new user: ${username}`);
        db.addCreditHistory(newUserId, username, transferAmount, transferAmount, 'reseller_received', `From reseller: ${reseller.username}`);
      }
    }

    db.addActivityLog(req.user.id, reseller.username, req.ip, 'Reseller', 'CreateUser', `${username} (${email})`);

    const user = db.getUserById(newUserId);
    res.status(201).json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/users/:id/credits', (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 1 || amount > 10000) {
      return res.status(400).json({ error: 'Amount must be between 1 and 10000' });
    }

    if (!isOwnSubUser(req.user.id, req.params.id)) {
      return res.status(404).json({ error: 'User not found' });
    }

    const reseller = db.getUserById(req.user.id);
    const transferAmount = Math.floor(amount);
    if (reseller.credits < transferAmount) {
      return res.status(403).json({ error: 'Insufficient credits' });
    }

    const target = db.getUserById(req.params.id);
    db.addCredits(-transferAmount, req.user.id);
    db.addCredits(transferAmount, req.params.id);

    const updatedReseller = db.getUserById(req.user.id);
    const updatedTarget = db.getUserById(req.params.id);

    db.addCreditHistory(req.user.id, reseller.username, -transferAmount, updatedReseller.credits, 'reseller_transfer', `To: ${target.username}`);
    db.addCreditHistory(parseInt(req.params.id), target.username, transferAmount, updatedTarget.credits, 'reseller_received', `From: ${reseller.username}`);
    db.addActivityLog(req.user.id, reseller.username, req.ip, 'Reseller', 'TransferCredits', `+${transferAmount} to ${target.username}`);

    res.json({ user: updatedTarget, reseller_credits: updatedReseller.credits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/users/:id', (req, res) => {
  try {
    if (!isOwnSubUser(req.user.id, req.params.id)) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = db.getUserById(req.params.id);
    db.deleteUserAdmin(req.params.id);
    db.addActivityLog(req.user.id, req.reseller.username, req.ip, 'Reseller', 'DeleteUser', user ? user.username : req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Proxies ────────────────────────────────────────

router.get('/proxies', (req, res) => {
  try {
    res.json({ proxies: db.getProxiesByParent(req.user.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Stream Management ──────────────────────────────

router.get('/stream-requests', (req, res) => {
  try {
    res.json({ requests: db.getStreamRequestsByParent(req.user.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/proxies/:id/approve-stream', (req, res) => {
  try {
    const proxy = db.getProxyById(req.params.id);
    if (!proxy) return res.status(404).json({ error: 'Proxy not found' });
    if (!isOwnSubUser(req.user.id, proxy.user_id)) {
      return res.status(403).json({ error: 'Not your sub-user proxy' });
    }
    db.approveStreamProxy(req.params.id);
    db.addActivityLog(req.user.id, req.reseller.username, req.ip, 'Reseller', 'ApproveStream', proxy.subdomain);
    res.json({ message: 'Stream proxy approved', proxy: db.getProxyById(req.params.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/proxies/:id/deny-stream', (req, res) => {
  try {
    const proxy = db.getProxyById(req.params.id);
    if (!proxy) return res.status(404).json({ error: 'Proxy not found' });
    if (!isOwnSubUser(req.user.id, proxy.user_id)) {
      return res.status(403).json({ error: 'Not your sub-user proxy' });
    }
    db.denyStreamProxy(req.params.id);
    db.addActivityLog(req.user.id, req.reseller.username, req.ip, 'Reseller', 'DenyStream', proxy.subdomain);
    res.json({ message: 'Stream proxy denied' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/proxies/:id/bandwidth-limit', (req, res) => {
  try {
    const { limit_mbps } = req.body;
    const proxy = db.getProxyById(req.params.id);
    if (!proxy) return res.status(404).json({ error: 'Proxy not found' });
    if (!isOwnSubUser(req.user.id, proxy.user_id)) {
      return res.status(403).json({ error: 'Not your sub-user proxy' });
    }
    db.setBandwidthLimit(req.params.id, parseInt(limit_mbps) || 0);
    db.addActivityLog(req.user.id, req.reseller.username, req.ip, 'Reseller', 'BandwidthLimit', `${proxy.subdomain}: ${limit_mbps || 'unlimited'} Mbps`);
    res.json({ message: 'Bandwidth limit updated', proxy: db.getProxyById(req.params.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Gbps Pool ──────────────────────────────────────

router.get('/pool', (req, res) => {
  try {
    const reseller = db.getUserById(req.user.id);
    const subUsers = db.getUsersByParent(req.user.id);
    const proxies = db.getProxiesByParent(req.user.id);
    const totalAllocated = proxies.reduce((sum, p) => sum + (p.speed_limit_mbps || 0), 0);

    res.json({
      pool: {
        total_mbps: reseller.gbps_pool || 0,
        allocated_mbps: totalAllocated,
        available_mbps: Math.max(0, (reseller.gbps_pool || 0) - totalAllocated),
        total_gbps: ((reseller.gbps_pool || 0) / 1000).toFixed(1),
        allocated_gbps: (totalAllocated / 1000).toFixed(1),
        available_gbps: (Math.max(0, (reseller.gbps_pool || 0) - totalAllocated) / 1000).toFixed(1),
      },
      allocations: proxies.map(p => ({
        proxy_id: p.id,
        subdomain: p.subdomain,
        owner: p.owner_username,
        speed_limit_mbps: p.speed_limit_mbps || 0,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/proxies/:id/allocate-speed', (req, res) => {
  try {
    const { speed_mbps } = req.body;
    const speedMbps = parseInt(speed_mbps) || 0;

    const proxy = db.getProxyById(req.params.id);
    if (!proxy) return res.status(404).json({ error: 'Proxy not found' });
    if (!isOwnSubUser(req.user.id, proxy.user_id)) {
      return res.status(403).json({ error: 'Not your sub-user proxy' });
    }

    const reseller = db.getUserById(req.user.id);
    const proxies = db.getProxiesByParent(req.user.id);
    const currentAllocated = proxies.reduce((sum, p) => {
      if (p.id === parseInt(req.params.id)) return sum;
      return sum + (p.speed_limit_mbps || 0);
    }, 0);

    const pool = reseller.gbps_pool || 0;
    if (speedMbps > 0 && (currentAllocated + speedMbps) > pool) {
      return res.status(400).json({
        error: `Not enough pool capacity. Available: ${pool - currentAllocated} Mbps, requested: ${speedMbps} Mbps`,
      });
    }

    db.setProxySpeedLimit(proxy.id, speedMbps);
    db.setGbpsAllocated(req.user.id, currentAllocated + speedMbps);

    db.addActivityLog(req.user.id, req.reseller.username, req.ip, 'Reseller', 'AllocateSpeed',
      `${proxy.subdomain}: ${speedMbps} Mbps`);

    res.json({ message: 'Speed allocated', proxy: db.getProxyById(proxy.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Stats ──────────────────────────────────────────

router.get('/stats', (req, res) => {
  try {
    const stats = db.getResellerStats(req.user.id);
    const reseller = db.getUserById(req.user.id);
    res.json({
      stats: {
        ...stats,
        credits: reseller.credits,
        max_proxies: reseller.max_proxies,
        max_users: reseller.max_users,
        max_bandwidth: reseller.max_bandwidth,
        gbps_pool: reseller.gbps_pool || 0,
        gbps_allocated: reseller.gbps_allocated || 0,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
