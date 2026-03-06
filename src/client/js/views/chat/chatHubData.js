export function createChatHubDataController({
    sidebarSummaryMaxChars = 30
} = {}) {
    function sortByRecent(left, right) {
        const l = new Date(left.last_message_at || left.updated_at || left.created_at || 0).getTime();
        const r = new Date(right.last_message_at || right.updated_at || right.created_at || 0).getTime();
        return r - l;
    }

    function shouldRefreshShortSummary(chat) {
        const msgCount = parseInt(chat?.message_count, 10) || 0;
        const summaryCount = parseInt(chat?.thread_summary_message_count, 10) || 0;
        return msgCount > 0 && msgCount <= 5 && summaryCount < msgCount;
    }

    function needsSummaryHydration(chat) {
        const hasSummary = String(chat?.thread_summary || '').trim().length > 0;
        if (!hasSummary) return true;
        return shouldRefreshShortSummary(chat);
    }

    function groupChatsByAgent(chats, kind) {
        const groups = new Map();
        chats.forEach((chat) => {
            const agent = chat.agent || {};
            const rawAgentId = agent.id || chat.ai_agent_id || chat.agent_id || 'unknown';
            const groupId = `${kind}:${String(rawAgentId).toUpperCase()}`;
            if (!groups.has(groupId)) {
                groups.set(groupId, {
                    id: groupId,
                    kind,
                    agent,
                    chats: [],
                    unreadCount: 0,
                    latest: 0
                });
            }
            const group = groups.get(groupId);
            if ((!group.agent?.id || !group.agent?.name) && agent) group.agent = agent;
            group.chats.push(chat);
            group.unreadCount += Math.max(0, parseInt(chat.unreadCount, 10) || 0);
            const ts = new Date(chat.last_message_at || chat.updated_at || chat.created_at || 0).getTime();
            if (!Number.isNaN(ts)) group.latest = Math.max(group.latest, ts);
        });
        return [...groups.values()]
            .map((group) => ({ ...group, chats: group.chats.slice().sort(sortByRecent) }))
            .sort((a, b) => b.latest - a.latest);
    }

    function getPersonalChatTitle(chat) {
        const title = String(chat?.title || '').trim();
        if (title && title.toLowerCase() !== 'conversation') return title;
        const summary = String(chat?.thread_summary || '').trim();
        if (summary) return summary.slice(0, sidebarSummaryMaxChars);
        const lastPreview = String(chat?.last_message_preview || chat?.last_message || '').trim();
        if (lastPreview) return lastPreview.slice(0, sidebarSummaryMaxChars);
        const msgCount = parseInt(chat?.message_count, 10) || 0;
        if (msgCount <= 1) return 'New conversation';
        const shortId = String(chat?.id || '').slice(-4).toUpperCase();
        return shortId ? `Chat ${shortId}` : 'Chat thread';
    }

    return {
        sortByRecent,
        shouldRefreshShortSummary,
        needsSummaryHydration,
        groupChatsByAgent,
        getPersonalChatTitle
    };
}
