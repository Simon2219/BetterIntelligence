/**
 * Quick script to verify GET /api/appearance returns expected structure.
 * Run: node scripts/test-appearance-api.js
 */
const https = require('https');
const http = require('http');
require('dotenv').config();
const port = parseInt(process.env.PORT || '3000', 10);
const useHttps = process.env.SSL_KEY_PATH || process.env.HTTPS === 'true';
const client = useHttps ? https : http;
const proto = useHttps ? 'https' : 'http';

const req = client.get(
  `${proto}://localhost:${port}/api/appearance`,
  { rejectUnauthorized: false },
  (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        const hasDark = data?.data?.dark && typeof data.data.dark === 'object';
        const hasLight = data?.data?.light && typeof data.data.light === 'object';
        console.log(JSON.stringify(data, null, 2));
        console.log('\n1-2 Pass:', hasDark && hasLight);
        process.exit(hasDark && hasLight ? 0 : 1);
      } catch (e) {
        console.error('Parse error:', e.message);
        process.exit(1);
      }
    });
  }
);
req.on('error', (err) => {
  console.error('Error:', err?.message || String(err));
  process.exit(1);
});
