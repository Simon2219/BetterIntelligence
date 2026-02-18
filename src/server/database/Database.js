/**
 * Database - BetterIntelligence data layer
 * SQLite via better-sqlite3. Exports Systems for agents, skills, conversations, etc.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const Config = require('../../../config/Config');
const log = require('../services/Logger')('db');

let db = null;
let dbPath = '';

async function initDb() {
    const rawPath = Config.get('db.path', './data/db/betterintelligence.db');
    dbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(dbPath);
    db.pragma('journal_mode=WAL');
    db.pragma('foreign_keys=ON');

    await runMigrations();
    await seedDefaults();

    log.info('Database ready', { path: dbPath });
    return db;
}

function run(sql, params = []) {
    try { return { changes: db.prepare(sql).run(...params).changes }; }
    catch (e) { log.error('Run error', { err: e.message }); throw e; }
}

function all(sql, params = []) {
    try { return db.prepare(sql).all(...params); }
    catch (e) { log.error('All error', { err: e.message }); throw e; }
}

function get(sql, params = []) {
    try { return db.prepare(sql).get(...params); }
    catch (e) { log.error('Get error', { err: e.message }); throw e; }
}

function generateId(len = 8) {
    const cs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let r = '';
    for (let i = 0; i < len; i++) r += cs.charAt(Math.floor(Math.random() * cs.length));
    return r;
}

function generateUserId() {
    let id;
    do { id = generateId(6); } while (get('SELECT id FROM users WHERE UPPER(id) = ?', [id]));
    return id;
}

// ─── Migrations ───────────────────────────────────────────────────────────────

async function runMigrations() {
    run(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TEXT DEFAULT (datetime('now')))`);

    const list = [
        { name: '001_initial', up: migrate001 },
        { name: '002_skills_deploy', up: migrate002 }
    ];

    for (const m of list) {
        if (get('SELECT id FROM _migrations WHERE name = ?', [m.name])) continue;
        log.info('Running migration', { name: m.name });
        m.up();
        run('INSERT INTO _migrations (name) VALUES (?)', [m.name]);
    }
}

function migrate001() {
    run(`CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        is_admin INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role_id INTEGER NOT NULL DEFAULT 2,
        avatar_url TEXT DEFAULT '',
        bio TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1,
        settings TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (role_id) REFERENCES roles(id)
    )`);

    run(`CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    run(`CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    run(`CREATE TABLE IF NOT EXISTS ai_agents (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT NOT NULL,
        tagline TEXT DEFAULT '',
        avatar_url TEXT DEFAULT '',
        personality TEXT DEFAULT '{}',
        backstory TEXT DEFAULT '',
        behavior_rules TEXT DEFAULT '{}',
        sample_dialogues TEXT DEFAULT '[]',
        system_prompt TEXT DEFAULT '',
        skills_order TEXT DEFAULT '[]',
        text_provider TEXT DEFAULT 'ollama',
        text_model TEXT DEFAULT '',
        temperature REAL DEFAULT 0.8,
        max_tokens INTEGER DEFAULT 512,
        is_active INTEGER DEFAULT 1,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`);

    run(`CREATE TABLE IF NOT EXISTS ai_prompt_templates (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        category TEXT DEFAULT 'base',
        content TEXT NOT NULL DEFAULT '',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    run(`CREATE TABLE IF NOT EXISTS ai_provider_config (
        provider_name TEXT PRIMARY KEY,
        endpoint_url TEXT DEFAULT '',
        api_key TEXT DEFAULT '',
        default_model TEXT DEFAULT '',
        is_enabled INTEGER DEFAULT 0,
        settings TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    run('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
    run('CREATE INDEX IF NOT EXISTS idx_ai_agents_user ON ai_agents(user_id)');
}

function migrate002() {
    run(`CREATE TABLE IF NOT EXISTS skill_registry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        path TEXT NOT NULL,
        creator_id TEXT,
        version TEXT DEFAULT '1.0.0',
        hub_published INTEGER DEFAULT 0,
        downloads INTEGER DEFAULT 0,
        rating REAL DEFAULT 0,
        category TEXT DEFAULT 'general',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (creator_id) REFERENCES users(id)
    )`);

    run(`CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        user_id TEXT,
        embed_session_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`);

    run(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT DEFAULT '',
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )`);

    run(`CREATE TABLE IF NOT EXISTS agent_deployments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        embed_enabled INTEGER DEFAULT 1,
        api_enabled INTEGER DEFAULT 0,
        webhook_url TEXT DEFAULT '',
        api_key_hash TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE
    )`);

    run(`CREATE TABLE IF NOT EXISTS hook_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT,
        deployment_id INTEGER,
        event TEXT NOT NULL,
        url TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (agent_id) REFERENCES ai_agents(id),
        FOREIGN KEY (deployment_id) REFERENCES agent_deployments(id)
    )`);

    run('CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id)');
    run('CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)');
    run('CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)');
    run('CREATE INDEX IF NOT EXISTS idx_deployments_slug ON agent_deployments(slug)');
}

async function seedDefaults() {
    const rc = get('SELECT COUNT(*) as c FROM roles');
    if (rc.c > 0) return;

    log.info('Seeding default roles');
    run(`INSERT INTO roles (name, is_admin) VALUES ('User', 0), ('Admin', 1)`);
}

// ─── UserSystem ──────────────────────────────────────────────────────────────

const UserSystem = {
    create(data) {
        const id = generateUserId();
        run(`INSERT INTO users (id, email, username, display_name, password_hash, role_id, avatar_url, bio, settings)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, data.email, data.username, data.displayName, data.passwordHash, data.roleId || 2,
             data.avatarUrl || '', data.bio || '', JSON.stringify(data.settings || { theme: 'dark' })]);
        return this.getById(id);
    },

    getById(id) {
        return get(`SELECT u.*, r.name as role_name, r.is_admin as role_is_admin
            FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE UPPER(u.id) = UPPER(?)`, [id]);
    },

    getByEmail(email) {
        return get(`SELECT u.*, r.name as role_name, r.is_admin as role_is_admin
            FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE LOWER(u.email) = LOWER(?)`, [email]);
    },

    getByUsername(username) {
        return get(`SELECT u.*, r.name as role_name, r.is_admin as role_is_admin
            FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE LOWER(u.username) = LOWER(?)`, [username]);
    },

    getWithRole(id) {
        const u = this.getById(id);
        if (!u) return null;
        const role = RoleSystem.getById(u.role_id);
        return { ...u, role };
    },

    update(id, updates) {
        const allowed = ['display_name', 'avatar_url', 'bio', 'settings'];
        const sets = [];
        const vals = [];
        for (const k of allowed) {
            if (updates[k] === undefined) continue;
            const col = k === 'displayName' ? 'display_name' : k === 'avatarUrl' ? 'avatar_url' : k;
            sets.push(`${col} = ?`);
            vals.push(typeof updates[k] === 'object' ? JSON.stringify(updates[k]) : updates[k]);
        }
        if (sets.length === 0) return this.getById(id);
        sets.push("updated_at = datetime('now')");
        vals.push(id);
        run(`UPDATE users SET ${sets.join(', ')} WHERE UPPER(id) = UPPER(?)`, vals);
        return this.getById(id);
    },

    setOnline(id, online) {
        run(`UPDATE users SET last_seen = datetime('now') WHERE UPPER(id) = UPPER(?)`, [id]);
    }
};

// ─── RoleSystem ──────────────────────────────────────────────────────────────

const RoleSystem = {
    getById(id) { return get('SELECT * FROM roles WHERE id = ?', [id]); },
    getByName(name) { return get('SELECT * FROM roles WHERE LOWER(name) = LOWER(?)', [name]); },
    list() { return all('SELECT * FROM roles ORDER BY id'); }
};

// ─── TokenSystem ──────────────────────────────────────────────────────────────

const TokenSystem = {
    store(userId, tokenHash, expiresAt) {
        run('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [userId, tokenHash, expiresAt]);
    },
    find(tokenHash) {
        return get("SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > datetime('now')", [tokenHash]);
    },
    revoke(tokenHash) { run('DELETE FROM refresh_tokens WHERE token_hash = ?', [tokenHash]); },
    revokeAllForUser(userId) { run('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]); }
};

// ─── SettingsSystem ──────────────────────────────────────────────────────────

const SettingsSystem = {
    get(key) { const r = get('SELECT value FROM app_settings WHERE key = ?', [key]); return r?.value ?? null; },
    set(key, value, category = 'general') {
        const ex = get('SELECT key FROM app_settings WHERE key = ?', [key]);
        if (ex) run("UPDATE app_settings SET value = ?, category = ?, updated_at = datetime('now') WHERE key = ?", [value, category, key]);
        else run('INSERT INTO app_settings (key, value, category) VALUES (?, ?, ?)', [key, value, category]);
    },
    getAll() { return all('SELECT * FROM app_settings ORDER BY category, key'); }
};

// ─── AIAgentSystem ───────────────────────────────────────────────────────────

const _parseAgent = (row) => {
    if (!row) return null;
    const j = (v, d) => { try { return JSON.parse(v || 'null') ?? d; } catch { return d; } };
    return {
        ...row,
        personality: j(row.personality, {}),
        behavior_rules: j(row.behavior_rules, {}),
        sample_dialogues: j(row.sample_dialogues, []),
        skills_order: j(row.skills_order, []),
        metadata: j(row.metadata, {}),
        is_active: row.is_active === 1
    };
};

const AIAgentSystem = {
    create(data) {
        const id = generateId(6);
        run(`INSERT INTO ai_agents (id, user_id, name, tagline, avatar_url, personality, backstory,
            behavior_rules, sample_dialogues, system_prompt, skills_order, text_provider, text_model,
            temperature, max_tokens, is_active, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, data.userId || null, data.name || 'Agent', data.tagline || '', data.avatarUrl || '',
             JSON.stringify(data.personality || {}), data.backstory || '',
             JSON.stringify(data.behaviorRules || {}), JSON.stringify(data.sampleDialogues || []),
             data.systemPrompt || '', JSON.stringify(data.skillsOrder || []),
             data.textProvider || 'ollama', data.textModel || '',
             data.temperature ?? 0.8, data.maxTokens || 512,
             data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1,
             JSON.stringify(data.metadata || {})]);
        return this.getById(id);
    },

    getById(id) {
        const r = get('SELECT * FROM ai_agents WHERE id = ?', [id]);
        return r ? _parseAgent(r) : null;
    },

    list(filters = {}) {
        let sql = 'SELECT * FROM ai_agents WHERE 1=1';
        const params = [];
        if (filters.userId) { sql += ' AND UPPER(user_id) = UPPER(?)'; params.push(filters.userId); }
        if (filters.isActive !== undefined) { sql += ' AND is_active = ?'; params.push(filters.isActive ? 1 : 0); }
        sql += ' ORDER BY updated_at DESC';
        if (filters.limit) { sql += ' LIMIT ?'; params.push(filters.limit); }
        return all(sql, params).map(_parseAgent);
    },

    update(id, updates) {
        const map = { userId: 'user_id', name: 'name', tagline: 'tagline', avatarUrl: 'avatar_url',
            personality: 'personality', backstory: 'backstory', behaviorRules: 'behavior_rules',
            sampleDialogues: 'sample_dialogues', systemPrompt: 'system_prompt', skillsOrder: 'skills_order',
            textProvider: 'text_provider', textModel: 'text_model', temperature: 'temperature',
            maxTokens: 'max_tokens', isActive: 'is_active', metadata: 'metadata' };
        const sets = [];
        const vals = [];
        for (const [k, v] of Object.entries(updates)) {
            const col = map[k];
            if (!col) continue;
            let val = v;
            if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
            if (typeof val === 'boolean') val = val ? 1 : 0;
            sets.push(`${col} = ?`);
            vals.push(val);
        }
        if (sets.length === 0) return this.getById(id);
        sets.push("updated_at = datetime('now')");
        vals.push(id);
        run(`UPDATE ai_agents SET ${sets.join(', ')} WHERE id = ?`, vals);
        return this.getById(id);
    },

    delete(id) { run('DELETE FROM ai_agents WHERE id = ?', [id]); }
};

// ─── ConversationSystem ───────────────────────────────────────────────────────

const ConversationSystem = {
    create(agentId, userId = null, embedSessionId = null) {
        const id = generateId(12);
        run(`INSERT INTO conversations (id, agent_id, user_id, embed_session_id) VALUES (?, ?, ?, ?)`,
            [id, agentId, userId, embedSessionId]);
        return this.getById(id);
    },

    getById(id) { return get('SELECT * FROM conversations WHERE id = ?', [id]); },

    listForUser(userId, agentId = null) {
        let sql = 'SELECT * FROM conversations WHERE user_id = ?';
        const params = [userId];
        if (agentId) { sql += ' AND agent_id = ?'; params.push(agentId); }
        sql += ' ORDER BY updated_at DESC';
        return all(sql, params);
    },

    listForAgent(agentId, limit = 50) {
        return all('SELECT * FROM conversations WHERE agent_id = ? ORDER BY updated_at DESC LIMIT ?', [agentId, limit]);
    }
};

// ─── MessageSystem ───────────────────────────────────────────────────────────

const MessageSystem = {
    add(conversationId, role, content, metadata = {}) {
        const id = generateId(12);
        run(`INSERT INTO messages (id, conversation_id, role, content, metadata) VALUES (?, ?, ?, ?, ?)`,
            [id, conversationId, role, content || '', JSON.stringify(metadata)]);
        run("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?", [conversationId]);
        return id;
    },

    list(conversationId, limit = 100) {
        return all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?', [conversationId, limit]);
    }
};

// ─── DeploymentSystem ────────────────────────────────────────────────────────

const DeploymentSystem = {
    create(agentId, slug) {
        run(`INSERT INTO agent_deployments (agent_id, slug) VALUES (?, ?)`, [agentId, slug]);
        return get('SELECT * FROM agent_deployments WHERE slug = ?', [slug]);
    },

    getBySlug(slug) { return get('SELECT * FROM agent_deployments WHERE slug = ?', [slug]); },
    getByAgentId(agentId) { return get('SELECT * FROM agent_deployments WHERE agent_id = ?', [agentId]); },

    update(slug, updates) {
        const allow = ['embed_enabled', 'api_enabled', 'webhook_url', 'api_key_hash'];
        const sets = [];
        const vals = [];
        for (const k of allow) {
            if (updates[k] === undefined) continue;
            sets.push(`${k} = ?`);
            vals.push(updates[k]);
        }
        if (sets.length === 0) return this.getBySlug(slug);
        sets.push("updated_at = datetime('now')");
        vals.push(slug);
        run(`UPDATE agent_deployments SET ${sets.join(', ')} WHERE slug = ?`, vals);
        return this.getBySlug(slug);
    }
};

// ─── Shutdown ─────────────────────────────────────────────────────────────────

function shutdown() {
    if (db) { db.close(); db = null; }
    log.info('Database shutdown');
}

module.exports = {
    initDb, run, all, get, generateId, generateUserId, shutdown,
    UserSystem, RoleSystem, TokenSystem, SettingsSystem,
    AIAgentSystem, ConversationSystem, MessageSystem, DeploymentSystem
};
