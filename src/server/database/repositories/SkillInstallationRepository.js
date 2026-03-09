const { run, all, get } = require('../core/query');

function parseJson(value, fallback) {
    try {
        return JSON.parse(value || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

function normalize(row) {
    if (!row) return null;
    return {
        ...row,
        metadata: parseJson(row.metadata, {})
    };
}

const SkillInstallationRepository = {
    getById(id) {
        return normalize(get('SELECT * FROM skill_installations WHERE id = ?', [id]));
    },

    getByUserAndSkill(userId, skillId) {
        return normalize(get(`SELECT * FROM skill_installations
            WHERE user_id = ? AND skill_id = ? AND status = 'installed'
            LIMIT 1`, [userId, skillId]));
    },

    listForUser(userId, opts = {}) {
        const params = [userId];
        let sql = 'SELECT * FROM skill_installations WHERE user_id = ?';
        if (opts.status) {
            sql += ' AND status = ?';
            params.push(opts.status);
        }
        sql += ' ORDER BY updated_at DESC, created_at DESC';
        return all(sql, params).map(normalize);
    },

    listJoinedForUser(userId, opts = {}) {
        const params = [userId];
        let sql = `SELECT
                i.*,
                s.slug AS skill_slug,
                s.creator_id AS skill_creator_id,
                s.visibility AS skill_visibility,
                s.version AS skill_version,
                s.name AS skill_name,
                s.description AS skill_description,
                s.source_type AS skill_source_type,
                s.instructions_text AS skill_instructions_text,
                s.definition_json AS skill_definition_json,
                s.metadata_json AS skill_metadata_json,
                s.materialized_path AS skill_materialized_path,
                s.materialized_at AS skill_materialized_at,
                s.archived_at AS skill_archived_at
            FROM skill_installations i
            JOIN skills s ON s.id = i.skill_id
            WHERE i.user_id = ?`;
        if (opts.status) {
            sql += ' AND i.status = ?';
            params.push(opts.status);
        }
        sql += ' ORDER BY i.updated_at DESC, i.created_at DESC';
        return all(sql, params).map(normalize);
    },

    create(data = {}) {
        run(`INSERT INTO skill_installations (
            id, user_id, skill_id, listing_id, revision_id, grant_id, status, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            data.id,
            data.userId,
            data.skillId,
            data.listingId || null,
            data.revisionId || null,
            data.grantId || null,
            data.status || 'installed',
            JSON.stringify(data.metadata || {})
        ]);
        return this.getById(data.id);
    },

    upsertInstalled(data = {}) {
        const existing = data.id
            ? this.getById(data.id)
            : (data.userId && data.skillId ? this.getByUserAndSkill(data.userId, data.skillId) : null);
        if (!existing) return this.create(data);
        return this.update(existing.id, {
            userId: data.userId,
            skillId: data.skillId,
            listingId: data.listingId,
            revisionId: data.revisionId,
            grantId: data.grantId,
            status: data.status || 'installed',
            metadata: data.metadata
        });
    },

    update(id, updates = {}) {
        const fieldMap = {
            userId: 'user_id',
            skillId: 'skill_id',
            listingId: 'listing_id',
            revisionId: 'revision_id',
            grantId: 'grant_id',
            status: 'status',
            metadata: 'metadata'
        };
        const sets = [];
        const values = [];
        Object.entries(fieldMap).forEach(([key, column]) => {
            if (updates[key] === undefined) return;
            sets.push(`${column} = ?`);
            values.push(column === 'metadata' ? JSON.stringify(updates[key] || {}) : updates[key]);
        });
        if (!sets.length) return this.getById(id);
        sets.push("updated_at = datetime('now')");
        values.push(id);
        run(`UPDATE skill_installations SET ${sets.join(', ')} WHERE id = ?`, values);
        return this.getById(id);
    },

    uninstall(id) {
        return this.update(id, { status: 'removed' });
    }
};

module.exports = SkillInstallationRepository;
