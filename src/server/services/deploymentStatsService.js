const { all, get } = require('../database');

function parseDays(value) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 30;
    return Math.min(parsed, 365);
}

function toInt(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function percentileFromSorted(values, p) {
    if (!Array.isArray(values) || !values.length) return 0;
    const safeP = Math.max(0, Math.min(1, p));
    const idx = Math.floor((values.length - 1) * safeP);
    return toInt(values[idx]);
}

function getDeploymentOperationalSummary(deploymentId) {
    const depId = parseInt(deploymentId, 10);
    if (!Number.isFinite(depId)) {
        return {
            chatCount: 0,
            messageCount: 0,
            lastMessageAt: null
        };
    }

    const chatRow = get(`SELECT
            COUNT(*) AS chat_count,
            MAX(COALESCE(last_message_at, updated_at, created_at)) AS last_message_at
        FROM chats
        WHERE deployment_id = ?`, [depId]) || {};
    const messageRow = get(`SELECT
            COUNT(*) AS message_count
        FROM chat_messages m
        JOIN chats c ON UPPER(c.id) = UPPER(m.chat_id)
        WHERE c.deployment_id = ?`, [depId]) || {};

    return {
        chatCount: toInt(chatRow.chat_count),
        messageCount: toInt(messageRow.message_count),
        lastMessageAt: chatRow.last_message_at || null
    };
}

function getDeploymentStats(deploymentId, opts = {}) {
    const depId = parseInt(deploymentId, 10);
    if (!Number.isFinite(depId)) {
        return {
            days: 30,
            since: null,
            totals: {
                chats: 0,
                activeChats: 0,
                messages: 0,
                userMessages: 0,
                assistantMessages: 0,
                requests: 0,
                errors: 0,
                errorRate: 0,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                avgLatencyMs: 0,
                p50LatencyMs: 0,
                p95LatencyMs: 0
            },
            timeline: []
        };
    }

    const days = parseDays(opts.days);
    const sinceIso = new Date(Date.now() - (days * 86400000)).toISOString();

    const chatRow = get(`SELECT
            COUNT(*) AS chat_count,
            SUM(CASE WHEN COALESCE(last_message_at, created_at) >= ? THEN 1 ELSE 0 END) AS active_chat_count
        FROM chats
        WHERE deployment_id = ?`, [sinceIso, depId]) || {};

    const messageRow = get(`SELECT
            COUNT(*) AS total_messages,
            SUM(CASE WHEN UPPER(m.sender_id) = UPPER(COALESCE(c.ai_agent_id, '')) THEN 1 ELSE 0 END) AS assistant_messages,
            SUM(CASE WHEN UPPER(m.sender_id) != UPPER(COALESCE(c.ai_agent_id, '')) THEN 1 ELSE 0 END) AS user_messages
        FROM chat_messages m
        JOIN chats c ON UPPER(c.id) = UPPER(m.chat_id)
        WHERE c.deployment_id = ?`, [depId]) || {};

    const usageRow = get(`SELECT
            COUNT(*) AS requests,
            SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS errors,
            SUM(e.prompt_tokens) AS prompt_tokens,
            SUM(e.completion_tokens) AS completion_tokens,
            SUM(e.total_tokens) AS total_tokens,
            AVG(e.duration_ms) AS avg_latency_ms
        FROM ai_model_usage_events e
        JOIN chats c ON UPPER(c.id) = UPPER(e.chat_id)
        WHERE c.deployment_id = ?
          AND e.created_at >= ?`, [depId, sinceIso]) || {};

    const durationValues = all(`SELECT e.duration_ms AS ms
        FROM ai_model_usage_events e
        JOIN chats c ON UPPER(c.id) = UPPER(e.chat_id)
        WHERE c.deployment_id = ?
          AND e.created_at >= ?
          AND e.duration_ms IS NOT NULL
        ORDER BY e.duration_ms ASC`, [depId, sinceIso]).map((row) => toInt(row.ms)).filter((value) => value > 0);

    const messageTimelineRows = all(`SELECT
            DATE(m.created_at) AS day,
            COUNT(*) AS messages
        FROM chat_messages m
        JOIN chats c ON UPPER(c.id) = UPPER(m.chat_id)
        WHERE c.deployment_id = ?
          AND m.created_at >= ?
        GROUP BY DATE(m.created_at)
        ORDER BY day ASC`, [depId, sinceIso]);

    const chatTimelineRows = all(`SELECT
            DATE(c.created_at) AS day,
            COUNT(*) AS chats
        FROM chats c
        WHERE c.deployment_id = ?
          AND c.created_at >= ?
        GROUP BY DATE(c.created_at)
        ORDER BY day ASC`, [depId, sinceIso]);

    const usageTimelineRows = all(`SELECT
            DATE(e.created_at) AS day,
            COUNT(*) AS requests,
            SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS errors,
            SUM(e.total_tokens) AS total_tokens
        FROM ai_model_usage_events e
        JOIN chats c ON UPPER(c.id) = UPPER(e.chat_id)
        WHERE c.deployment_id = ?
          AND e.created_at >= ?
        GROUP BY DATE(e.created_at)
        ORDER BY day ASC`, [depId, sinceIso]);

    const timelineMap = new Map();
    messageTimelineRows.forEach((row) => {
        const key = String(row.day || '').trim();
        if (!key) return;
        if (!timelineMap.has(key)) timelineMap.set(key, { day: key, chats: 0, messages: 0, requests: 0, errors: 0, totalTokens: 0 });
        timelineMap.get(key).messages = toInt(row.messages);
    });
    chatTimelineRows.forEach((row) => {
        const key = String(row.day || '').trim();
        if (!key) return;
        if (!timelineMap.has(key)) timelineMap.set(key, { day: key, chats: 0, messages: 0, requests: 0, errors: 0, totalTokens: 0 });
        timelineMap.get(key).chats = toInt(row.chats);
    });
    usageTimelineRows.forEach((row) => {
        const key = String(row.day || '').trim();
        if (!key) return;
        if (!timelineMap.has(key)) timelineMap.set(key, { day: key, chats: 0, messages: 0, requests: 0, errors: 0, totalTokens: 0 });
        const item = timelineMap.get(key);
        item.requests = toInt(row.requests);
        item.errors = toInt(row.errors);
        item.totalTokens = toInt(row.total_tokens);
    });

    const requests = toInt(usageRow.requests);
    const errors = toInt(usageRow.errors);
    const errorRate = requests > 0 ? Number(((errors / requests) * 100).toFixed(2)) : 0;

    return {
        days,
        since: sinceIso,
        totals: {
            chats: toInt(chatRow.chat_count),
            activeChats: toInt(chatRow.active_chat_count),
            messages: toInt(messageRow.total_messages),
            userMessages: toInt(messageRow.user_messages),
            assistantMessages: toInt(messageRow.assistant_messages),
            requests,
            errors,
            errorRate,
            promptTokens: toInt(usageRow.prompt_tokens),
            completionTokens: toInt(usageRow.completion_tokens),
            totalTokens: toInt(usageRow.total_tokens),
            avgLatencyMs: toInt(Math.round(Number(usageRow.avg_latency_ms || 0))),
            p50LatencyMs: percentileFromSorted(durationValues, 0.5),
            p95LatencyMs: percentileFromSorted(durationValues, 0.95)
        },
        timeline: [...timelineMap.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)))
    };
}

module.exports = {
    getDeploymentOperationalSummary,
    getDeploymentStats
};

