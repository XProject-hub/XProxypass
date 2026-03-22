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
`);

// Migrate existing tables if credits/expires_at columns are missing
try { db.exec('ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE proxies ADD COLUMN expires_at DATETIME'); } catch {}

const stmts = {
  createUser: db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  ),
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  getUserById: db.prepare('SELECT id, username, email, is_admin, credits, created_at FROM users WHERE id = ?'),

  createProxy: db.prepare(
    'INSERT INTO proxies (user_id, subdomain, target_url, expires_at) VALUES (?, ?, ?, ?)'
  ),
  getProxiesByUser: db.prepare(
    'SELECT * FROM proxies WHERE user_id = ? ORDER BY created_at DESC'
  ),
  getProxyBySubdomain: db.prepare('SELECT * FROM proxies WHERE subdomain = ?'),
  getProxyById: db.prepare('SELECT * FROM proxies WHERE id = ?'),
  deleteProxy: db.prepare('DELETE FROM proxies WHERE id = ? AND user_id = ?'),
  deleteProxyAdmin: db.prepare('DELETE FROM proxies WHERE id = ?'),
  toggleProxy: db.prepare(
    'UPDATE proxies SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ? AND user_id = ?'
  ),
  incrementRequests: db.prepare(
    'UPDATE proxies SET requests_count = requests_count + 1 WHERE id = ?'
  ),

  deductCredit: db.prepare(
    'UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0'
  ),
  addCredits: db.prepare(
    'UPDATE users SET credits = credits + ? WHERE id = ?'
  ),
  setAdmin: db.prepare(
    'UPDATE users SET is_admin = ? WHERE id = ?'
  ),

  getAllUsers: db.prepare(
    'SELECT id, username, email, is_admin, credits, created_at FROM users ORDER BY created_at DESC'
  ),
  getAllProxies: db.prepare(`
    SELECT p.*, u.username as owner_username
    FROM proxies p
    LEFT JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `),
  deleteUserAdmin: db.prepare('DELETE FROM users WHERE id = ?'),

  getUserStats: db.prepare(`
    SELECT
      COUNT(*) as total_proxies,
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
  createUser(username, email, passwordHash) {
    return stmts.createUser.run(username, email, passwordHash);
  },
  getUserByEmail(email) {
    return stmts.getUserByEmail.get(email);
  },
  getUserByUsername(username) {
    return stmts.getUserByUsername.get(username);
  },
  getUserById(id) {
    return stmts.getUserById.get(id);
  },
  createProxy(userId, subdomain, targetUrl, expiresAt) {
    return stmts.createProxy.run(userId, subdomain, targetUrl, expiresAt || null);
  },
  getProxiesByUser(userId) {
    return stmts.getProxiesByUser.all(userId);
  },
  getProxyBySubdomain(subdomain) {
    return stmts.getProxyBySubdomain.get(subdomain);
  },
  getProxyById(id) {
    return stmts.getProxyById.get(id);
  },
  deleteProxy(id, userId) {
    return stmts.deleteProxy.run(id, userId);
  },
  deleteProxyAdmin(id) {
    return stmts.deleteProxyAdmin.run(id);
  },
  toggleProxy(id, userId) {
    return stmts.toggleProxy.run(id, userId);
  },
  incrementRequests(id) {
    return stmts.incrementRequests.run(id);
  },
  deductCredit(userId) {
    return stmts.deductCredit.run(userId);
  },
  addCredits(amount, userId) {
    return stmts.addCredits.run(amount, userId);
  },
  setAdmin(isAdmin, userId) {
    return stmts.setAdmin.run(isAdmin, userId);
  },
  getAllUsers() {
    return stmts.getAllUsers.all();
  },
  getAllProxies() {
    return stmts.getAllProxies.all();
  },
  deleteUserAdmin(id) {
    return stmts.deleteUserAdmin.run(id);
  },
  getUserStats(userId) {
    return stmts.getUserStats.get(userId);
  },
  getGlobalStats() {
    return stmts.getGlobalStats.get();
  },
  subdomainExists(subdomain) {
    return !!stmts.subdomainExists.get(subdomain);
  },
};
