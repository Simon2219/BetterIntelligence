export async function fetchSelectedModelUsage({
    api,
    uiState,
    decodeModelKey,
    buildUsageTimeline
}) {
    if (uiState.modelsSubView !== 'stats' || !uiState.selectedModelKey) return null;

    const selected = decodeModelKey(uiState.selectedModelKey);
    if (!selected?.providerName || !selected?.modelId) return null;

    const days = parseInt(uiState.modelUsageDays, 10) || 30;
    const bucket = uiState.modelUsageBucket === 'hour' ? 'hour' : 'day';
    const { data: usageData } = await api(
        `/admin/models/${encodeURIComponent(selected.providerName)}/${encodeURIComponent(selected.modelId)}/usage?days=${days}&bucket=${bucket}`
    );

    const points = usageData?.usage?.points || [];
    const totalsUsage = usageData?.usage?.totals || {};
    const fullPoints = buildUsageTimeline(points, usageData?.usage, bucket, days);

    return {
        selected,
        usageData,
        totalsUsage,
        fullPoints,
        days,
        bucket
    };
}

