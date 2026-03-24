require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  domain: process.env.DOMAIN || 'localhost',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
  nodeEnv: process.env.NODE_ENV || 'development',
  paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
  paypalSecret: process.env.PAYPAL_SECRET || '',
  paypalSandbox: process.env.PAYPAL_SANDBOX === 'true',
  nodeSecret: process.env.NODE_SECRET || 'change-this-node-secret',
  cloudflareToken: process.env.CLOUDFLARE_TOKEN || '',
  cloudflareZoneId: process.env.CLOUDFLARE_ZONE_ID || '',
};
