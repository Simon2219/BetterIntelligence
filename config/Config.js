/**
 * Config - Centralized configuration for BetterIntelligence
 */
const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor() {
        this._config = {};
        this._runtimeOverrides = {};
        this._loaded = false;
    }

    load() {
        const defaultPath = path.join(__dirname, 'default.json');
        const defaultConfig = JSON.parse(fs.readFileSync(defaultPath, 'utf-8'));
        this._config = JSON.parse(JSON.stringify(defaultConfig));

        if (process.env.PORT) this._config.server.port = parseInt(process.env.PORT, 10);
        if (process.env.HOST) this._config.server.host = process.env.HOST;
        if (process.env.JWT_ACCESS_SECRET) this._config.auth.accessSecret = process.env.JWT_ACCESS_SECRET;
        if (process.env.JWT_REFRESH_SECRET) this._config.auth.refreshSecret = process.env.JWT_REFRESH_SECRET;
        if (process.env.DB_PATH) this._config.db.path = process.env.DB_PATH;
        if (process.env.MEDIA_PATH) this._config.media.path = process.env.MEDIA_PATH;
        if (process.env.AI_ENABLED !== undefined) this._config.ai.enabled = process.env.AI_ENABLED === '1' || process.env.AI_ENABLED === 'true';
        if (process.env.OLLAMA_URL) this._config.ai.ollamaUrl = process.env.OLLAMA_URL;
        if (process.env.OLLAMA_MODEL) this._config.ai.ollamaModel = process.env.OLLAMA_MODEL;
        if (process.env.COMFYUI_URL) this._config.ai.comfyuiUrl = process.env.COMFYUI_URL;
        if (process.env.COMFYUI_MODEL) this._config.ai.comfyuiModel = process.env.COMFYUI_MODEL;
        if (process.env.COMFYUI_START_WITH_SERVER !== undefined) this._config.ai.comfyuiStartWithServer = process.env.COMFYUI_START_WITH_SERVER === '1' || process.env.COMFYUI_START_WITH_SERVER === 'true';

        if (process.env.LOG_ENABLED !== undefined) this._config.logging.enabled = process.env.LOG_ENABLED === '1' || process.env.LOG_ENABLED === 'true';
        if (process.env.LOG_LEVEL) this._config.logging.level = process.env.LOG_LEVEL;
        if (process.env.LOG_CONSOLE !== undefined) this._config.logging.output.console = process.env.LOG_CONSOLE === '1' || process.env.LOG_CONSOLE === 'true';
        if (process.env.LOG_FILE !== undefined) this._config.logging.output.file = process.env.LOG_FILE === '1' || process.env.LOG_FILE === 'true';
        if (process.env.LOG_PATH) this._config.logging.file.path = process.env.LOG_PATH;

        if (process.env.SECURITY_ALLOWED_ORIGINS) this._config.security.allowedOrigins = this._parseList(process.env.SECURITY_ALLOWED_ORIGINS);
        if (process.env.HTTP_CORS_ORIGINS) this._config.security.httpCorsOrigins = this._parseList(process.env.HTTP_CORS_ORIGINS);
        if (process.env.SOCKET_CORS_ORIGINS) this._config.security.socketCorsOrigins = this._parseList(process.env.SOCKET_CORS_ORIGINS);
        if (process.env.SECURITY_ACCEPT_SOCKET_QUERY_TOKEN !== undefined) {
            this._config.security.acceptSocketQueryToken = process.env.SECURITY_ACCEPT_SOCKET_QUERY_TOKEN === '1' || process.env.SECURITY_ACCEPT_SOCKET_QUERY_TOKEN === 'true';
        }
        if (process.env.SECURITY_ALLOW_NO_ORIGIN_IN_DEV !== undefined) {
            this._config.security.allowNoOriginInDev = process.env.SECURITY_ALLOW_NO_ORIGIN_IN_DEV === '1' || process.env.SECURITY_ALLOW_NO_ORIGIN_IN_DEV === 'true';
        }

        this._loaded = true;
        return this;
    }

    applyRuntimeOverrides(overrides) {
        this._runtimeOverrides = overrides || {};
        for (const [key, value] of Object.entries(overrides)) {
            this._setNested(this._config, key, this._parseValue(value));
        }
    }

    get(keyPath, defaultValue) {
        if (!this._loaded) this.load();
        const result = keyPath.split('.').reduce((cur, k) => cur?.[k], this._config);
        return result !== undefined ? result : defaultValue;
    }

    getAll() {
        if (!this._loaded) this.load();
        return JSON.parse(JSON.stringify(this._config));
    }

    getColors(theme = 'dark') {
        const key = `colors.${theme}`;
        const val = this.get(key, null);
        if (val && typeof val === 'object') return val;
        return {};
    }

    set(keyPath, value) {
        this._setNested(this._config, keyPath, value);
    }

    _setNested(obj, path, value) {
        const keys = path.split('.');
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
            cur = cur[keys[i]];
        }
        cur[keys[keys.length - 1]] = value;
    }

    _parseValue(v) {
        if (v === 'true') return true;
        if (v === 'false') return false;
        const n = Number(v);
        if (!isNaN(n) && v !== '') return n;
        try { return JSON.parse(v); } catch { return v; }
    }

    _parseList(value) {
        return String(value || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
}

const Config = new ConfigManager();
Config.load();
module.exports = Config;
