const express = require('express');
const https = require('https');
const crypto = require('crypto');
const { authenticate } = require('../auth');
const db = require('../database');
const config = require('../config');

const router = express.Router();

const CREDIT_PACKAGES = [
  { id: 'starter', name: 'Starter', credits: 1, price: 7.00 },
  { id: 'basic', name: 'Basic', credits: 5, price: 30.00 },
  { id: 'pro', name: 'Pro', credits: 10, price: 50.00 },
  { id: 'business', name: 'Business', credits: 25, price: 100.00 },
];

function nowpaymentsRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = https.request({
      hostname: 'api.nowpayments.io',
      port: 443,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.nowpaymentsApiKey,
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data || '{}') }); }
        catch { resolve({ status: res.statusCode, data: {} }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.setTimeout(15000);
    if (postData) req.write(postData);
    req.end();
  });
}

function verifyIPN(body, signature) {
  if (!config.nowpaymentsIpnSecret || !signature) return false;
  const sorted = Object.keys(body).sort().reduce((acc, key) => {
    acc[key] = body[key];
    return acc;
  }, {});
  const hmac = crypto.createHmac('sha512', config.nowpaymentsIpnSecret);
  hmac.update(JSON.stringify(sorted));
  return hmac.digest('hex') === signature;
}

router.get('/packages', (req, res) => {
  res.json({ packages: CREDIT_PACKAGES });
});

