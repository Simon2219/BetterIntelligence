import { ADMIN_COLOR_KEYS, createAdminUiState } from './adminState.js';
import {
    formatNumber,
    formatCompactNumber,
    createUsageTileModeGetters,
    createRenderSplitValueTile,
    buildUsageTimeline,
    periodLabel,
    encodeModelKey,
    decodeModelKey
} from './adminUtils.js';
import { createAdminRealtimeController } from './adminRealtime.js';
import { renderDashboardTab } from './tabs/adminDashboardTab.js';
import { renderRolesTab } from './tabs/adminRolesTab.js';
import { renderColorsTab } from './tabs/adminColorsTab.js';
import { createModelsTabRenderer } from './tabs/models/adminModelsTabView.js';
import { renderCatalogTab } from './tabs/adminCatalogTab.js';
import { renderSettingsTab } from './tabs/adminSettingsTab.js';

export function createAdminView(deps) {
    const {
        api,
        showToast,
        showConfirm,
        escapeHtml,
        applyAppearance,
        appearanceClient,
        getSocketClients
    } = deps;

    const uiState = createAdminUiState();
    const { getUsageTileMode, applyUsageTileMode } = createUsageTileModeGetters(uiState);
    const renderSplitValueTile = createRenderSplitValueTile({ escapeHtml, getUsageTileMode });

    const modelsRenderer = createModelsTabRenderer({
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
    });

    const realtimeController = createAdminRealtimeController({ uiState, getSocketClients });

    async function renderTab(container, tab) {
        if (uiState.activeTab === 'models' && tab !== 'models') {
            realtimeController.unsubscribeModelsRealtime();
        }

        uiState.activeTab = tab;
        container.querySelectorAll('.admin-tab').forEach((button) => {
            button.classList.toggle('admin-tab--active', button.dataset.tab === tab);
        });

        const content = container.querySelector('#admin-content');
        if (!content) return;
        content.innerHTML = '';

        if (tab === 'dashboard') {
            await renderDashboardTab({ content, api, escapeHtml });
            return;
        }

        if (tab === 'roles') {
            await renderRolesTab({ content, api, escapeHtml, showToast });
            return;
        }

        if (tab === 'colors') {
            try {
                await renderColorsTab({
                    content,
                    api,
                    uiState,
                    ADMIN_COLOR_KEYS,
                    escapeHtml,
                    showToast,
                    showConfirm,
                    applyAppearance,
                    appearanceClient
                });
            } catch (error) {
                content.innerHTML = `<p class="text-danger">${escapeHtml(error.message)}</p>`;
            }
            return;
        }

        if (tab === 'models') {
            try {
                await modelsRenderer.renderModelsTab(content);
                realtimeController.bindModelsRealtime(content, modelsRenderer.renderModelsTab);
            } catch (error) {
                content.innerHTML = `<p class="text-danger">${escapeHtml(error.message)}</p>`;
            }
            return;
        }

        if (tab === 'settings') {
            await renderSettingsTab({ content, api, escapeHtml, showToast });
            return;
        }

        if (tab === 'catalog') {
            await renderCatalogTab({ content, api, escapeHtml, showToast });
        }
    }

    async function renderAdmin(container) {
        container.innerHTML = `
            <div class="container">
                <h2 class="admin-title">Admin Panel</h2>
                <div class="admin-main-nav">
                    <button class="admin-main-tab admin-tab admin-tab--active" data-tab="dashboard" data-admin-tab>Dashboard</button>
                    <button class="admin-main-tab admin-tab" data-tab="roles" data-admin-tab>Roles & Permissions</button>
                    <button class="admin-main-tab admin-tab" data-tab="colors" data-admin-tab>Color Scheme</button>
                    <button class="admin-main-tab admin-tab" data-tab="models" data-admin-tab>AI Models</button>
                    <button class="admin-main-tab admin-tab" data-tab="catalog" data-admin-tab>Catalog Review</button>
                    <button class="admin-main-tab admin-tab" data-tab="settings" data-admin-tab>App Settings</button>
                </div>
                <div id="admin-content"></div>
            </div>
        `;

        container.querySelectorAll('[data-admin-tab]').forEach((button) => {
            button.addEventListener('click', () => {
                renderTab(container, button.dataset.tab);
            });
        });

        await renderTab(container, 'dashboard');
    }

    return {
        ADMIN_COLOR_KEYS,
        renderAdmin
    };
}
