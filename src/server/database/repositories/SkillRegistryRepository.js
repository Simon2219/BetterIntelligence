const { run, all, get } = require('../core/query');


const SkillRegistryRepository = {
    upsert(data) {
        const ex = get('SELECT id FROM skill_registry WHERE slug = ?', [data.slug]);
        if (ex) {
            run(`UPDATE skill_registry SET path = ?, creator_id = ?, version = ?, hub_published = 1, updated_at = datetime('now') WHERE slug = ?`,
                [data.path, data.creatorId || null, data.version || '1.0.0', data.slug]);
        } else {
            run(`INSERT INTO skill_registry (slug, path, creator_id, version, hub_published) VALUES (?, ?, ?, ?, 1)`,
                [data.slug, data.path, data.creatorId || null, data.version || '1.0.0']);
        }
        return get('SELECT * FROM skill_registry WHERE slug = ?', [data.slug]);
    },
    listPublished() {
        return all('SELECT * FROM skill_registry WHERE hub_published = 1 ORDER BY slug');
    }
};


module.exports = SkillRegistryRepository;
