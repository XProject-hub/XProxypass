const express = require('express');
const https = require('https');
const { authenticate } = require('../auth');
const db = require('../database');
const config = require('../config');

const router = express.Router();

const CREDIT_PACKAGES = [
  { id: 'starter', name: 'Starter', credits: 1, price: '7.00', currency: 'EUR' },
  { id: 'basic', name: 'Basic', credits: 5, price: '30.00', currency: 'EUR' },
  { id: 'pro', name: 'Pro', credits: 10, price: '50.00', currency: 'EUR' },
  { id: 'business', name: 'Business', credits: 25, price: '100.00', currency: 'EUR' },
];

function paypalRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${config.paypalClientId}:${config.paypalSecret}`).toString('base64');
    const host = config.paypalSandbox ? 'api-m.sandbox.paypal.com' : 'api-m.paypal.com';
    const postData = body ? JSON.stringify(body) : '';

    const options = {
      hostname: host,
      port: 443,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data || '{}') }); }
        catch { resolve({ status: res.statusCode, data: {} }); }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

router.get('/packages', (req, res) => {
  res.json({ packages: CREDIT_PACKAGES });
});

router.post('/create-order', authenticate, async (req, res) => {
  try {
    const { package_id } = req.body;
    const pkg = CREDIT_PACKAGES.find(p => p.id === package_id);
    if (!pkg) return res.status(400).json({ error: 'Invalid package' });

    if (!config.paypalClientId || !config.paypalSecret) {
      return res.status(500).json({ error: 'PayPal not configured' });
    }

    const result = await paypalRequest('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: pkg.currency,
          value: pkg.price,
        },
        description: `ProxyXPass - ${pkg.name} Package (${pkg.credits} credits)`,
        custom_id: JSON.stringify({ user_id: req.user.id, package_id: pkg.id }),
      }],
      application_context: {
        brand_name: 'ProxyXPass',
        return_url: `https://${config.domain}/dashboard/buy?payment=success`,
        cancel_url: `https://${config.domain}/dashboard/buy?payment=cancelled`,
      },
    });

    if (result.status !== 201 || !result.data.id) {
      console.error('PayPal create order failed:', result.data);
      return res.status(500).json({ error: 'Failed to create PayPal order' });
    }

    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Payment', 'OrderCreated', `${pkg.name} ($${pkg.price})`);

    res.json({
      order_id: result.data.id,
      approve_url: result.data.links?.find(l => l.rel === 'approve')?.href,
    });
  } catch (err) {
    console.error('PayPal create order error:', err);
    res.status(500).json({ error: 'Payment error' });
  }
});

router.post('/capture-order', authenticate, async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'Order ID required' });

    const result = await paypalRequest('POST', `/v2/checkout/orders/${order_id}/capture`, {});

    if (result.data.status !== 'COMPLETED') {
      console.error('PayPal capture failed:', result.data);
      return res.status(400).json({ error: 'Payment not completed' });
    }

    const customId = result.data.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id;
    let meta;
    try { meta = JSON.parse(customId); } catch {
      return res.status(400).json({ error: 'Invalid payment data' });
    }

    if (meta.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Payment user mismatch' });
    }

    const pkg = CREDIT_PACKAGES.find(p => p.id === meta.package_id);
    if (!pkg) return res.status(400).json({ error: 'Invalid package' });

    db.addCredits(pkg.credits, req.user.id);
    const updated = db.getUserById(req.user.id);

    db.addCreditHistory(req.user.id, req.user.username, pkg.credits, updated.credits, 'paypal_purchase', `${pkg.name} - $${pkg.price} (Order: ${order_id})`);
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Payment', 'Completed', `${pkg.name} +${pkg.credits} credits ($${pkg.price})`);

    res.json({
      message: 'Payment successful',
      credits_added: pkg.credits,
      new_balance: updated.credits,
    });
  } catch (err) {
    console.error('PayPal capture error:', err);
    res.status(500).json({ error: 'Payment processing error' });
  }
});

// ── Stream Plans (public) ──────────────────────────

