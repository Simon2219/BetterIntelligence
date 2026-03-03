/**
 * Start server with HTTPS enabled.
 * Kills any process on the port first, then starts cleanly.
 * Usage: node start-https.js  or  npm start
 */
process.env.USE_HTTPS = '1';
require('dotenv').config();
const { killPort } = require('./scripts/kill-port.js');
const port = parseInt(process.env.PORT || '3000', 10);
killPort(port);
setTimeout(() => {
    try {
        require('./server.js');
    } catch (err) {
        console.error('\n  BetterIntelligence — Failed to start:', err.message, '\n');
        console.error(err.stack);
        process.exit(1);
    }
}, 300);
