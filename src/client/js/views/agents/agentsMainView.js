import { createAgentFormRenderer } from './builder/agentBuilderMainView.js';
import { renderAgentsCategoryManager as openAgentsCategoryManager } from './agentsCategoryManager.js';
import { loadAgentsListData } from './agentsListData.js';
import { bindAgentsListEvents } from './agentsListEvents.js';
import { renderAgentsListView } from './agentsListRender.js';

export function createAgentsView(deps) {
    const { api, navigate, showToast, showConfirm, getAgentAvatarUrl, escapeHtml } = deps;
    const { renderAgentForm } = createAgentFormRenderer(deps);

    async function renderAgentsCategoryManager(container, categories) {
        await openAgentsCategoryManager({
            container,
            categories,
            api,
            showToast,
            escapeHtml,
            onDone: async () => {
                await renderAgents(container, '/agents');
            }
        });
    }

    async function renderAgentsList(container) {
        const data = await loadAgentsListData({
            api,
            locationSearch: location.search
        });

        container.innerHTML = renderAgentsListView({
            data,
            escapeHtml,
            getAgentAvatarUrl
        });

        bindAgentsListEvents({
            container,
            data,
            api,
            navigate,
            showToast,
            showConfirm,
            escapeHtml,
            renderAgents,
            renderAgentsCategoryManager
        });
    }

    async function renderAgents(container, path) {
        const parts = String(path || '').split('/').filter(Boolean);
        const isNew = parts[1] === 'new';
        const editId = parts[1] && parts[1] !== 'new' ? parts[1] : null;

        if (isNew || editId) {
            await renderAgentForm(container, editId);
            return;
        }

        try {
            await renderAgentsList(container);
        } catch (error) {
            container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(error.message)}</p></div>`;
        }
    }

    return {
        renderAgents,
        renderAgentForm,
        renderAgentsCategoryManager
    };
}
