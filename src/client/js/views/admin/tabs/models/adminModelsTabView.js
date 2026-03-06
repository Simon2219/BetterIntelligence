import { fetchCatalogData } from './adminModelsCatalogService.js';
import { fetchSelectedModelUsage } from './adminModelsUsageService.js';
import {
    flattenProviderModels,
    buildModelsByKey,
    buildModelPickerItems
} from './adminModelsMappers.js';
import { normalizeModelsTabState } from './adminModelsState.js';
import { renderModelsTabMarkup } from './adminModelsCatalogRender.js';
import { renderSelectedModelUsage } from './adminModelsUsageTilesRender.js';
import { bindModelsTabEvents } from './adminModelsEvents.js';
import { confirmDialog } from '../../adminUtils.js';

export function createModelsTabRenderer({
    api,
    uiState,
    escapeHtml,
    showToast,
    showConfirm,
    formatNumber,
    formatCompactNumber,
    buildUsageTimeline,
    periodLabel,
    encodeModelKey,
    decodeModelKey,
    renderSplitValueTile,
    applyUsageTileMode,
    getUsageTileMode
}) {
    async function renderModelsTab(content) {
        const { providers, totals, usageTotals } = await fetchCatalogData({ api, uiState });
        const modelsFlat = flattenProviderModels(providers);
        const modelsByKey = buildModelsByKey(modelsFlat, encodeModelKey);
        normalizeModelsTabState({ uiState, modelsByKey });

        let usageHtml = '<div class="admin-model-usage-empty">Choose a model to load detailed statistics.</div>';
        try {
            const usagePayload = await fetchSelectedModelUsage({
                api,
                uiState,
                decodeModelKey,
                buildUsageTimeline
            });
            usageHtml = renderSelectedModelUsage({
                usagePayload,
                uiState,
                escapeHtml,
                formatCompactNumber,
                formatNumber,
                periodLabel
            });
        } catch (error) {
            usageHtml = `<p class="text-danger">${escapeHtml(error.message)}</p>`;
        }

        const modelPickerItems = buildModelPickerItems({
            modelsFlat,
            uiState,
            encodeModelKey,
            escapeHtml
        });

        content.innerHTML = renderModelsTabMarkup({
            providers,
            totals,
            usageTotals,
            uiState,
            modelPickerItems,
            usageHtml,
            renderSplitValueTile,
            encodeModelKey,
            escapeHtml,
            formatNumber
        });

        bindModelsTabEvents({
            content,
            uiState,
            modelsByKey,
            decodeModelKey,
            confirmDialog: (options) => confirmDialog({ showConfirm, ...options }),
            applyUsageTileMode,
            getUsageTileMode,
            api,
            showToast,
            renderModelsTab
        });
    }

    return { renderModelsTab };
}
