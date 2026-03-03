const { run, all, get } = require('../core/query');


const AnalyticsRepository = {
    record(agentId, eventType, metadata = {}) {
        run(`INSERT INTO agent_analytics (agent_id, event_type, metadata) VALUES (?, ?, ?)`,
            [agentId, eventType, JSON.stringify(metadata)]);
    },

    getStats(agentId, days = 30) {
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const total = get(`SELECT COUNT(*) as c FROM agent_analytics WHERE agent_id = ? AND created_at >= ?`, [agentId, since]);
        const byType = all(`SELECT event_type, COUNT(*) as c FROM agent_analytics WHERE agent_id = ? AND created_at >= ? GROUP BY event_type`, [agentId, since]);
        const daily = all(`SELECT DATE(created_at) as day, event_type, COUNT(*) as c FROM agent_analytics WHERE agent_id = ? AND created_at >= ? GROUP BY DATE(created_at), event_type ORDER BY day`, [agentId, since]);
        const tokenUsage = all(`SELECT DATE(created_at) as day, SUM(json_extract(metadata, '$.promptTokens')) as prompt_tokens, SUM(json_extract(metadata, '$.completionTokens')) as completion_tokens FROM agent_analytics WHERE agent_id = ? AND event_type = 'response' AND created_at >= ? GROUP BY DATE(created_at) ORDER BY day`, [agentId, since]);
        const avgResponseTime = get(`SELECT AVG(json_extract(metadata, '$.durationMs')) as avg_ms FROM agent_analytics WHERE agent_id = ? AND event_type = 'response' AND created_at >= ?`, [agentId, since]);
        const conversations = get(`SELECT COUNT(DISTINCT json_extract(metadata, '$.conversationId')) as c FROM agent_analytics WHERE agent_id = ? AND event_type = 'invoke' AND created_at >= ?`, [agentId, since]);
        const messages = get(`SELECT COUNT(*) as c FROM agent_analytics WHERE agent_id = ? AND event_type = 'invoke' AND created_at >= ?`, [agentId, since]);
        const errors = get(`SELECT COUNT(*) as c FROM agent_analytics WHERE agent_id = ? AND event_type = 'error' AND created_at >= ?`, [agentId, since]);

        const responseTimes = all(`SELECT json_extract(metadata, '$.durationMs') as ms FROM agent_analytics WHERE agent_id = ? AND event_type = 'response' AND created_at >= ? AND json_extract(metadata, '$.durationMs') IS NOT NULL ORDER BY ms`, [agentId, since]).map(r => r.ms).filter(Boolean);
        const p50 = responseTimes.length ? responseTimes[Math.floor(responseTimes.length * 0.5)] : 0;
        const p95 = responseTimes.length ? responseTimes[Math.floor(responseTimes.length * 0.95)] : 0;

        const totalEvents = (total?.c || 0);
        const errorCount = errors?.c || 0;
        const errorRate = totalEvents > 0 ? ((errorCount / totalEvents) * 100).toFixed(1) : '0.0';

        const dailyConversations = all(`SELECT DATE(created_at) as day, COUNT(DISTINCT json_extract(metadata, '$.conversationId')) as c FROM agent_analytics WHERE agent_id = ? AND event_type = 'invoke' AND created_at >= ? GROUP BY DATE(created_at) ORDER BY day`, [agentId, since]);

        return {
            total: totalEvents,
            byType: byType || [],
            daily: daily || [],
            dailyConversations: dailyConversations || [],
            tokenUsage: tokenUsage || [],
            avgResponseTimeMs: Math.round(avgResponseTime?.avg_ms || 0),
            p50ResponseMs: Math.round(p50),
            p95ResponseMs: Math.round(p95),
            conversations: conversations?.c || 0,
            messages: messages?.c || 0,
            errors: errorCount,
            errorRate
        };
    }
};


module.exports = AnalyticsRepository;
