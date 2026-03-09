const { run, all, get } = require('../core/query');
const { generateId } = require('../core/ids');

function parseJson(value, fallback) {
    try {
        return JSON.parse(value || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

function normalizeGrant(row) {
    if (!row) return null;
    return {
        ...row,
        feature_gates: parseJson(row.feature_gates, {}),
        quota_limits: parseJson(row.quota_limits, {}),
        metadata: parseJson(row.metadata, {}),
        rolls_to_latest_approved: row.rolls_to_latest_approved === undefined
            ? true
            : row.rolls_to_latest_approved !== 0
    };
}

function normalizeRequest(row) {
    if (!row) return null;
    return {
        ...row
    };
}

const CatalogEntitlementRepository = {
    getGrantById(id) {
        return normalizeGrant(get('SELECT * FROM catalog_grants WHERE id = ?', [id]));
    },

    listGrantsForSubject(subjectType, subjectId, opts = {}) {
        const params = [subjectType, subjectId];
        let sql = 'SELECT * FROM catalog_grants WHERE subject_type = ? AND subject_id = ?';
        if (opts.status) {
            sql += ' AND status = ?';
            params.push(opts.status);
        }
        if (opts.assetType) {
            sql += ' AND asset_type = ?';
            params.push(opts.assetType);
        }
        sql += ' ORDER BY created_at DESC';
        return all(sql, params).map(normalizeGrant);
    },

    listGrantsByOwner(ownerType, ownerId, opts = {}) {
        const params = [ownerType || 'user', ownerId];
        let sql = 'SELECT * FROM catalog_grants WHERE owner_type = ? AND owner_id = ?';
        if (opts.status) {
            sql += ' AND status = ?';
            params.push(opts.status);
        }
        if (opts.assetType) {
            sql += ' AND asset_type = ?';
            params.push(opts.assetType);
        }
        sql += ' ORDER BY created_at DESC';
        return all(sql, params).map(normalizeGrant);
    },

    listChildGrants(parentGrantId, opts = {}) {
        if (!parentGrantId) return [];
        const params = [parentGrantId];
        let sql = 'SELECT * FROM catalog_grants WHERE parent_grant_id = ?';
        if (opts.status) {
            sql += ' AND status = ?';
            params.push(opts.status);
        }
        if (opts.assetType) {
            sql += ' AND asset_type = ?';
            params.push(opts.assetType);
        }
        if (opts.subjectType) {
            sql += ' AND subject_type = ?';
            params.push(opts.subjectType);
        }
        if (opts.subjectId) {
            sql += ' AND subject_id = ?';
            params.push(String(opts.subjectId));
        }
        if (opts.grantScope) {
            sql += ' AND grant_scope = ?';
            params.push(opts.grantScope);
        }
        sql += ' ORDER BY created_at DESC';
        return all(sql, params).map(normalizeGrant);
    },

    findMatchingGrant({ subjectType, subjectId, assetType, assetId, listingId = null, statuses = ['active'] } = {}) {
        if (!subjectType || !subjectId || !assetType || !assetId) return null;
        const params = [subjectType, subjectId, assetType, assetId];
        let sql = `SELECT * FROM catalog_grants
            WHERE subject_type = ? AND subject_id = ?
              AND asset_type = ? AND asset_id = ?`;
        if (listingId) {
            sql += ' AND listing_id = ?';
            params.push(listingId);
        }
        if (statuses?.length) {
            sql += ` AND status IN (${statuses.map(() => '?').join(', ')})`;
            params.push(...statuses);
        }
        sql += ' ORDER BY created_at DESC LIMIT 1';
        return normalizeGrant(get(sql, params));
    },

    findMatchingChildGrant({ parentGrantId, subjectType, subjectId, assetType, assetId, grantScope = null, statuses = ['active'] } = {}) {
        if (!parentGrantId || !subjectType || !subjectId || !assetType || !assetId) return null;
        const params = [parentGrantId, subjectType, String(subjectId), assetType, assetId];
        let sql = `SELECT * FROM catalog_grants
            WHERE parent_grant_id = ?
              AND subject_type = ? AND subject_id = ?
              AND asset_type = ? AND asset_id = ?`;
        if (grantScope) {
            sql += ' AND grant_scope = ?';
            params.push(grantScope);
        }
        if (statuses?.length) {
            sql += ` AND status IN (${statuses.map(() => '?').join(', ')})`;
            params.push(...statuses);
        }
        sql += ' ORDER BY created_at DESC LIMIT 1';
        return normalizeGrant(get(sql, params));
    },

    createGrant(data = {}) {
        const id = data.id || `cgr_${generateId(12)}`;
        run(`INSERT INTO catalog_grants (
            id, owner_type, owner_id, listing_id, revision_id, plan_id, asset_type, asset_id,
            subject_type, subject_id, grant_type, status, feature_gates, quota_limits, period_kind,
            external_ref, starts_at, ends_at, metadata, created_by, parent_grant_id, grant_scope,
            billing_subject_type, billing_subject_id, actor_scope, rolls_to_latest_approved
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id,
            data.ownerType || 'user',
            data.ownerId || null,
            data.listingId || null,
            data.revisionId || null,
            data.planId || null,
            data.assetType,
            data.assetId,
            data.subjectType || 'user',
            String(data.subjectId || ''),
            data.grantType || 'manual',
            data.status || 'active',
            JSON.stringify(data.featureGates || {}),
            JSON.stringify(data.quotaLimits || {}),
            data.periodKind || 'monthly',
            data.externalRef || '',
            data.startsAt || null,
            data.endsAt || null,
            JSON.stringify(data.metadata || {}),
            data.createdBy || null,
            data.parentGrantId || null,
            data.grantScope || 'direct',
            data.billingSubjectType || data.subjectType || 'user',
            data.billingSubjectId !== undefined && data.billingSubjectId !== null
                ? String(data.billingSubjectId)
                : String(data.subjectId || ''),
            data.actorScope || '',
            data.rollsToLatestApproved === false ? 0 : 1
        ]);
        return this.getGrantById(id);
    },

    revokeGrant(id, opts = {}) {
        run(`UPDATE catalog_grants
            SET status = ?, revoked_at = datetime('now'), updated_at = datetime('now'),
                metadata = ?
            WHERE id = ?`, [
            opts.status || 'revoked',
            JSON.stringify(opts.metadata || {}),
            id
        ]);
        return this.getGrantById(id);
    },

    listAccessRequestsForRequester(userId, opts = {}) {
        const params = [userId];
        let sql = 'SELECT * FROM catalog_access_requests WHERE requester_user_id = ?';
        if (opts.status) {
            sql += ' AND status = ?';
            params.push(opts.status);
        }
        sql += ' ORDER BY created_at DESC';
        return all(sql, params).map(normalizeRequest);
    },

    listAccessRequestsForOwner(ownerUserId, opts = {}) {
        const params = [ownerUserId];
        let sql = `SELECT r.*
            FROM catalog_access_requests r
            JOIN catalog_listings l ON l.id = r.listing_id
            WHERE l.owner_type = 'user' AND l.owner_id = ?`;
        if (opts.status) {
            sql += ' AND r.status = ?';
            params.push(opts.status);
        }
        sql += ' ORDER BY r.created_at DESC';
        return all(sql, params).map(normalizeRequest);
    },

    getAccessRequestById(id) {
        return normalizeRequest(get('SELECT * FROM catalog_access_requests WHERE id = ?', [id]));
    },

    createAccessRequest(data = {}) {
        const id = data.id || `car_${generateId(12)}`;
        run(`INSERT INTO catalog_access_requests (
            id, listing_id, revision_id, requester_user_id, requested_subject_type, requested_subject_id,
            plan_id, note, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id,
            data.listingId,
            data.revisionId || null,
            data.requesterUserId,
            data.requestedSubjectType || 'user',
            String(data.requestedSubjectId || data.requesterUserId || ''),
            data.planId || null,
            data.note || '',
            data.status || 'pending'
        ]);
        return this.getAccessRequestById(id);
    },

    resolveAccessRequest(id, data = {}) {
        run(`UPDATE catalog_access_requests
            SET status = ?, decision_reason = ?, resolved_by = ?, updated_at = datetime('now'),
                resolved_at = datetime('now')
            WHERE id = ?`, [
            data.status || 'approved',
            data.decisionReason || '',
            data.resolvedBy || null,
            id
        ]);
        return this.getAccessRequestById(id);
    },

    listUsageCounters(grantId, periodKey = null) {
        const sql = periodKey
            ? 'SELECT * FROM catalog_usage_counters WHERE grant_id = ? AND period_key = ? ORDER BY metric_key'
            : 'SELECT * FROM catalog_usage_counters WHERE grant_id = ? ORDER BY period_key DESC, metric_key ASC';
        const params = periodKey ? [grantId, periodKey] : [grantId];
        return all(sql, params);
    },

    getUsageCounter(grantId, periodKey, metricKey) {
        return get('SELECT * FROM catalog_usage_counters WHERE grant_id = ? AND period_key = ? AND metric_key = ?', [grantId, periodKey, metricKey]);
    },

    incrementUsageCounter(grantId, periodKey, metricKey, delta = 1) {
        const amount = parseInt(delta, 10) || 0;
        const existing = this.getUsageCounter(grantId, periodKey, metricKey);
        if (!existing) {
            run(`INSERT INTO catalog_usage_counters (
                grant_id, period_key, metric_key, usage_value, updated_at
            ) VALUES (?, ?, ?, ?, datetime('now'))`, [grantId, periodKey, metricKey, amount]);
        } else {
            run(`UPDATE catalog_usage_counters
                SET usage_value = usage_value + ?, updated_at = datetime('now')
                WHERE grant_id = ? AND period_key = ? AND metric_key = ?`, [amount, grantId, periodKey, metricKey]);
        }
        return this.getUsageCounter(grantId, periodKey, metricKey);
    }
};

module.exports = CatalogEntitlementRepository;
