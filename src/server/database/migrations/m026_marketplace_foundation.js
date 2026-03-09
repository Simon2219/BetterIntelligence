const path = require('path');
const { run, all, get } = require('../core/query');
const { generateId } = require('../core/ids');
const { ignoreDuplicateColumnError } = require('./helpers');
const Config = require('../../../../config/Config');
const SkillLoader = require('../../services/SkillLoader');

function parseJson(value, fallback) {
    try {
        return JSON.parse(value || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

function slugify(value, fallback = 'listing') {
    const base = String(value || fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return base || fallback;
}

function uniqueListingSlug(seed) {
    const base = slugify(seed, 'listing');
    let slug = base;
    let counter = 1;
    while (get('SELECT id FROM market_listings WHERE slug = ?', [slug])) {
        counter += 1;
        slug = `${base}-${counter}`;
    }
    return slug;
}

function addRoleColumn(name) {
    try {
        run(`ALTER TABLE roles ADD COLUMN ${name} INTEGER DEFAULT 0`);
    } catch (err) {
        ignoreDuplicateColumnError(err);
    }
}

function normalizeOwnerId(value) {
    const ownerId = String(value || '').trim();
    return ownerId || 'platform';
}

function createListingFromAgent(agent, opts = {}) {
    const existing = get('SELECT * FROM market_listings WHERE asset_type = ? AND asset_id = ? LIMIT 1', ['agent', agent.id]);
    if (existing) return existing;

    const listingId = `ml_${generateId(12)}`;
    const revisionId = `mrev_${generateId(12)}`;
    const visibility = opts.visibility || (agent.hub_published === 1 ? 'public' : 'private');
    const status = opts.status || (visibility === 'public' ? 'published' : 'approved');
    const title = String(agent.name || 'Agent');
    const summary = String(agent.tagline || '');
    const skillIds = all('SELECT skill_id FROM agent_skills WHERE agent_id = ? ORDER BY sort_order', [agent.id]).map((row) => row.skill_id);
    const tags = all(`SELECT t.name
        FROM agent_tags at
        JOIN tags t ON t.id = at.tag_id
        WHERE at.agent_id = ?
        ORDER BY t.name`, [agent.id]).map((row) => row.name);
    const snapshot = {
        ...agent,
        skillIds,
        tags
    };

    run(`INSERT INTO market_listings (
        id, owner_type, owner_id, asset_type, asset_id, slug, title, summary, description, tags, metadata,
        status, visibility, current_revision_id, current_approved_revision_id
    ) VALUES (?, 'user', ?, 'agent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        listingId,
        normalizeOwnerId(agent.user_id),
        agent.id,
        uniqueListingSlug(`${title}-${agent.id}`),
        title,
        summary,
        summary,
        JSON.stringify(tags || []),
        JSON.stringify({ migrated: true, source: 'ai_agents' }),
        status,
        visibility,
        revisionId,
        revisionId
    ]);

    run(`INSERT INTO market_listing_revisions (
        id, listing_id, revision_number, title, summary, description, snapshot, safety_metadata,
        submit_notes, policy_version, review_status, created_by, submitted_at, reviewed_at
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`, [
        revisionId,
        listingId,
        title,
        summary,
        summary,
        JSON.stringify(snapshot),
        JSON.stringify({ migrated: true, checks: [] }),
        'Migrated from existing agent record',
        'legacy-migration',
        'approved',
        agent.user_id || null
    ]);

    run(`INSERT INTO market_plan_tiers (
        id, listing_id, revision_id, code, name, description, billing_mode, price_cents, currency, interval,
        external_price_ref, feature_gates, quota_limits, is_default, is_active
    ) VALUES (?, ?, ?, 'legacy-free', 'Legacy Free', ?, 'manual', 0, 'usd', 'month', '', ?, ?, 1, 1)`, [
        `mpl_${generateId(12)}`,
        listingId,
        revisionId,
        'Migrated free access plan',
        JSON.stringify({
            can_chat: true,
            can_copy: true,
            can_deploy: true,
            can_api: false,
            can_install: false,
            can_use_skill: false,
            can_commercial_use: false
        }),
        JSON.stringify({})
    ]);

    return get('SELECT * FROM market_listings WHERE id = ?', [listingId]);
}

function createListingFromSkill(skill) {
    const existing = get('SELECT * FROM market_listings WHERE asset_type = ? AND asset_id = ? LIMIT 1', ['skill', skill.id]);
    if (existing) return existing;

    const base = path.resolve(Config.get('skills.basePath', './data/skills'));
    const loaded = SkillLoader.loadSkillFromDir(path.join(base, skill.path)) || {};
    const listingId = `ml_${generateId(12)}`;
    const revisionId = `mrev_${generateId(12)}`;
    const title = String(skill.name || loaded.name || skill.slug || 'Skill');
    const summary = String(skill.description || loaded.description || '');
    const visibility = skill.hub_published === 1 ? 'public' : 'private';
    const status = visibility === 'public' ? 'published' : 'approved';
    const snapshot = {
        ...skill,
        ...loaded
    };

    run(`INSERT INTO market_listings (
        id, owner_type, owner_id, asset_type, asset_id, slug, title, summary, description, tags, metadata,
        status, visibility, current_revision_id, current_approved_revision_id
    ) VALUES (?, 'user', ?, 'skill', ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)`, [
        listingId,
        normalizeOwnerId(skill.creator_id),
        skill.id,
        uniqueListingSlug(`${title}-${skill.slug || skill.id}`),
        title,
        summary,
        summary,
        JSON.stringify({ migrated: true, source: 'skills' }),
        status,
        visibility,
        revisionId,
        revisionId
    ]);

    run(`INSERT INTO market_listing_revisions (
        id, listing_id, revision_number, title, summary, description, snapshot, safety_metadata,
        submit_notes, policy_version, review_status, created_by, submitted_at, reviewed_at
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`, [
        revisionId,
        listingId,
        title,
        summary,
        summary,
        JSON.stringify(snapshot),
        JSON.stringify({ migrated: true, checks: [] }),
        'Migrated from existing skill record',
        'legacy-migration',
        'approved',
        skill.creator_id || null
    ]);

    run(`INSERT INTO market_plan_tiers (
        id, listing_id, revision_id, code, name, description, billing_mode, price_cents, currency, interval,
        external_price_ref, feature_gates, quota_limits, is_default, is_active
    ) VALUES (?, ?, ?, 'legacy-free', 'Legacy Free', ?, 'manual', 0, 'usd', 'month', '', ?, ?, 1, 1)`, [
        `mpl_${generateId(12)}`,
        listingId,
        revisionId,
        'Migrated free install plan',
        JSON.stringify({
            can_chat: false,
            can_copy: false,
            can_deploy: false,
            can_api: false,
            can_install: true,
            can_use_skill: true,
            can_commercial_use: false
        }),
        JSON.stringify({})
    ]);

    return get('SELECT * FROM market_listings WHERE id = ?', [listingId]);
}

function ensureDeploymentAccessPolicy(dep, listingId, revisionId) {
    const existing = get('SELECT * FROM deployment_access_policies WHERE deployment_id = ?', [dep.id]);
    if (existing) return existing;

    const sponsorGrantId = `mgr_${generateId(12)}`;
    run(`INSERT INTO entitlement_grants (
        id, owner_type, owner_id, listing_id, revision_id, plan_id, asset_type, asset_id,
        subject_type, subject_id, grant_type, status, feature_gates, quota_limits,
        period_kind, metadata, created_by
    ) VALUES (?, 'user', ?, ?, ?, NULL, 'agent', ?, 'deployment', ?, 'deployment_sponsor', 'active', ?, ?, 'monthly', ?, ?)`, [
        sponsorGrantId,
        dep.owner_user_id || null,
        listingId || null,
        revisionId || null,
        dep.agent_id,
        String(dep.id),
        JSON.stringify({
            can_chat: true,
            can_copy: false,
            can_deploy: false,
            can_api: (dep.api_enabled ?? 0) === 1,
            can_install: false,
            can_use_skill: false,
            can_commercial_use: false
        }),
        JSON.stringify({
            monthly_invocations: 1000,
            monthly_tokens: 250000
        }),
        JSON.stringify({ migrated: true, source: 'agent_deployments' }),
        dep.owner_user_id || null
    ]);

    run(`INSERT INTO deployment_access_policies (
        deployment_id, consumer_access_mode, pinned_revision_id, sponsor_grant_id, metadata
    ) VALUES (?, ?, ?, ?, ?)`, [
        dep.id,
        (dep.embed_enabled ?? 1) === 1 ? 'public_sponsored' : 'internal_only',
        revisionId || null,
        sponsorGrantId,
        JSON.stringify({ migrated: true })
    ]);
    return get('SELECT * FROM deployment_access_policies WHERE deployment_id = ?', [dep.id]);
}

function backfillListingsAndGrants() {
    const agents = all('SELECT * FROM ai_agents ORDER BY created_at ASC');
    const skills = all('SELECT * FROM skills ORDER BY created_at ASC');
    const deployments = all('SELECT * FROM agent_deployments ORDER BY id ASC');

    const listingByAgentId = new Map();

    agents.forEach((agent) => {
        const shouldCreate = agent.hub_published === 1
            || !!get('SELECT 1 FROM agent_subscriptions WHERE agent_id = ? LIMIT 1', [agent.id])
            || !!get('SELECT 1 FROM agent_deployments WHERE agent_id = ? LIMIT 1', [agent.id]);
        if (!shouldCreate) return;
        const listing = createListingFromAgent(agent, {
            visibility: agent.hub_published === 1 ? 'public' : 'private',
            status: agent.hub_published === 1 ? 'published' : 'approved'
        });
        if (listing) listingByAgentId.set(agent.id, listing);
    });

    skills.forEach((skill) => {
        if (skill.hub_published !== 1 && String(skill.visibility || '').toLowerCase() !== 'public') return;
        createListingFromSkill(skill);
    });

    deployments.forEach((dep) => {
        const listing = listingByAgentId.get(dep.agent_id) || get('SELECT * FROM market_listings WHERE asset_type = ? AND asset_id = ? LIMIT 1', ['agent', dep.agent_id]);
        const listingId = listing?.id || null;
        const revisionId = listing?.current_approved_revision_id || listing?.current_revision_id || null;
        ensureDeploymentAccessPolicy(dep, listingId, revisionId);
    });

    const subscriptions = all('SELECT * FROM agent_subscriptions ORDER BY subscribed_at ASC');
    subscriptions.forEach((subscription) => {
        const existing = get(`SELECT id FROM entitlement_grants
            WHERE subject_type = 'user' AND subject_id = ? AND asset_type = 'agent' AND asset_id = ? AND grant_type = 'legacy_subscription'
            LIMIT 1`, [subscription.user_id, subscription.agent_id]);
        if (existing) return;
        const listing = listingByAgentId.get(subscription.agent_id)
            || get('SELECT * FROM market_listings WHERE asset_type = ? AND asset_id = ? LIMIT 1', ['agent', subscription.agent_id]);
        run(`INSERT INTO entitlement_grants (
            id, owner_type, owner_id, listing_id, revision_id, plan_id, asset_type, asset_id,
            subject_type, subject_id, grant_type, status, feature_gates, quota_limits,
            period_kind, starts_at, metadata, created_by, created_at
        ) VALUES (?, 'user', ?, ?, ?, NULL, 'agent', ?, 'user', ?, 'legacy_subscription', 'active', ?, '{}', 'monthly', ?, ?, ?, ?)`, [
            `mgr_${generateId(12)}`,
            listing?.owner_id || null,
            listing?.id || null,
            listing?.current_approved_revision_id || listing?.current_revision_id || null,
            subscription.agent_id,
            subscription.user_id,
            JSON.stringify({
                can_chat: true,
                can_copy: true,
                can_deploy: true,
                can_api: false,
                can_install: false,
                can_use_skill: false,
                can_commercial_use: false
            }),
            subscription.subscribed_at || new Date().toISOString(),
            JSON.stringify({ migrated: true, source: 'agent_subscriptions' }),
            listing?.owner_id || null,
            subscription.subscribed_at || new Date().toISOString()
        ]);
    });
}

function up() {
    addRoleColumn('can_manage_marketplace');
    addRoleColumn('can_moderate_marketplace');
    run(`UPDATE roles
        SET can_manage_marketplace = 1,
            can_moderate_marketplace = CASE WHEN is_admin = 1 THEN 1 ELSE can_moderate_marketplace END
        WHERE is_admin = 1`);

    run(`CREATE TABLE IF NOT EXISTS market_listings (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL DEFAULT 'user',
        owner_id TEXT NOT NULL,
        asset_type TEXT NOT NULL CHECK (asset_type IN ('agent', 'skill', 'bundle')),
        asset_id TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        summary TEXT DEFAULT '',
        description TEXT DEFAULT '',
        tags TEXT DEFAULT '[]',
        metadata TEXT DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'draft',
        visibility TEXT NOT NULL DEFAULT 'private',
        current_revision_id TEXT,
        current_approved_revision_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);
    run('CREATE UNIQUE INDEX IF NOT EXISTS idx_market_listings_asset ON market_listings(asset_type, asset_id)');
    run('CREATE INDEX IF NOT EXISTS idx_market_listings_owner ON market_listings(owner_type, owner_id)');
    run('CREATE INDEX IF NOT EXISTS idx_market_listings_visibility ON market_listings(visibility, status)');

    run(`CREATE TABLE IF NOT EXISTS market_listing_revisions (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        revision_number INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL,
        summary TEXT DEFAULT '',
        description TEXT DEFAULT '',
        snapshot TEXT DEFAULT '{}',
        safety_metadata TEXT DEFAULT '{}',
        submit_notes TEXT DEFAULT '',
        policy_version TEXT DEFAULT '',
        review_status TEXT NOT NULL DEFAULT 'draft',
        created_by TEXT,
        submitted_at TEXT,
        reviewed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (listing_id) REFERENCES market_listings(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`);
    run('CREATE INDEX IF NOT EXISTS idx_market_revisions_listing ON market_listing_revisions(listing_id, revision_number DESC)');
    run('CREATE INDEX IF NOT EXISTS idx_market_revisions_status ON market_listing_revisions(review_status, created_at)');

    run(`CREATE TABLE IF NOT EXISTS market_plan_tiers (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        code TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        billing_mode TEXT NOT NULL DEFAULT 'manual',
        price_cents INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'usd',
        interval TEXT NOT NULL DEFAULT 'month',
        external_price_ref TEXT DEFAULT '',
        feature_gates TEXT DEFAULT '{}',
        quota_limits TEXT DEFAULT '{}',
        is_default INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (listing_id) REFERENCES market_listings(id) ON DELETE CASCADE,
        FOREIGN KEY (revision_id) REFERENCES market_listing_revisions(id) ON DELETE CASCADE
    )`);
    run('CREATE INDEX IF NOT EXISTS idx_market_plans_listing ON market_plan_tiers(listing_id, revision_id)');

    run(`CREATE TABLE IF NOT EXISTS market_bundle_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        item_type TEXT NOT NULL CHECK (item_type IN ('agent', 'skill')),
        item_id TEXT NOT NULL,
        item_revision_id TEXT,
        sort_order INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (listing_id) REFERENCES market_listings(id) ON DELETE CASCADE,
        FOREIGN KEY (revision_id) REFERENCES market_listing_revisions(id) ON DELETE CASCADE
    )`);
    run('CREATE INDEX IF NOT EXISTS idx_market_bundle_items_revision ON market_bundle_items(revision_id, sort_order)');

    run(`CREATE TABLE IF NOT EXISTS market_access_requests (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        revision_id TEXT,
        requester_user_id TEXT NOT NULL,
        requested_subject_type TEXT NOT NULL DEFAULT 'user',
        requested_subject_id TEXT,
        plan_id TEXT,
        note TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        decision_reason TEXT DEFAULT '',
        resolved_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        resolved_at TEXT,
        FOREIGN KEY (listing_id) REFERENCES market_listings(id) ON DELETE CASCADE,
        FOREIGN KEY (revision_id) REFERENCES market_listing_revisions(id) ON DELETE SET NULL,
        FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
    )`);
    run('CREATE INDEX IF NOT EXISTS idx_market_access_requests_listing ON market_access_requests(listing_id, status)');
    run('CREATE INDEX IF NOT EXISTS idx_market_access_requests_requester ON market_access_requests(requester_user_id, status)');

    run(`CREATE TABLE IF NOT EXISTS entitlement_grants (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL DEFAULT 'user',
        owner_id TEXT,
        listing_id TEXT,
        revision_id TEXT,
        plan_id TEXT,
        asset_type TEXT NOT NULL CHECK (asset_type IN ('agent', 'skill', 'bundle')),
        asset_id TEXT NOT NULL,
        subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'deployment', 'org')),
        subject_id TEXT NOT NULL,
        grant_type TEXT NOT NULL DEFAULT 'manual',
        status TEXT NOT NULL DEFAULT 'active',
        feature_gates TEXT DEFAULT '{}',
        quota_limits TEXT DEFAULT '{}',
        period_kind TEXT NOT NULL DEFAULT 'monthly',
        external_ref TEXT DEFAULT '',
        starts_at TEXT,
        ends_at TEXT,
        metadata TEXT DEFAULT '{}',
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        revoked_at TEXT,
        FOREIGN KEY (listing_id) REFERENCES market_listings(id) ON DELETE SET NULL,
        FOREIGN KEY (revision_id) REFERENCES market_listing_revisions(id) ON DELETE SET NULL,
        FOREIGN KEY (plan_id) REFERENCES market_plan_tiers(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`);
    run('CREATE INDEX IF NOT EXISTS idx_entitlement_grants_subject ON entitlement_grants(subject_type, subject_id, status)');
    run('CREATE INDEX IF NOT EXISTS idx_entitlement_grants_asset ON entitlement_grants(asset_type, asset_id, status)');
    run('CREATE INDEX IF NOT EXISTS idx_entitlement_grants_listing ON entitlement_grants(listing_id, status)');

    run(`CREATE TABLE IF NOT EXISTS entitlement_usage_counters (
        grant_id TEXT NOT NULL,
        period_key TEXT NOT NULL,
        metric_key TEXT NOT NULL,
        usage_value INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (grant_id, period_key, metric_key),
        FOREIGN KEY (grant_id) REFERENCES entitlement_grants(id) ON DELETE CASCADE
    )`);

    run(`CREATE TABLE IF NOT EXISTS deployment_access_policies (
        deployment_id INTEGER PRIMARY KEY,
        consumer_access_mode TEXT NOT NULL DEFAULT 'internal_only',
        pinned_revision_id TEXT,
        sponsor_grant_id TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (deployment_id) REFERENCES agent_deployments(id) ON DELETE CASCADE,
        FOREIGN KEY (pinned_revision_id) REFERENCES market_listing_revisions(id) ON DELETE SET NULL,
        FOREIGN KEY (sponsor_grant_id) REFERENCES entitlement_grants(id) ON DELETE SET NULL
    )`);

    run(`CREATE TABLE IF NOT EXISTS market_reviews (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        revision_id TEXT,
        reviewer_user_id TEXT,
        action TEXT NOT NULL,
        decision TEXT DEFAULT '',
        reason TEXT DEFAULT '',
        findings TEXT DEFAULT '[]',
        policy_version TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (listing_id) REFERENCES market_listings(id) ON DELETE CASCADE,
        FOREIGN KEY (revision_id) REFERENCES market_listing_revisions(id) ON DELETE SET NULL,
        FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL
    )`);
    run('CREATE INDEX IF NOT EXISTS idx_market_reviews_listing ON market_reviews(listing_id, created_at DESC)');

    run(`CREATE TABLE IF NOT EXISTS market_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_user_id TEXT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        before_state TEXT DEFAULT '{}',
        after_state TEXT DEFAULT '{}',
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    )`);
    run('CREATE INDEX IF NOT EXISTS idx_market_audit_entity ON market_audit_log(entity_type, entity_id, created_at DESC)');

    backfillListingsAndGrants();

    try {
        const rows = all('SELECT id, metadata FROM ai_provider_models');
        rows.forEach((row) => {
            const metadata = parseJson(row.metadata, {});
            if (metadata.promptTokenCostUsd === undefined) metadata.promptTokenCostUsd = 0;
            if (metadata.completionTokenCostUsd === undefined) metadata.completionTokenCostUsd = 0;
            if (metadata.imageRequestCostUsd === undefined) metadata.imageRequestCostUsd = 0;
            run('UPDATE ai_provider_models SET metadata = ? WHERE id = ?', [JSON.stringify(metadata), row.id]);
        });
    } catch {}
}

module.exports = {
    id: '026',
    name: 'marketplace_foundation',
    up
};