router.get('/stream-plans', (req, res) => {
  try {
    const plans = db.getActiveStreamPlans();
    const grouped = { streaming: [], enterprise: [], reseller: [] };
    plans.forEach(p => { if (grouped[p.type]) grouped[p.type].push(p); });
    res.json({ plans: grouped });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/my-subscription', authenticate, (req, res) => {
  try {
    const sub = db.getActiveSubscription(req.user.id);
    res.json({ active: sub || null });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Create Invoice for Credit Package ──────────────

router.post('/create-invoice', authenticate, async (req, res) => {
  try {
    const { package_id } = req.body;
    if (!package_id) return res.status(400).json({ error: 'Package ID required' });

    if (!config.nowpaymentsApiKey) {
      return res.status(500).json({ error: 'Crypto payments not configured' });
    }

    const pkg = CREDIT_PACKAGES.find(p => p.id === package_id);
    if (!pkg) return res.status(400).json({ error: 'Invalid package' });

    const orderId = `credits_${req.user.id}_${Date.now()}`;

    const result = await nowpaymentsRequest('POST', '/v1/invoice', {
      price_amount: pkg.price,
      price_currency: 'eur',
      order_id: orderId,
      order_description: `ProxyXPass ${pkg.name} Package (${pkg.credits} credits)`,
      ipn_callback_url: `https://${config.domain}/api/crypto/ipn`,
      success_url: `https://${config.domain}/dashboard/buy?crypto=success&order=${orderId}`,
      cancel_url: `https://${config.domain}/dashboard/buy?crypto=cancelled`,
    });

    if (!result.data.id) {
      console.error('[Crypto] Invoice creation failed:', result.data);
      return res.status(500).json({ error: 'Failed to create crypto invoice' });
    }

    const payment = db.createCryptoPayment(req.user.id, 'credits', pkg.id, null, pkg.price, orderId);
    db.updateCryptoPayment(payment.lastInsertRowid, null, String(result.data.id), 'waiting', null, null);

    db.addActivityLog(req.user.id, req.user.username, req.ip, 'CryptoPayment', 'InvoiceCreated',
      `${pkg.name} (${pkg.price} EUR) - Order: ${orderId}`);

    res.json({
      invoice_url: result.data.invoice_url,
      invoice_id: result.data.id,
      order_id: orderId,
    });
  } catch (err) {
    console.error('[Crypto] Create invoice error:', err);
    res.status(500).json({ error: 'Crypto payment error' });
  }
});

// ── Create Invoice for Streaming Plan ──────────────

router.post('/create-subscription-invoice', authenticate, async (req, res) => {
  try {
    const { plan_id } = req.body;
    if (!plan_id) return res.status(400).json({ error: 'Plan ID required' });

    if (!config.nowpaymentsApiKey) {
      return res.status(500).json({ error: 'Crypto payments not configured' });
    }

    const plan = db.getStreamPlanById(plan_id);
    if (!plan || !plan.is_active) return res.status(404).json({ error: 'Plan not found' });

    const existing = db.getActiveSubscription(req.user.id);
    if (existing) {
      return res.status(400).json({ error: 'You already have an active subscription. Cancel it first.' });
    }

    const orderId = `sub_${req.user.id}_${plan.id}_${Date.now()}`;

    const result = await nowpaymentsRequest('POST', '/v1/invoice', {
      price_amount: plan.price_eur,
      price_currency: 'eur',
      order_id: orderId,
      order_description: `ProxyXPass ${plan.name} - Monthly Subscription`,
      ipn_callback_url: `https://${config.domain}/api/crypto/ipn`,
      success_url: `https://${config.domain}/dashboard/buy?crypto=success&order=${orderId}`,
      cancel_url: `https://${config.domain}/dashboard/buy?crypto=cancelled`,
    });

    if (!result.data.id) {
      console.error('[Crypto] Subscription invoice failed:', result.data);
      return res.status(500).json({ error: 'Failed to create crypto invoice' });
    }

    const payment = db.createCryptoPayment(req.user.id, 'subscription', null, plan.id, plan.price_eur, orderId);
    db.updateCryptoPayment(payment.lastInsertRowid, null, String(result.data.id), 'waiting', null, null);

    db.addActivityLog(req.user.id, req.user.username, req.ip, 'CryptoPayment', 'SubInvoiceCreated',
      `${plan.name} (${plan.price_eur} EUR) - Order: ${orderId}`);

    res.json({
      invoice_url: result.data.invoice_url,
      invoice_id: result.data.id,
      order_id: orderId,
    });
  } catch (err) {
    console.error('[Crypto] Create subscription invoice error:', err);
    res.status(500).json({ error: 'Crypto payment error' });
  }
});

// ── IPN Webhook (NOWPayments callback) ─────────────

router.post('/ipn', async (req, res) => {
  try {
    const signature = req.headers['x-nowpayments-sig'];
    const body = req.body;

    if (config.nowpaymentsIpnSecret && !verifyIPN(body, signature)) {
      console.error('[Crypto IPN] Invalid signature');
      return res.sendStatus(400);
    }

    const paymentStatus = body.payment_status;
    const orderId = body.order_id;
    const payCurrency = body.pay_currency;
    const payAmount = body.pay_amount;
    const nowpaymentsId = body.payment_id;

    console.log(`[Crypto IPN] Order: ${orderId}, Status: ${paymentStatus}, Currency: ${payCurrency}, Amount: ${payAmount}`);

    if (!orderId) return res.sendStatus(200);

    const payment = db.getCryptoPaymentByOrderId(orderId);
    if (!payment) {
      console.error(`[Crypto IPN] Payment not found for order: ${orderId}`);
      return res.sendStatus(200);
    }

    db.updateCryptoPayment(payment.id, String(nowpaymentsId || ''), payment.invoice_id, paymentStatus, payCurrency, payAmount);

    if (paymentStatus === 'finished' || paymentStatus === 'confirmed') {
      if (payment.status === 'finished' || payment.status === 'confirmed') {
        return res.sendStatus(200);
      }

      if (payment.type === 'credits') {
        const pkg = CREDIT_PACKAGES.find(p => p.id === payment.package_id);
        if (pkg) {
          db.addCredits(pkg.credits, payment.user_id);
          const user = db.getUserById(payment.user_id);
          db.addCreditHistory(payment.user_id, user?.username || 'unknown', pkg.credits,
            (user?.credits || 0), 'crypto_purchase',
            `${pkg.name} - Crypto ${payCurrency} (Order: ${orderId})`);
          db.addActivityLog(payment.user_id, user?.username, null, 'CryptoPayment', 'Completed',
            `+${pkg.credits} credits - ${payCurrency} ${payAmount}`);
          console.log(`[Crypto IPN] Credits added: ${pkg.credits} to user ${payment.user_id}`);
        }
      }

      if (payment.type === 'subscription') {
        const plan = db.getStreamPlanById(payment.plan_id);
        if (plan) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);

          const sub = db.createSubscription(
            payment.user_id, plan.id, `crypto_${orderId}`, 'active',
            plan.speed_mbps, plan.type, new Date().toISOString(), expiresAt.toISOString()
          );

          if (plan.type === 'reseller') {
            db.updateUserRole(payment.user_id, 'reseller');
            db.setGbpsPool(payment.user_id, plan.speed_mbps);
          }

          const user = db.getUserById(payment.user_id);
          db.addActivityLog(payment.user_id, user?.username, null, 'CryptoPayment', 'SubscriptionActivated',
            `${plan.name} - Crypto ${payCurrency} (Order: ${orderId})`);
          console.log(`[Crypto IPN] Subscription activated: ${plan.name} for user ${payment.user_id}`);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[Crypto IPN] Error:', err);
    res.sendStatus(200);
  }
});

// ── Payment Status Check ───────────────────────────

router.get('/payment-status/:orderId', authenticate, (req, res) => {
  try {
    const payment = db.getCryptoPaymentByOrderId(req.params.orderId);
    if (!payment || payment.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json({ payment });
  } catch (err) {
    console.error('[Crypto] Status check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/my-payments', authenticate, (req, res) => {
  try {
    res.json({ payments: db.getCryptoPaymentsByUser(req.user.id) });
  } catch (err) {
    console.error('[Crypto] My payments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
