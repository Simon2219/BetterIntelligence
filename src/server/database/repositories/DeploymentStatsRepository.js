/**
 * DeploymentStatsRepository - Raw SQL queries for deployment statistics.
 */
const { all, get } = require('../core/query');

function getOperationalCounts(deploymentId) {
    const chatRow = get(`SELECT
            COUNT(*) AS chat_count,
            MAX(COALESCE(last_message_at, updated_at, created_at)) AS last_message_at
        FROM chats
        WHERE deployment_id = ?`, [deploymentId]) || {};
    const messageRow = get(`SELECT
            COUNT(*) AS message_count
        FROM chat_messages m
        JOIN chats c ON UPPER(c.id) = UPPER(m.chat_id)
        WHERE c.deployment_id = ?`, [deploymentId]) || {};
    return { chatRow, messageRow };
}

function getChatCounts(deploymentId, sinceIso) {
    return get(`SELECT
            COUNT(*) AS chat_count,
            SUM(CASE WHEN COALESCE(last_message_at, created_at) >= ? THEN 1 ELSE 0 END) AS active_chat_count
        FROM chats
        WHERE deployment_id = ?`, [sinceIso, deploymentId]) || {};
}

function getMessageCounts(deploymentId) {
    return get(`SELECT
            COUNT(*) AS total_messages,
            SUM(CASE WHEN UPPER(m.sender_id) = UPPER(COALESCE(c.ai_agent_id, '')) THEN 1 ELSE 0 END) AS assistant_messages,
            SUM(CASE WHEN UPPER(m.sender_id) != UPPER(COALESCE(c.ai_agent_id, '')) THEN 1 ELSE 0 END) AS user_messages
        FROM chat_messages m
        JOIN chats c ON UPPER(c.id) = UPPER(m.chat_id)
        WHERE c.deployment_id = ?`, [deploymentId]) || {};
}

function getUsageTotals(deploymentId, sinceIso) {
    return get(`SELECT
            COUNT(*) AS requests,
            SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS errors,
            SUM(e.prompt_tokens) AS prompt_tokens,
            SUM(e.completion_tokens) AS completion_tokens,
            SUM(e.total_tokens) AS total_tokens,
            AVG(e.duration_ms) AS avg_latency_ms
        FROM ai_model_usage_events e
        JOIN chats c ON UPPER(c.id) = UPPER(e.chat_id)
        WHERE c.deployment_id = ?
          AND e.created_at >= ?`, [deploymentId, sinceIso]) || {};
}

function getLatencyValues(deploymentId, sinceIso) {
    return all(`SELECT e.duration_ms AS ms
        FROM ai_model_usage_events e
        JOIN chats c ON UPPER(c.id) = UPPER(e.chat_id)
        WHERE c.deployment_id = ?
          AND e.created_at >= ?
          AND e.duration_ms IS NOT NULL
        ORDER BY e.duration_ms ASC`, [deploymentId, sinceIso]);
}

function getMessageTimeline(deploymentId, sinceIso) {
    return all(`SELECT
            DATE(m.created_at) AS day,
            COUNT(*) AS messages
        FROM chat_messages m
        JOIN chats c ON UPPER(c.id) = UPPER(m.chat_id)
        WHERE c.deployment_id = ?
          AND m.created_at >= ?
        GROUP BY DATE(m.created_at)
        ORDER BY day ASC`, [deploymentId, sinceIso]);
}

function getChatTimeline(deploymentId, sinceIso) {
    return all(`SELECT
            DATE(c.created_at) AS day,
            COUNT(*) AS chats
        FROM chats c
        WHERE c.deployment_id = ?
          AND c.created_at >= ?
        GROUP BY DATE(c.created_at)
        ORDER BY day ASC`, [deploymentId, sinceIso]);
}

function getUsageTimeline(deploymentId, sinceIso) {
    return all(`SELECT
            DATE(e.created_at) AS day,
            COUNT(*) AS requests,
            SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS errors,
            SUM(e.total_tokens) AS total_tokens
        FROM ai_model_usage_events e
        JOIN chats c ON UPPER(c.id) = UPPER(e.chat_id)
        WHERE c.deployment_id = ?
          AND e.created_at >= ?
        GROUP BY DATE(e.created_at)
        ORDER BY day ASC`, [deploymentId, sinceIso]);
}

module.exports = {
    getOperationalCounts,
    getChatCounts,
    getMessageCounts,
    getUsageTotals,
    getLatencyValues,
    getMessageTimeline,
    getChatTimeline,
    getUsageTimeline
};
