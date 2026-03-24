const { Client } = require('ssh2');

function generateNodeSetupScript(masterUrl, nodeSecret, nodeId, domain) {
  return `
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

# Install Node.js
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
fi

# Install Nginx
if ! command -v nginx &> /dev/null; then
  apt-get update -y
  apt-get install -y nginx
fi

# Create app directory
mkdir -p /opt/proxyxpass-node
cd /opt/proxyxpass-node

# Install dependencies
cat > package.json << 'PKGJSON'
{
  "name": "proxyxpass-node",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "http-proxy": "^1.18.1"
  }
}
PKGJSON

npm install --production

# Download node-agent from master
curl -sL ${masterUrl}/api/node/agent-script -H "X-Node-Secret: ${nodeSecret}" -o node-agent.js 2>/dev/null

# If download failed, create minimal agent
if [ ! -s node-agent.js ]; then
cat > node-agent.js << 'NODEAGENT'
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const httpProxy = require('http-proxy');
require('events').EventEmitter.defaultMaxListeners = 0;

const MASTER_URL = process.env.MASTER_URL;
const NODE_SECRET = process.env.NODE_SECRET;
const NODE_PORT = parseInt(process.env.NODE_PORT, 10) || 3000;
const NODE_ID = process.env.NODE_ID || '';

const proxy = httpProxy.createProxyServer({ xfwd: true });
const proxyCache = {};
const CACHE_TTL = 60000;
const activeConnections = {};
const bandwidthPerSecond = {};
const bandwidthTotal = {};

proxy.on('error', (err, req, res) => {
  if (res && res.writeHead) { res.writeHead(502); res.end('Backend unavailable'); }
});

async function masterAPI(endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, MASTER_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    const postData = JSON.stringify(body);
    const req = client.request({
      hostname: url.hostname, port: url.port || (isHttps ? 443 : 80),
      path: url.pathname, method: 'POST', timeout: 10000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData), 'X-Node-Secret': NODE_SECRET, 'X-Node-ID': NODE_ID }
    }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch{resolve(null)} }); });
    req.on('error', reject); req.on('timeout', ()=>{req.destroy();reject(new Error('Timeout'))}); req.write(postData); req.end();
  });
}

async function getProxy(subdomain) {
  const cached = proxyCache[subdomain];
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;
  try {
    const r = await masterAPI('/api/node/validate-proxy', { subdomain });
    if (r && r.proxy) { proxyCache[subdomain] = { data: r.proxy, time: Date.now() }; return r.proxy; }
  } catch(e) { if (cached) return cached.data; }
  return null;
}

setInterval(()=>{ for(const id in bandwidthPerSecond) bandwidthPerSecond[id]=0; },1000);
setInterval(async()=>{ try{await masterAPI('/api/node/report-stats',{connections:activeConnections,bandwidth:bandwidthTotal});for(const id in bandwidthTotal)bandwidthTotal[id]=0;}catch{} },10000);

function addBW(id,bytes){if(!bandwidthTotal[id])bandwidthTotal[id]=0;bandwidthTotal[id]+=bytes;}

const server = http.createServer(async(req,res)=>{
  if(req.url==='/health'){res.writeHead(200);return res.end(JSON.stringify({status:'ok',node_id:NODE_ID}));}
  const host=(req.headers.host||'').split(':')[0].replace(/^www\\./,'');
  const parts=host.split('.');
  if(parts.length<3){res.writeHead(404);return res.end('Not a proxy request');}
  const subdomain=parts[0];
  const record=await getProxy(subdomain);
  if(!record||!record.is_active||(record.expires_at&&new Date(record.expires_at)<new Date())){res.writeHead(404);return res.end('Proxy not found');}
  if(!activeConnections[record.id])activeConnections[record.id]=0;
  activeConnections[record.id]++;
  res.on('close',()=>{if(activeConnections[record.id]>0)activeConnections[record.id]--;});
  const proxyHost=subdomain+'.'+host.split('.').slice(1).join('.');
  const targetHost=new URL(record.target_url).host;
  const targetOrigin=new URL(record.target_url).origin;
  const targetHostname=targetHost.split(':')[0];
  const proxyHostname=proxyHost.split(':')[0];
  function rewrite(s){if(!s)return s;s=s.split(targetOrigin).join('https://'+proxyHost);s=s.split('http://'+targetHost).join('https://'+proxyHost);s=s.split(targetHost).join(proxyHost);if(targetHostname!==targetHost)s=s.split('"url":"'+targetHostname+'"').join('"url":"'+proxyHostname+'"');return s;}
  proxy.once('proxyRes',(proxyRes)=>{
    if(record.stream_proxy===2&&[301,302,307,308].includes(proxyRes.statusCode)&&proxyRes.headers.location){
      proxyRes.resume();const cl=proxyRes.headers.location.startsWith('https')?https:http;
      cl.get(proxyRes.headers.location,{timeout:30000},(rr)=>{
        const h={...rr.headers};delete h['content-security-policy'];h['cache-control']='no-store';
        res.writeHead(rr.statusCode,h);let p=0;
        const fl=setInterval(()=>{if(p>0){addBW(record.id,p);p=0;}},5000);
        rr.on('data',c=>{res.write(c);p+=c.length;if(!bandwidthPerSecond[record.id])bandwidthPerSecond[record.id]=0;bandwidthPerSecond[record.id]+=c.length;});
        rr.on('end',()=>{clearInterval(fl);res.end();if(p>0)addBW(record.id,p);});
        res.on('close',()=>{clearInterval(fl);rr.destroy();if(p>0)addBW(record.id,p);});
      }).on('error',()=>{res.writeHead(502);res.end('Stream unavailable');});
      return;
    }
    const ct=proxyRes.headers['content-type']||'';
    const rp=(req.url||'').toLowerCase();
    const isM3U=rp.includes('get.php')||rp.includes('.m3u')||rp.includes('player_api');
    const isRW=ct.includes('text')||ct.includes('json')||ct.includes('mpegurl')||ct.includes('javascript')||(record.stream_proxy===2&&ct.includes('octet-stream')&&isM3U);
    const nh={...proxyRes.headers};
    if(nh.location)nh.location=rewrite(nh.location);
    delete nh['content-security-policy'];delete nh['strict-transport-security'];
    nh['cache-control']='no-store,no-cache';delete nh['etag'];
    if(isRW){
      const chunks=[];proxyRes.on('data',c=>chunks.push(c));
      proxyRes.on('end',()=>{
        let raw=Buffer.concat(chunks);const enc=proxyRes.headers['content-encoding'];
        if(enc){try{if(enc==='gzip')raw=zlib.gunzipSync(raw);else if(enc==='br')raw=zlib.brotliDecompressSync(raw);else if(enc==='deflate')raw=zlib.inflateSync(raw);}catch{}}
        let body=raw.toString('utf8');body=rewrite(body);
        delete nh['content-length'];delete nh['content-encoding'];nh['transfer-encoding']='chunked';
        res.writeHead(proxyRes.statusCode,nh);res.end(body);
        const bytes=Buffer.byteLength(body);addBW(record.id,bytes);
        if(!bandwidthPerSecond[record.id])bandwidthPerSecond[record.id]=0;bandwidthPerSecond[record.id]+=bytes;
      });
    } else {
      res.writeHead(proxyRes.statusCode,nh);let p=0;
      const fl=setInterval(()=>{if(p>0){addBW(record.id,p);p=0;}},5000);
      proxyRes.on('data',c=>{res.write(c);p+=c.length;if(!bandwidthPerSecond[record.id])bandwidthPerSecond[record.id]=0;bandwidthPerSecond[record.id]+=c.length;});
      proxyRes.on('end',()=>{clearInterval(fl);res.end();if(p>0)addBW(record.id,p);});
      res.on('close',()=>{clearInterval(fl);if(p>0)addBW(record.id,p);});
    }
  });
  proxy.web(req,res,{target:record.target_url,changeOrigin:true,selfHandleResponse:true});
});
server.listen(NODE_PORT,()=>console.log('[NodeAgent] Running on port '+NODE_PORT+' Master: '+MASTER_URL));
NODEAGENT
fi

# Create .env
cat > .env << ENVFILE
MASTER_URL=${masterUrl}
NODE_SECRET=${nodeSecret}
NODE_PORT=3000
NODE_ID=${nodeId}
ENVFILE

# Create PM2 config
cat > ecosystem.config.js << 'PM2CONF'
module.exports = {
  apps: [{
    name: 'proxyxpass-node',
    script: 'node-agent.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: { NODE_ENV: 'production' }
  }]
};
PM2CONF

# Configure Nginx
cat > /etc/nginx/sites-available/proxyxpass-node << 'NGINXCONF'
server {
    listen 80;
    listen 443 ssl;
    listen 25461;
    listen 8080;
    listen 8880;
    listen 8443;
    listen 1935;
    listen 8000;
    listen 8001;
    listen 8082;
    listen 9981;
    listen 9982;
    server_name _;

    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

    client_max_body_size 50m;
    proxy_buffering off;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\$scheme;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
NGINXCONF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/proxyxpass-node /etc/nginx/sites-enabled/proxyxpass-node
nginx -t && systemctl restart nginx

# Open firewall ports
ufw allow 80/tcp 2>/dev/null
ufw allow 443/tcp 2>/dev/null
ufw allow 25461/tcp 2>/dev/null
ufw allow 8080/tcp 2>/dev/null
ufw allow 8880/tcp 2>/dev/null
ufw allow 8443/tcp 2>/dev/null
ufw allow 1935/tcp 2>/dev/null
ufw allow 8000:8082/tcp 2>/dev/null
ufw allow 9981:9982/tcp 2>/dev/null

# Start node agent
cd /opt/proxyxpass-node
pm2 delete proxyxpass-node 2>/dev/null
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null

echo "PROXYXPASS_NODE_SETUP_COMPLETE"
`;
}

