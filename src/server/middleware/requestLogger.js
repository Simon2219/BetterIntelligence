const log = require('../services/Logger')('api');

function requestLogger(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        const d = Date.now() - start;
        if (res.statusCode >= 500) log.error('Request error', { method: req.method, path: req.originalUrl, status: res.statusCode, duration: d });
    });
    next();
}

module.exports = requestLogger;
