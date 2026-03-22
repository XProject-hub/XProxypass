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
        return_url: `https://${config.domain}/dashboard?payment=success`,
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

module.exports = router;
