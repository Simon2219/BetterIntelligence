const { run, all, get } = require('../core/query');
const { generateId } = require('../core/ids');

function parseJson(value, fallback) {
    try {
        return JSON.parse(value || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

function asBool(value) {
    return value === 1 || value === true;
}

function normalizeListing(row) {
    if (!row) return null;
    return {
        ...row,
        tags: parseJson(row.tags, []),
        metadata: parseJson(row.metadata, {}),
        hasCurrentRevision: !!row.current_revision_id,
        hasApprovedRevision: !!row.current_approved_revision_id
    };
}

function normalizeRevision(row) {
    if (!row) return null;
    return {
        ...row,
        snapshot: parseJson(row.snapshot, {}),
        safety_metadata: parseJson(row.safety_metadata, {}),
        findings: parseJson(row.findings, []),
        metadata: parseJson(row.metadata, {})
    };
}

function normalizePlan(row) {
    if (!row) return null;
    return {
        ...row,
        feature_gates: parseJson(row.feature_gates, {}),
        quota_limits: parseJson(row.quota_limits, {}),
        is_default: asBool(row.is_default),
        is_active: asBool(row.is_active)
    };
}

function normalizeBundleItem(row) {
    if (!row) return null;
    return {
        ...row,
        metadata: parseJson(row.metadata, {})
    };
}

function normalizeReview(row) {
    if (!row) return null;
    return {
        ...row,
        findings: parseJson(row.findings, [])
    };
}

const CatalogListingRepository = {
    getById(id) {
        return normalizeListing(get('SELECT * FROM catalog_listings WHERE id = ?', [id]));
    },

    getBySlug(slug) {
        return normalizeListing(get('SELECT * FROM catalog_listings WHERE slug = ? LIMIT 1', [slug]));
    },

    getByAsset(assetType, assetId) {
        return normalizeListing(get('SELECT * FROM catalog_listings WHERE asset_type = ? AND asset_id = ? LIMIT 1', [assetType, assetId]));
    },

    listByOwner(ownerType, ownerId, opts = {}) {
        const includePublicOnly = opts.publicOnly === true;
        const includeStatuses = Array.isArray(opts.statuses) && opts.statuses.length ? opts.statuses : null;
        const params = [ownerType || 'user', ownerId];
        let sql = 'SELECT * FROM catalog_listings WHERE owner_type = ? AND owner_id = ?';
        if (includePublicOnly) {
            sql += ' AND visibility = ?';
            params.push('public');
        }
        if (includeStatuses) {
            sql += ` AND status IN (${includeStatuses.map(() => '?').join(', ')})`;
            params.push(...includeStatuses);
        }
        sql += ' ORDER BY updated_at DESC, created_at DESC';
        return all(sql, params).map(normalizeListing);
    },

    listPublic(opts = {}) {
        const params = [];
        let sql = `SELECT * FROM catalog_listings
            WHERE visibility = 'public'
              AND status IN ('approved', 'published')`;
        if (opts.assetType) {
            sql += ' AND asset_type = ?';
            params.push(opts.assetType);
        }
        if (opts.q) {
            sql += ' AND (LOWER(title) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(description) LIKE ?)';
            const q = `%${String(opts.q).trim().toLowerCase()}%`;
            params.push(q, q, q);
        }
        sql += ' ORDER BY updated_at DESC, created_at DESC';
        if (opts.limit) {
            sql += ' LIMIT ?';
            params.push(parseInt(opts.limit, 10));
        }
        return all(sql, params).map(normalizeListing);
    },

    create(data = {}) {
        const id = data.id || `ml_${generateId(12)}`;
        run(`INSERT INTO catalog_listings (
            id, owner_type, owner_id, asset_type, asset_id, slug, title, summary, description, tags,
            metadata, status, visibility, current_revision_id, current_approved_revision_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id,
            data.ownerType || 'user',
            data.ownerId,
            data.assetType,
            data.assetId,
            data.slug,
            data.title || '',
            data.summary || '',
            data.description || '',
            JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
            JSON.stringify(data.metadata || {}),
            data.status || 'draft',
            data.visibility || 'private',
            data.currentRevisionId || null,
            data.currentApprovedRevisionId || null
        ]);
        return this.getById(id);
    },

    update(id, updates = {}) {
        const fieldMap = {
            ownerType: 'owner_type',
            ownerId: 'owner_id',
            assetType: 'asset_type',
            assetId: 'asset_id',
            slug: 'slug',
            title: 'title',
            summary: 'summary',
            description: 'description',
            tags: 'tags',
            metadata: 'metadata',
            status: 'status',
            visibility: 'visibility',
            currentRevisionId: 'current_revision_id',
            currentApprovedRevisionId: 'current_approved_revision_id'
        };
        const sets = [];
        const values = [];
        Object.entries(fieldMap).forEach(([key, column]) => {
            if (updates[key] === undefined) return;
            const raw = (key === 'tags' || key === 'metadata')
                ? JSON.stringify(updates[key] || (key === 'tags' ? [] : {}))
                : updates[key];
            sets.push(`${column} = ?`);
            values.push(raw);
        });
        if (!sets.length) return this.getById(id);
        sets.push("updated_at = datetime('now')");
        values.push(id);
        run(`UPDATE catalog_listings SET ${sets.join(', ')} WHERE id = ?`, values);
        return this.getById(id);
    },

    listRevisions(listingId) {
        return all('SELECT * FROM catalog_listing_revisions WHERE listing_id = ? ORDER BY revision_number DESC, created_at DESC', [listingId]).map(normalizeRevision);
    },

    getRevisionById(id) {
        return normalizeRevision(get('SELECT * FROM catalog_listing_revisions WHERE id = ?', [id]));
    },

    getRevisionByListingAndNumber(listingId, revisionNumber) {
        return normalizeRevision(get('SELECT * FROM catalog_listing_revisions WHERE listing_id = ? AND revision_number = ? LIMIT 1', [listingId, revisionNumber]));
    },

    createRevision(data = {}) {
        const id = data.id || `mrev_${generateId(12)}`;
        const revisionNumber = data.revisionNumber || (
            (get('SELECT MAX(revision_number) as n FROM catalog_listing_revisions WHERE listing_id = ?', [data.listingId])?.n || 0) + 1
        );
        run(`INSERT INTO catalog_listing_revisions (
            id, listing_id, revision_number, title, summary, description, snapshot, safety_metadata,
            submit_notes, policy_version, review_status, created_by, submitted_at, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id,
            data.listingId,
            revisionNumber,
            data.title || '',
            data.summary || '',
            data.description || '',
            JSON.stringify(data.snapshot || {}),
            JSON.stringify(data.safetyMetadata || {}),
            data.submitNotes || '',
            data.policyVersion || '',
            data.reviewStatus || 'draft',
            data.createdBy || null,
            data.submittedAt || null,
            data.reviewedAt || null
        ]);
        return this.getRevisionById(id);
    },

    updateRevision(id, updates = {}) {
        const fieldMap = {
            title: 'title',
            summary: 'summary',
            description: 'description',
            snapshot: 'snapshot',
            safetyMetadata: 'safety_metadata',
            submitNotes: 'submit_notes',
            policyVersion: 'policy_version',
            reviewStatus: 'review_status',
            submittedAt: 'submitted_at',
            reviewedAt: 'reviewed_at'
        };
        const sets = [];
        const values = [];
        Object.entries(fieldMap).forEach(([key, column]) => {
            if (updates[key] === undefined) return;
            let raw = updates[key];
            if (key === 'snapshot' || key === 'safetyMetadata') raw = JSON.stringify(raw || {});
            sets.push(`${column} = ?`);
            values.push(raw);
        });
        if (!sets.length) return this.getRevisionById(id);
        sets.push("updated_at = datetime('now')");
        values.push(id);
        run(`UPDATE catalog_listing_revisions SET ${sets.join(', ')} WHERE id = ?`, values);
        return this.getRevisionById(id);
    },

    listPlanTiers(listingId, revisionId = null) {
        const sql = revisionId
            ? 'SELECT * FROM catalog_plan_tiers WHERE listing_id = ? AND revision_id = ? ORDER BY is_default DESC, name ASC'
            : 'SELECT * FROM catalog_plan_tiers WHERE listing_id = ? ORDER BY is_default DESC, created_at DESC';
        const params = revisionId ? [listingId, revisionId] : [listingId];
        return all(sql, params).map(normalizePlan);
    },

    getPlanTierById(id) {
        return normalizePlan(get('SELECT * FROM catalog_plan_tiers WHERE id = ?', [id]));
    },

    replacePlanTiers(listingId, revisionId, plans = []) {
        run('DELETE FROM catalog_plan_tiers WHERE listing_id = ? AND revision_id = ?', [listingId, revisionId]);
        plans.forEach((plan, index) => {
            const id = plan.id || `cpl_${generateId(12)}`;
            run(`INSERT INTO catalog_plan_tiers (
                id, listing_id, revision_id, code, name, description, billing_mode, price_cents, currency, interval,
                external_price_ref, feature_gates, quota_limits, is_default, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                id,
                listingId,
                revisionId,
                plan.code || `plan-${index + 1}`,
                plan.name || `Plan ${index + 1}`,
                plan.description || '',
                plan.billingMode || 'manual',
                parseInt(plan.priceCents, 10) || 0,
                String(plan.currency || 'usd').toLowerCase(),
                plan.interval || 'month',
                plan.externalPriceRef || '',
                JSON.stringify(plan.featureGates || {}),
                JSON.stringify(plan.quotaLimits || {}),
                plan.isDefault ? 1 : 0,
                plan.isActive === false ? 0 : 1
            ]);
        });
        return this.listPlanTiers(listingId, revisionId);
    },

    listBundleItems(listingId, revisionId = null) {
        const sql = revisionId
            ? 'SELECT * FROM catalog_bundle_items WHERE listing_id = ? AND revision_id = ? ORDER BY sort_order ASC, id ASC'
            : 'SELECT * FROM catalog_bundle_items WHERE listing_id = ? ORDER BY sort_order ASC, id ASC';
        const params = revisionId ? [listingId, revisionId] : [listingId];
        return all(sql, params).map(normalizeBundleItem);
    },

    replaceBundleItems(listingId, revisionId, items = []) {
        run('DELETE FROM catalog_bundle_items WHERE listing_id = ? AND revision_id = ?', [listingId, revisionId]);
        items.forEach((item, index) => {
            run(`INSERT INTO catalog_bundle_items (
                listing_id, revision_id, item_type, item_id, item_revision_id, sort_order, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                listingId,
                revisionId,
                item.itemType,
                item.itemId,
                item.itemRevisionId || null,
                index,
                JSON.stringify(item.metadata || {})
            ]);
        });
        return this.listBundleItems(listingId, revisionId);
    },

    createReview(data = {}) {
        const id = data.id || `crvw_${generateId(12)}`;
        run(`INSERT INTO catalog_reviews (
            id, listing_id, revision_id, reviewer_user_id, action, decision, reason, findings, policy_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id,
            data.listingId,
            data.revisionId || null,
            data.reviewerUserId || null,
            data.action || 'review',
            data.decision || '',
            data.reason || '',
            JSON.stringify(data.findings || []),
            data.policyVersion || ''
        ]);
        return normalizeReview(get('SELECT * FROM catalog_reviews WHERE id = ?', [id]));
    },

    listReviews(listingId) {
        return all('SELECT * FROM catalog_reviews WHERE listing_id = ? ORDER BY created_at DESC', [listingId]).map(normalizeReview);
    },

    getReviewById(id) {
        return normalizeReview(get('SELECT * FROM catalog_reviews WHERE id = ?', [id]));
    },

    createAuditLog(data = {}) {
        run(`INSERT INTO catalog_audit_log (
            actor_user_id, entity_type, entity_id, action, before_state, after_state, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            data.actorUserId || null,
            data.entityType,
            data.entityId,
            data.action,
            JSON.stringify(data.beforeState || {}),
            JSON.stringify(data.afterState || {}),
            JSON.stringify(data.metadata || {})
        ]);
    },

    listPendingReviewQueue() {
        return all(`SELECT
                l.*,
                r.id AS revision_id,
                r.revision_number,
                r.review_status,
                r.submit_notes,
                r.policy_version,
                r.created_at AS revision_created_at,
                r.submitted_at
            FROM catalog_listing_revisions r
            JOIN catalog_listings l ON l.id = r.listing_id
            WHERE r.review_status = 'pending_review'
            ORDER BY COALESCE(r.submitted_at, r.created_at) ASC`).map((row) => ({
            listing: normalizeListing(row),
            revision: normalizeRevision({
                id: row.revision_id,
                listing_id: row.id,
                revision_number: row.revision_number,
                review_status: row.review_status,
                submit_notes: row.submit_notes,
                policy_version: row.policy_version,
                created_at: row.revision_created_at,
                submitted_at: row.submitted_at
            })
        }));
    }
};

module.exports = CatalogListingRepository;
