import { getHubAgentHealth } from './hubHealth.js';
import { renderHubMainView } from './hubMainView.js';
import { renderHubSkillsView } from './hubSkillsView.js';
import { renderHubAgentsView } from './hubAgentsView.js';
import { renderHubAgentDetailView } from './hubAgentDetailView.js';

export function createHubView(deps) {
    const { api, navigate, showToast, getAgentAvatarUrl, escapeHtml } = deps;

    const healthFor = (agent) => getHubAgentHealth(agent, escapeHtml);

    async function renderHub(container, path) {
        const pathOnly = (path || '/hub').split('?')[0];
        const pathClean = pathOnly.replace(/\/$/, '') || '/hub';
        const parts = pathClean.split('/').filter(Boolean);
        const sub = parts[1];
        const id = parts[2];

        const rerender = (nextPath) => renderHub(container, nextPath);

        if (sub === 'agents' && id) {
            await renderHubAgentDetailView({
                container,
                agentId: id,
                api,
                navigate,
                showToast,
                getAgentAvatarUrl,
                escapeHtml,
                getHubAgentHealth: healthFor,
                rerender
            });
            return;
        }

        if (sub === 'agents') {
            await renderHubAgentsView({
                container,
                api,
                navigate,
                showToast,
                getAgentAvatarUrl,
                escapeHtml,
                getHubAgentHealth: healthFor,
                rerender
            });
            return;
        }

        if (sub === 'skills') {
            await renderHubSkillsView({
                container,
                api,
                navigate,
                showToast,
                escapeHtml,
                rerender
            });
            return;
        }

        await renderHubMainView({
            container,
            api,
            navigate,
            showToast,
            getAgentAvatarUrl,
            escapeHtml,
            getHubAgentHealth: healthFor,
            rerender
        });
    }

    async function renderHubMain(container) {
        await renderHubMainView({
            container,
            api,
            navigate,
            showToast,
            getAgentAvatarUrl,
            escapeHtml,
            getHubAgentHealth: healthFor,
            rerender: (nextPath) => renderHub(container, nextPath)
        });
    }

    async function renderHubSkills(container) {
        await renderHubSkillsView({
            container,
            api,
            navigate,
            showToast,
            escapeHtml,
            rerender: (nextPath) => renderHub(container, nextPath)
        });
    }

    async function renderHubAgents(container) {
        await renderHubAgentsView({
            container,
            api,
            navigate,
            showToast,
            getAgentAvatarUrl,
            escapeHtml,
            getHubAgentHealth: healthFor,
            rerender: (nextPath) => renderHub(container, nextPath)
        });
    }

    async function renderHubAgentDetail(container, agentId) {
        await renderHubAgentDetailView({
            container,
            agentId,
            api,
            navigate,
            showToast,
            getAgentAvatarUrl,
            escapeHtml,
            getHubAgentHealth: healthFor,
            rerender: (nextPath) => renderHub(container, nextPath)
        });
    }

    return {
        renderHub,
        renderHubMain,
        renderHubSkills,
        renderHubAgents,
        renderHubAgentDetail
    };
}
