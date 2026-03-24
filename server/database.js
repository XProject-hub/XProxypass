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
    max_connections INTEGER DEFAULT 100,
    bandwidth_limit TEXT DEFAULT '1Gbps',
    ssh_port INTEGER DEFAULT 22,
    ssh_user TEXT DEFAULT 'root',
    ssh_pass TEXT,
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
try { db.exec('ALTER TABLE proxy_servers ADD COLUMN max_connections INTEGER DEFAULT 100'); } catch {}
try { db.exec("ALTER TABLE proxy_servers ADD COLUMN bandwidth_limit TEXT DEFAULT '1Gbps'"); } catch {}
try { db.exec('ALTER TABLE proxy_servers ADD COLUMN ssh_port INTEGER DEFAULT 22'); } catch {}
try { db.exec("ALTER TABLE proxy_servers ADD COLUMN ssh_user TEXT DEFAULT 'root'"); } catch {}
try { db.exec('ALTER TABLE proxy_servers ADD COLUMN ssh_pass TEXT'); } catch {}

// Reseller system
try { db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'"); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN parent_id INTEGER DEFAULT NULL'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN max_proxies INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN max_users INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN max_bandwidth INTEGER DEFAULT 0'); } catch {}

// IP lock
try { db.exec('ALTER TABLE proxies ADD COLUMN ip_lock TEXT DEFAULT NULL'); } catch {}

// Stream tokens
db.exec(`
  CREATE TABLE IF NOT EXISTS stream_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    proxy_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proxy_id) REFERENCES proxies(id) ON DELETE CASCADE
  );
`);

// Gbps streaming plans
try { db.exec('ALTER TABLE users ADD COLUMN gbps_pool INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN gbps_allocated INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE proxies ADD COLUMN speed_limit_mbps INTEGER DEFAULT 0'); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS stream_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    speed_mbps INTEGER NOT NULL,
    price_eur REAL NOT NULL,
    is_active INTEGER DEFAULT 1,
    description TEXT,
    paypal_plan_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    paypal_subscription_id TEXT,
    status TEXT DEFAULT 'pending',
    speed_mbps INTEGER NOT NULL,
    plan_type TEXT NOT NULL,
    started_at DATETIME,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES stream_plans(id)
  );
`);

// Seed default stream plans
const DEFAULT_PLANS = [
  { name: 'Streaming 1Gbps', type: 'streaming', speed_mbps: 1000, price_eur: 99, description: '1 Gbps fair use streaming' },
  { name: 'Streaming 2Gbps', type: 'streaming', speed_mbps: 2000, price_eur: 179, description: '2 Gbps fair use streaming' },
  { name: 'Streaming 3Gbps', type: 'streaming', speed_mbps: 3000, price_eur: 249, description: '3 Gbps fair use streaming' },
  { name: 'Streaming 5Gbps', type: 'streaming', speed_mbps: 5000, price_eur: 399, description: '5 Gbps fair use streaming' },
  { name: 'Enterprise 1Gbps', type: 'enterprise', speed_mbps: 1000, price_eur: 249, description: '1 Gbps dedicated, no throttle' },
  { name: 'Enterprise 2Gbps', type: 'enterprise', speed_mbps: 2000, price_eur: 399, description: '2 Gbps dedicated, no throttle' },
  { name: 'Enterprise 3Gbps', type: 'enterprise', speed_mbps: 3000, price_eur: 599, description: '3 Gbps dedicated, no throttle' },
  { name: 'Enterprise 5Gbps', type: 'enterprise', speed_mbps: 5000, price_eur: 999, description: '5 Gbps dedicated, no throttle' },
  { name: 'Enterprise 10Gbps', type: 'enterprise', speed_mbps: 10000, price_eur: 1799, description: '10 Gbps dedicated, no throttle' },
  { name: 'Enterprise 20Gbps', type: 'enterprise', speed_mbps: 20000, price_eur: 3199, description: '20 Gbps dedicated, no throttle' },
  { name: 'Enterprise 30Gbps', type: 'enterprise', speed_mbps: 30000, price_eur: 4499, description: '30 Gbps dedicated, no throttle' },
  { name: 'Enterprise 40Gbps', type: 'enterprise', speed_mbps: 40000, price_eur: 5799, description: '40 Gbps dedicated, no throttle' },
  { name: 'Enterprise 50Gbps', type: 'enterprise', speed_mbps: 50000, price_eur: 6999, description: '50 Gbps dedicated, no throttle' },
  { name: 'Reseller 5Gbps', type: 'reseller', speed_mbps: 5000, price_eur: 399, description: '5 Gbps pool for resellers' },
  { name: 'Reseller 10Gbps', type: 'reseller', speed_mbps: 10000, price_eur: 699, description: '10 Gbps pool for resellers' },
  { name: 'Reseller 20Gbps', type: 'reseller', speed_mbps: 20000, price_eur: 1199, description: '20 Gbps pool for resellers' },
  { name: 'Reseller 50Gbps', type: 'reseller', speed_mbps: 50000, price_eur: 2499, description: '50 Gbps pool for resellers' },
];

try {
  const existingPlans = db.prepare('SELECT COUNT(*) as count FROM stream_plans').get();
  if (existingPlans.count === 0) {
    const insertPlan = db.prepare('INSERT INTO stream_plans (name, type, speed_mbps, price_eur, description) VALUES (?, ?, ?, ?, ?)');
    for (const p of DEFAULT_PLANS) {
      insertPlan.run(p.name, p.type, p.speed_mbps, p.price_eur, p.description);
    }
    console.log('[DB] Seeded default stream plans');
  }
} catch (err) { console.error('[DB] Plan seed error:', err.message); }

// Sync role column with is_admin for existing admins
try { db.exec("UPDATE users SET role = 'admin' WHERE is_admin = 1 AND (role IS NULL OR role = 'user')"); } catch {}

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
  getUserById: db.prepare('SELECT id, username, email, is_admin, credits, role, parent_id, max_proxies, max_users, max_bandwidth, gbps_pool, gbps_allocated, created_at FROM users WHERE id = ?'),

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

  getAllUsers: db.prepare('SELECT id, username, email, is_admin, credits, role, parent_id, max_proxies, max_users, max_bandwidth, gbps_pool, gbps_allocated, created_at FROM users ORDER BY created_at DESC'),
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
  getPendingStreamProxies: db.prepare("SELECT p.*, u.username as owner_username FROM proxies p LEFT JOIN users u ON p.user_id = u.id WHERE p.stream_proxy >= 1 ORDER BY p.stream_proxy ASC, p.created_at DESC"),
  updateProxySubdomain: db.prepare('UPDATE proxies SET subdomain = ? WHERE id = ? AND user_id = ?'),
  updateProxyTarget: db.prepare('UPDATE proxies SET target_url = ? WHERE id = ? AND user_id = ?'),
  updateProxyCountry: db.prepare('UPDATE proxies SET country = ? WHERE id = ? AND user_id = ?'),

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
  updateServerMaxConn: db.prepare('UPDATE proxy_servers SET max_connections = ? WHERE id = ?'),
  updateServerSSH: db.prepare('UPDATE proxy_servers SET ssh_port = ?, ssh_user = ?, ssh_pass = ? WHERE id = ?'),
  updateServerDetails: db.prepare('UPDATE proxy_servers SET country = ?, label = ? WHERE id = ?'),
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

  // IP lock
  setIpLock: db.prepare('UPDATE proxies SET ip_lock = ? WHERE id = ?'),

  // Stream tokens
  createStreamToken: db.prepare('INSERT INTO stream_tokens (token, proxy_id, expires_at) VALUES (?, ?, ?)'),
  getStreamToken: db.prepare('SELECT st.*, p.subdomain, p.target_url, p.stream_proxy, p.is_active, p.bandwidth_limit, p.bandwidth_used, p.proxy_domain, p.country, p.expires_at as proxy_expires_at, p.ip_lock FROM stream_tokens st JOIN proxies p ON st.proxy_id = p.id WHERE st.token = ?'),
  getTokensByProxy: db.prepare('SELECT id, token, proxy_id, expires_at, created_at FROM stream_tokens WHERE proxy_id = ? ORDER BY created_at DESC'),
  deleteStreamToken: db.prepare('DELETE FROM stream_tokens WHERE id = ? AND proxy_id = ?'),
  deleteExpiredTokens: db.prepare('DELETE FROM stream_tokens WHERE expires_at < ?'),

  // Reseller
  setParentId: db.prepare('UPDATE users SET parent_id = ? WHERE id = ?'),
  updateUserRole: db.prepare('UPDATE users SET role = ?, is_admin = CASE WHEN ? = \'admin\' THEN 1 ELSE 0 END WHERE id = ?'),
  updateResellerLimits: db.prepare('UPDATE users SET max_proxies = ?, max_users = ?, max_bandwidth = ? WHERE id = ?'),
  getUsersByParent: db.prepare('SELECT id, username, email, is_admin, credits, role, parent_id, created_at FROM users WHERE parent_id = ? ORDER BY created_at DESC'),
  countUsersByParent: db.prepare('SELECT COUNT(*) as count FROM users WHERE parent_id = ?'),
  getProxiesByParent: db.prepare(`
    SELECT p.*, u.username as owner_username
    FROM proxies p JOIN users u ON p.user_id = u.id
    WHERE u.parent_id = ?
    ORDER BY p.created_at DESC
  `),
  countProxiesByParent: db.prepare(`
    SELECT COUNT(*) as count FROM proxies p JOIN users u ON p.user_id = u.id WHERE u.parent_id = ?
  `),
  getStreamRequestsByParent: db.prepare(`
    SELECT p.*, u.username as owner_username
    FROM proxies p JOIN users u ON p.user_id = u.id
    WHERE u.parent_id = ? AND p.stream_proxy >= 1
    ORDER BY p.stream_proxy ASC, p.created_at DESC
  `),
  getResellerStats: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE parent_id = ?) as total_users,
      (SELECT COUNT(*) FROM proxies WHERE user_id IN (SELECT id FROM users WHERE parent_id = ?)) as total_proxies,
      (SELECT COALESCE(SUM(requests_count), 0) FROM proxies WHERE user_id IN (SELECT id FROM users WHERE parent_id = ?)) as total_requests,
      (SELECT COALESCE(SUM(bandwidth_used), 0) FROM proxies WHERE user_id IN (SELECT id FROM users WHERE parent_id = ?)) as total_bandwidth
  `),

  // Stream plans
  getAllStreamPlans: db.prepare('SELECT * FROM stream_plans ORDER BY type, speed_mbps'),
  getActiveStreamPlans: db.prepare("SELECT * FROM stream_plans WHERE is_active = 1 ORDER BY type, speed_mbps"),
  getStreamPlanById: db.prepare('SELECT * FROM stream_plans WHERE id = ?'),
  createStreamPlan: db.prepare('INSERT INTO stream_plans (name, type, speed_mbps, price_eur, description) VALUES (?, ?, ?, ?, ?)'),
  updateStreamPlan: db.prepare('UPDATE stream_plans SET name = ?, type = ?, speed_mbps = ?, price_eur = ?, description = ?, is_active = ? WHERE id = ?'),
  updateStreamPlanPaypal: db.prepare('UPDATE stream_plans SET paypal_plan_id = ? WHERE id = ?'),
  deleteStreamPlan: db.prepare('DELETE FROM stream_plans WHERE id = ?'),

  // Subscriptions
  createSubscription: db.prepare('INSERT INTO subscriptions (user_id, plan_id, paypal_subscription_id, status, speed_mbps, plan_type, started_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  getSubscriptionById: db.prepare('SELECT s.*, sp.name as plan_name, sp.price_eur, u.username FROM subscriptions s JOIN stream_plans sp ON s.plan_id = sp.id JOIN users u ON s.user_id = u.id WHERE s.id = ?'),
  getSubscriptionByPaypal: db.prepare('SELECT * FROM subscriptions WHERE paypal_subscription_id = ?'),
  getSubscriptionsByUser: db.prepare('SELECT s.*, sp.name as plan_name, sp.price_eur FROM subscriptions s JOIN stream_plans sp ON s.plan_id = sp.id WHERE s.user_id = ? ORDER BY s.created_at DESC'),
  getActiveSubscription: db.prepare("SELECT s.*, sp.name as plan_name, sp.price_eur FROM subscriptions s JOIN stream_plans sp ON s.plan_id = sp.id WHERE s.user_id = ? AND s.status = 'active' LIMIT 1"),
  getAllSubscriptions: db.prepare('SELECT s.*, sp.name as plan_name, sp.price_eur, u.username FROM subscriptions s JOIN stream_plans sp ON s.plan_id = sp.id JOIN users u ON s.user_id = u.id ORDER BY s.created_at DESC'),
  updateSubscriptionStatus: db.prepare('UPDATE subscriptions SET status = ? WHERE id = ?'),
  updateSubscriptionPaypal: db.prepare('UPDATE subscriptions SET paypal_subscription_id = ?, status = ? WHERE id = ?'),
  activateSubscription: db.prepare("UPDATE subscriptions SET status = 'active', started_at = CURRENT_TIMESTAMP, expires_at = datetime('now', '+30 days') WHERE id = ?"),
  renewSubscription: db.prepare("UPDATE subscriptions SET expires_at = datetime(expires_at, '+30 days'), status = 'active' WHERE id = ?"),
  expireSubscriptions: db.prepare("UPDATE subscriptions SET status = 'expired' WHERE status = 'active' AND expires_at < CURRENT_TIMESTAMP"),

  // Speed limit on proxies
  setProxySpeedLimit: db.prepare('UPDATE proxies SET speed_limit_mbps = ? WHERE id = ?'),

  // Gbps pool
  setGbpsPool: db.prepare('UPDATE users SET gbps_pool = ? WHERE id = ?'),
  setGbpsAllocated: db.prepare('UPDATE users SET gbps_allocated = ? WHERE id = ?'),
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
  updateProxySubdomain(id, userId, subdomain) { return stmts.updateProxySubdomain.run(subdomain, id, userId); },
  updateProxyTarget(id, userId, targetUrl) { return stmts.updateProxyTarget.run(targetUrl, id, userId); },
  updateProxyCountry(id, userId, country) { return stmts.updateProxyCountry.run(country, id, userId); },
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
  updateServerMaxConn(id, max) { return stmts.updateServerMaxConn.run(max, id); },
  updateServerSSH(id, sshPort, sshUser, sshPass) { return stmts.updateServerSSH.run(sshPort, sshUser, sshPass, id); },
  updateServerDetails(id, country, label) { return stmts.updateServerDetails.run(country, label, id); },
  deleteServer(id) { return stmts.deleteServer.run(id); },
  getActivityLogs() { return stmts.getActivityLogs.all(); },

  getUserStats(userId) { return stmts.getUserStats.get(userId); },
  getGlobalStats() { return stmts.getGlobalStats.get(); },
  subdomainExists(subdomain) { return !!stmts.subdomainExists.get(subdomain); },

  // IP lock
  setIpLock(id, ip) { return stmts.setIpLock.run(ip, id); },

  // Stream tokens
  createStreamToken(token, proxyId, expiresAt) { return stmts.createStreamToken.run(token, proxyId, expiresAt); },
  getStreamToken(token) { return stmts.getStreamToken.get(token); },
  getTokensByProxy(proxyId) { return stmts.getTokensByProxy.all(proxyId); },
  deleteStreamToken(id, proxyId) { return stmts.deleteStreamToken.run(id, proxyId); },
  deleteExpiredTokens() { return stmts.deleteExpiredTokens.run(Math.floor(Date.now() / 1000)); },

  // Reseller
  setParentId(userId, parentId) { return stmts.setParentId.run(parentId, userId); },
  updateUserRole(id, role) { return stmts.updateUserRole.run(role, role, id); },
  updateResellerLimits(id, maxProxies, maxUsers, maxBandwidth) { return stmts.updateResellerLimits.run(maxProxies, maxUsers, maxBandwidth, id); },
  getUsersByParent(parentId) { return stmts.getUsersByParent.all(parentId); },
  countUsersByParent(parentId) { return stmts.countUsersByParent.get(parentId).count; },
  getProxiesByParent(parentId) { return stmts.getProxiesByParent.all(parentId); },
  countProxiesByParent(parentId) { return stmts.countProxiesByParent.get(parentId).count; },
  getStreamRequestsByParent(parentId) { return stmts.getStreamRequestsByParent.all(parentId); },
  getResellerStats(resellerId) { return stmts.getResellerStats.get(resellerId, resellerId, resellerId, resellerId); },

  // Stream plans
  getAllStreamPlans() { return stmts.getAllStreamPlans.all(); },
  getActiveStreamPlans() { return stmts.getActiveStreamPlans.all(); },
  getStreamPlanById(id) { return stmts.getStreamPlanById.get(id); },
  createStreamPlan(name, type, speedMbps, priceEur, description) { return stmts.createStreamPlan.run(name, type, speedMbps, priceEur, description || null); },
  updateStreamPlan(id, name, type, speedMbps, priceEur, description, isActive) { return stmts.updateStreamPlan.run(name, type, speedMbps, priceEur, description || null, isActive, id); },
  updateStreamPlanPaypal(id, paypalPlanId) { return stmts.updateStreamPlanPaypal.run(paypalPlanId, id); },
  deleteStreamPlan(id) { return stmts.deleteStreamPlan.run(id); },

  // Subscriptions
  createSubscription(userId, planId, paypalSubId, status, speedMbps, planType, startedAt, expiresAt) {
    return stmts.createSubscription.run(userId, planId, paypalSubId || null, status, speedMbps, planType, startedAt || null, expiresAt || null);
  },
  getSubscriptionById(id) { return stmts.getSubscriptionById.get(id); },
  getSubscriptionByPaypal(paypalSubId) { return stmts.getSubscriptionByPaypal.get(paypalSubId); },
  getSubscriptionsByUser(userId) { return stmts.getSubscriptionsByUser.all(userId); },
  getActiveSubscription(userId) { return stmts.getActiveSubscription.get(userId); },
  getAllSubscriptions() { return stmts.getAllSubscriptions.all(); },
  updateSubscriptionStatus(id, status) { return stmts.updateSubscriptionStatus.run(status, id); },
  updateSubscriptionPaypal(id, paypalSubId, status) { return stmts.updateSubscriptionPaypal.run(paypalSubId, status, id); },
  activateSubscription(id) { return stmts.activateSubscription.run(id); },
  renewSubscription(id) { return stmts.renewSubscription.run(id); },
  expireSubscriptions() { return stmts.expireSubscriptions.run(); },

  // Speed limit
  setProxySpeedLimit(id, speedMbps) { return stmts.setProxySpeedLimit.run(speedMbps, id); },

  // Gbps pool
  setGbpsPool(userId, poolMbps) { return stmts.setGbpsPool.run(poolMbps, userId); },
  setGbpsAllocated(userId, allocatedMbps) { return stmts.setGbpsAllocated.run(allocatedMbps, userId); },
};
