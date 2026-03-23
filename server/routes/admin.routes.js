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
    const { ip, ssh_port, username, password, country, label, max_connections } = req.body;

    if (!ip || !password || !country) {
      return res.status(400).json({ error: 'IP, password, and country are required' });
    }

    const result = db.addServer(ip, 3128, country.toUpperCase(), label || `${country} Server`, 'installing');
    if (max_connections) {
      db.updateServerMaxConn(result.lastInsertRowid, parseInt(max_connections) || 100);
    }
    db.updateServerSSH(result.lastInsertRowid, ssh_port || 22, username || 'root', password);
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

router.patch('/servers/:id', (req, res) => {
  try {
    const server = db.getServerById(req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    const { country, label, ssh_pass, ssh_port, ssh_user, max_connections, bandwidth_limit } = req.body;
    if (country || label) {
      db.updateServerDetails(req.params.id, (country || server.country).toUpperCase(), label || server.label);
    }
    if (ssh_pass) {
      db.updateServerSSH(req.params.id, ssh_port || server.ssh_port || 22, ssh_user || server.ssh_user || 'root', ssh_pass);
    }
    if (max_connections) {
      db.updateServerMaxConn(req.params.id, parseInt(max_connections) || 100);
    }
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Server', 'Edit', `${server.ip}: updated`);
    res.json({ server: db.getServerById(req.params.id) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/servers/:id/uptime', async (req, res) => {
  try {
    const server = db.getServerById(req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (!server.ssh_pass) return res.json({ server_uptime: 'N/A', squid_uptime: 'N/A', error: 'No SSH credentials' });

    const cmd = [
      "echo \"SERVER:$(uptime -p)\"",
      "echo \"SQUID:$(systemctl show squid --property=ActiveEnterTimestamp --value)\"",
      "echo \"CPU:$(top -bn1 | grep 'Cpu(s)' | awk '{print $2}')\"",
      "echo \"RAM:$(free -m | awk '/Mem:/{printf \"%d/%d\", $3, $2}')\"",
      "echo \"DISK:$(df -h / | awk 'NR==2{printf \"%s/%s\", $3, $2}')\""
    ].join(' && ');
    const output = await sshCommand(server, cmd);
    const lines = output.split('\n');
    let serverUptime = 'N/A', squidUptime = 'N/A', cpu = 'N/A', ram = 'N/A', disk = 'N/A';
    for (const line of lines) {
      if (line.startsWith('SERVER:')) serverUptime = line.replace('SERVER:', '').trim();
      if (line.startsWith('CPU:')) cpu = line.replace('CPU:', '').trim() + '%';
      if (line.startsWith('RAM:')) ram = line.replace('RAM:', '').trim() + ' MB';
      if (line.startsWith('DISK:')) disk = line.replace('DISK:', '').trim();
      if (line.startsWith('SQUID:')) {
        const ts = line.replace('SQUID:', '').trim();
        if (ts) {
          const diff = Date.now() - new Date(ts).getTime();
          const hours = Math.floor(diff / 3600000);
          const mins = Math.floor((diff % 3600000) / 60000);
          squidUptime = hours > 24 ? `${Math.floor(hours/24)}d ${hours%24}h` : `${hours}h ${mins}m`;
        }
      }
    }
    res.json({ server_uptime: serverUptime, squid_uptime: squidUptime, cpu, ram, disk });
  } catch (err) {
    res.json({ server_uptime: 'Error', squid_uptime: 'Error', error: err.message });
  }
});

router.post('/servers/:id/max-connections', (req, res) => {
  try {
    const { max } = req.body;
    const server = db.getServerById(req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    db.updateServerMaxConn(req.params.id, parseInt(max) || 100);
    res.json({ message: 'Max connections updated' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/servers/:id/check', async (req, res) => {
  try {
    const server = db.getServerById(req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const alive = await checkServer(server.ip, server.port);
    const status = alive ? 'online' : 'offline';
    db.updateServerStatus(server.id, status);

    res.json({ server: { ...server, status, last_check: new Date().toISOString() }, check_result: alive ? 'responding' : 'not_responding' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

function sshCommand(server, command) {
  const { Client } = require('ssh2');
  return new Promise((resolve, reject) => {
    if (!server.ssh_pass) return reject(new Error('No SSH credentials stored'));
    const conn = new Client();
    const timeout = setTimeout(() => { conn.end(); reject(new Error('Timeout')); }, 30000);
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) { clearTimeout(timeout); conn.end(); reject(err); return; }
        let out = '';
        stream.on('data', d => out += d);
        stream.stderr.on('data', d => out += d);
        stream.on('close', () => { clearTimeout(timeout); conn.end(); resolve(out.trim()); });
      });
    });
    conn.on('error', (err) => { clearTimeout(timeout); reject(err); });
    conn.connect({ host: server.ip, port: server.ssh_port || 22, username: server.ssh_user || 'root', password: server.ssh_pass, readyTimeout: 15000 });
  });
}

router.post('/servers/:id/start', async (req, res) => {
  try {
    const server = db.getServerById(req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    const output = await sshCommand(server, 'systemctl start squid && systemctl status squid --no-pager -l | head -5');
    db.updateServerStatus(server.id, 'online');
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Server', 'Start', `${server.ip}: Squid started`);
    res.json({ message: 'Squid started', output });
  } catch (err) {
    res.status(500).json({ error: `Start failed: ${err.message}` });
  }
});

router.post('/servers/:id/stop', async (req, res) => {
  try {
    const server = db.getServerById(req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    const output = await sshCommand(server, 'systemctl stop squid');
    db.updateServerStatus(server.id, 'offline');
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Server', 'Stop', `${server.ip}: Squid stopped`);
    res.json({ message: 'Squid stopped', output });
  } catch (err) {
    res.status(500).json({ error: `Stop failed: ${err.message}` });
  }
});

router.post('/servers/:id/restart', async (req, res) => {
  try {
    const server = db.getServerById(req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    const output = await sshCommand(server, 'systemctl restart squid && sleep 2 && systemctl status squid --no-pager -l | head -5');
    db.updateServerStatus(server.id, 'online');
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Server', 'Restart', `${server.ip}: Squid restarted`);
    res.json({ message: 'Squid restarted', output });
  } catch (err) {
    res.status(500).json({ error: `Restart failed: ${err.message}` });
  }
});

router.post('/servers/:id/reboot', async (req, res) => {
  try {
    const server = db.getServerById(req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    await sshCommand(server, 'reboot &');
    db.updateServerStatus(server.id, 'offline');
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Server', 'Reboot', `${server.ip}: Server rebooting`);
    res.json({ message: 'Server rebooting. Will come back online in ~60 seconds.' });
  } catch (err) {
    res.status(500).json({ error: `Reboot failed: ${err.message}` });
  }
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
