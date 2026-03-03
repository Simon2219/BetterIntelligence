/**
 * Request Logger - Logs HTTP requests to per-user or guest log files
 *
 * Runs for /api/* requests. Logs after response finishes.
 * Writes to users/{userId}.log (authenticated) or guests/access.log (guest).
 */

const Logger = require('../services/Logger');
const Config = require('../../../config/Config');
const log = Logger('api');

function _shouldLog() {
    const enabled = Config.get('logging.enabled', true);
    const level = Config.get('logging.systems.api', 'info');
    const order = { debug: 0, info: 1, warn: 2, error: 3 };
    return enabled && (order[level] ?? 1) <= 1;
}

function requestLogger(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        if (!_shouldLog()) return;

        const duration = Date.now() - start;
        const userId = req.user?.id || 'guest';
        const ip = req.ip || req.connection?.remoteAddress || '-';
        const line = `[${new Date().toISOString()}] [${req.method}] ${req.originalUrl || req.url} ${res.statusCode} ${duration}ms ip=${ip}\n`;

        if (req.user) {
            Logger.appendToUserLog(userId, line);
        } else {
            Logger.appendToGuestLog(line);
        }

        if (res.statusCode >= 500) {
            log.error('Request error', { method: req.method, path: req.originalUrl, status: res.statusCode, duration, ip });
        }
    });
    next();
}

module.exports = requestLogger;
