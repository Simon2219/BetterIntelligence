const { run, all } = require('../core/query');
const { ignoreDuplicateColumnError } = require('./helpers');

function addColumn(table, column, definition) {
    try {
        run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (err) {
        ignoreDuplicateColumnError(err);
    }
}

function columnExists(table, column) {
    try {
        const rows = all(`PRAGMA table_info(${table})`);
        return rows.some((row) => String(row.name || '').toLowerCase() === String(column || '').toLowerCase());
    } catch {
        return false;
    }
}

function up() {
    addColumn('catalog_grants', 'parent_grant_id', 'TEXT');
    addColumn('catalog_grants', 'grant_scope', "TEXT NOT NULL DEFAULT 'direct'");
    addColumn('catalog_grants', 'billing_subject_type', 'TEXT');
    addColumn('catalog_grants', 'billing_subject_id', 'TEXT');
    addColumn('catalog_grants', 'actor_scope', "TEXT DEFAULT ''");
    addColumn('catalog_grants', 'rolls_to_latest_approved', 'INTEGER NOT NULL DEFAULT 1');

    if (columnExists('catalog_grants', 'grant_scope')) {
        run(`UPDATE catalog_grants
            SET grant_scope = CASE
                WHEN LOWER(COALESCE(grant_type, '')) = 'deployment_sponsor' THEN 'deployment_sponsor'
                ELSE COALESCE(NULLIF(grant_scope, ''), 'direct')
            END`);
    }
    if (columnExists('catalog_grants', 'billing_subject_type')) {
        run(`UPDATE catalog_grants
            SET billing_subject_type = COALESCE(NULLIF(billing_subject_type, ''), subject_type)`);
    }
    if (columnExists('catalog_grants', 'billing_subject_id')) {
        run(`UPDATE catalog_grants
            SET billing_subject_id = COALESCE(NULLIF(billing_subject_id, ''), subject_id)`);
    }
    if (columnExists('catalog_grants', 'actor_scope')) {
        run(`UPDATE catalog_grants
            SET actor_scope = CASE
                WHEN LOWER(COALESCE(subject_type, '')) = 'deployment' THEN 'guest'
                ELSE COALESCE(NULLIF(actor_scope, ''), 'end_user')
            END`);
    }
    if (columnExists('catalog_grants', 'rolls_to_latest_approved')) {
        run(`UPDATE catalog_grants
            SET rolls_to_latest_approved = COALESCE(rolls_to_latest_approved, 1)`);
    }

    run(`CREATE TABLE IF NOT EXISTS usage_attribution_legs (
        id TEXT PRIMARY KEY,
        usage_event_id INTEGER NOT NULL,
        leg_type TEXT NOT NULL,
        primary_subject_type TEXT,
        primary_subject_id TEXT,
        asset_type TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        grant_id TEXT,
        parent_grant_id TEXT,
        deployment_id INTEGER,
        actor_user_id TEXT,
        owner_user_id TEXT,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        requests INTEGER NOT NULL DEFAULT 1,
        estimated_cost_usd REAL NOT NULL DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (usage_event_id) REFERENCES ai_model_usage_events(id) ON DELETE CASCADE,
        FOREIGN KEY (grant_id) REFERENCES catalog_grants(id) ON DELETE SET NULL,
        FOREIGN KEY (parent_grant_id) REFERENCES catalog_grants(id) ON DELETE SET NULL
    )`);

    run('CREATE INDEX IF NOT EXISTS idx_usage_attribution_event ON usage_attribution_legs(usage_event_id, leg_type)');
    run('CREATE INDEX IF NOT EXISTS idx_usage_attribution_grant ON usage_attribution_legs(grant_id, leg_type, created_at)');
    run('CREATE INDEX IF NOT EXISTS idx_usage_attribution_parent_grant ON usage_attribution_legs(parent_grant_id, leg_type, created_at)');
    run('CREATE INDEX IF NOT EXISTS idx_usage_attribution_asset ON usage_attribution_legs(asset_type, asset_id, leg_type, created_at)');
    run('CREATE INDEX IF NOT EXISTS idx_usage_attribution_owner ON usage_attribution_legs(owner_user_id, leg_type, created_at)');
    run('CREATE INDEX IF NOT EXISTS idx_usage_attribution_actor ON usage_attribution_legs(actor_user_id, leg_type, created_at)');
    run('CREATE INDEX IF NOT EXISTS idx_usage_attribution_deployment ON usage_attribution_legs(deployment_id, leg_type, created_at)');
}

module.exports = {
    id: '029',
    name: 'unified_grants_usage_attribution',
    up
};
