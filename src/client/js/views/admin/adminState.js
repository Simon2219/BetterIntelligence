export const ADMIN_COLOR_KEYS = [
    'bg-primary', 'bg-secondary', 'bg-card', 'bg-hover',
    'text-primary', 'text-secondary', 'text-muted',
    'accent', 'accent-primary', 'accent-secondary', 'accent-hover',
    'success', 'danger', 'warning', 'info', 'border'
];

export function createAdminUiState() {
    return {
        activeTab: 'dashboard',
        previewTheme: document.documentElement.getAttribute('data-theme') || 'dark',
        selectedPaletteId: null,
        paletteListCollapsed: false,
        showNewPaletteForm: false,
        newPaletteName: '',
        colorDraft: {},
        colorDraftPaletteId: null,
        assignmentDraft: { dark: null, light: null },
        modelsSubView: 'config',
        modelUsageDays: 30,
        modelCatalogUsageDays: 30,
        modelUsageBucket: 'day',
        modelUsageMetric: null,
        selectedModelKey: null,
        modelsCatalogSynced: false,
        usageTileModes: {}
    };
}
