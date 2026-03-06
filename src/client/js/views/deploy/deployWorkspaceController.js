import { deploymentCapabilities } from './deployPermissions.js';
import { renderDeployWorkspaceHeader } from './deployWorkspaceHeader.js';
import { renderDeployOverviewTab } from './tabs/deployOverviewTab.js';
import { renderDeployChatsTab } from './tabs/deployChatsTab.js';
import { renderDeployAccessTab } from './tabs/deployAccessTab.js';
import { renderDeployStatsTab } from './tabs/deployStatsTab.js';

export async function renderDeployWorkspace({
    container,
    slug,
    requestedTab = 'overview',
    api,
    navigate,
    showToast,
    showConfirm,
    escapeHtml,
    formatDeployTime,
    renderDeployMessage
}) {
    let data;
    try {
        data = (await api(`/deploy/${encodeURIComponent(slug)}/manage`))?.data || {};
    } catch (error) {
        container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(error.message || 'Deployment not found')}</p></div>`;
        return;
    }

    const capabilities = deploymentCapabilities(data?.access || {});
    const tabs = [{ id: 'overview', label: 'Overview' }];
    if (capabilities.canViewChats) tabs.push({ id: 'chats', label: 'Chats' });
    if (capabilities.canManageMembers) tabs.push({ id: 'access', label: 'Access' });
    if (capabilities.canViewChats) tabs.push({ id: 'stats', label: 'Statistics' });
    const tab = tabs.some((item) => item.id === requestedTab) ? requestedTab : tabs[0].id;

    container.innerHTML = `<div class="container deploy-workspace">${renderDeployWorkspaceHeader({ data, activeTab: tab, tabs, escapeHtml })}<div class="deploy-workspace__content" id="deploy-workspace-content"></div></div>`;
    container.querySelectorAll('[data-route]').forEach((el) => el.addEventListener('click', (event) => {
        event.preventDefault();
        const route = String(el.getAttribute('data-route') || '').trim();
        if (route) navigate(route);
    }));
    container.querySelectorAll('[data-switch-tab]').forEach((el) => el.addEventListener('click', () => {
        const next = String(el.getAttribute('data-switch-tab') || '').trim();
        if (next && next !== tab) navigate(`/deploy/${encodeURIComponent(slug)}?tab=${encodeURIComponent(next)}`);
    }));

    const content = container.querySelector('#deploy-workspace-content');
    if (!content) return;

    const rerenderWorkspace = (targetContainer, nextSlug, nextTab = 'overview') => renderDeployWorkspace({
        container: targetContainer,
        slug: nextSlug,
        requestedTab: nextTab,
        api,
        navigate,
        showToast,
        showConfirm,
        escapeHtml,
        formatDeployTime,
        renderDeployMessage
    });

    if (tab === 'overview') {
        await renderDeployOverviewTab({
            content,
            slug,
            data,
            capabilities,
            rootContainer: container,
            api,
            showToast,
            escapeHtml,
            formatDeployTime,
            renderWorkspace: rerenderWorkspace
        });
        return;
    }
    if (tab === 'chats') {
        await renderDeployChatsTab({
            content,
            slug,
            capabilities,
            api,
            showToast,
            escapeHtml,
            formatDeployTime,
            renderDeployMessage
        });
        return;
    }
    if (tab === 'access') {
        await renderDeployAccessTab({
            content,
            slug,
            capabilities,
            api,
            showToast,
            showConfirm,
            escapeHtml
        });
        return;
    }
    if (tab === 'stats') {
        await renderDeployStatsTab({
            content,
            slug,
            api,
            escapeHtml
        });
        return;
    }

    content.innerHTML = '<div class="card"><p class="text-muted">Unsupported deployment tab.</p></div>';
}
