/**
 * DeploymentStatsService - Orchestrates deployment statistics queries.
 * All raw SQL is in DeploymentStatsRepository.
 */
const DeploymentStatsRepository = require('../database/repositories/DeploymentStatsRepository');

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
        return { chatCount: 0, messageCount: 0, lastMessageAt: null };
    }

    const { chatRow, messageRow } = DeploymentStatsRepository.getOperationalCounts(depId);

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
            days: 30, since: null,
            totals: {
                chats: 0, activeChats: 0, messages: 0, userMessages: 0, assistantMessages: 0,
                requests: 0, errors: 0, errorRate: 0, promptTokens: 0, completionTokens: 0,
                totalTokens: 0, avgLatencyMs: 0, p50LatencyMs: 0, p95LatencyMs: 0
            },
            timeline: []
        };
    }

    const days = parseDays(opts.days);
    const sinceIso = new Date(Date.now() - (days * 86400000)).toISOString();

    const chatRow = DeploymentStatsRepository.getChatCounts(depId, sinceIso);
    const messageRow = DeploymentStatsRepository.getMessageCounts(depId);
    const usageRow = DeploymentStatsRepository.getUsageTotals(depId, sinceIso);
    const durationValues = DeploymentStatsRepository.getLatencyValues(depId, sinceIso)
        .map((row) => toInt(row.ms))
        .filter((value) => value > 0);

    const messageTimelineRows = DeploymentStatsRepository.getMessageTimeline(depId, sinceIso);
    const chatTimelineRows = DeploymentStatsRepository.getChatTimeline(depId, sinceIso);
    const usageTimelineRows = DeploymentStatsRepository.getUsageTimeline(depId, sinceIso);

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
