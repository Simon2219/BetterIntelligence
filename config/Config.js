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

        if (process.env.PORT) this._config.server.port = parseInt(process.env.PORT);
        if (process.env.HOST) this._config.server.host = process.env.HOST;
        if (process.env.JWT_ACCESS_SECRET) this._config.auth.accessSecret = process.env.JWT_ACCESS_SECRET;
        if (process.env.JWT_REFRESH_SECRET) this._config.auth.refreshSecret = process.env.JWT_REFRESH_SECRET;
        if (process.env.DB_PATH) this._config.db.path = process.env.DB_PATH;
        if (process.env.MEDIA_PATH) this._config.media.path = process.env.MEDIA_PATH;
        if (process.env.AI_ENABLED !== undefined) this._config.ai.enabled = process.env.AI_ENABLED === '1' || process.env.AI_ENABLED === 'true';
        if (process.env.OLLAMA_URL) this._config.ai.ollamaUrl = process.env.OLLAMA_URL;
        if (process.env.OLLAMA_MODEL) this._config.ai.ollamaModel = process.env.OLLAMA_MODEL;

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
}

const Config = new ConfigManager();
Config.load();
module.exports = Config;
