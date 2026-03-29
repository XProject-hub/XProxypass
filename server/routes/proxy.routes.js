const express = require('express');
const { authenticate } = require('../auth');
const db = require('../database');
const dnsManager = require('../dns-manager');

const router = express.Router();

const RESERVED = new Set([
  'api', 'www', 'mail', 'admin', 'ftp', 'smtp', 'pop', 'imap',
  'ns1', 'ns2', 'cdn', 'static', 'assets', 'panel', 'dashboard',
  'login', 'register', 'app', 'dev', 'staging', 'test',
]);

// const proxyPool = require('../proxy-pool');

const COUNTRY_NAMES = {
  AD:'Andorra',AE:'UAE',AF:'Afghanistan',AG:'Antigua & Barbuda',AL:'Albania',AM:'Armenia',AO:'Angola',
  AR:'Argentina',AT:'Austria',AU:'Australia',AZ:'Azerbaijan',BA:'Bosnia',BB:'Barbados',BD:'Bangladesh',
  BE:'Belgium',BF:'Burkina Faso',BG:'Bulgaria',BH:'Bahrain',BI:'Burundi',BJ:'Benin',BN:'Brunei',
  BO:'Bolivia',BR:'Brazil',BS:'Bahamas',BT:'Bhutan',BW:'Botswana',BY:'Belarus',BZ:'Belize',
  CA:'Canada',CD:'Congo (DRC)',CF:'Central Africa',CG:'Congo',CH:'Switzerland',CI:'Ivory Coast',
  CL:'Chile',CM:'Cameroon',CN:'China',CO:'Colombia',CR:'Costa Rica',CU:'Cuba',CV:'Cape Verde',
  CY:'Cyprus',CZ:'Czech Republic',DE:'Germany',DJ:'Djibouti',DK:'Denmark',DO:'Dominican Republic',
  DZ:'Algeria',EC:'Ecuador',EE:'Estonia',EG:'Egypt',ER:'Eritrea',ES:'Spain',ET:'Ethiopia',
  FI:'Finland',FJ:'Fiji',FR:'France',GA:'Gabon',GB:'United Kingdom',GE:'Georgia',GH:'Ghana',
  GM:'Gambia',GN:'Guinea',GR:'Greece',GT:'Guatemala',GY:'Guyana',HK:'Hong Kong',HN:'Honduras',
  HR:'Croatia',HT:'Haiti',HU:'Hungary',ID:'Indonesia',IE:'Ireland',IL:'Israel',IN:'India',
  IQ:'Iraq',IR:'Iran',IS:'Iceland',IT:'Italy',JM:'Jamaica',JO:'Jordan',JP:'Japan',
  KE:'Kenya',KG:'Kyrgyzstan',KH:'Cambodia',KR:'South Korea',KW:'Kuwait',KZ:'Kazakhstan',
  LA:'Laos',LB:'Lebanon',LK:'Sri Lanka',LR:'Liberia',LS:'Lesotho',LT:'Lithuania',LU:'Luxembourg',
  LV:'Latvia',LY:'Libya',MA:'Morocco',MD:'Moldova',ME:'Montenegro',MG:'Madagascar',MK:'North Macedonia',
  ML:'Mali',MM:'Myanmar',MN:'Mongolia',MO:'Macau',MR:'Mauritania',MT:'Malta',MU:'Mauritius',
  MV:'Maldives',MW:'Malawi',MX:'Mexico',MY:'Malaysia',MZ:'Mozambique',NA:'Namibia',NE:'Niger',
  NG:'Nigeria',NI:'Nicaragua',NL:'Netherlands',NO:'Norway',NP:'Nepal',NZ:'New Zealand',OM:'Oman',
  PA:'Panama',PE:'Peru',PG:'Papua New Guinea',PH:'Philippines',PK:'Pakistan',PL:'Poland',
  PR:'Puerto Rico',PS:'Palestine',PT:'Portugal',PY:'Paraguay',QA:'Qatar',RO:'Romania',RS:'Serbia',
  RU:'Russia',RW:'Rwanda',SA:'Saudi Arabia',SC:'Seychelles',SD:'Sudan',SE:'Sweden',SG:'Singapore',
  SI:'Slovenia',SK:'Slovakia',SL:'Sierra Leone',SN:'Senegal',SO:'Somalia',SR:'Suriname',SS:'South Sudan',
  SV:'El Salvador',SY:'Syria',SZ:'Eswatini',TD:'Chad',TG:'Togo',TH:'Thailand',TJ:'Tajikistan',
  TL:'Timor-Leste',TM:'Turkmenistan',TN:'Tunisia',TO:'Tonga',TR:'Turkey',TT:'Trinidad & Tobago',
  TW:'Taiwan',TZ:'Tanzania',UA:'Ukraine',UG:'Uganda',US:'United States',UY:'Uruguay',UZ:'Uzbekistan',
  VE:'Venezuela',VN:'Vietnam',VU:'Vanuatu',WS:'Samoa',YE:'Yemen',ZA:'South Africa',ZM:'Zambia',ZW:'Zimbabwe',
};

