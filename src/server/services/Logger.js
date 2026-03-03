/**
 * Logger - Centralized logging with config-driven levels and outputs
 *
 * Usage: const log = require('./Logger')('auth');
 *        log.info('User signed up', { userId, email });
 *
 * Systems: auth, chat, media, socket, db, api, server, ai
 * Levels: debug, info, warn, error
 *
 * Env at startup: LOG_ENABLED, LOG_LEVEL, LOG_CONSOLE, LOG_FILE
 * Runtime (Unix): SIGUSR2=toggle, SIGUSR1=cycle level
 * Runtime (Windows): POST /api/admin/logging
 */

const Config = require('../../../config/Config');
const FileStorageService = require('./FileStorageService');

const LEVELS = ['debug', 'info', 'warn', 'error'];
const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };

const _runtimeOverrides = {};
let _logStorage = null;

function _getStorage() {
    if (!_logStorage) {
        const basePath = Config.get('logging.file.path', './data/logs');
        _logStorage = new FileStorageService(basePath);
    }
    return _logStorage;
}

function _resolve(key, fallback) {
    if (_runtimeOverrides[key] !== undefined) return _runtimeOverrides[key];
    return fallback;
}

function _isEnabled() {
    const v = _resolve('enabled', Config.get('logging.enabled', true));
    return v === true;
}

function _getLevel(system) {
    const globalLevel = _resolve('level', Config.get('logging.level', 'info'));
    const systemLevel = Config.get(`logging.systems.${system}`, globalLevel);
    return (systemLevel || globalLevel).toLowerCase();
}

function _getConsoleOutput() {
    return _resolve('console', Config.get('logging.output.console', true));
}

function _getFileOutput() {
    return _resolve('file', Config.get('logging.output.file', true));
}

function _formatLine(level, system, message, meta) {
    const ts = new Date().toISOString();
    const metaStr = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${ts}] [${level.toUpperCase()}] [${system}] ${message}${metaStr}\n`;
}

function _shouldLog(system, level) {
    if (!_isEnabled()) return false;
    const minLevel = _getLevel(system);
    const minOrder = LEVEL_ORDER[minLevel] ?? 1;
    const msgOrder = LEVEL_ORDER[level] ?? 1;
    return msgOrder >= minOrder;
}

function _output(system, level, message, meta) {
    if (!_shouldLog(system, level)) return;

    const line = _formatLine(level, system, message, meta);

    if (_getConsoleOutput()) {
        const out = level === 'error' ? 'stderr' : 'stdout';
        process[out].write(line);
    }

    if (_getFileOutput()) {
        try {
            _getStorage().append('server.log', line);
        } catch (e) {
            process.stderr.write(`[Logger] Failed to write log: ${e.message}\n`);
        }
    }
}

function createLogger(system) {
    return {
        debug(msg, meta) { _output(system, 'debug', msg, meta); },
        info(msg, meta) { _output(system, 'info', msg, meta); },
        warn(msg, meta) { _output(system, 'warn', msg, meta); },
        error(msg, meta) { _output(system, 'error', msg, meta); }
    };
}

function setEnabled(v) { _runtimeOverrides.enabled = !!v; }
function setLevel(v) { _runtimeOverrides.level = String(v).toLowerCase(); }
function setConsoleOutput(v) { _runtimeOverrides.console = !!v; }
function setFileOutput(v) { _runtimeOverrides.file = !!v; }

function getStatus() {
    return {
        enabled: _isEnabled(),
        level: _resolve('level', Config.get('logging.level', 'info')),
        console: _getConsoleOutput(),
        file: _getFileOutput()
    };
}

function appendToUserLog(userId, line) {
    if (!_isEnabled() || !_getFileOutput()) return;
    try {
        _getStorage().append(`users/${userId}.log`, line);
    } catch (e) {
        process.stderr.write(`[Logger] Failed to write user log: ${e.message}\n`);
    }
}

function appendToGuestLog(line) {
    if (!_isEnabled() || !_getFileOutput()) return;
    try {
        _getStorage().append('guests/access.log', line);
    } catch (e) {
        process.stderr.write(`[Logger] Failed to write guest log: ${e.message}\n`);
    }
}

function appendToAgentLog(agentId, line) {
    if (!agentId || !_isEnabled() || !_getFileOutput()) return;
    try {
        _getStorage().append(`ai/agents/${agentId}.log`, line.endsWith('\n') ? line : line + '\n');
    } catch (e) {
        process.stderr.write(`[Logger] Failed to write agent log: ${e.message}\n`);
    }
}

function appendToConversationLog(conversationId, line) {
    if (!conversationId || !_isEnabled() || !_getFileOutput()) return;
    try {
        _getStorage().append(`ai/conversations/${conversationId}.log`, line.endsWith('\n') ? line : line + '\n');
    } catch (e) {
        process.stderr.write(`[Logger] Failed to write conversation log: ${e.message}\n`);
    }
}

function _setupSignals() {
    if (process.platform === 'win32') return;

    process.on('SIGUSR2', () => {
        const next = !_isEnabled();
        setEnabled(next);
        process.stdout.write(`[Logger] ${next ? 'enabled' : 'disabled'}\n`);
    });

    process.on('SIGUSR1', () => {
        const current = _resolve('level', Config.get('logging.level', 'info'));
        const idx = LEVELS.indexOf(current);
        const nextIdx = idx < 0 ? 0 : (idx + 1) % LEVELS.length;
        const next = LEVELS[nextIdx];
        setLevel(next);
        process.stdout.write(`[Logger] level=${next}\n`);
    });
}

_setupSignals();

module.exports = createLogger;
module.exports.setEnabled = setEnabled;
module.exports.setLevel = setLevel;
module.exports.setConsoleOutput = setConsoleOutput;
module.exports.setFileOutput = setFileOutput;
module.exports.getStatus = getStatus;
module.exports.appendToUserLog = appendToUserLog;
module.exports.appendToGuestLog = appendToGuestLog;
module.exports.appendToAgentLog = appendToAgentLog;
module.exports.appendToConversationLog = appendToConversationLog;
module.exports.LEVELS = LEVELS;