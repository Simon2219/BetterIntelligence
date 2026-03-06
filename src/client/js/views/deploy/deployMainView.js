import { parseDeployPath, formatDeployTime, renderDeployMessage } from './deployFormatters.js';
import { renderDeployList } from './deployListView.js';
import { renderDeployWorkspace } from './deployWorkspaceController.js';

export function createDeployView(deps) {
    const {
        api,
        navigate,
        showToast,
        escapeHtml,
        showConfirm
    } = deps;

    async function renderDeploy(container, path) {
        const info = parseDeployPath(path || '/deploy');
        if (!info.slug) {
            await renderDeployList({
                container,
                info,
                api,
                navigate,
                showToast,
                escapeHtml
            });
            return;
        }

        await renderDeployWorkspace({
            container,
            slug: info.slug,
            requestedTab: info.tab,
            api,
            navigate,
            showToast,
            showConfirm,
            escapeHtml,
            formatDeployTime,
            renderDeployMessage: (message, agentId) => renderDeployMessage(message, agentId, { escapeHtml, formatDeployTime })
        });
    }

    return { renderDeploy };
}
