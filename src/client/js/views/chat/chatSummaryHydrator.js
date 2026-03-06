export function createSummaryHydrator({
    api,
    shouldRefreshShortSummary,
    needsSummaryHydration,
    summaryHydrationInFlight,
    summaryHydrationStamp,
    rerenderHub
} = {}) {
    return function hydrateSidebarSummaries({
        chats,
        container,
        selectedChatId
    } = {}) {
        const summaryJobs = (chats || [])
            .filter((chat) => needsSummaryHydration(chat))
            .map((chat) => ({
                chatId: String(chat.id || '').trim(),
                msgCount: parseInt(chat.message_count, 10) || 0,
                force: shouldRefreshShortSummary(chat)
            }))
            .filter((job) => job.chatId)
            .filter((job) => {
                if (summaryHydrationInFlight.has(job.chatId)) return false;
                const lastStamp = summaryHydrationStamp.get(job.chatId) || 0;
                return job.msgCount > lastStamp || lastStamp === 0;
            })
            .slice(0, 2);

        if (!summaryJobs.length) return;

        summaryJobs.forEach((job) => summaryHydrationInFlight.add(job.chatId));
        Promise.allSettled(summaryJobs.map((job) => api(`/chats/${encodeURIComponent(job.chatId)}/summary`, {
            method: 'POST',
            body: JSON.stringify({
                reason: 'sidebar_preview',
                force: job.force
            })
        }))).then((results) => {
            let shouldRefresh = false;
            results.forEach((result, idx) => {
                const job = summaryJobs[idx];
                summaryHydrationInFlight.delete(job.chatId);
                const resolvedCount = result.status === 'fulfilled'
                    ? parseInt(result.value?.data?.summaryMessageCount, 10) || job.msgCount
                    : job.msgCount;
                summaryHydrationStamp.set(job.chatId, Math.max(job.msgCount, resolvedCount));
                if (result.status === 'fulfilled' && String(result.value?.data?.summary || '').trim()) {
                    shouldRefresh = true;
                }
            });
            if (shouldRefresh && container?.isConnected) {
                rerenderHub?.(container, selectedChatId).catch(() => {});
            }
        }).catch(() => {
            summaryJobs.forEach((job) => summaryHydrationInFlight.delete(job.chatId));
        });
    };
}
