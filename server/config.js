require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  domain: process.env.DOMAIN || 'localhost',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
  nodeEnv: process.env.NODE_ENV || 'development',
  nodeSecret: process.env.NODE_SECRET || 'change-this-node-secret',
  cloudflareToken: process.env.CLOUDFLARE_TOKEN || '',
  cloudflareZoneId: process.env.CLOUDFLARE_ZONE_ID || '',
  nowpaymentsApiKey: process.env.NOWPAYMENTS_API_KEY || '',
  nowpaymentsIpnSecret: process.env.NOWPAYMENTS_IPN_SECRET || '',
};
