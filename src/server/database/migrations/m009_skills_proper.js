const { run, all, get } = require('../core/query');

const fs = require('fs');
const path = require('path');
const Config = require('../../../../config/Config');
const log = require('../../services/Logger')('db');

function up() {
    run(`CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL,
            path TEXT NOT NULL,
            creator_id TEXT,
            visibility TEXT DEFAULT 'private',
            version TEXT DEFAULT '1.0.0',
            hub_published INTEGER DEFAULT 0,
            name TEXT DEFAULT '',
            description TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (creator_id) REFERENCES users(id)
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug)');
        run('CREATE INDEX IF NOT EXISTS idx_skills_creator ON skills(creator_id)');
        run('CREATE INDEX IF NOT EXISTS idx_skills_visibility ON skills(visibility)');
    
        run(`CREATE TABLE IF NOT EXISTS agent_skills (
            agent_id TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            PRIMARY KEY (agent_id, skill_id),
            FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE,
            FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id)');
        run('CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON agent_skills(skill_id)');
    
        const base = path.resolve(Config.get('skills.basePath', './data/skills'));
        const bundledDir = path.join(base, 'bundled');
        if (fs.existsSync(bundledDir)) {
            const entries = fs.readdirSync(bundledDir, { withFileTypes: true });
            for (const e of entries) {
                if (!e.isDirectory()) continue;
                const skillPath = path.join(bundledDir, e.name);
                const skillFile = path.join(skillPath, 'SKILL.md');
                if (!fs.existsSync(skillFile)) continue;
                const id = 'bundled:' + e.name;
                if (get('SELECT id FROM skills WHERE id = ?', [id])) continue;
                let name = e.name, description = '', version = '1.0.0';
                try {
                    const content = fs.readFileSync(skillFile, 'utf8');
                    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                    if (m) for (const line of m[1].split(/\r?\n/)) {
                        const idx = line.indexOf(':');
                        if (idx > 0) {
                            const k = line.substring(0, idx).trim().toLowerCase();
                            const v = line.substring(idx + 1).trim();
                            if (k === 'name') name = v; else if (k === 'description') description = v; else if (k === 'version') version = v;
                        }
                    }
                } catch (err) {
                    log.debug('Skipping bundled skill metadata parse error', { slug: e.name, err: err.message });
                }
                run(`INSERT INTO skills (id, slug, path, creator_id, visibility, version, hub_published, name, description)
                    VALUES (?, ?, ?, NULL, 'public', ?, 0, ?, ?)`,
                    [id, e.name, 'bundled/' + e.name, version, name, description]);
            }
        }
    
        const registryTable = get("SELECT name FROM sqlite_master WHERE type='table' AND name='skill_registry'");
        if (registryTable) {
            const registry = all('SELECT * FROM skill_registry');
            for (const r of registry) {
                const id = r.creator_id ? 'user:' + r.creator_id + ':' + r.slug : 'hub:' + r.slug;
                if (get('SELECT id FROM skills WHERE id = ?', [id])) continue;
                run(`INSERT INTO skills (id, slug, path, creator_id, visibility, version, hub_published, name, description)
                    VALUES (?, ?, ?, ?, 'public', ?, 1, ?, '')`,
                    [id, r.slug, r.path, r.creator_id || null, r.version || '1.0.0', r.slug]);
            }
        }
    
        const workspaceDir = path.join(base, 'workspace');
        const installedDir = path.join(base, 'installed');
        for (const [dirName, prefix] of [['workspace', 'user:'], ['installed', 'installed:']]) {
            const dir = dirName === 'workspace' ? workspaceDir : installedDir;
            if (!fs.existsSync(dir)) continue;
            let userIds;
            try { userIds = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { continue; }
            for (const uid of userIds) {
                const userPath = path.join(dir, uid);
                let slugs;
                try { slugs = fs.readdirSync(userPath, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { continue; }
                for (const slug of slugs) {
                    const skillPath = path.join(userPath, slug);
                    if (!fs.existsSync(path.join(skillPath, 'SKILL.md'))) continue;
                    const id = prefix + uid + ':' + slug;
                    if (get('SELECT id FROM skills WHERE id = ?', [id])) continue;
                    let name = slug, description = '', version = '1.0.0';
                    try {
                        const content = fs.readFileSync(path.join(skillPath, 'SKILL.md'), 'utf8');
                        const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                        if (m) for (const line of m[1].split(/\r?\n/)) {
                            const idx = line.indexOf(':');
                            if (idx > 0) {
                                const k = line.substring(0, idx).trim().toLowerCase();
                                const v = line.substring(idx + 1).trim();
                                if (k === 'name') name = v; else if (k === 'description') description = v; else if (k === 'version') version = v;
                            }
                        }
                    } catch (err) {
                        log.debug('Skipping user skill metadata parse error', { userId: uid, slug, err: err.message });
                    }
                    run(`INSERT INTO skills (id, slug, path, creator_id, visibility, version, hub_published, name, description)
                        VALUES (?, ?, ?, ?, 'private', ?, 0, ?, ?)`,
                        [id, slug, dirName + '/' + uid + '/' + slug, dirName === 'workspace' ? uid : null, version, name, description]);
                }
            }
        }
    
        const agents = all('SELECT id, user_id, skills_order FROM ai_agents');
        for (const agent of agents) {
            let slugs = [];
            try { slugs = JSON.parse(agent.skills_order || '[]') || []; } catch (e) { log.debug('Invalid skills_order JSON', { agentId: agent.id, err: e.message }); }
            if (!Array.isArray(slugs)) continue;
            const ownerId = agent.user_id || '';
            for (let i = 0; i < slugs.length; i++) {
                const slug = String(slugs[i] || '').toLowerCase().trim();
                if (!slug) continue;
                let skillId = get('SELECT id FROM skills WHERE id = ?', ['bundled:' + slug])?.id;
                if (!skillId && ownerId) skillId = get('SELECT id FROM skills WHERE id = ?', ['user:' + ownerId + ':' + slug])?.id;
                if (!skillId && ownerId) skillId = get('SELECT id FROM skills WHERE id = ?', ['installed:' + ownerId + ':' + slug])?.id;
                if (!skillId) skillId = get('SELECT id FROM skills WHERE slug = ? LIMIT 1', [slug])?.id;
                if (!skillId) continue;
                try {
                    run('INSERT OR IGNORE INTO agent_skills (agent_id, skill_id, sort_order) VALUES (?, ?, ?)', [agent.id, skillId, i]);
                } catch (e) {
                    log.debug('Skipping agent_skill migration row', { agentId: agent.id, skillId, err: e.message });
                }
            }
        }
}

module.exports = {
    id: '009',
    name: 'skills_proper',
    up
};
