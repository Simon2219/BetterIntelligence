/**
 * BetterIntelligence - Client App Bootstrap (composition-only)
 */

/*
|--------------------------------------------------------------------------
| Imports: UI Components and Utilities
|--------------------------------------------------------------------------
*/

// UI components and utilities used by composed view systems.
import { showToast } from '../components/Toast.js';
import { showConfirm } from '../components/Dialog.js';
import { makeDropZone } from '../utils/dragdrop.js';
import { showMediaUploadPreview } from '../components/MediaUploadPreview.js';
import { showMediaViewer } from '../components/MediaViewer.js';
import { icon } from '../utils/dom.js';

/*
|--------------------------------------------------------------------------
| Imports: View Factories
|--------------------------------------------------------------------------
*/

// View factories for each routed domain.
import { createAuthView } from '../views/auth/authView.js';
import { createAgentsView } from '../views/agents/agentsMainView.js';
import { createChatView } from '../views/chat/chatMainView.js';
import { createAnalyticsView } from '../views/analytics/analyticsView.js';
import { createSkillsView } from '../views/skills/skillsView.js';
import { createHubView } from '../views/hub/hubView.js';
import { createDeployView } from '../views/deploy/deployMainView.js';
import { createAdminView } from '../views/admin/adminPanelView.js';
import { createSettingsView } from '../views/settings/settingsView.js';
import { createOnboardingView } from '../views/onboarding/onboardingView.js';
import { createMainAppView } from '../views/app/mainAppView.js';
import { createAppNotificationsWindow } from '../views/app/appNotificationsWindow.js';

/*
|--------------------------------------------------------------------------
| Imports: Core Infrastructure Modules
|--------------------------------------------------------------------------
*/

// Shared infrastructure clients used by core controllers.
import { createSocketClients } from './socketClients.js';

// Core app controller factories and helpers.
import { createAppState } from './appRuntimeState.js';
import { createApiClient } from './apiClient.js';
import { createAuthSession } from './authSession.js';
import { getAgentAvatarUrl } from '../utils/agentAvatar.js';
import { createGatewaySocketController } from './gatewaySocket.js';
import {
    createAppearanceController,
    fetchResolvedAppearance,
    applyThemeVariables,
    fetchAdminPalettes,
    createPalette,
    updatePalette,
    deletePalette,
    reorderPalettes,
    updatePaletteAssignments
} from './clientAppearance.js';
import { createRouterController } from './router.js';

// Temporary chat-domain glue hosted in app bootstrap for route lifecycle parity.
import { createChatSummaryOnCloseTrigger } from '../views/chat/chatLifecycle.js';
import { clearChatSocketListeners } from '../views/chat/chatSocketEvents.js';

/*
|--------------------------------------------------------------------------
| General Helpers
|--------------------------------------------------------------------------
*/

// Escapes untrusted text before inserting into HTML strings.
function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = String(value ?? '');
    return node.innerHTML;
}

/*
|--------------------------------------------------------------------------
| Global App Runtime State
|--------------------------------------------------------------------------
*/

// API base used by core app wrappers and view factories.
const API_BASE = '/api';

// Central mutable app runtime state container.
const state = createAppState({
    initialPath: location.pathname + location.search
});

// Navigation indirection allows controllers to call navigate before router initialization.
let navigateImpl = (path, opts = {}) => {
    if (opts?.replace) history.replaceState({}, '', path);
    else history.pushState({}, '', path);
};

// Stable proxy function passed into child modules as navigation dependency.
const navigateProxy = (path, opts = {}) => navigateImpl(path, opts);

// Callback bridge updated after socket controller is initialized.
let onAccessTokenChanged = () => {};

// Holds gateway socket controller instance for late-bound unauthorized handlers.
let gatewaySocketController = null;

/*
|--------------------------------------------------------------------------
| Subsystem: API Client
|--------------------------------------------------------------------------
*/

// API client owns token handling, refresh, and authenticated request wrapper.
const apiClient = createApiClient({
    apiBase: API_BASE,
    getAccessToken: state.getAccessToken,
    setAccessToken: state.setAccessToken,
    getCurrentUser: state.getCurrentUser,
    setCurrentUser: state.setCurrentUser,
    onAccessTokenChanged: () => onAccessTokenChanged(),
    onUnauthorized: () => gatewaySocketController?.handleUnauthorized?.()
});

// Core API client methods used across composed subsystems.
const {
    api,
    getToken,
    setToken,
    refreshAccessToken
} = apiClient;

/*
|--------------------------------------------------------------------------
| Subsystem: Gateway Socket
|--------------------------------------------------------------------------
*/

