const Config = require('../../../config/Config');
const fs = require('fs');
const path = require('path');

const LEVELS = ['debug', 'info', 'warn', 'error'];
const ORDER = { debug: 0, info: 1, warn: 2, error: 3 };

function _shouldLog(system, level) {
    if (!Config.get('logging.enabled', true)) return false;
    const min = (Config.get(`logging.systems.${system}`) || Config.get('logging.level', 'info')).toLowerCase();
    return (ORDER[level] ?? 1) >= (ORDER[min] ?? 1);
}

function _format(level, system, msg, meta) {
    const m = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${new Date().toISOString()}] [${level.toUpperCase()}] [${system}] ${msg}${m}\n`;
}

function createLogger(system) {
    return {
        debug(m, meta) { if (_shouldLog(system, 'debug')) _out(system, 'debug', m, meta); },
        info(m, meta) { if (_shouldLog(system, 'info')) _out(system, 'info', m, meta); },
        warn(m, meta) { if (_shouldLog(system, 'warn')) _out(system, 'warn', m, meta); },
        error(m, meta) { if (_shouldLog(system, 'error')) _out(system, 'error', m, meta); }
    };
}

let _console = true;
function _out(system, level, msg, meta) {
    const line = _format(level, system, msg, meta);
    if (_console) process[level === 'error' ? 'stderr' : 'stdout'].write(line);
    const logPath = Config.get('logging.file.path', './data/logs');
    const dir = path.resolve(logPath);
    if (dir) {
        try {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.appendFileSync(path.join(dir, 'server.log'), line);
        } catch {}
    }
}

createLogger.setConsoleOutput = (v) => { _console = !!v; };
module.exports = createLogger;
