const { run, all, get } = require('../core/query');
const { generateId } = require('../core/ids');

function parseJson(value, fallback) {
    try {
        return JSON.parse(value || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

function normalizeSkill(row) {
    if (!row) return null;
    const { hub_published, ...rest } = row;
    const definition = parseJson(row.definition_json, {});
    const metadata = parseJson(row.metadata_json, {});
    const sourceType = String(row.source_type || '').trim().toLowerCase() || 'workspace';
    return {
        ...rest,
        source_type: sourceType,
        instructions_text: row.instructions_text || definition.instructions || '',
        definition_json: definition,
        metadata_json: metadata,
        definition,
        metadata,
        source: sourceType === 'bundled' ? 'bundled' : (sourceType === 'workspace' ? 'workspace' : 'imported'),
        archived: !!row.archived_at
    };
}

function normalizeLibraryEntry(row) {
    if (!row) return null;
    const definition = parseJson(row.definition_json || row.skill_definition_json, {});
    const metadata = parseJson(row.metadata_json || row.skill_metadata_json, {});
    const sourceType = String(row.source_type || row.skill_source_type || '').trim().toLowerCase() || 'workspace';
    const source = row.installation_id || row.source === 'installed'
        ? 'installed'
        : (sourceType === 'bundled' ? 'bundled' : 'workspace');
    const entryId = row.entry_id || row.installation_id || row.id;
    const skillId = row.skill_id || row.id;
    return {
        id: entryId,
        entryId,
        installationId: row.installation_id || null,
        skillId,
        slug: row.slug || row.skill_slug,
        creator_id: row.creator_id || row.skill_creator_id || null,
        visibility: row.visibility || row.skill_visibility || 'private',
        version: row.version || row.skill_version || definition.version || '1.0.0',
        name: row.name || row.skill_name || definition.name || row.slug || row.skill_slug || '',
        description: row.description || row.skill_description || definition.description || '',
        source_type: sourceType,
        source,
        instructions: row.instructions_text || row.skill_instructions_text || definition.instructions || '',
        instructions_text: row.instructions_text || row.skill_instructions_text || definition.instructions || '',
        definition_json: definition,
        metadata_json: metadata,
        definition,
        metadata,
        materialized_path: row.materialized_path || row.skill_materialized_path || null,
        materialized_at: row.materialized_at || row.skill_materialized_at || null,
        archived_at: row.archived_at || row.skill_archived_at || null,
        market: row.market || null
    };
}

function hasSkillGrant(userId, skillId) {
    if (!userId || !skillId) return false;
    const direct = get(`SELECT id FROM catalog_grants
        WHERE subject_type = 'user'
          AND UPPER(subject_id) = UPPER(?)
          AND asset_type = 'skill'
          AND asset_id = ?
          AND status = 'active'
        LIMIT 1`, [userId, skillId]);
    if (direct) return true;

    const derived = get(`SELECT g.id
        FROM catalog_grants g
        JOIN catalog_bundle_items bi
          ON bi.listing_id = g.listing_id
         AND (g.revision_id IS NULL OR bi.revision_id = g.revision_id)
        WHERE g.subject_type = 'user'
          AND UPPER(g.subject_id) = UPPER(?)
          AND g.asset_type = 'bundle'
          AND g.status = 'active'
          AND bi.item_type = 'skill'
          AND bi.item_id = ?
        LIMIT 1`, [userId, skillId]);
    return !!derived;
}

function resolveCanonicalSkillId(inputId) {
    if (!inputId) return null;
    const installation = get(`SELECT skill_id FROM skill_installations
        WHERE id = ? AND status = 'installed'
        LIMIT 1`, [inputId]);
    return installation?.skill_id || inputId;
}

const SkillRepository = {
    getById(id) {
        return normalizeSkill(get('SELECT * FROM skills WHERE id = ?', [id]));
    },

    getBySlug(slug) {
        return normalizeSkill(get(`SELECT * FROM skills
            WHERE slug = ? AND archived_at IS NULL
            ORDER BY updated_at DESC
            LIMIT 1`, [slug]));
    },

    create(data) {
        const id = data.id || (data.creatorId ? `user:${data.creatorId}:${data.slug}` : generateId(12));
        const sourceType = String(data.sourceType || '').trim().toLowerCase() || 'workspace';
        const definition = {
            ...(data.definitionJson || {}),
            name: data.name || data.definitionJson?.name || data.slug,
            description: data.description || data.definitionJson?.description || '',
            version: data.version || data.definitionJson?.version || '1.0.0',
            instructions: data.instructionsText || data.definitionJson?.instructions || '',
            metadata: data.metadataJson || data.definitionJson?.metadata || {}
        };
        run(`INSERT INTO skills (
            id, slug, path, creator_id, visibility, version, name, description,
            source_type, instructions_text, definition_json, metadata_json, materialized_path, materialized_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id,
            data.slug,
            data.path || data.materializedPath || '',
            data.creatorId || null,
            data.visibility || 'private',
            data.version || '1.0.0',
            data.name || data.slug,
            data.description || '',
            sourceType,
            data.instructionsText || definition.instructions || '',
            JSON.stringify(definition),
            JSON.stringify(data.metadataJson || definition.metadata || {}),
            data.materializedPath || data.path || null,
            data.materializedAt || null,
            data.archivedAt || null
        ]);
        return this.getById(id);
    },

    update(id, updates) {
        const allowMap = {
            visibility: 'visibility',
            name: 'name',
            description: 'description',
            version: 'version',
            path: 'path',
            sourceType: 'source_type',
            instructionsText: 'instructions_text',
            definitionJson: 'definition_json',
            metadataJson: 'metadata_json',
            materializedPath: 'materialized_path',
            materializedAt: 'materialized_at',
            archivedAt: 'archived_at'
        };
        const sets = [];
        const vals = [];
        Object.entries(allowMap).forEach(([key, column]) => {
            if (updates[key] === undefined) return;
            let value = updates[key];
            if (column === 'definition_json' || column === 'metadata_json') value = JSON.stringify(value || {});
            sets.push(`${column} = ?`);
            vals.push(value);
        });
        if (!sets.length) return this.getById(id);
        sets.push("updated_at = datetime('now')");
        vals.push(id);
        run(`UPDATE skills SET ${sets.join(', ')} WHERE id = ?`, vals);
        return this.getById(id);
    },

    listBundled() {
        return all(`SELECT * FROM skills
            WHERE archived_at IS NULL
              AND LOWER(COALESCE(source_type, '')) = 'bundled'
            ORDER BY name`).map(normalizeSkill);
    },

    listWorkspaceForUser(userId) {
        if (!userId) return [];
        return all(`SELECT * FROM skills
            WHERE archived_at IS NULL
              AND creator_id = ?
              AND LOWER(COALESCE(source_type, '')) != 'bundled'
            ORDER BY updated_at DESC, name ASC`, [userId]).map(normalizeSkill);
    },

    listInstalledForUser(userId) {
        if (!userId) return [];
        return all(`SELECT
                i.id AS installation_id,
                i.id AS entry_id,
                i.skill_id,
                i.user_id,
                i.listing_id,
                i.revision_id,
                i.grant_id,
                i.status AS installation_status,
                i.metadata,
                s.*
            FROM skill_installations i
            JOIN skills s ON s.id = i.skill_id
            WHERE i.user_id = ?
              AND i.status = 'installed'
            ORDER BY i.updated_at DESC, i.created_at DESC`, [userId]).map(normalizeLibraryEntry);
    },

    listLibraryEntriesForUser(userId) {
        const bundled = this.listBundled().map((skill) => normalizeLibraryEntry(skill));
        const workspace = this.listWorkspaceForUser(userId).map((skill) => normalizeLibraryEntry(skill));
        const installed = this.listInstalledForUser(userId);
        return [...bundled, ...workspace, ...installed];
    },

    listForUser(userId) {
        return this.listLibraryEntriesForUser(userId);
    },

    getLibraryEntryById(userId, entryId) {
        if (!entryId) return null;
        const installed = userId ? get(`SELECT
                i.id AS installation_id,
                i.id AS entry_id,
                i.skill_id,
                i.user_id,
                i.listing_id,
                i.revision_id,
                i.grant_id,
                i.status AS installation_status,
                i.metadata,
                s.*
            FROM skill_installations i
            JOIN skills s ON s.id = i.skill_id
            WHERE i.user_id = ? AND i.id = ?
            LIMIT 1`, [userId, entryId]) : null;
        if (installed) return normalizeLibraryEntry(installed);
        const skill = this.getById(entryId);
        if (!skill) return null;
        if (skill.source_type === 'bundled') return normalizeLibraryEntry(skill);
        if (skill.creator_id && String(skill.creator_id).toUpperCase() === String(userId || '').toUpperCase()) {
            return normalizeLibraryEntry(skill);
        }
        return null;
    },

    listForAgent(agentId) {
        const agent = get('SELECT user_id FROM ai_agents WHERE id = ?', [agentId]);
        if (!agent) return [];
        const rows = all(`SELECT s.*
            FROM skills s
            JOIN agent_skills a ON s.id = a.skill_id
            WHERE a.agent_id = ?
              AND s.archived_at IS NULL
            ORDER BY a.sort_order`, [agentId]).map(normalizeSkill);
        return rows.filter((skill) => this.agentCanUseSkill(agentId, skill.id));
    },

    agentCanUseSkill(agentId, skillId) {
        const agent = get('SELECT user_id FROM ai_agents WHERE id = ?', [agentId]);
        const canonicalSkillId = resolveCanonicalSkillId(skillId);
        const skill = this.getById(canonicalSkillId);
        if (!agent || !skill) return false;
        if (skill.source_type === 'bundled') return true;
        if (skill.creator_id && String(skill.creator_id).toUpperCase() === String(agent.user_id || '').toUpperCase()) return true;
        if (hasSkillGrant(agent.user_id, canonicalSkillId)) return true;
        return false;
    },

    assignToAgent(agentId, skillIds) {
        run('DELETE FROM agent_skills WHERE agent_id = ?', [agentId]);
        const ids = Array.isArray(skillIds) ? skillIds : [];
        ids.forEach((rawId, index) => {
            const skillId = resolveCanonicalSkillId(String(rawId || '').trim());
            if (!skillId) return;
            if (!this.agentCanUseSkill(agentId, skillId)) return;
            run('INSERT OR IGNORE INTO agent_skills (agent_id, skill_id, sort_order) VALUES (?, ?, ?)', [agentId, skillId, index]);
        });
    },

    getAgentSkillIds(agentId) {
        return all('SELECT skill_id FROM agent_skills WHERE agent_id = ? ORDER BY sort_order', [agentId]).map((row) => row.skill_id);
    },

    getAgentSkillEntryIds(agentId, userId) {
        return this.getAgentSkillIds(agentId).map((skillId) => {
            const installation = userId ? get(`SELECT id FROM skill_installations
                WHERE user_id = ?
                  AND skill_id = ?
                  AND status = 'installed'
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1`, [userId, skillId]) : null;
            return installation?.id || skillId;
        });
    },

    listPublicHub() {
        return all(`SELECT s.*
            FROM skills s
            JOIN catalog_listings l ON l.asset_id = s.id AND l.asset_type = 'skill'
            WHERE s.archived_at IS NULL
              AND l.visibility = 'public'
              AND l.status IN ('approved', 'published')
            ORDER BY l.updated_at DESC, l.created_at DESC`).map(normalizeSkill);
    }
};

module.exports = SkillRepository;
