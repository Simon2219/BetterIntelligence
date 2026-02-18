process.env.USE_HTTPS = '1';
require('dotenv').config();
const { killPort } = require('./scripts/kill-port.js');
const port = parseInt(process.env.PORT || '3000');
killPort(port);
setTimeout(() => { try { require('./server.js'); } catch (e) { console.error(e); process.exit(1); } }, 300);