// Gateway socket controller owns realtime app socket lifecycle and unread sync.
gatewaySocketController = createGatewaySocketController({
    createSocketClients,
    getToken,
    setSocketClients: state.setSocketClients,
    getSocketClients: state.getSocketClients,
    setActiveSocket: state.setActiveSocket,
    getCurrentUser: state.getCurrentUser,
    setCurrentUser: state.setCurrentUser,
    setToken,
    navigate: navigateProxy,
    api,
    showToast,
    resetNotificationsState: state.resetNotificationsState
});

// Token-refresh hook rebinds socket auth whenever access token changes.
onAccessTokenChanged = () => gatewaySocketController.refreshSocketAuth();

// Gateway socket methods required by auth, nav, and view systems.
const {
    ensureSocket,
    createSocket,
    destroyActiveSocket,
    updateChatUnreadBadge,
    getSocketClients: ensureSocketClients
} = gatewaySocketController;

/*
|--------------------------------------------------------------------------
| Subsystem: Notifications Window
|--------------------------------------------------------------------------
*/

// App notifications view owns bell dropdown rendering and ack flows.
const notificationsController = createAppNotificationsWindow({
    api,
    escapeHtml,
    showToast,
    ensureSocketClients,
    state
});

// Notification surface used by nav composition and explicit exports.
const {
    renderNotificationsUI,
    bootstrapNotifications,
    acknowledgeNotification,
    acknowledgeAllNotifications,
    bindNotificationsSocket
} = notificationsController;

/*
|--------------------------------------------------------------------------
| Subsystem: Appearance
|--------------------------------------------------------------------------
*/

// Appearance controller owns runtime theme fetch/apply behavior.
const appearanceController = createAppearanceController({
    fetchResolvedAppearance,
    applyThemeVariables,
    api
});

// Appearance apply function used during boot and settings/admin flows.
const { applyAppearance } = appearanceController;

/*
|--------------------------------------------------------------------------
| Subsystem: Auth and Session
|--------------------------------------------------------------------------
*/

// Auth session controller owns login session restore and logout lifecycle.
const authSession = createAuthSession({
    getToken,
    setToken,
    setCurrentUser: state.setCurrentUser,
    refreshAccessToken,
    api,
    ensureSocket,
    destroyActiveSocket,
    navigate: navigateProxy
});

// Auth session methods consumed by bootstrap lifecycle and settings view.
const { checkSession, logout } = authSession;

/*
|--------------------------------------------------------------------------
| Subsystem: Chat Route Lifecycle
|--------------------------------------------------------------------------
*/

// Chat summary lifecycle trigger runs on route transitions away from chat contexts.
const triggerChatSummaryOnClose = createChatSummaryOnCloseTrigger({
    getCurrentUser: state.getCurrentUser,
    getChatSummaryStamp: state.getChatSummaryStamp,
    setChatSummaryStamp: state.setChatSummaryStamp,
    getChatSummaryCooldownMs: state.getChatSummaryCooldownMs,
    api
});

/*
|--------------------------------------------------------------------------
| App State Adapters
|--------------------------------------------------------------------------
*/

// Sets app user state and syncs token when session payload includes one.
function setCurrentUser(user) {
    state.setCurrentUser(user);
    if (user?._token) setToken(user._token);
}

// Returns current authenticated user from app state.
function getCurrentUser() {
    return state.getCurrentUser();
}

// Returns current routed view key from app state.
function getCurrentView() {
    return state.getCurrentView();
}

// Returns currently active realtime socket from app state.
function getActiveSocket() {
    return state.getActiveSocket();
}

/*
|--------------------------------------------------------------------------
| Subsystem: Domain View Composition
|--------------------------------------------------------------------------
*/

// Auth view rendering functions.
const { renderAuth } = createAuthView({
    api,
    navigate: navigateProxy,
    showToast,
    setCurrentUser,
    escapeHtml
});

// Agents list and builder rendering functions.
const { renderAgents, renderAgentForm } = createAgentsView({
    api,
    navigate: navigateProxy,
    showToast,
    showConfirm,
    getAgentAvatarUrl,
    escapeHtml,
    getToken,
    API_BASE,
    makeDropZone
});

// Chat hub/thread rendering functions and message renderer.
const { renderChatHub, renderChatView, renderChatMessage } = createChatView({
    api,
    navigate: navigateProxy,
    showToast,
    showConfirm,
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
    getCurrentUser
});

// Analytics view rendering function.
const { renderAnalytics } = createAnalyticsView({
    api,
    navigate: navigateProxy,
    showToast,
    getAgentAvatarUrl,
    escapeHtml,
    getSocketClients: ensureSocketClients
});