router.get('/stream-plans', (req, res) => {
  try {
    const plans = db.getActiveStreamPlans();
    const grouped = {
      streaming: plans.filter(p => p.type === 'streaming'),
      enterprise: plans.filter(p => p.type === 'enterprise'),
      reseller: plans.filter(p => p.type === 'reseller'),
    };
    res.json({ plans: grouped, all: plans });
  } catch (err) {
    console.error('Stream plans error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PayPal Subscription Flow ───────────────────────

async function getPayPalAccessToken() {
  const auth = Buffer.from(`${config.paypalClientId}:${config.paypalSecret}`).toString('base64');
  const host = config.paypalSandbox ? 'api-m.sandbox.paypal.com' : 'api-m.paypal.com';

  return new Promise((resolve, reject) => {
    const postData = 'grant_type=client_credentials';
    const req = https.request({
      hostname: host, port: 443, path: '/v1/oauth2/token', method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data).access_token); }
        catch { reject(new Error('Failed to get access token')); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function paypalSubscriptionRequest(method, path, body, accessToken) {
  const host = config.paypalSandbox ? 'api-m.sandbox.paypal.com' : 'api-m.paypal.com';
  const postData = body ? JSON.stringify(body) : '';

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host, port: 443, path, method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
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
    if (postData) req.write(postData);
    req.end();
  });
}

async function ensurePayPalPlan(plan, accessToken) {
  if (plan.paypal_plan_id) return plan.paypal_plan_id;

  const productResult = await paypalSubscriptionRequest('POST', '/v1/catalogs/products', {
    name: plan.name,
    description: plan.description || plan.name,
    type: 'SERVICE',
    category: 'SOFTWARE',
  }, accessToken);

  if (!productResult.data.id) {
    console.error('[PayPal] Product creation failed:', productResult.data);
    return null;
  }

  const planResult = await paypalSubscriptionRequest('POST', '/v1/billing/plans', {
    product_id: productResult.data.id,
    name: plan.name,
    description: plan.description || plan.name,
    billing_cycles: [{
      frequency: { interval_unit: 'MONTH', interval_count: 1 },
      tenure_type: 'REGULAR',
      sequence: 1,
      total_cycles: 0,
      pricing_scheme: {
        fixed_price: { value: plan.price_eur.toFixed(2), currency_code: 'EUR' },
      },
    }],
    payment_preferences: {
      auto_bill_outstanding: true,
      payment_failure_threshold: 3,
    },
  }, accessToken);

  if (planResult.data.id) {
    db.updateStreamPlanPaypal(plan.id, planResult.data.id);
    console.log(`[PayPal] Created plan ${plan.name} -> ${planResult.data.id}`);
    return planResult.data.id;
  }

  console.error('[PayPal] Plan creation failed:', planResult.data);
  return null;
}

router.post('/create-subscription', authenticate, async (req, res) => {
  try {
    const { plan_id } = req.body;
    if (!plan_id) return res.status(400).json({ error: 'Plan ID required' });

    if (!config.paypalClientId || !config.paypalSecret) {
      return res.status(500).json({ error: 'PayPal not configured' });
    }

    const plan = db.getStreamPlanById(plan_id);
    if (!plan || !plan.is_active) return res.status(404).json({ error: 'Plan not found' });

    const existing = db.getActiveSubscription(req.user.id);
    if (existing) {
      return res.status(400).json({ error: 'You already have an active subscription. Cancel it first.' });
    }

    const accessToken = await getPayPalAccessToken();
    const paypalPlanId = await ensurePayPalPlan(plan, accessToken);
    if (!paypalPlanId) {
      return res.status(500).json({ error: 'Failed to create PayPal plan' });
    }

    const subResult = await paypalSubscriptionRequest('POST', '/v1/billing/subscriptions', {
      plan_id: paypalPlanId,
      custom_id: JSON.stringify({ user_id: req.user.id, plan_id: plan.id }),
      application_context: {
        brand_name: 'ProxyXPass',
        return_url: `https://${config.domain}/dashboard/buy?subscription=success&plan_id=${plan.id}`,
        cancel_url: `https://${config.domain}/dashboard/buy?subscription=cancelled`,
        user_action: 'SUBSCRIBE_NOW',
      },
    }, accessToken);

    if (!subResult.data.id) {
      console.error('[PayPal] Subscription creation failed:', subResult.data);
      return res.status(500).json({ error: 'Failed to create subscription' });
    }

    const sub = db.createSubscription(
      req.user.id, plan.id, subResult.data.id, 'pending',
      plan.speed_mbps, plan.type, null, null
    );

    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Subscription', 'Created',
      `${plan.name} (${plan.price_eur} EUR/mj)`);

    const approveUrl = subResult.data.links?.find(l => l.rel === 'approve')?.href;

    res.json({
      subscription_id: subResult.data.id,
      approve_url: approveUrl,
      db_id: sub.lastInsertRowid,
    });
  } catch (err) {
    console.error('Create subscription error:', err);
    res.status(500).json({ error: 'Subscription error' });
  }
});

router.post('/activate-subscription', authenticate, async (req, res) => {
  try {
    const { subscription_id } = req.body;
    if (!subscription_id) return res.status(400).json({ error: 'Subscription ID required' });

    const accessToken = await getPayPalAccessToken();
    const result = await paypalSubscriptionRequest('GET', `/v1/billing/subscriptions/${subscription_id}`, null, accessToken);

    if (result.data.status !== 'ACTIVE') {
      return res.status(400).json({ error: `Subscription not active. Status: ${result.data.status}` });
    }

    const sub = db.getSubscriptionByPaypal(subscription_id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    if (sub.user_id !== req.user.id) return res.status(403).json({ error: 'Not your subscription' });

    db.activateSubscription(sub.id);
    const plan = db.getStreamPlanById(sub.plan_id);

    if (sub.plan_type === 'reseller') {
      db.updateUserRole(req.user.id, 'reseller');
      db.setGbpsPool(req.user.id, sub.speed_mbps);
      db.addActivityLog(req.user.id, req.user.username, req.ip, 'Subscription', 'ResellerActivated',
        `${plan.name} - ${sub.speed_mbps} Mbps pool`);
    } else {
      db.addActivityLog(req.user.id, req.user.username, req.ip, 'Subscription', 'Activated',
        `${plan.name} - ${sub.speed_mbps} Mbps`);
    }

    res.json({ message: 'Subscription activated', subscription: db.getSubscriptionById(sub.id) });
  } catch (err) {
    console.error('Activate subscription error:', err);
    res.status(500).json({ error: 'Activation error' });
  }
});

router.post('/cancel-subscription', authenticate, async (req, res) => {
  try {
    const sub = db.getActiveSubscription(req.user.id);
    if (!sub) return res.status(404).json({ error: 'No active subscription' });

    if (sub.paypal_subscription_id) {
      try {
        const accessToken = await getPayPalAccessToken();
        await paypalSubscriptionRequest('POST',
          `/v1/billing/subscriptions/${sub.paypal_subscription_id}/cancel`,
          { reason: 'User cancelled' }, accessToken);
      } catch (err) {
        console.error('PayPal cancel error:', err.message);
      }
    }

    db.updateSubscriptionStatus(sub.id, 'cancelled');
    db.addActivityLog(req.user.id, req.user.username, req.ip, 'Subscription', 'Cancelled', sub.plan_name);

    res.json({ message: 'Subscription cancelled. Access continues until period end.' });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    res.status(500).json({ error: 'Cancel error' });
  }
});

router.get('/my-subscription', authenticate, (req, res) => {
  try {
    const sub = db.getActiveSubscription(req.user.id);
    const all = db.getSubscriptionsByUser(req.user.id);
    res.json({ active: sub || null, history: all });
  } catch (err) {
    console.error('Get subscription error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PayPal Webhook ─────────────────────────────────

router.post('/subscription-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const eventType = event.event_type;
    const resource = event.resource;

    console.log(`[PayPal Webhook] ${eventType}`);

    if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
      const sub = db.getSubscriptionByPaypal(resource.id);
      if (sub && sub.status !== 'active') {
        db.activateSubscription(sub.id);
        const plan = db.getStreamPlanById(sub.plan_id);
        if (sub.plan_type === 'reseller') {
          db.updateUserRole(sub.user_id, 'reseller');
          db.setGbpsPool(sub.user_id, sub.speed_mbps);
        }
        console.log(`[Webhook] Activated subscription ${sub.id} for user ${sub.user_id}`);
      }
    }

    if (eventType === 'PAYMENT.SALE.COMPLETED') {
      const billingAgreementId = resource.billing_agreement_id;
      if (billingAgreementId) {
        const sub = db.getSubscriptionByPaypal(billingAgreementId);
        if (sub) {
          db.renewSubscription(sub.id);
          console.log(`[Webhook] Renewed subscription ${sub.id}`);
        }
      }
    }

    if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED' || eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') {
      const sub = db.getSubscriptionByPaypal(resource.id);
      if (sub) {
        db.updateSubscriptionStatus(sub.id, eventType.includes('CANCELLED') ? 'cancelled' : 'suspended');
        console.log(`[Webhook] ${eventType} subscription ${sub.id}`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[Webhook] Error:', err);
    res.sendStatus(200);
  }
});

module.exports = router;
