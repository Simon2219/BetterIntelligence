const { run, all, get } = require('../core/query');
const { generateId } = require('../core/ids');

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
        estimated_cost_usd: Number(row.estimated_cost_usd || 0),
        metadata: parseJson(row.metadata, {})
    };
}

function buildSinceClause(days, params) {
    const parsed = parseInt(days, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return '';
    params.push(`-${Math.min(parsed, 3650)} days`);
    return ` AND datetime(created_at) >= datetime('now', ?)`;
}

const UsageAttributionRepository = {
    createLegs(legs = []) {
        const rows = Array.isArray(legs) ? legs.filter(Boolean) : [];
        rows.forEach((leg) => {
            const id = leg.id || `ual_${generateId(12)}`;
            run(`INSERT INTO usage_attribution_legs (
                id, usage_event_id, leg_type, primary_subject_type, primary_subject_id, asset_type, asset_id,
                grant_id, parent_grant_id, deployment_id, actor_user_id, owner_user_id,
                prompt_tokens, completion_tokens, total_tokens, requests, estimated_cost_usd, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                id,
                leg.usageEventId,
                leg.legType,
                leg.primarySubjectType || null,
                leg.primarySubjectId || null,
                leg.assetType,
                leg.assetId,
                leg.grantId || null,
                leg.parentGrantId || null,
                leg.deploymentId || null,
                leg.actorUserId || null,
                leg.ownerUserId || null,
                Number(leg.promptTokens || 0),
                Number(leg.completionTokens || 0),
                Number(leg.totalTokens || 0),
                Number(leg.requests || 1),
                Number(leg.estimatedCostUsd || 0),
                JSON.stringify(leg.metadata || {})
            ]);
        });
        return rows.length;
    },

    listByUsageEvent(usageEventId) {
        return all(`SELECT * FROM usage_attribution_legs
            WHERE usage_event_id = ?
            ORDER BY created_at ASC, leg_type ASC`, [usageEventId]).map(normalize);
    },

    listByGrant(grantId, opts = {}) {
        if (!grantId) return [];
        const params = [grantId];
        let sql = `SELECT * FROM usage_attribution_legs
            WHERE grant_id = ?`;
        if (opts.legType) {
            sql += ' AND leg_type = ?';
            params.push(opts.legType);
        }
        sql += buildSinceClause(opts.days, params);
        sql += ' ORDER BY datetime(created_at) DESC, id DESC';
        if (opts.limit) {
            sql += ' LIMIT ?';
            params.push(Math.min(parseInt(opts.limit, 10) || 50, 500));
        }
        return all(sql, params).map(normalize);
    },

    listByParentGrant(parentGrantId, opts = {}) {
        if (!parentGrantId) return [];
        const params = [parentGrantId];
        let sql = `SELECT * FROM usage_attribution_legs
            WHERE parent_grant_id = ?`;
        if (opts.legType) {
            sql += ' AND leg_type = ?';
            params.push(opts.legType);
        }
        sql += buildSinceClause(opts.days, params);
        sql += ' ORDER BY datetime(created_at) DESC, id DESC';
        return all(sql, params).map(normalize);
    },

    listByAsset(assetType, assetId, opts = {}) {
        if (!assetType || !assetId) return [];
        const params = [assetType, assetId];
        let sql = `SELECT * FROM usage_attribution_legs
            WHERE asset_type = ? AND asset_id = ?`;
        if (opts.legType) {
            sql += ' AND leg_type = ?';
            params.push(opts.legType);
        }
        sql += buildSinceClause(opts.days, params);
        sql += ' ORDER BY datetime(created_at) DESC, id DESC';
        if (opts.limit) {
            sql += ' LIMIT ?';
            params.push(Math.min(parseInt(opts.limit, 10) || 100, 1000));
        }
        return all(sql, params).map(normalize);
    },

    summarizeByGrant(grantId, opts = {}) {
        if (!grantId) return [];
        const params = [grantId];
        let sql = `SELECT
                leg_type,
                COUNT(*) AS events,
                SUM(COALESCE(requests, 0)) AS requests,
                SUM(COALESCE(prompt_tokens, 0)) AS prompt_tokens,
                SUM(COALESCE(completion_tokens, 0)) AS completion_tokens,
                SUM(COALESCE(total_tokens, 0)) AS total_tokens,
                SUM(COALESCE(estimated_cost_usd, 0)) AS estimated_cost_usd,
                MAX(created_at) AS last_seen_at
            FROM usage_attribution_legs
            WHERE grant_id = ?`;
        sql += buildSinceClause(opts.days, params);
        sql += ' GROUP BY leg_type ORDER BY leg_type ASC';
        return all(sql, params).map(normalize);
    },

    summarizeByAsset(assetType, assetId, opts = {}) {
        if (!assetType || !assetId) return [];
        const params = [assetType, assetId];
        let sql = `SELECT
                leg_type,
                COUNT(*) AS events,
                SUM(COALESCE(requests, 0)) AS requests,
                SUM(COALESCE(prompt_tokens, 0)) AS prompt_tokens,
                SUM(COALESCE(completion_tokens, 0)) AS completion_tokens,
                SUM(COALESCE(total_tokens, 0)) AS total_tokens,
                SUM(COALESCE(estimated_cost_usd, 0)) AS estimated_cost_usd,
                MAX(created_at) AS last_seen_at
            FROM usage_attribution_legs
            WHERE asset_type = ? AND asset_id = ?`;
        sql += buildSinceClause(opts.days, params);
        sql += ' GROUP BY leg_type ORDER BY leg_type ASC';
        return all(sql, params).map(normalize);
    },

    getByEventAndType(usageEventId, legType) {
        return normalize(get(`SELECT * FROM usage_attribution_legs
            WHERE usage_event_id = ? AND leg_type = ?
            ORDER BY created_at DESC LIMIT 1`, [usageEventId, legType]));
    }
};

module.exports = UsageAttributionRepository;