function setupServer(ip, port, username, password, options = {}) {
  const { masterUrl, nodeSecret, nodeId, domain } = options;

  const script = (masterUrl && nodeSecret)
    ? generateNodeSetupScript(masterUrl, nodeSecret, nodeId || '', domain || '')
    : getSquidScript();

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    let errorOutput = '';
    const timeout = setTimeout(() => {
      conn.end();
      reject(new Error('Setup timed out after 180 seconds'));
    }, 180000);

    conn.on('ready', () => {
      console.log(`[ServerSetup] Connected to ${ip}`);
      conn.exec(script, (err, stream) => {
        if (err) { clearTimeout(timeout); conn.end(); reject(err); return; }
        stream.on('data', (data) => { output += data.toString(); });
        stream.stderr.on('data', (data) => { errorOutput += data.toString(); });
        stream.on('close', (code) => {
          clearTimeout(timeout);
          conn.end();
          if (output.includes('PROXYXPASS_NODE_SETUP_COMPLETE') || output.includes('PROXYXPASS_SETUP_COMPLETE')) {
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

function getSquidScript() {
  return `
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y squid
cat > /etc/squid/squid.conf << 'SQUIDCONF'
http_port 3128
acl all src 0.0.0.0/0
http_access allow all
forwarded_for on
via off
cache_mem 64 MB
cache deny all
max_filedescriptors 65535
visible_hostname proxyxpass-node
SQUIDCONF
systemctl enable squid
systemctl restart squid
ufw allow 3128/tcp 2>/dev/null
echo "PROXYXPASS_SETUP_COMPLETE"
`;
}

function checkServer(ip, proxyPort) {
  return new Promise((resolve) => {
    const net = require('net');
    let attempts = 0;
    const maxAttempts = 2;
    function tryConnect() {
      const socket = new net.Socket();
      socket.setTimeout(8000);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('timeout', () => { socket.destroy(); attempts++; if (attempts < maxAttempts) setTimeout(tryConnect, 1000); else resolve(false); });
      socket.on('error', () => { socket.destroy(); attempts++; if (attempts < maxAttempts) setTimeout(tryConnect, 1000); else resolve(false); });
      socket.connect(proxyPort || 3000, ip);
    }
    tryConnect();
  });
}

module.exports = { setupServer, checkServer };
