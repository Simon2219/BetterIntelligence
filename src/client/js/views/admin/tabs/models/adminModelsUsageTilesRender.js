import { renderUsageChartHtml } from './adminModelsUsageChartsRender.js';

export function renderSelectedModelUsage({
    usagePayload,
    uiState,
    escapeHtml,
    formatCompactNumber,
    formatNumber,
    periodLabel
}) {
    if (!usagePayload) {
        return '<div class="admin-model-usage-empty">Choose a model to load detailed statistics.</div>';
    }

    const { selected, usageData, totalsUsage, fullPoints, bucket } = usagePayload;
    const activeMetric = ['requests', 'tokens', 'errors'].includes(uiState.modelUsageMetric)
        ? uiState.modelUsageMetric
        : null;

    const chartHtml = renderUsageChartHtml({
        fullPoints,
        bucket,
        activeMetric,
        escapeHtml,
        formatNumber,
        formatCompactNumber,
        periodLabel
    });

    return `
        <div class="admin-model-usage">
            <div class="admin-model-usage__header">
                <h4>${escapeHtml(usageData?.model?.displayName || selected.modelId)}</h4>
                <p>${escapeHtml(usageData?.model?.providerDisplayName || usageData?.model?.providerName || selected.providerName)} - ${escapeHtml(selected.modelId)}</p>
            </div>
            <div class="admin-model-usage__stats">
                <button type="button" class="admin-model-usage-stat admin-model-usage-stat--requests ${activeMetric === 'requests' ? 'admin-model-usage-stat--active' : ''}" data-usage-metric="requests" aria-pressed="${activeMetric === 'requests' ? 'true' : 'false'}">
                    <span class="admin-model-usage-stat__label">Requests</span>
                    <strong>${formatCompactNumber(totalsUsage.requests || 0)}</strong>
                </button>
                <button type="button" class="admin-model-usage-stat admin-model-usage-stat--tokens ${activeMetric === 'tokens' ? 'admin-model-usage-stat--active' : ''}" data-usage-metric="tokens" aria-pressed="${activeMetric === 'tokens' ? 'true' : 'false'}">
                    <span class="admin-model-usage-stat__label">Tokens</span>
                    <strong>${formatCompactNumber(totalsUsage.totalTokens || 0)}</strong>
                </button>
                <button type="button" class="admin-model-usage-stat admin-model-usage-stat--errors ${activeMetric === 'errors' ? 'admin-model-usage-stat--active' : ''}" data-usage-metric="errors" aria-pressed="${activeMetric === 'errors' ? 'true' : 'false'}">
                    <span class="admin-model-usage-stat__label">Errors</span>
                    <strong>${formatCompactNumber(totalsUsage.errorCount || 0)}</strong>
                </button>
            </div>
            ${chartHtml}
        </div>
    `;
}