// Skills list and form rendering functions.
const { renderSkills, renderSkillForm } = createSkillsView({
    api,
    navigate: navigateProxy,
    showToast,
    escapeHtml
});

// Hub dashboard rendering function.
const { renderHub } = createHubView({
    api,
    navigate: navigateProxy,
    showToast,
    getAgentAvatarUrl,
    escapeHtml
});

// Deploy workspace rendering function.
const { renderDeploy } = createDeployView({
    api,
    navigate: navigateProxy,
    showToast,
    showConfirm,
    escapeHtml
});

// Admin panel rendering function and appearance palette client wiring.
const { renderAdmin } = createAdminView({
    api,
    showToast,
    showConfirm,
    escapeHtml,
    getSocketClients: ensureSocketClients,
    applyAppearance,
    appearanceClient: {
        fetchAdminPalettes,
        createPalette,
        updatePalette,
        deletePalette,
        reorderPalettes,
        updatePaletteAssignments
    }
});

// Settings rendering function with session and appearance actions.
const { renderSettings } = createSettingsView({
    api,
    showToast,
    showConfirm,
    logout,
    applyAppearance,
    getCurrentUser,
    escapeHtml
});

// Onboarding rendering function for first-time setup flow.
const { renderOnboarding } = createOnboardingView({
    api,
    showToast,
    navigate: navigateProxy,
    escapeHtml
});

/*
|--------------------------------------------------------------------------
| Subsystem: Main App Shell Composition
|--------------------------------------------------------------------------
*/

// Main app view orchestrates topbar + sidebar + main content host composition.
const mainAppView = createMainAppView({
    state,
    navigate: navigateProxy,
    logout,
    escapeHtml,
    ensureSocket,
    bindNotificationsSocket,
    bootstrapNotifications,
    updateChatUnreadBadge,
    renderNotificationsUI,
    acknowledgeNotification,
    acknowledgeAllNotifications
});

// Top-level app shell renderer consumed by router.
const { renderMainAppView } = mainAppView;

/*
|--------------------------------------------------------------------------
| Subsystem: Router Composition
|--------------------------------------------------------------------------
*/

// Router controller owns route dispatch and view render orchestration.
const routerController = createRouterController({
    state,
    triggerChatSummaryOnClose,
    clearChatSocketListeners,
    renderNav: renderMainAppView,
    api,
    showToast,
    viewRenderers: {
        renderAuth,
        renderAgents,
        renderAgentForm,
        renderChatHub,
        renderChatView,
        renderAnalytics,
        renderSkills,
        renderSkillForm,
        renderHub,
        renderDeploy,
        renderAdmin,
        renderSettings,
        renderOnboarding
    }
});

// Global navigation/render functions exposed by bootstrap and app API.
const { navigate, render } = routerController;

// Swap proxy target now that router navigate implementation exists.
navigateImpl = navigate;

/*
|--------------------------------------------------------------------------
| Bootstrap Lifecycle
|--------------------------------------------------------------------------
*/

// Boots app lifecycle: history listener, session restore, theme apply, initial route render.
export function bootstrapApp() {
    window.addEventListener('popstate', () => {
        const nextPath = location.pathname + location.search;
        triggerChatSummaryOnClose(state.getLastRenderedPath(), nextPath);
        if (state.getCurrentView() === 'chat' && state.getActiveSocket()) {
            clearChatSocketListeners(state.getActiveSocket());
        }
        render(nextPath || '/');
    });

    (async () => {
        await checkSession();
        await applyAppearance();
        const initialPath = location.pathname + location.search;
        render(initialPath || '/');
    })();

    window.BetterIntelligence = { navigate, getToken, api, showToast };
}

/*
|--------------------------------------------------------------------------
| Public Exports and Auto-Start
|--------------------------------------------------------------------------
*/

// Re-export app composition surface used by tests and other modules.
export {
    navigate,
    render,
    renderMainAppView as renderNav,
    renderAuth,
    renderAgents,
    renderAgentForm,
    renderChatHub,
    renderChatView,
    renderAnalytics,
    renderSkills,
    renderSkillForm,
    renderHub,
    renderDeploy,
    renderAdmin,
    renderSettings,
    renderOnboarding,
    renderChatMessage,
    getToken,
    api,
    createSocket,
    ensureSocketClients as getSocketClients,
    setCurrentUser,
    getCurrentUser,
    getCurrentView,
    getActiveSocket
};

// Auto-start bootstrap when module is loaded via app entrypoint.
bootstrapApp();
