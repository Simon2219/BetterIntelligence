import { createChatStateController } from './chatState.js';
import { createChatFormatters } from './chatFormatters.js';
import { createChatMessageRenderer } from './chatMessageRenderer.js';
import { createChatHubDataController } from './chatHubData.js';
import { createChatHubUnreadController } from './chatHubUnread.js';
import { createSummaryHydrator } from './chatSummaryHydrator.js';
import { bindHubSidebarControls } from './chatHubSidebar.js';
import { createHubRenderer } from './chatHubRender.js';
import { createThreadRenderer } from './chatThreadRender.js';

const COPY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

export function createChatView(deps) {
    const {
        api,
        navigate,
        showToast,
        getAgentAvatarUrl,
        escapeHtml,
        createSocket,
        clearChatSocketListeners,
        updateChatUnreadBadge,
        showMediaUploadPreview,
        showMediaViewer,
        icon,
        getToken,
        API_BASE,
        getCurrentUser,
        createChatForAgent
    } = deps;

    const stateController = createChatStateController({ getCurrentUser });
    const formatters = createChatFormatters({ escapeHtml });
    const hubData = createChatHubDataController({ sidebarSummaryMaxChars: 30 });

    const renderChatMessage = createChatMessageRenderer({
        escapeHtml,
        simpleMarkdown: formatters.simpleMarkdown,
        formatTimestamp: formatters.formatTimestamp,
        resolveMediaUrl: formatters.resolveMediaUrl,
        copyIcon: COPY_ICON
    });

    const summaryHydrationInFlight = new Set();
    const summaryHydrationStamp = new Map();

    let renderChatHub = async () => {};

    const hubUnreadController = createChatHubUnreadController({
        normalizeId: stateController.normalizeId,
        rerenderHub: (...args) => renderChatHub(...args)
    });

    const hydrateSidebarSummaries = createSummaryHydrator({
        api,
        shouldRefreshShortSummary: hubData.shouldRefreshShortSummary,
        needsSummaryHydration: hubData.needsSummaryHydration,
        summaryHydrationInFlight,
        summaryHydrationStamp,
        rerenderHub: (...args) => renderChatHub(...args)
    });

    const { renderChatView } = createThreadRenderer({
        api,
        getCurrentUser,
        getAgentAvatarUrl,
        escapeHtml,
        showToast,
        createSocket,
        clearChatSocketListeners,
        showMediaUploadPreview,
        showMediaViewer,
        icon,
        getToken,
        API_BASE,
        renderChatMessage,
        formatTimestamp: formatters.formatTimestamp,
        copyIcon: COPY_ICON
    });

    renderChatHub = createHubRenderer({
        api,
        navigate,
        showToast,
        escapeHtml,
        getAgentAvatarUrl,
        createChatForAgent,
        sortByRecent: hubData.sortByRecent,
        groupChatsByAgent: hubData.groupChatsByAgent,
        getPersonalChatTitle: hubData.getPersonalChatTitle,
        formatSidebarDateTime: formatters.formatSidebarDateTime,
        getGroupState: stateController.getGroupState,
        setGroupState: stateController.setGroupState,
        getSidebarState: stateController.getSidebarState,
        setSidebarState: stateController.setSidebarState,
        clampSidebarWidth: stateController.clampSidebarWidth,
        updateChatUnreadBadge,
        installLiveUnreadUpdates: hubUnreadController.installLiveUnreadUpdates,
        hydrateSidebarSummaries,
        bindHubSidebarControls,
        renderChatView
    });

    return { renderChatHub, renderChatView, renderChatMessage };
}
