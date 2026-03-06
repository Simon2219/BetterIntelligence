export async function fetchCatalogData({ api, uiState }) {
    const allTimeDays = 3650;
    if (!uiState.modelsCatalogSynced) {
        try {
            await api('/admin/models/refresh', {
                method: 'POST',
                body: JSON.stringify({ days: allTimeDays })
            });
        } catch (err) {
            console.warn('Failed to sync model catalog on load', err);
        } finally {
            uiState.modelsCatalogSynced = true;
        }
    }

    const { data } = await api(`/admin/models?days=${allTimeDays}`);
    const providers = data?.providers || [];
    const totals = data?.totals || {};

    const usageWindowDays = parseInt(uiState.modelCatalogUsageDays, 10) || 30;
    let usageTotals = totals;
    if (usageWindowDays !== allTimeDays) {
        try {
            const { data: windowedData } = await api(`/admin/models?days=${usageWindowDays}`);
            usageTotals = windowedData?.totals || usageTotals;
        } catch (err) {
            console.warn('Failed to load model usage timeframe totals', err);
        }
    }

    return {
        allTimeDays,
        providers,
        totals,
        usageWindowDays,
        usageTotals
    };
}

