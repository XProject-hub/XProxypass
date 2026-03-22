const express = require('express');
const { authenticate } = require('../auth');
const db = require('../database');

const router = express.Router();

const RESERVED = new Set([
  'api', 'www', 'mail', 'admin', 'ftp', 'smtp', 'pop', 'imap',
  'ns1', 'ns2', 'cdn', 'static', 'assets', 'panel', 'dashboard',
  'login', 'register', 'app', 'dev', 'staging', 'test',
]);

const proxyPool = require('../proxy-pool');

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

router.get('/countries', (req, res) => {
  const poolCountries = proxyPool.getAvailableCountries();
  const countries = [
    { code: 'auto', name: 'Auto (Direct)', total: 0, verified: 0 },
    ...poolCountries.map(c => ({ code: c.code, name: COUNTRY_NAMES[c.code] || c.code, total: c.total, verified: c.verified })),
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

router.post('/', (req, res) => {
  try {
    const { subdomain, target_url, country, validity } = req.body;

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
    const proxy = db.getProxyById(result.lastInsertRowid);

    db.addActivityLog(req.user.id, user.username, req.ip, 'Proxy', 'Create', `${sub} -> ${target_url} [${selectedCountry}] [${plan.label}]`);

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

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const proxy = db.getProxyById(id);
    const result = db.deleteProxy(id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Proxy not found' });

    if (proxy) {
      db.addActivityLog(req.user.id, req.user.username, req.ip, 'Proxy', 'Delete', proxy.subdomain);
    }

    res.json({ message: 'Proxy deleted' });
  } catch (err) {
    console.error('Delete proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
