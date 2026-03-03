function createUsageTimelineApi({ all, get }) {
    function getUsageTimeline(providerName, modelId, opts = {}) {
        const provider = String(providerName || '').trim().toLowerCase();
        const id = String(modelId || '').trim();
        if (!provider || !id) {
            return {
                days: 30,
                bucket: 'day',
                points: [],
                totals: { requests: 0, totalTokens: 0, successCount: 0, errorCount: 0 }
            };
        }

        const daysValue = parseInt(opts.days, 10);
        const days = Number.isFinite(daysValue) && daysValue > 0 ? Math.min(daysValue, 3650) : 30;
        const bucket = opts.bucket === 'hour' ? 'hour' : 'day';
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const periodExpr = bucket === 'hour'
            ? "strftime('%Y-%m-%d %H:00', created_at)"
            : "strftime('%Y-%m-%d', created_at)";

        const points = all(`SELECT
            ${periodExpr} as period,
            COUNT(*) as requests,
            SUM(total_tokens) as total_tokens,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count
            FROM ai_model_usage_events
            WHERE provider_name = ? AND model_id = ? AND created_at >= ?
            GROUP BY period
            ORDER BY period ASC`, [provider, id, since]).map((row) => ({
            period: row.period,
            requests: row.requests || 0,
            totalTokens: row.total_tokens || 0,
            successCount: row.success_count || 0,
            errorCount: row.error_count || 0
        }));

        const totals = get(`SELECT
            COUNT(*) as requests,
            SUM(total_tokens) as total_tokens,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count
            FROM ai_model_usage_events
            WHERE provider_name = ? AND model_id = ? AND created_at >= ?`,
        [provider, id, since]) || {};

        return {
            days,
            bucket,
            since,
            points,
            totals: {
                requests: totals.requests || 0,
                totalTokens: totals.total_tokens || 0,
                successCount: totals.success_count || 0,
                errorCount: totals.error_count || 0
            }
        };
    }

    return {
        getUsageTimeline
    };
}

module.exports = {
    createUsageTimelineApi
};
