const { all, get, run } = require('../core/query');
const { generateId } = require('../core/ids');

function parseJson(value, fallback) {
    try {
        return JSON.parse(value || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

function normalizeOwnerId(value) {
    const ownerId = String(value || '').trim();
    return ownerId || 'platform';
}

function slugify(value, fallback = 'listing') {
    const base = String(value || fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return base || fallback;
}

function nextSlug(seed) {
    const base = slugify(seed, 'listing');
    let slug = base;
    let counter = 1;
    while (get('SELECT id FROM catalog_listings WHERE slug = ?', [slug])) {
        counter += 1;
        slug = `${base}-${counter}`;
    }
    return slug;
}

function ensureDefaultPlan(listingId, revisionId, assetType) {
    const existing = get('SELECT id FROM catalog_plan_tiers WHERE listing_id = ? AND revision_id = ? LIMIT 1', [listingId, revisionId]);
    if (existing) return;
    const featureGates = assetType === 'skill'
        ? {
            can_chat: false,
            can_copy: false,
            can_deploy: false,
            can_api: false,
            can_install: true,
            can_use_skill: true,
            can_commercial_use: false
        }
        : {
            can_chat: true,
            can_copy: true,
            can_deploy: true,
            can_api: false,
            can_install: false,
            can_use_skill: false,
            can_commercial_use: false
        };
    run(`INSERT INTO catalog_plan_tiers (
        id, listing_id, revision_id, code, name, description, billing_mode, price_cents, currency, interval,
        external_price_ref, feature_gates, quota_limits, is_default, is_active
    ) VALUES (?, ?, ?, 'legacy-free', 'Legacy Free', ?, 'manual', 0, 'usd', 'month', '', ?, '{}', 1, 1)`, [
        `cpl_${generateId(12)}`,
        listingId,
        revisionId,
        'Backfilled free access plan',
        JSON.stringify(featureGates)
    ]);
}

function buildAgentSnapshot(agent) {
    const skillIds = all('SELECT skill_id FROM agent_skills WHERE agent_id = ? ORDER BY sort_order', [agent.id]).map((row) => row.skill_id);
    const tags = all(`SELECT t.id, t.name
        FROM agent_tags at
        JOIN tags t ON t.id = at.tag_id
        WHERE at.agent_id = ?
        ORDER BY t.name`, [agent.id]);
    return {
        ...agent,
        skillIds,
        tags
    };
}

function buildSkillSnapshot(skill) {
    const definition = parseJson(skill.definition_json, {});
    const metadata = parseJson(skill.metadata_json, {});
    return {
        ...skill,
        definition: {
            ...definition,
            name: skill.name || definition.name || skill.slug || '',
            description: skill.description || definition.description || '',
            version: skill.version || definition.version || '1.0.0',
            instructions: skill.instructions_text || definition.instructions || '',
            metadata: {
                ...(definition.metadata || {}),
                ...(metadata || {})
            }
        }
    };
}

function ensureRevision(listing, snapshot, ownerId, title, summary) {
    const existingRevisionId = listing.current_approved_revision_id || listing.current_revision_id || null;
    const existingRevision = existingRevisionId ? get('SELECT * FROM catalog_listing_revisions WHERE id = ?', [existingRevisionId]) : null;
    if (existingRevision) return existingRevision;

    const revisionId = `mrev_${generateId(12)}`;
    run(`INSERT INTO catalog_listing_revisions (
        id, listing_id, revision_number, title, summary, description, snapshot, safety_metadata,
        submit_notes, policy_version, review_status, created_by, submitted_at, reviewed_at
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, datetime('now'), datetime('now'))`, [
        revisionId,
        listing.id,
        title,
        summary,
        summary,
        JSON.stringify(snapshot || {}),
        JSON.stringify({ migrated: true, checks: [] }),
        'Backfilled during strict catalog cutover',
        'catalog-cutover-v1',
        ownerId || null
    ]);
    run(`UPDATE catalog_listings
        SET current_revision_id = ?,
            current_approved_revision_id = COALESCE(current_approved_revision_id, ?),
            updated_at = datetime('now')
        WHERE id = ?`, [revisionId, revisionId, listing.id]);
    return get('SELECT * FROM catalog_listing_revisions WHERE id = ?', [revisionId]);
}

function ensureListing({ assetType, assetId, ownerId, title, summary, visibility, status, snapshot }) {
    let listing = get('SELECT * FROM catalog_listings WHERE asset_type = ? AND asset_id = ? LIMIT 1', [assetType, assetId]);
    if (!listing) {
        const listingId = `ml_${generateId(12)}`;
        run(`INSERT INTO catalog_listings (
            id, owner_type, owner_id, asset_type, asset_id, slug, title, summary, description, tags, metadata, status, visibility
        ) VALUES (?, 'user', ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)`, [
            listingId,
            normalizeOwnerId(ownerId),
            assetType,
            assetId,
            nextSlug(`${title}-${assetId}`),
            title,
            summary,
            summary,
            JSON.stringify({ migrated: true, source: 'strict_catalog_cutover' }),
            status,
            visibility
        ]);
        listing = get('SELECT * FROM catalog_listings WHERE id = ?', [listingId]);
    } else {
        run(`UPDATE catalog_listings
            SET title = COALESCE(NULLIF(title, ''), ?),
                summary = COALESCE(NULLIF(summary, ''), ?),
                description = COALESCE(NULLIF(description, ''), ?),
                visibility = CASE WHEN ? = 'public' THEN 'public' ELSE visibility END,
                status = CASE
                    WHEN ? = 'public' AND status NOT IN ('published', 'approved') THEN 'published'
                    ELSE status
                END,
                updated_at = datetime('now')
            WHERE id = ?`, [
            title,
            summary,
            summary,
            visibility,
            visibility,
            listing.id
        ]);
        listing = get('SELECT * FROM catalog_listings WHERE id = ?', [listing.id]);
    }

    const revision = ensureRevision(listing, snapshot, ownerId, title, summary);
    ensureDefaultPlan(listing.id, revision.id, assetType);
    return get('SELECT * FROM catalog_listings WHERE id = ?', [listing.id]);
}

function backfillAgentListings() {
    const agents = all('SELECT * FROM ai_agents ORDER BY created_at ASC');
    agents.forEach((agent) => {
        const shouldList = agent.hub_published === 1
            || !!get('SELECT 1 FROM agent_subscriptions WHERE agent_id = ? LIMIT 1', [agent.id])
            || !!get('SELECT 1 FROM agent_deployments WHERE agent_id = ? LIMIT 1', [agent.id]);
        if (!shouldList) return;
        ensureListing({
            assetType: 'agent',
            assetId: agent.id,
            ownerId: agent.user_id,
            title: agent.name || 'Agent',
            summary: agent.tagline || '',
            visibility: agent.hub_published === 1 ? 'public' : 'private',
            status: agent.hub_published === 1 ? 'published' : 'approved',
            snapshot: buildAgentSnapshot(agent)
        });
    });
}

function backfillSkillListings() {
    const skills = all('SELECT * FROM skills ORDER BY created_at ASC');
    skills.forEach((skill) => {
        const isPublic = skill.hub_published === 1 || String(skill.visibility || '').toLowerCase() === 'public';
        if (!isPublic) return;
        ensureListing({
            assetType: 'skill',
            assetId: skill.id,
            ownerId: skill.creator_id,
            title: skill.name || skill.slug || 'Skill',
            summary: skill.description || '',
            visibility: 'public',
            status: 'published',
            snapshot: buildSkillSnapshot(skill)
        });
    });
}

function backfillLegacySubscriptions() {
    const subscriptions = all('SELECT * FROM agent_subscriptions ORDER BY subscribed_at ASC');
    subscriptions.forEach((subscription) => {
        const listing = get('SELECT * FROM catalog_listings WHERE asset_type = ? AND asset_id = ? LIMIT 1', ['agent', subscription.agent_id]);
        if (!listing) return;
        const existing = get(`SELECT id FROM catalog_grants
            WHERE subject_type = 'user'
              AND subject_id = ?
              AND asset_type = 'agent'
              AND asset_id = ?
              AND grant_type = 'legacy_subscription'
            LIMIT 1`, [subscription.user_id, subscription.agent_id]);
        if (existing) return;
        run(`INSERT INTO catalog_grants (
            id, owner_type, owner_id, listing_id, revision_id, plan_id, asset_type, asset_id,
            subject_type, subject_id, grant_type, status, feature_gates, quota_limits,
            period_kind, starts_at, metadata, created_by, created_at
        ) VALUES (?, 'user', ?, ?, ?, NULL, 'agent', ?, 'user', ?, 'legacy_subscription', 'active', ?, '{}', 'monthly', ?, ?, ?, ?)`, [
            `mgr_${generateId(12)}`,
            listing.owner_id || null,
            listing.id,
            listing.current_approved_revision_id || listing.current_revision_id || null,
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
            JSON.stringify({ migrated: true, source: 'agent_subscriptions', strictCatalogCutover: true }),
            listing.owner_id || null,
            subscription.subscribed_at || new Date().toISOString()
        ]);
    });
}

function up() {
    backfillAgentListings();
    backfillSkillListings();
    backfillLegacySubscriptions();
}

module.exports = {
    id: '028',
    name: 'strict_catalog_cutover',
    up
};
