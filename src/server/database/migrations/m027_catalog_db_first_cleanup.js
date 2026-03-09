const fs = require('fs');
const path = require('path');
const { run, all, get } = require('../core/query');
const { ignoreDuplicateColumnError } = require('./helpers');
const Config = require('../../../../config/Config');
const SkillLoader = require('../../services/SkillLoader');

function tableExists(name) {
    return !!get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name]);
}

function columnExists(tableName, columnName) {
    if (!tableExists(tableName)) return false;
    return all(`PRAGMA table_info(${tableName})`).some((row) => String(row.name || '').toLowerCase() === String(columnName || '').toLowerCase());
}

function addColumnIfMissing(tableName, definition) {
    const columnName = String(definition || '').trim().split(/\s+/)[0];
    if (!columnName || columnExists(tableName, columnName)) return;
    try {
        run(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
    } catch (err) {
        ignoreDuplicateColumnError(err);
    }
}

function renameTableIfNeeded(oldName, newName) {
    if (!tableExists(oldName) || tableExists(newName)) return;
    run(`ALTER TABLE ${oldName} RENAME TO ${newName}`);
}

function parseJson(value, fallback) {
    try {
        return JSON.parse(value || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

function resolveSkillPath(skill) {
    if (!skill?.path) return null;
    const base = path.resolve(Config.get('skills.basePath', './data/skills'));
    const fullPath = path.join(base, skill.path);
    return fs.existsSync(path.join(fullPath, 'SKILL.md')) ? fullPath : null;
}

function deriveSourceType(skill) {
    const existing = String(skill?.source_type || '').trim().toLowerCase();
    if (existing) return existing;
    const relPath = String(skill?.path || '').replace(/\\/g, '/').toLowerCase();
    if (relPath.startsWith('bundled/')) return 'bundled';
    if (relPath.startsWith('workspace/')) return 'workspace';
    if (relPath.startsWith('installed/')) return 'installed';
    return 'imported';
}

function loadSkillDefinition(skill) {
    const loaded = resolveSkillPath(skill) ? (SkillLoader.loadSkillFromDir(resolveSkillPath(skill)) || {}) : {};
    const definitionJson = parseJson(skill?.definition_json, {});
    const metadataJson = parseJson(skill?.metadata_json, {});
    const metadata = {
        ...(loaded.metadata || {}),
        ...(metadataJson || {})
    };
    const instructionsText = skill?.instructions_text || loaded.instructions || definitionJson.instructions || '';
    return {
        sourceType: deriveSourceType(skill),
        instructionsText,
        definition: {
            ...(definitionJson || {}),
            name: skill?.name || loaded.name || skill?.slug || '',
            description: skill?.description || loaded.description || '',
            version: skill?.version || loaded.version || '1.0.0',
            instructions: instructionsText,
            metadata
        },
        metadata,
        materializedPath: skill?.materialized_path || skill?.path || null,
        materializedAt: resolveSkillPath(skill) ? (skill?.materialized_at || new Date().toISOString()) : (skill?.materialized_at || null)
    };
}

function ensureCatalogTableNames() {
    renameTableIfNeeded('market_listings', 'catalog_listings');
    renameTableIfNeeded('market_listing_revisions', 'catalog_listing_revisions');
    renameTableIfNeeded('market_plan_tiers', 'catalog_plan_tiers');
    renameTableIfNeeded('market_bundle_items', 'catalog_bundle_items');
    renameTableIfNeeded('market_access_requests', 'catalog_access_requests');
    renameTableIfNeeded('market_reviews', 'catalog_reviews');
    renameTableIfNeeded('market_audit_log', 'catalog_audit_log');
    renameTableIfNeeded('entitlement_grants', 'catalog_grants');
    renameTableIfNeeded('entitlement_usage_counters', 'catalog_usage_counters');
}

function ensureSkillColumns() {
    addColumnIfMissing('skills', "source_type TEXT DEFAULT 'workspace'");
    addColumnIfMissing('skills', "instructions_text TEXT DEFAULT ''");
    addColumnIfMissing('skills', "definition_json TEXT DEFAULT '{}'");
    addColumnIfMissing('skills', "metadata_json TEXT DEFAULT '{}'");
    addColumnIfMissing('skills', 'materialized_path TEXT');
    addColumnIfMissing('skills', 'materialized_at TEXT');
    addColumnIfMissing('skills', 'archived_at TEXT');
}

function ensureInstallTables() {
    run(`CREATE TABLE IF NOT EXISTS skill_installations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        listing_id TEXT,
        revision_id TEXT,
        grant_id TEXT,
        status TEXT NOT NULL DEFAULT 'installed',
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        FOREIGN KEY (listing_id) REFERENCES catalog_listings(id) ON DELETE SET NULL,
        FOREIGN KEY (revision_id) REFERENCES catalog_listing_revisions(id) ON DELETE SET NULL,
        FOREIGN KEY (grant_id) REFERENCES catalog_grants(id) ON DELETE SET NULL
    )`);
    run('CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_installations_user_skill ON skill_installations(user_id, skill_id)');
    run('CREATE INDEX IF NOT EXISTS idx_skill_installations_user ON skill_installations(user_id, status)');

    run(`CREATE TABLE IF NOT EXISTS skill_library_category_assignments (
        entry_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        PRIMARY KEY (entry_id, category_id),
        FOREIGN KEY (category_id) REFERENCES skill_categories(id) ON DELETE CASCADE
    )`);
    run('CREATE INDEX IF NOT EXISTS idx_skill_library_category_assignments_category ON skill_library_category_assignments(category_id, sort_order)');
}

function backfillSkillCategoryAssignments() {
    if (!tableExists('skill_category_assignments')) return;
    const count = get('SELECT COUNT(*) AS c FROM skill_library_category_assignments');
    if (Number(count?.c || 0) > 0) return;
    run(`INSERT OR IGNORE INTO skill_library_category_assignments (entry_id, category_id, sort_order)
        SELECT skill_id, category_id, sort_order
        FROM skill_category_assignments`);
}

function resolveCanonicalSkillId(installedSkill, canonicalBySlug) {
    const candidate = canonicalBySlug.get(String(installedSkill.slug || '').toLowerCase());
    if (candidate?.id && candidate.id !== installedSkill.id) return candidate.id;
    return installedSkill.id;
}

function backfillCanonicalSkillsAndInstallations() {
    const skills = all('SELECT * FROM skills ORDER BY created_at ASC');
    const canonicalBySlug = new Map();

    skills.forEach((skill) => {
        if (deriveSourceType(skill) === 'installed') return;
        const slug = String(skill.slug || '').toLowerCase();
        if (!slug || canonicalBySlug.has(slug)) return;
        canonicalBySlug.set(slug, skill);
    });

    skills.forEach((skill) => {
        const def = loadSkillDefinition(skill);
        run(`UPDATE skills
            SET source_type = ?,
                instructions_text = ?,
                definition_json = ?,
                metadata_json = ?,
                materialized_path = ?,
                materialized_at = ?,
                updated_at = datetime('now')
            WHERE id = ?`, [
            def.sourceType === 'installed' ? 'imported' : def.sourceType,
            def.instructionsText || '',
            JSON.stringify(def.definition || {}),
            JSON.stringify(def.metadata || {}),
            def.materializedPath || skill.path || null,
            def.materializedAt || null,
            skill.id
        ]);
    });

    const installedRows = all(`SELECT * FROM skills
        WHERE LOWER(COALESCE(source_type, '')) = 'installed'
           OR LOWER(path) LIKE 'installed/%'
        ORDER BY created_at ASC`);

    installedRows.forEach((installedSkill) => {
        const relPath = String(installedSkill.path || '').replace(/\\/g, '/');
        const match = relPath.match(/^installed\/([^/]+)\//i);
        const userId = match?.[1] || String(installedSkill.id || '').split(':')[1] || null;
        if (!userId) return;

        const canonicalSkillId = resolveCanonicalSkillId(installedSkill, canonicalBySlug);
        const listing = get(`SELECT * FROM catalog_listings
            WHERE asset_type = 'skill' AND asset_id = ?
            LIMIT 1`, [canonicalSkillId]);
        const grant = get(`SELECT * FROM catalog_grants
            WHERE subject_type = 'user'
              AND subject_id = ?
              AND asset_type = 'skill'
              AND asset_id = ?
              AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1`, [userId, canonicalSkillId]);

        run(`INSERT OR IGNORE INTO skill_installations (
            id, user_id, skill_id, listing_id, revision_id, grant_id, status, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, 'installed', ?)`, [
            installedSkill.id,
            userId,
            canonicalSkillId,
            listing?.id || null,
            listing?.current_approved_revision_id || listing?.current_revision_id || null,
            grant?.id || null,
            JSON.stringify({ migrated: true, source: 'legacy_installed_skill', legacySkillId: installedSkill.id })
        ]);

        if (canonicalSkillId !== installedSkill.id) {
            const agentAssignments = all('SELECT agent_id, sort_order FROM agent_skills WHERE skill_id = ?', [installedSkill.id]);
            agentAssignments.forEach((assignment) => {
                run('INSERT OR IGNORE INTO agent_skills (agent_id, skill_id, sort_order) VALUES (?, ?, ?)', [
                    assignment.agent_id,
                    canonicalSkillId,
                    assignment.sort_order
                ]);
            });
            run('DELETE FROM agent_skills WHERE skill_id = ?', [installedSkill.id]);
            run(`UPDATE skills
                SET archived_at = COALESCE(archived_at, datetime('now')),
                    source_type = 'installed',
                    updated_at = datetime('now')
                WHERE id = ?`, [installedSkill.id]);
        } else {
            run(`UPDATE skills
                SET source_type = 'imported',
                    archived_at = NULL,
                    updated_at = datetime('now')
                WHERE id = ?`, [installedSkill.id]);
        }
    });
}

function up() {
    ensureCatalogTableNames();
    ensureSkillColumns();
    ensureInstallTables();
    backfillSkillCategoryAssignments();
    backfillCanonicalSkillsAndInstallations();
}

module.exports = {
    id: '027',
    name: 'catalog_db_first_cleanup',
    up
};
