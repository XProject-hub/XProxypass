const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'xproxypass.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    credits INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS proxies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subdomain TEXT UNIQUE NOT NULL,
    target_url TEXT NOT NULL,
    country TEXT DEFAULT 'auto',
    is_active INTEGER DEFAULT 1,
    requests_count INTEGER DEFAULT 0,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS request_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proxy_id INTEGER NOT NULL,
    method TEXT,
    path TEXT,
    status_code INTEGER,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proxy_id) REFERENCES proxies(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS credit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    ip_address TEXT,
    module TEXT NOT NULL,
    operation TEXT NOT NULL,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS proxy_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    port INTEGER DEFAULT 3128,
    country TEXT NOT NULL,
    label TEXT,
    status TEXT DEFAULT 'pending',
    last_check DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT UNIQUE NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
try { db.exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('registration_open', 'true')"); } catch {}

try { db.exec('ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE proxies ADD COLUMN expires_at DATETIME'); } catch {}
try { db.exec('ALTER TABLE proxies ADD COLUMN country TEXT DEFAULT "auto"'); } catch {}
try { db.exec('ALTER TABLE proxies ADD COLUMN stream_proxy INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE proxies ADD COLUMN bandwidth_used INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE proxies ADD COLUMN bandwidth_limit INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE proxies ADD COLUMN proxy_domain TEXT'); } catch {}

const COUNTRIES = [
  { code: 'auto', name: 'Auto (Nearest)' },
  { code: 'US', name: 'United States' },
  { code: 'UK', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'FR', name: 'France' },
  { code: 'CA', name: 'Canada' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AU', name: 'Australia' },
  { code: 'JP', name: 'Japan' },
  { code: 'BR', name: 'Brazil' },
  { code: 'IN', name: 'India' },
];

const stmts = {
  createUser: db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'),
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  getUserById: db.prepare('SELECT id, username, email, is_admin, credits, created_at FROM users WHERE id = ?'),

  createProxy: db.prepare('INSERT INTO proxies (user_id, subdomain, target_url, country, expires_at) VALUES (?, ?, ?, ?, ?)'),
  getProxiesByUser: db.prepare('SELECT * FROM proxies WHERE user_id = ? ORDER BY created_at DESC'),
  getProxyBySubdomain: db.prepare('SELECT * FROM proxies WHERE subdomain = ?'),
  getProxyById: db.prepare('SELECT * FROM proxies WHERE id = ?'),
  deleteProxy: db.prepare('DELETE FROM proxies WHERE id = ? AND user_id = ?'),
  deleteProxyAdmin: db.prepare('DELETE FROM proxies WHERE id = ?'),
  toggleProxy: db.prepare('UPDATE proxies SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ? AND user_id = ?'),
  incrementRequests: db.prepare('UPDATE proxies SET requests_count = requests_count + 1 WHERE id = ?'),
  renewProxy: db.prepare('UPDATE proxies SET expires_at = ?, is_active = 1 WHERE id = ?'),

  deductCredit: db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0'),
  addCredits: db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?'),
  setAdmin: db.prepare('UPDATE users SET is_admin = ? WHERE id = ?'),

  getAllUsers: db.prepare('SELECT id, username, email, is_admin, credits, created_at FROM users ORDER BY created_at DESC'),
  getAllProxies: db.prepare(`
    SELECT p.*, u.username as owner_username
    FROM proxies p LEFT JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `),
  deleteUserAdmin: db.prepare('DELETE FROM users WHERE id = ?'),

  addCreditHistory: db.prepare('INSERT INTO credit_history (user_id, username, amount, balance_after, action, detail) VALUES (?, ?, ?, ?, ?, ?)'),
  getCreditHistory: db.prepare('SELECT * FROM credit_history ORDER BY created_at DESC LIMIT 200'),

  addActivityLog: db.prepare('INSERT INTO activity_logs (user_id, username, ip_address, module, operation, detail) VALUES (?, ?, ?, ?, ?, ?)'),
  getActivityLogs: db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 200'),

  requestStreamProxy: db.prepare('UPDATE proxies SET stream_proxy = 1 WHERE id = ? AND user_id = ?'),
  approveStreamProxy: db.prepare('UPDATE proxies SET stream_proxy = 2 WHERE id = ?'),
  denyStreamProxy: db.prepare('UPDATE proxies SET stream_proxy = 0 WHERE id = ?'),
  addBandwidth: db.prepare('UPDATE proxies SET bandwidth_used = bandwidth_used + ? WHERE id = ?'),
  setBandwidthLimit: db.prepare('UPDATE proxies SET bandwidth_limit = ? WHERE id = ?'),
  resetBandwidth: db.prepare('UPDATE proxies SET bandwidth_used = 0 WHERE id = ?'),
  getPendingStreamProxies: db.prepare("SELECT p.*, u.username as owner_username FROM proxies p LEFT JOIN users u ON p.user_id = u.id WHERE p.stream_proxy = 1 ORDER BY p.created_at DESC"),

  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),

  addDomain: db.prepare('INSERT INTO domains (domain) VALUES (?)'),
  getAllDomains: db.prepare('SELECT * FROM domains ORDER BY created_at DESC'),
  getActiveDomains: db.prepare("SELECT * FROM domains WHERE is_active = 1 ORDER BY domain ASC"),
  deleteDomain: db.prepare('DELETE FROM domains WHERE id = ?'),
  toggleDomain: db.prepare('UPDATE domains SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?'),
  setProxyDomain: db.prepare('UPDATE proxies SET proxy_domain = ? WHERE id = ?'),
  getProxyBySubdomainAndDomain: db.prepare('SELECT * FROM proxies WHERE subdomain = ? AND proxy_domain = ?'),

  addServer: db.prepare('INSERT INTO proxy_servers (ip, port, country, label, status) VALUES (?, ?, ?, ?, ?)'),
  getAllServers: db.prepare('SELECT * FROM proxy_servers ORDER BY created_at DESC'),
  getServersByCountry: db.prepare("SELECT * FROM proxy_servers WHERE country = ? AND status = 'online'"),
  getServerById: db.prepare('SELECT * FROM proxy_servers WHERE id = ?'),
  updateServerStatus: db.prepare('UPDATE proxy_servers SET status = ?, last_check = CURRENT_TIMESTAMP WHERE id = ?'),
  deleteServer: db.prepare('DELETE FROM proxy_servers WHERE id = ?'),

  getUserStats: db.prepare(`
    SELECT COUNT(*) as total_proxies,
      COALESCE(SUM(requests_count), 0) as total_requests,
      COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) as active_proxies
    FROM proxies WHERE user_id = ?
  `),
  getGlobalStats: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM proxies) as total_proxies,
      (SELECT COALESCE(SUM(requests_count), 0) FROM proxies) as total_requests
  `),
  subdomainExists: db.prepare('SELECT 1 FROM proxies WHERE subdomain = ?'),
};

module.exports = {
  COUNTRIES,
  createUser(username, email, passwordHash) { return stmts.createUser.run(username, email, passwordHash); },
  getUserByEmail(email) { return stmts.getUserByEmail.get(email); },
  getUserByUsername(username) { return stmts.getUserByUsername.get(username); },
  getUserById(id) { return stmts.getUserById.get(id); },

  createProxy(userId, subdomain, targetUrl, country, expiresAt) {
    return stmts.createProxy.run(userId, subdomain, targetUrl, country || 'auto', expiresAt || null);
  },
  getProxiesByUser(userId) { return stmts.getProxiesByUser.all(userId); },
  getProxyBySubdomain(subdomain) { return stmts.getProxyBySubdomain.get(subdomain); },
  getProxyById(id) { return stmts.getProxyById.get(id); },
  deleteProxy(id, userId) { return stmts.deleteProxy.run(id, userId); },
  deleteProxyAdmin(id) { return stmts.deleteProxyAdmin.run(id); },
  toggleProxy(id, userId) { return stmts.toggleProxy.run(id, userId); },
  incrementRequests(id) { return stmts.incrementRequests.run(id); },
  renewProxy(id, expiresAt) { return stmts.renewProxy.run(expiresAt, id); },

  deductCredit(userId) { return stmts.deductCredit.run(userId); },
  addCredits(amount, userId) { return stmts.addCredits.run(amount, userId); },
  setAdmin(isAdmin, userId) { return stmts.setAdmin.run(isAdmin, userId); },

  getAllUsers() { return stmts.getAllUsers.all(); },
  getAllProxies() { return stmts.getAllProxies.all(); },
  deleteUserAdmin(id) { return stmts.deleteUserAdmin.run(id); },

  addCreditHistory(userId, username, amount, balanceAfter, action, detail) {
    return stmts.addCreditHistory.run(userId, username, amount, balanceAfter, action, detail || null);
  },
  getCreditHistory() { return stmts.getCreditHistory.all(); },

  addActivityLog(userId, username, ip, module, operation, detail) {
    return stmts.addActivityLog.run(userId || null, username || null, ip || null, module, operation, detail || null);
  },

  requestStreamProxy(id, userId) { return stmts.requestStreamProxy.run(id, userId); },
  approveStreamProxy(id) { return stmts.approveStreamProxy.run(id); },
  denyStreamProxy(id) { return stmts.denyStreamProxy.run(id); },
  addBandwidth(bytes, id) { return stmts.addBandwidth.run(bytes, id); },
  setBandwidthLimit(id, limitMbps) { return stmts.setBandwidthLimit.run(limitMbps, id); },
  resetBandwidth(id) { return stmts.resetBandwidth.run(id); },
  getPendingStreamProxies() { return stmts.getPendingStreamProxies.all(); },

  getSetting(key) { const r = stmts.getSetting.get(key); return r ? r.value : null; },
  setSetting(key, value) { return stmts.setSetting.run(key, value); },

  addDomain(domain) { return stmts.addDomain.run(domain); },
  getAllDomains() { return stmts.getAllDomains.all(); },
  getActiveDomains() { return stmts.getActiveDomains.all(); },
  deleteDomain(id) { return stmts.deleteDomain.run(id); },
  toggleDomain(id) { return stmts.toggleDomain.run(id); },
  setProxyDomain(id, domain) { return stmts.setProxyDomain.run(domain, id); },
  getProxyBySubdomainAndDomain(subdomain, domain) { return stmts.getProxyBySubdomainAndDomain.get(subdomain, domain); },

  addServer(ip, port, country, label, status) { return stmts.addServer.run(ip, port, country, label || null, status || 'pending'); },
  getAllServers() { return stmts.getAllServers.all(); },
  getServersByCountry(country) { return stmts.getServersByCountry.all(country); },
  getServerById(id) { return stmts.getServerById.get(id); },
  updateServerStatus(id, status) { return stmts.updateServerStatus.run(status, id); },
  deleteServer(id) { return stmts.deleteServer.run(id); },
  getActivityLogs() { return stmts.getActivityLogs.all(); },

  getUserStats(userId) { return stmts.getUserStats.get(userId); },
  getGlobalStats() { return stmts.getGlobalStats.get(); },
  subdomainExists(subdomain) { return !!stmts.subdomainExists.get(subdomain); },
};
