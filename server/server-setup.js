const { Client } = require('ssh2');

const SQUID_SETUP_SCRIPT = `
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y squid

cat > /etc/squid/squid.conf << 'SQUIDCONF'
# ProxyXPass Squid Configuration
http_port 3128
acl all src 0.0.0.0/0
http_access allow all
forwarded_for on
via off
request_header_access X-Forwarded-For allow all

# Performance
cache_mem 256 MB
maximum_object_size 64 MB
cache_dir ufs /var/spool/squid 1000 16 256

# Security
visible_hostname proxyxpass-node
httpd_suppress_version_string on

# Logging
access_log /var/log/squid/access.log squid
SQUIDCONF

systemctl enable squid
systemctl restart squid

# Firewall
ufw allow 3128/tcp 2>/dev/null || true

echo "PROXYXPASS_SETUP_COMPLETE"
`;

function setupServer(ip, port, username, password) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    let errorOutput = '';
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error('Setup timed out after 120 seconds'));
    }, 120000);

    conn.on('ready', () => {
      console.log(`[ServerSetup] Connected to ${ip}`);

      conn.exec(SQUID_SETUP_SCRIPT, (err, stream) => {
        if (err) { clearTimeout(timeout); conn.end(); reject(err); return; }

        stream.on('data', (data) => { output += data.toString(); });
        stream.stderr.on('data', (data) => { errorOutput += data.toString(); });

        stream.on('close', (code) => {
          clearTimeout(timeout);
          conn.end();

          if (output.includes('PROXYXPASS_SETUP_COMPLETE')) {
            resolve({ success: true, output, code });
          } else {
            reject(new Error(`Setup failed (exit ${code}): ${errorOutput || output.slice(-500)}`));
          }
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`SSH connection failed: ${err.message}`));
    });

    conn.connect({
      host: ip,
      port: port || 22,
      username: username || 'root',
      password: password,
      readyTimeout: 15000,
      algorithms: {
        kex: ['ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
      },
    });
  });
}

function checkServer(ip, proxyPort) {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get({
      hostname: ip,
      port: proxyPort || 3128,
      path: '/',
      timeout: 10000,
    }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(true));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('socket', (socket) => {
      socket.on('connect', () => resolve(true));
    });
    setTimeout(() => { req.destroy(); resolve(false); }, 12000);
  });
}

module.exports = { setupServer, checkServer };
