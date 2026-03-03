const { run, all, get } = require('../core/query');


const SettingsRepository = {
    get(key) { const r = get('SELECT value FROM app_settings WHERE key = ?', [key]); return r?.value ?? null; },
    set(key, value, category = 'general') {
        const ex = get('SELECT key FROM app_settings WHERE key = ?', [key]);
        if (ex) run("UPDATE app_settings SET value = ?, category = ?, updated_at = datetime('now') WHERE key = ?", [value, category, key]);
        else run('INSERT INTO app_settings (key, value, category) VALUES (?, ?, ?)', [key, value, category]);
    },
    getAll() { return all('SELECT * FROM app_settings ORDER BY category, key'); }
};


module.exports = SettingsRepository;
