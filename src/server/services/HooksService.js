/**
 * HooksService - Fire events to webhooks and emit over Socket.io
 * Events: message_received, agent_response, skill_invoked, deploy_request
 */
const https = require('https');
const http = require('http');
const log = require('./Logger')('hooks');

let _io = null;
const _configs = new Map(); // event -> [{ url, enabled }]

function init(io) {
    _io = io;
}

function register(event, url, enabled = true) {
    if (!_configs.has(event)) _configs.set(event, []);
    _configs.get(event).push({ url, enabled });
}

function clear(event) {
    _configs.delete(event);
}

/**
 * Fire a hook event. POSTs to configured URLs and emits hooks:event over Socket.io.
 */
async function fire(event, payload) {
    const configs = _configs.get(event) || [];
    const body = JSON.stringify({ event, ...payload, timestamp: new Date().toISOString() });

    for (const { url, enabled } of configs) {
        if (!enabled || !url) continue;
        try {
            const u = new URL(url);
            const lib = u.protocol === 'https:' ? https : http;
            await new Promise((resolve, reject) => {
                const req = lib.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
                    res.on('data', () => {});
                    res.on('end', resolve);
                });
                req.on('error', reject);
                req.write(body);
                req.end();
            });
        } catch (err) {
            log.warn('Webhook failed', { event, url, err: err.message });
        }
    }

    if (_io) {
        _io.emit('hooks:event', { event, ...payload });
    }
}

module.exports = { init, fire, register, clear };
