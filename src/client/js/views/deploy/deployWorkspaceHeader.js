import { deployBadgeClass, deployRoleLabel, normalizeDeployRole } from './deployPermissions.js';
import { formatDeployAccessMode } from './deployFormatters.js';

export function renderDeployWorkspaceHeader({ data, activeTab, tabs, escapeHtml }) {
    const deployment = data?.deployment || {};
    const agent = data?.agent || {};
    const role = normalizeDeployRole(data?.access?.role);
    const accessMode = formatDeployAccessMode(data?.accessPolicy?.consumer_access_mode);
    const runtimeState = String(data?.runtimeHealth?.state || 'unknown').toLowerCase();
    const runtimeLabel = runtimeState === 'ok'
        ? 'Ready'
        : runtimeState === 'warning'
            ? 'Degraded'
            : runtimeState === 'error'
                ? 'Blocked'
                : 'Unknown';

    return `
        <div class="deploy-workspace__header card">
            <div class="deploy-workspace__header-main">
                <button type="button" class="btn btn-ghost btn-sm btn-chevron" data-route="/deploy">
                    <span class="ui-chevron ui-chevron--left" aria-hidden="true"></span><span>Back to Deployments</span>
                </button>
                <div class="deploy-workspace__title-wrap">
                    <h2 class="deploy-workspace__title">/${escapeHtml(deployment.slug || '')}</h2>
                    <span class="${deployBadgeClass(role)}">${escapeHtml(deployRoleLabel(role))}</span>
                    <span class="deploy-chip deploy-chip--subtle">${escapeHtml(accessMode)}</span>
                    <span class="deploy-chip ${runtimeState === 'ok' ? 'deploy-chip--ok' : runtimeState === 'warning' ? 'deploy-chip--warn' : runtimeState === 'error' ? 'deploy-chip--danger' : 'deploy-chip--subtle'}" title="${escapeHtml(data?.runtimeHealth?.summary || '')}">${escapeHtml(runtimeLabel)}</span>
                </div>
                <div class="deploy-workspace__subtitle">Agent: <strong>${escapeHtml(agent.name || 'Unknown')}</strong></div>
            </div>
            <div class="deploy-workspace__tabs" role="tablist" aria-label="Deployment workspace tabs">
                ${tabs.map((tab) => `<button type="button" class="deploy-workspace__tab ${activeTab === tab.id ? 'deploy-workspace__tab--active' : ''}" data-switch-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join('')}
            </div>
        </div>
    `;
}
