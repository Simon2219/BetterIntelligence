function createUsageTotalsApi({ all, get }) {
    function isInternalSource(source) {
        const normalized = String(source || '').trim().toLowerCase();
        if (!normalized) return false;
        return normalized === 'chat-summary'
            || normalized.startsWith('internal')
            || normalized.startsWith('system');
    }

    function getUsageTotals(opts = {}) {
        const daysValue = parseInt(opts.days, 10);
        const days = Number.isFinite(daysValue) && daysValue > 0 ? Math.min(daysValue, 3650) : 30;
        const since = new Date(Date.now() - days * 86400000).toISOString();

        const rows = all(`SELECT
            provider_name,
            model_id,
            COUNT(*) as requests,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count,
            SUM(prompt_tokens) as prompt_tokens,
            SUM(completion_tokens) as completion_tokens,
            SUM(total_tokens) as total_tokens
            FROM ai_model_usage_events
            WHERE created_at >= ?
            GROUP BY provider_name, model_id`, [since]);

        const totals = get(`SELECT
            COUNT(*) as requests,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count,
            SUM(prompt_tokens) as prompt_tokens,
            SUM(completion_tokens) as completion_tokens,
            SUM(total_tokens) as total_tokens
            FROM ai_model_usage_events
            WHERE created_at >= ?`, [since]) || {};

        const sourceRows = all(`SELECT
            source,
            COUNT(*) as requests,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count,
            SUM(prompt_tokens) as prompt_tokens,
            SUM(completion_tokens) as completion_tokens,
            SUM(total_tokens) as total_tokens
            FROM ai_model_usage_events
            WHERE created_at >= ?
            GROUP BY source`, [since]);

        const modelSourceRows = all(`SELECT
            provider_name,
            model_id,
            source,
            COUNT(*) as requests,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count,
            SUM(prompt_tokens) as prompt_tokens,
            SUM(completion_tokens) as completion_tokens,
            SUM(total_tokens) as total_tokens
            FROM ai_model_usage_events
            WHERE created_at >= ?
            GROUP BY provider_name, model_id, source`, [since]);

        const byModel = {};
        rows.forEach((row) => {
            byModel[`${row.provider_name}:${row.model_id}`] = {
                requests: row.requests || 0,
                successCount: row.success_count || 0,
                errorCount: row.error_count || 0,
                promptTokens: row.prompt_tokens || 0,
                completionTokens: row.completion_tokens || 0,
                totalTokens: row.total_tokens || 0
            };
        });

        const byModelScope = {};
        modelSourceRows.forEach((row) => {
            const key = `${row.provider_name}:${row.model_id}`;
            if (!byModelScope[key]) {
                byModelScope[key] = {
                    user: { requests: 0, successCount: 0, errorCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                    internal: { requests: 0, successCount: 0, errorCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }
                };
            }
            const source = String(row.source || '').trim();
            const scope = isInternalSource(source) ? byModelScope[key].internal : byModelScope[key].user;
            scope.requests += row.requests || 0;
            scope.successCount += row.success_count || 0;
            scope.errorCount += row.error_count || 0;
            scope.promptTokens += row.prompt_tokens || 0;
            scope.completionTokens += row.completion_tokens || 0;
            scope.totalTokens += row.total_tokens || 0;
        });

        Object.keys(byModel).forEach((key) => {
            const scope = byModelScope[key] || {
                user: { requests: 0, successCount: 0, errorCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
                internal: { requests: 0, successCount: 0, errorCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }
            };
            byModel[key] = {
                ...byModel[key],
                userRequests: scope.user.requests,
                userSuccessCount: scope.user.successCount,
                userErrorCount: scope.user.errorCount,
                userPromptTokens: scope.user.promptTokens,
                userCompletionTokens: scope.user.completionTokens,
                userTotalTokens: scope.user.totalTokens,
                internalRequests: scope.internal.requests,
                internalSuccessCount: scope.internal.successCount,
                internalErrorCount: scope.internal.errorCount,
                internalPromptTokens: scope.internal.promptTokens,
                internalCompletionTokens: scope.internal.completionTokens,
                internalTotalTokens: scope.internal.totalTokens,
                byScope: scope
            };
        });

        const bySource = {};
        const user = { requests: 0, successCount: 0, errorCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
        const internal = { requests: 0, successCount: 0, errorCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        sourceRows.forEach((row) => {
            const source = String(row.source || 'unknown').trim() || 'unknown';
            const stats = {
                requests: row.requests || 0,
                successCount: row.success_count || 0,
                errorCount: row.error_count || 0,
                promptTokens: row.prompt_tokens || 0,
                completionTokens: row.completion_tokens || 0,
                totalTokens: row.total_tokens || 0
            };
            bySource[source] = stats;
            const bucket = isInternalSource(source) ? internal : user;
            bucket.requests += stats.requests;
            bucket.successCount += stats.successCount;
            bucket.errorCount += stats.errorCount;
            bucket.promptTokens += stats.promptTokens;
            bucket.completionTokens += stats.completionTokens;
            bucket.totalTokens += stats.totalTokens;
        });

        return {
            days,
            since,
            byModel,
            bySource,
            byScope: {
                user,
                internal
            },
            totals: {
                requests: totals.requests || 0,
                successCount: totals.success_count || 0,
                errorCount: totals.error_count || 0,
                promptTokens: totals.prompt_tokens || 0,
                completionTokens: totals.completion_tokens || 0,
                totalTokens: totals.total_tokens || 0
            }
        };
    }

    return {
        getUsageTotals
    };
}

module.exports = {
    createUsageTotalsApi
};
