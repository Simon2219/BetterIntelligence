const { run, all, get } = require('../core/query');
const SettingsRepository = require('./SettingsRepository');

const { createDisplayNamesApi } = require('./aiModel/displayNames');
const { createCatalogReadWriteApi } = require('./aiModel/catalogReadWrite');
const { createUsageWriteApi } = require('./aiModel/usageWrite');
const { createUsageTotalsApi } = require('./aiModel/usageTotals');
const { createUsageTimelineApi } = require('./aiModel/usageTimeline');
const { normalizeModelRowForApi } = require('./aiModel/mappers');

const displayNamesApi = createDisplayNamesApi(SettingsRepository);
const catalogApi = createCatalogReadWriteApi({ run, all, get, deriveModelDisplayName: displayNamesApi.deriveModelDisplayName });
const usageWriteApi = createUsageWriteApi({ run, upsertModel: catalogApi.upsertModel });
const usageTotalsApi = createUsageTotalsApi({ all, get });
const usageTimelineApi = createUsageTimelineApi({ all, get });

const AIModelRepository = {
    deriveDisplayName(modelId) {
        return displayNamesApi.deriveModelDisplayName(modelId);
    },

    deriveProviderDisplayName(providerName) {
        return displayNamesApi.deriveProviderDisplayName(providerName);
    },

    getProviderDisplayName(providerName, opts = {}) {
        return displayNamesApi.getProviderDisplayName(providerName, opts);
    },

    setProviderDisplayName(providerName, displayName) {
        return displayNamesApi.setProviderDisplayName(providerName, displayName);
    },

    listProviderDisplayNames() {
        return displayNamesApi.listProviderDisplayNames();
    },

    upsertModel(providerName, modelId, data = {}) {
        return catalogApi.upsertModel(providerName, modelId, data);
    },

    getByProviderAndModel(providerName, modelId) {
        return catalogApi.getByProviderAndModel(providerName, modelId);
    },

    getDisplayName(providerName, modelId, opts = {}) {
        return catalogApi.getDisplayName(providerName, modelId, opts);
    },

    syncProviderModels(providerName, models, opts = {}) {
        return catalogApi.syncProviderModels(providerName, models, opts);
    },

    listModels(filters = {}) {
        return catalogApi.listModels(filters);
    },

    listByProvider(providerName, filters = {}) {
        return catalogApi.listByProvider(providerName, filters);
    },

    setModelState(providerName, modelId, updates = {}) {
        return catalogApi.setModelState(providerName, modelId, updates);
    },

    recordUsage(event = {}) {
        return usageWriteApi.recordUsage(event);
    },

    getUsageTotals(opts = {}) {
        return usageTotalsApi.getUsageTotals(opts);
    },

    getUsageTimeline(providerName, modelId, opts = {}) {
        return usageTimelineApi.getUsageTimeline(providerName, modelId, opts);
    },

    normalizeModelRowForApi(row) {
        return normalizeModelRowForApi(row);
    }
};

module.exports = AIModelRepository;