const VALIDITY_OPTIONS = [
  { value: '1month', label: '1 Month', days: 30, credits: 1 },
  { value: '3months', label: '3 Months', days: 90, credits: 2 },
  { value: '6months', label: '6 Months', days: 180, credits: 4 },
  { value: '12months', label: '12 Months', days: 365, credits: 6 },
];

router.use(authenticate);

router.get('/domains', (req, res) => {
  try {
    const config = require('../config');
    const active = db.getActiveDomains();
    const domains = [
      { domain: config.domain, label: config.domain },
      ...active.map(d => ({ domain: d.domain, label: d.domain })),
    ];
    res.json({ domains });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function serverMatchesType(server, requiredType) {
  const st = server.server_type || 'all';
  if (st === 'all') return true;
  try {
    const types = JSON.parse(st);
    if (Array.isArray(types)) return types.includes('all') || types.includes(requiredType);
  } catch {}
  return st === requiredType || st === 'all';
}

router.get('/countries', (req, res) => {
  const serverType = req.query.type || 'all';
  const servers = db.getAllServers().filter(s => s.status === 'online' && (serverType === 'all' || serverMatchesType(s, serverType)));
  const countryMap = {};
  const labels = {};
  for (const s of servers) {
    if (!countryMap[s.country]) { countryMap[s.country] = 0; labels[s.country] = []; }
    countryMap[s.country]++;
    if (s.label) labels[s.country].push(s.label);
  }
  const countries = [
    { code: 'auto', name: 'Auto (Direct)', servers: 0 },
    ...Object.keys(countryMap).sort().map(code => {
      const cityList = labels[code].length > 0 ? ` (${labels[code].join(', ')})` : '';
      return {
        code,
        name: `${COUNTRY_NAMES[code] || code}${cityList}`,
        servers: countryMap[code],
      };
    }),
  ];
  res.json({ countries });
});

router.get('/validity-options', (req, res) => {
  res.json({ options: VALIDITY_OPTIONS });
});

router.get('/', (req, res) => {
  try {
    const proxies = db.getProxiesByUser(req.user.id);
    res.json({ proxies });
  } catch (err) {
    console.error('Get proxies error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { subdomain, target_url, country, validity, proxy_domain } = req.body;

    if (!subdomain || !target_url) {
      return res.status(400).json({ error: 'Subdomain and target URL are required' });
    }

    if (!validity) {
      return res.status(400).json({ error: 'Validity period is required' });
    }

    const plan = VALIDITY_OPTIONS.find(v => v.value === validity);
    if (!plan) {
      return res.status(400).json({ error: 'Invalid validity option' });
    }

    const user = db.getUserById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (!user.is_admin && user.credits < plan.credits) {
      return res.status(403).json({ error: `Insufficient credits. ${plan.label} requires ${plan.credits} credit${plan.credits > 1 ? 's' : ''}.` });
    }

    if (user.parent_id) {
      const reseller = db.getUserById(user.parent_id);
      if (reseller && reseller.max_proxies > 0) {
        const currentCount = db.countProxiesByParent(user.parent_id);
        if (currentCount >= reseller.max_proxies) {
          return res.status(403).json({ error: 'Proxy limit reached for your reseller account.' });
        }
      }
    }

    const sub = subdomain.toLowerCase().trim();

    if (sub.length < 2 || sub.length > 32) {
      return res.status(400).json({ error: 'Subdomain must be 2-32 characters' });
    }

    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sub)) {
      return res.status(400).json({ error: 'Subdomain can only contain lowercase letters, numbers, and hyphens' });
    }

    if (RESERVED.has(sub)) {
      return res.status(400).json({ error: 'This subdomain is reserved' });
    }

    if (db.subdomainExists(sub)) {
      return res.status(409).json({ error: 'Subdomain already taken' });
    }

    try { new URL(target_url); } catch {
      return res.status(400).json({ error: 'Invalid target URL' });
    }

    const selectedCountry = country || 'auto';

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + plan.days);

    if (!user.is_admin) {
      for (let i = 0; i < plan.credits; i++) {
        db.deductCredit(req.user.id);
      }
      const after = db.getUserById(req.user.id);
      db.addCreditHistory(req.user.id, user.username, -plan.credits, after.credits, 'proxy_created', `${sub} (${plan.label})`);
    }

    const result = db.createProxy(req.user.id, sub, target_url, selectedCountry, expiry.toISOString());
    const selectedDomain = proxy_domain || require('../config').domain;
    db.setProxyDomain(result.lastInsertRowid, selectedDomain);
    const proxy = db.getProxyById(result.lastInsertRowid);

    db.addActivityLog(req.user.id, user.username, req.ip, 'Proxy', 'Create', `${sub}.${selectedDomain} -> ${target_url} [${selectedCountry}] [${plan.label}]`);

    if (dnsManager.isConfigured() && selectedCountry !== 'auto') {
      const nodeIP = await dnsManager.getNodeIPForCountry(selectedCountry, db);
      if (nodeIP) {
        dnsManager.createARecord(sub, selectedDomain, nodeIP).catch(() => {});
      }
    }

    res.status(201).json({ proxy });
  } catch (err) {
    console.error('Create proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/renew', (req, res) => {
  try {
    const { id } = req.params;
    const { validity } = req.body;

    const plan = VALIDITY_OPTIONS.find(v => v.value === validity);
    if (!plan) return res.status(400).json({ error: 'Invalid validity option' });

    const proxy = db.getProxyById(id);
    if (!proxy || proxy.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Proxy not found' });
    }

    const user = db.getUserById(req.user.id);
    if (!user.is_admin && user.credits < plan.credits) {
      return res.status(403).json({ error: `Insufficient credits. ${plan.label} requires ${plan.credits} credit${plan.credits > 1 ? 's' : ''}.` });
    }

    const currentExpiry = proxy.expires_at ? new Date(proxy.expires_at) : new Date();
    const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
    baseDate.setDate(baseDate.getDate() + plan.days);

    if (!user.is_admin) {
      for (let i = 0; i < plan.credits; i++) {
        db.deductCredit(req.user.id);
      }
      const after = db.getUserById(req.user.id);
      db.addCreditHistory(req.user.id, user.username, -plan.credits, after.credits, 'proxy_renewed', `${proxy.subdomain} +${plan.label}`);
    }

    db.renewProxy(id, baseDate.toISOString());
    const updated = db.getProxyById(id);

    db.addActivityLog(req.user.id, user.username, req.ip, 'Proxy', 'Renew', `${proxy.subdomain} +${plan.label} (until ${baseDate.toLocaleDateString()})`);

    res.json({ proxy: updated });
  } catch (err) {
    console.error('Renew proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.toggleProxy(id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Proxy not found' });

    const proxy = db.getProxyById(id);
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Proxy', 'Toggle', `${proxy.subdomain} -> ${proxy.is_active ? 'active' : 'paused'}`);

    res.json({ proxy });
  } catch (err) {
    console.error('Toggle proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/edit', async (req, res) => {
  try {
    const { id } = req.params;
    const { subdomain, target_url, country } = req.body;

    const proxy = db.getProxyById(id);
    if (!proxy || proxy.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Proxy not found' });
    }

    if (country && country !== proxy.country) {
      db.updateProxyCountry(id, req.user.id, country);
      db.addActivityLog(req.user.id, req.user.username, req.ip, 'Proxy', 'EditCountry', `${proxy.subdomain}: ${proxy.country} -> ${country}`);

      if (dnsManager.isConfigured()) {
        const domain = proxy.proxy_domain || require('../config').domain;
        if (country !== 'auto') {
          const nodeIP = await dnsManager.getNodeIPForCountry(country, db);
          if (nodeIP) dnsManager.createARecord(proxy.subdomain, domain, nodeIP).catch(() => {});
        } else {
          dnsManager.deleteARecord(proxy.subdomain, domain).catch(() => {});
        }
      }
    }

    if (subdomain) {
      const sub = subdomain.toLowerCase().trim();
      if (sub !== proxy.subdomain) {
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sub)) {
          return res.status(400).json({ error: 'Invalid subdomain format' });
        }
        if (db.subdomainExists(sub)) {
          return res.status(409).json({ error: 'Subdomain already taken' });
        }
        db.updateProxySubdomain(id, req.user.id, sub);
        db.addActivityLog(req.user.id, req.user.username, req.ip, 'Proxy', 'EditSubdomain', `${proxy.subdomain} -> ${sub}`);
      }
    }

    if (target_url) {
      try { new URL(target_url); } catch {
        return res.status(400).json({ error: 'Invalid target URL' });
      }
      db.updateProxyTarget(id, req.user.id, target_url);
      db.addActivityLog(req.user.id, req.user.username, req.ip, 'Proxy', 'EditTarget', `${proxy.subdomain}: -> ${target_url}`);
    }

    const updated = db.getProxyById(id);
    res.json({ proxy: updated });
  } catch (err) {
    console.error('Edit proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/request-stream', (req, res) => {
  try {
    const { id } = req.params;
    const proxy = db.getProxyById(id);
    if (!proxy || proxy.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Proxy not found' });
    }
    if (proxy.stream_proxy === 2) {
      return res.status(400).json({ error: 'Stream proxy already approved' });
    }

    db.requestStreamProxy(id, req.user.id);
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Proxy', 'StreamRequest', proxy.subdomain);

    res.json({ message: 'Stream proxy requested. Waiting for admin approval.' });
  } catch (err) {
    console.error('Stream proxy request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── IP Whitelist ───────────────────────────────────

router.post('/:id/ip-lock', (req, res) => {
  try {
    const proxy = db.getProxyById(req.params.id);
    if (!proxy || proxy.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Proxy not found' });
    }
    const ip = req.body.ip;
    if (!ip || !/^[\d.]+$/.test(ip.trim())) {
      return res.status(400).json({ error: 'Valid IP address required' });
    }
    const ipClean = ip.trim();

    let ips = [];
    if (proxy.ip_lock) {
      try { ips = JSON.parse(proxy.ip_lock); } catch { if (proxy.ip_lock) ips = [proxy.ip_lock]; }
    }
    if (!Array.isArray(ips)) ips = [];
    if (ips.includes(ipClean)) {
      return res.status(409).json({ error: 'IP already whitelisted' });
    }
    ips.push(ipClean);
    db.setIpLock(proxy.id, JSON.stringify(ips));
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Proxy', 'IpWhitelist', `${proxy.subdomain} +${ipClean} (${ips.length} total)`);
    res.json({ message: 'IP added to whitelist', proxy: db.getProxyById(proxy.id) });
  } catch (err) {
    console.error('IP whitelist error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/ip-lock', (req, res) => {
  try {
    const proxy = db.getProxyById(req.params.id);
    if (!proxy || proxy.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Proxy not found' });
    }
    const ipToRemove = req.body?.ip;

    if (ipToRemove) {
      let ips = [];
      if (proxy.ip_lock) {
        try { ips = JSON.parse(proxy.ip_lock); } catch { if (proxy.ip_lock) ips = [proxy.ip_lock]; }
      }
      if (!Array.isArray(ips)) ips = [];
      ips = ips.filter(ip => ip !== ipToRemove);
      db.setIpLock(proxy.id, ips.length > 0 ? JSON.stringify(ips) : null);
      db.addActivityLog(req.user.id, req.user.username, req.ip, 'Proxy', 'IpWhitelist', `${proxy.subdomain} -${ipToRemove} (${ips.length} remaining)`);
    } else {
      db.setIpLock(proxy.id, null);
      db.addActivityLog(req.user.id, req.user.username, req.ip, 'Proxy', 'IpWhitelistClear', `${proxy.subdomain} all IPs removed`);
    }
    res.json({ message: 'IP whitelist updated', proxy: db.getProxyById(proxy.id) });
  } catch (err) {
    console.error('IP whitelist error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Stream Tokens ──────────────────────────────────

router.post('/:id/generate-token', async (req, res) => {
  try {
    const proxy = db.getProxyById(req.params.id);
    if (!proxy || proxy.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Proxy not found' });
    }
    if (proxy.stream_proxy !== 2) {
      return res.status(400).json({ error: 'Stream proxy must be approved to generate tokens' });
    }

    const crypto = require('crypto');
    const durationHours = parseInt(req.body.duration_hours) || 24;
    const { username, password } = req.body;
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + (durationHours * 3600);

    let encryptedCreds = null;
    if (username && password) {
      const config = require('../config');
      const key = crypto.createHash('sha256').update(config.jwtSecret).digest();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(JSON.stringify({ username, password }), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      encryptedCreds = iv.toString('hex') + ':' + encrypted;
    }

    db.createStreamToken(token, proxy.id, expiresAt, encryptedCreds);

    const config = require('../config');
    const proxyDomain = proxy.proxy_domain || config.domain;

    let streamHost = config.domain;
    if (proxy.country && proxy.country !== 'auto' && dnsManager.isConfigured()) {
      const nodeIP = await dnsManager.getNodeIPForCountry(proxy.country, db);
      if (nodeIP) {
        streamHost = `${proxy.subdomain}.${proxyDomain}`;
      }
    }

    const streamUrl = `http://${streamHost}/stream/${token}`;

    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Stream', 'TokenCreated', `${proxy.subdomain} (${durationHours}h${username ? ', with credentials' : ''})`);

    res.json({ token, url: streamUrl, expires_at: expiresAt, has_credentials: !!encryptedCreds });
  } catch (err) {
    console.error('Generate token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/tokens', (req, res) => {
  try {
    const proxy = db.getProxyById(req.params.id);
    if (!proxy || proxy.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Proxy not found' });
    }
    const now = Math.floor(Date.now() / 1000);
    const tokens = db.getTokensByProxy(proxy.id).map(t => ({
      ...t,
      is_expired: t.expires_at < now,
    }));
    res.json({ tokens });
  } catch (err) {
    console.error('Get tokens error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/tokens/:tokenId', (req, res) => {
  try {
    const proxy = db.getProxyById(req.params.id);
    if (!proxy || proxy.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Proxy not found' });
    }
    db.deleteStreamToken(req.params.tokenId, proxy.id);
    res.json({ message: 'Token revoked' });
  } catch (err) {
    console.error('Delete token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Delete Proxy ───────────────────────────────────

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const proxy = db.getProxyById(id);
    const result = db.deleteProxy(id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Proxy not found' });

    if (proxy) {
      db.addActivityLog(req.user.id, req.user.username, req.ip, 'Proxy', 'Delete', proxy.subdomain);
      if (dnsManager.isConfigured() && proxy.proxy_domain) {
        dnsManager.deleteARecord(proxy.subdomain, proxy.proxy_domain).catch(() => {});
      }
    }

    res.json({ message: 'Proxy deleted' });
  } catch (err) {
    console.error('Delete proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
