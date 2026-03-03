/**
 * BetterIntelligence - Client App
 */

import { showToast } from '../../components/Toast.js';
import { showConfirm } from '../../components/Dialog.js';
import { makeDropZone } from '../../utils/dragdrop.js';
import { showMediaUploadPreview } from '../../components/MediaUploadPreview.js';
import { showMediaViewer } from '../../components/MediaViewer.js';
import { icon } from '../../utils/dom.js';
import { createAuthView } from '../../views/authView.js';
import { createAgentsView } from '../../views/agentsView.js';
import { createChatView } from '../../views/chatView.js';
import { createAnalyticsView } from '../../views/analyticsView.js';
import { createSkillsView } from '../../views/skillsView.js';
import { createHubView } from '../../views/hubView.js';
import { createDeployView } from '../../views/deployView.js';
import { createAdminView } from '../../views/adminView.js';
import { createSettingsView } from '../../views/settingsView.js';
import { createOnboardingView } from '../../views/onboardingView.js';
import {
    fetchResolvedAppearance,
    applyThemeVariables,
    fetchAdminPalettes,
    createPalette,
    updatePalette,
    deletePalette,
    reorderPalettes,
    updatePaletteAssignments
} from '../appearanceClient.js';
import { createSocketClients } from '../socketClients.js';

const API_BASE = '/api';

let currentUser = null;
let currentView = null;
let _activeSocket = null;
let _accessToken = null;
let _socketClients = null;
let _lastRenderedPath = location.pathname + location.search;
const _chatSummaryInFlight = new Map();
const _chatSummaryCooldownMs = 7000;
let _notificationsLoaded = false;
let _notificationsSocketBound = false;
let _notificationItems = [];
let _notificationUnreadCount = 0;
const _notificationExpandedIds = new Set();

function getChatRouteId(pathLike) {
    const pathname = String(pathLike || '').split('?')[0];
    const match = pathname.match(/^\/chat\/([^/]+)$/);
    if (!match?.[1]) return null;
    const id = decodeURIComponent(match[1]).trim();
    if (!id || id.toLowerCase() === 'new') return null;
    return id;
}

function triggerChatSummaryOnClose(fromPathLike, toPathLike) {
    if (!currentUser) return;
    const fromChatId = getChatRouteId(fromPathLike);
    if (!fromChatId) return;
    const toChatId = getChatRouteId(toPathLike);
    if (toChatId && toChatId.toUpperCase() === fromChatId.toUpperCase()) return;

    const now = Date.now();
    const last = _chatSummaryInFlight.get(fromChatId) || 0;
    if (now - last < _chatSummaryCooldownMs) return;
    _chatSummaryInFlight.set(fromChatId, now);

    api(`/chats/${encodeURIComponent(fromChatId)}/summary`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'user_close' })
    }).catch((err) => {
        console.debug('Chat summary on close failed', { chatId: fromChatId, err: err?.message || String(err) });
    });
}

const AGENT_AVATAR_PALETTES = [
    { a: '#1d4ed8', b: '#2563eb', c: '#60a5fa', ink: '#e0ecff' },
    { a: '#0f766e', b: '#0891b2', c: '#22d3ee', ink: '#dff8ff' },
    { a: '#334155', b: '#475569', c: '#94a3b8', ink: '#f1f5f9' },
    { a: '#0e7490', b: '#0284c7', c: '#38bdf8', ink: '#e0f2fe' },
    { a: '#2563eb', b: '#3b82f6', c: '#93c5fd', ink: '#f8fbff' }
];

function hashString(input) {
    const str = String(input || '');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function getAgentAvatarInitial(agent) {
    const source = String(agent?.name || '').trim();
    const first = source ? source[0] : 'A';
    const clean = String(first).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return clean || 'A';
}

function normalizeAvatarShape(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw.includes('rect') || raw.includes('square') || raw.includes('rounded')) return 'rect';
    if (raw.includes('circle') || raw.includes('round')) return 'circle';
    return '';
}

function getAgentAvatarShape(agent, options = {}) {
    const modelPref = normalizeAvatarShape(
        agent?.avatar_shape
        || agent?.avatarShape
        || agent?.avatar_default
        || agent?.avatarDefault
        || agent?.avatar_mode
        || agent?.avatarMode
        || agent?.avatar_style
        || agent?.avatarStyle
    );
    if (modelPref) return modelPref;
    const uiPref = normalizeAvatarShape(options?.shape || options?.fallback || options?.variant);
    if (uiPref) return uiPref;
    return 'circle';
}

function buildAvatarSvg(initial, palette, shape) {
    const clipShape = shape === 'rect'
        ? '<rect width="64" height="64" rx="14"/>'
        : '<circle cx="32" cy="32" r="32"/>';
    const baseShape = shape === 'rect'
        ? '<rect width="64" height="64" rx="14" fill="url(#g)"/>'
        : '<circle cx="32" cy="32" r="32" fill="url(#g)"/>';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Agent avatar">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${palette.a}"/>
<stop offset="100%" stop-color="${palette.b}"/>
</linearGradient>
<clipPath id="clip">
${clipShape}
</clipPath>
</defs>
${baseShape}
<g clip-path="url(#clip)">
<circle cx="17" cy="17" r="12" fill="${palette.c}" fill-opacity="0.24"/>
<circle cx="52" cy="53" r="16" fill="${palette.c}" fill-opacity="0.18"/>
<rect x="11" y="12" width="42" height="40" rx="10" fill="#0b1224" fill-opacity="0.12"/>
<path d="M8 44 C20 36, 32 52, 56 36 L56 64 L8 64 Z" fill="#0b1224" fill-opacity="0.1"/>
</g>
<text x="50%" y="51%" dominant-baseline="middle" text-anchor="middle" font-family="DM Sans, Arial, sans-serif" font-size="24" font-weight="700" fill="${palette.ink}">${initial}</text>
</svg>`;
}

function getAgentAvatarUrl(agent, options = {}) {
    const url = agent?.avatar_url || agent?.avatarUrl;
    if (url && typeof url === 'string' && url.trim()) return url;
    const seed = hashString(agent?.id || agent?.name || 'agent');
    const palette = AGENT_AVATAR_PALETTES[seed % AGENT_AVATAR_PALETTES.length];
    const initial = getAgentAvatarInitial(agent);
    const shape = getAgentAvatarShape(agent, options);
    const svg = buildAvatarSvg(initial, palette, shape);
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function getToken() {
    return _accessToken;
}

function setAccessToken(token) {
    _accessToken = token ? String(token) : null;
    if (_socketClients) _socketClients.refreshAuth();
}

function ensureSocketClients() {
    if (!_socketClients) {
        _socketClients = createSocketClients({
            getToken,
            onTokenInvalid: () => {
                setAccessToken(null);
                currentUser = null;
                destroyActiveSocket();
                navigate('/');
            }
        });
    }
    return _socketClients;
}

async function refreshAccessToken() {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
    });
    const refreshData = await refreshRes.json().catch(() => ({}));
    if (!refreshRes.ok || !refreshData.data?.accessToken) return null;
    setAccessToken(refreshData.data.accessToken);
    if (refreshData.data.user) currentUser = refreshData.data.user;
    return refreshData.data;
}

async function api(path, opts = {}, isRetry = false) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers, credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !isRetry && !path.includes('/auth/refresh') && !path.includes('/auth/logout')) {
        try {
            const refreshed = await refreshAccessToken();
            if (refreshed?.accessToken) {
                return api(path, opts, true);
            }
        } catch {}
        setAccessToken(null);
        currentUser = null;
        destroyActiveSocket();
        navigate('/');
        throw new Error('Session expired');
    }
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
}

function setCurrentUser(user) {
    currentUser = user;
    if (user?._token) setAccessToken(user._token);
}

function getCurrentUser() {
    return currentUser;
}

function getCurrentView() {
    return currentView;
}

function getActiveSocket() {
    return _activeSocket;
}

function getSocketClients() {
    return ensureSocketClients();
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function destroyActiveSocket() {
    if (_socketClients) _socketClients.disconnectAll();
    _activeSocket = null;
    _notificationsSocketBound = false;
    _notificationsLoaded = false;
    _notificationItems = [];
    _notificationUnreadCount = 0;
}

function renderNotificationsUI() {
    const badge = document.getElementById('topbar-notifications-badge');
    if (badge) {
        badge.textContent = _notificationUnreadCount > 99 ? '99+' : String(_notificationUnreadCount);
        badge.classList.toggle('topbar__notif-badge--hidden', _notificationUnreadCount <= 0);
    }

    const list = document.getElementById('topbar-notifications-list');
    if (!list) return;

    if (!_notificationItems.length) {
        list.innerHTML = '<div class="topbar__notifications-empty">No notifications</div>';
        return;
    }

    const sorted = _notificationItems
        .slice()
        .sort((left, right) => {
            const leftRead = left?.read === true ? 1 : 0;
            const rightRead = right?.read === true ? 1 : 0;
            if (leftRead !== rightRead) return leftRead - rightRead;
            const leftTs = new Date(left?.createdAt || left?.created_at || 0).getTime();
            const rightTs = new Date(right?.createdAt || right?.created_at || 0).getTime();
            return rightTs - leftTs;
        });

    const unreadCount = sorted.filter((item) => item?.read !== true).length;

    list.innerHTML = `
        <div class="topbar__notifications-toolbar">
            <span class="topbar__notifications-count">${unreadCount} unread</span>
            <button type="button" class="topbar__notifications-read-all" data-read-all-notifications ${unreadCount <= 0 ? 'disabled' : ''}>Read All</button>
        </div>
        ${sorted.slice(0, 40).map((item) => {
        const severity = ['info', 'success', 'warning', 'danger'].includes(item.severity) ? item.severity : 'info';
        const readClass = item.read ? 'topbar__notification--read' : '';
        const isExpanded = _notificationExpandedIds.has(item.id);
        const collapsedClass = isExpanded ? 'topbar__notification--expanded' : 'topbar__notification--collapsed';
        const createdAt = new Date(item.createdAt || item.created_at || Date.now());
        const dateLabel = Number.isNaN(createdAt.getTime()) ? '' : createdAt.toLocaleString();
        return `
            <div class="topbar__notification ${readClass} ${collapsedClass}" data-notification-id="${escapeHtml(item.id || '')}">
                <div class="topbar__notification-head">
                    <span class="topbar__notification-dot topbar__notification-dot--${severity}"></span>
                    <strong>${escapeHtml(item.title || 'Notification')}</strong>
                    ${dateLabel ? `<span class="topbar__notification-time-inline">${escapeHtml(dateLabel)}</span>` : ''}
                    ${item.read ? '' : '<button type="button" class="topbar__notification-ack" data-ack-notification>Mark read</button>'}
                    <button type="button" class="topbar__notification-toggle" data-toggle-notification aria-label="Toggle notification details"></button>
                </div>
                <div class="topbar__notification-body">${escapeHtml(item.body || '')}</div>
            </div>
        `;
    }).join('')}
    `;
}

function setNotificationsState(payload) {
    const notifications = Array.isArray(payload?.notifications) ? payload.notifications : null;
    if (notifications) _notificationItems = notifications;
    if (Number.isFinite(Number(payload?.unreadCount))) _notificationUnreadCount = Number(payload.unreadCount);
    renderNotificationsUI();
}

async function bootstrapNotifications() {
    if (!currentUser || _notificationsLoaded) return;
    _notificationsLoaded = true;
    try {
        const { data } = await api('/users/me/notifications?limit=20');
        setNotificationsState({
            notifications: data?.notifications || [],
            unreadCount: data?.unreadCount || 0
        });
    } catch {
        _notificationsLoaded = false;
    }
}

async function acknowledgeNotification(notificationId) {
    const id = String(notificationId || '').trim();
    if (!id) return;
    try {
        const { data } = await api(`/users/me/notifications/${encodeURIComponent(id)}/ack`, { method: 'POST' });
        _notificationItems = _notificationItems.map((item) => (item.id === id ? { ...item, read: true } : item));
        if (Number.isFinite(Number(data?.unreadCount))) _notificationUnreadCount = Number(data.unreadCount);
        renderNotificationsUI();
        const nSocket = ensureSocketClients().getNotificationsSocket();
        nSocket?.emit('notifications:ack', { notificationId: id });
    } catch (err) {
        showToast(err.message || 'Failed to acknowledge notification', 'error');
    }
}

async function acknowledgeAllNotifications() {
    try {
        const { data } = await api('/users/me/notifications/read-all', { method: 'POST' });
        _notificationItems = _notificationItems.map((item) => ({ ...item, read: true }));
        if (Number.isFinite(Number(data?.unreadCount))) _notificationUnreadCount = Number(data.unreadCount);
        renderNotificationsUI();
        const nSocket = ensureSocketClients().getNotificationsSocket();
        nSocket?.emit('notifications:ack_all', {});
    } catch (err) {
        showToast(err.message || 'Failed to mark notifications as read', 'error');
    }
}

function bindNotificationsSocket() {
    if (!currentUser) return;
    const socket = ensureSocketClients().getNotificationsSocket();
    if (!socket || _notificationsSocketBound) return;

    _notificationsSocketBound = true;
    socket.on('connect', () => {
        socket.emit('notifications:subscribe', {});
    });
    socket.on('notifications:new', (payload) => {
        if (!payload || !payload.id) return;
        _notificationItems = [payload, ..._notificationItems.filter((item) => item.id !== payload.id)].slice(0, 20);
        if (payload.read !== true) _notificationUnreadCount += 1;
        renderNotificationsUI();
    });
    socket.on('notifications:badge', (payload) => {
        if (!payload) return;
        const unread = Number(payload.unreadCount);
        if (Number.isFinite(unread)) {
            _notificationUnreadCount = unread;
            renderNotificationsUI();
        }
    });
    socket.emit('notifications:subscribe', {});
}

function handleGatewayConversationMessage(d) {
    showToast(`New message from ${d.agentName || 'Agent'}`, 'info');
    updateChatUnreadBadge();
    window.dispatchEvent(new CustomEvent('bi:conversation:new_message', { detail: d || {} }));
}

function handleGatewayConnectError(err) {
    if (String(err?.message || '').toLowerCase().includes('token')) {
        setAccessToken(null);
        currentUser = null;
        destroyActiveSocket();
    }
}

function ensureSocket() {
    const socket = ensureSocketClients().getGatewaySocket();
    if (!socket) return null;
    _activeSocket = socket;
    socket.off('conversation:new_message', handleGatewayConversationMessage);
    socket.off('connect_error', handleGatewayConnectError);
    socket.on('conversation:new_message', handleGatewayConversationMessage);
    socket.on('connect_error', handleGatewayConnectError);

    return socket;
}

function createSocket() {
    return ensureSocket();
}

const CHAT_SOCKET_EVENTS = ['agent:stream', 'agent:done', 'agent:media', 'agent:error', 'chat:typing', 'chat:message', 'disconnect', 'connect_error'];

function clearChatSocketListeners(socket) {
    if (!socket) return;
    CHAT_SOCKET_EVENTS.forEach((eventName) => socket.off(eventName));
}

async function updateChatUnreadBadge() {
    if (!currentUser) return;
    try {
        const { data } = await api('/chats/unread-count');
        const count = data?.unreadCount ?? 0;
        const badge = document.getElementById('chat-unread-badge');
        if (badge) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.classList.toggle('sidebar__badge--hidden', count <= 0);
        }
    } catch {}
}

// ─── Navigation ─────────────────────────────────────────────────────────────

function renderNav() {
    const app = document.getElementById('app');
    const main = app.querySelector('.main');
    const toastContainer = document.getElementById('toast-container');

    if (currentUser) {
        let layout = app.querySelector('.app-layout');
        if (!layout) {
            layout = document.createElement('div');
            layout.className = 'app-layout';
            app.insertBefore(layout, main || toastContainer);
        }
        let topbar = layout.querySelector('.topbar');
        if (!topbar) {
            topbar = document.createElement('header');
            topbar.className = 'topbar';
            const avatarUrl = currentUser.avatar_url || currentUser.avatarUrl || '';
            const initial = (currentUser.display_name || currentUser.username || 'U')[0];
            topbar.innerHTML = `
                <button class="topbar__logo" type="button" data-route="/agents" title="Go to Agents">
                    <span class="topbar__logo-word">Better</span><span class="topbar__logo-word topbar__logo-word--accent">Intelligence</span><span class="topbar__logo-dot">&bull;</span>
                </button>
                <div class="topbar__spacer"></div>
                <div class="topbar__notifications">
                    <button class="topbar__icon-btn" id="notifications-btn" type="button" title="Notifications" aria-haspopup="true" aria-label="Notifications">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"></path>
                            <path d="M9 17a3 3 0 0 0 6 0"></path>
                        </svg>
                        <span id="topbar-notifications-badge" class="topbar__notif-badge topbar__notif-badge--hidden">0</span>
                    </button>
                    <div class="topbar__dropdown topbar__dropdown--hidden topbar__dropdown--notifications" id="notifications-dropdown">
                        <div class="topbar__notifications-list" id="topbar-notifications-list"></div>
                    </div>
                </div>
                <div class="topbar__profile">
                    <button class="topbar__avatar-btn" id="profile-btn" title="Profile" aria-haspopup="true">
                        ${avatarUrl ? `<img class="topbar__avatar" src="${escapeHtml(avatarUrl)}" alt="">` : `<span class="topbar__avatar topbar__avatar--fallback">${escapeHtml(initial)}</span>`}
                    </button>
                    <div class="topbar__dropdown topbar__dropdown--hidden" id="profile-dropdown">
                        <a href="#" data-route="/settings">Settings</a>
                        <button type="button" data-action="logout">Logout</button>
                    </div>
                </div>
            `;
            layout.appendChild(topbar);
        }
        let body = layout.querySelector('.app-body');
        if (!body) {
            body = document.createElement('div');
            body.className = 'app-body';
            layout.appendChild(body);
        }
        let sidebarWrap = body.querySelector('.sidebar-wrap');
        if (!sidebarWrap) {
            sidebarWrap = document.createElement('div');
            sidebarWrap.className = 'sidebar-wrap';
            body.insertBefore(sidebarWrap, body.querySelector('.main'));
        }
        let sidebar = sidebarWrap.querySelector('.sidebar');
        if (!sidebar) {
            sidebar = document.createElement('aside');
            sidebar.className = 'sidebar';
            sidebar.id = 'main-sidebar';
            sidebarWrap.appendChild(sidebar);
        }
        if (main && main.parentElement !== body) {
            main.classList.add('main__content');
            body.appendChild(main);
        }
        const path = location.pathname || '/';
        const isActive = (route) => path === route || path.startsWith(route + '/');
        const canAccessAdmin = currentUser.role?.is_admin || currentUser.role?.can_access_admin;
        sidebar.innerHTML = `
            <nav class="sidebar__nav">
                <div class="sidebar__section">
                    <a href="#" class="sidebar__link ${isActive('/chat') ? 'sidebar__link--active' : ''}" data-route="/chat">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        Chat
                        <span id="chat-unread-badge" class="sidebar__badge sidebar__badge--hidden">0</span>
                    </a>
                    <a href="#" class="sidebar__link ${isActive('/agents') ? 'sidebar__link--active' : ''}" data-route="/agents">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
                        Agents
                    </a>
                    <a href="#" class="sidebar__link ${isActive('/skills') ? 'sidebar__link--active' : ''}" data-route="/skills">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                        Skills
                    </a>
                </div>
                <div class="sidebar__divider"></div>
                <div class="sidebar__section">
                    <div class="sidebar__section-label">Community</div>
                    <a href="#" class="sidebar__link ${isActive('/hub') ? 'sidebar__link--active' : ''}" data-route="/hub">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        Hub
                    </a>
                </div>
                <div class="sidebar__divider"></div>
                <div class="sidebar__section">
                    <div class="sidebar__section-label">Tools</div>
                    <a href="#" class="sidebar__link ${isActive('/deploy') ? 'sidebar__link--active' : ''}" data-route="/deploy">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9M8 17l4 4 4-4"/></svg>
                        Deploy
                    </a>
                </div>
            </nav>
            <div class="sidebar__footer">
                ${canAccessAdmin ? `
                <a href="#" class="sidebar__link sidebar__link--footer ${isActive('/admin') ? 'sidebar__link--active' : ''}" data-route="/admin">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                    Admin Panel
                </a>
                ` : ''}
            </div>
        `;
        body.style.setProperty('--main-sidebar-width', (sidebarWrap.offsetWidth || 220) + 'px');
        layout.querySelectorAll('[data-route]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                if (el.classList.contains('topbar__logo')) {
                    el.classList.add('topbar__logo--clicked');
                    setTimeout(() => el.classList.remove('topbar__logo--clicked'), 550);
                }
                navigate(el.dataset.route);
            });
        });
        const notificationsBtn = document.getElementById('notifications-btn');
        const notificationsDropdown = document.getElementById('notifications-dropdown');
        const notificationsList = document.getElementById('topbar-notifications-list');
        const profileBtn = document.getElementById('profile-btn');
        const profileDropdown = document.getElementById('profile-dropdown');
        if (notificationsBtn && notificationsDropdown && notificationsList && !notificationsBtn.dataset.bound) {
            notificationsBtn.dataset.bound = '1';
            notificationsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const open = notificationsDropdown.classList.contains('topbar__dropdown--hidden');
                notificationsDropdown.classList.toggle('topbar__dropdown--hidden', !open);
                profileDropdown?.classList.add('topbar__dropdown--hidden');
                if (open) {
                    const close = () => {
                        notificationsDropdown.classList.add('topbar__dropdown--hidden');
                        document.removeEventListener('click', close);
                    };
                    setTimeout(() => document.addEventListener('click', close), 0);
                }
            });

            notificationsList.addEventListener('click', (e) => {
                const readAllBtn = e.target.closest('[data-read-all-notifications]');
                if (readAllBtn) {
                    acknowledgeAllNotifications();
                    return;
                }
                const ackBtn = e.target.closest('[data-ack-notification]');
                if (ackBtn) {
                    const row = ackBtn.closest('[data-notification-id]');
                    if (!row) return;
                    acknowledgeNotification(row.getAttribute('data-notification-id'));
                    return;
                }
                const toggleBtn = e.target.closest('[data-toggle-notification]');
                if (!toggleBtn) return;
                const row = toggleBtn.closest('[data-notification-id]');
                if (!row) return;
                const notificationId = row.getAttribute('data-notification-id');
                if (!notificationId) return;
                if (_notificationExpandedIds.has(notificationId)) _notificationExpandedIds.delete(notificationId);
                else _notificationExpandedIds.add(notificationId);
                renderNotificationsUI();
            });
        }
        if (profileBtn && profileDropdown) {
            if (!profileBtn.dataset.bound) {
                profileBtn.dataset.bound = '1';
                profileBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const open = profileDropdown.classList.contains('topbar__dropdown--hidden');
                    profileDropdown.classList.toggle('topbar__dropdown--hidden', !open);
                    notificationsDropdown?.classList.add('topbar__dropdown--hidden');
                    if (open) {
                        const close = () => {
                            profileDropdown.classList.add('topbar__dropdown--hidden');
                            document.removeEventListener('click', close);
                        };
                        setTimeout(() => document.addEventListener('click', close), 0);
                    }
                });
                profileDropdown.querySelector('[data-route="/settings"]')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    profileDropdown.classList.add('topbar__dropdown--hidden');
                    navigate('/settings');
                });
                profileDropdown.querySelector('[data-action="logout"]')?.addEventListener('click', () => {
                    profileDropdown.classList.add('topbar__dropdown--hidden');
                    logout();
                });
            }
        }

        renderNotificationsUI();
        ensureSocket();
        bindNotificationsSocket();
        bootstrapNotifications();
        updateChatUnreadBadge();
    } else {
        const layout = app.querySelector('.app-layout');
        if (layout) {
            const mainEl = layout.querySelector('.main');
            if (mainEl) {
                mainEl.classList.remove('main__content');
                app.insertBefore(mainEl, layout);
            }
            layout.remove();
        }
    }
}

async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    setAccessToken(null);
    currentUser = null;
    destroyActiveSocket();
    navigate('/');
}

async function applyAppearance() {
    try {
        const data = await fetchResolvedAppearance(api);
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        applyThemeVariables(theme, data);
    } catch {}
}

async function checkSession() {
    try {
        const refreshed = await refreshAccessToken();
        if (refreshed?.user) {
            currentUser = refreshed.user;
            const theme = refreshed.user.settings?.theme;
            if (theme && ['dark', 'light'].includes(theme)) {
                document.documentElement.setAttribute('data-theme', theme);
            }
            ensureSocket();
            return true;
        }
    } catch {}

    if (!getToken()) {
        setAccessToken(null);
        currentUser = null;
        destroyActiveSocket();
        return false;
    }

    try {
        const { data } = await api('/auth/session');
        if (data?.user && getToken()) {
            currentUser = data.user;
            const theme = data.user.settings?.theme;
            if (theme && ['dark', 'light'].includes(theme)) {
                document.documentElement.setAttribute('data-theme', theme);
            }
            ensureSocket();
            return true;
        }
    } catch {}
    setAccessToken(null);
    currentUser = null;
    destroyActiveSocket();
    return false;
}

function navigate(path, opts = {}) {
    const fromPath = _lastRenderedPath || (location.pathname + location.search);
    triggerChatSummaryOnClose(fromPath, path);
    if (currentView === 'chat' && _activeSocket) {
        clearChatSocketListeners(_activeSocket);
    }
    if (opts.replace) {
        history.replaceState({}, '', path);
    } else {
        history.pushState({}, '', path);
    }
    render(path);
}

async function render(path) {
    const app = document.getElementById('app');
    const main = app.querySelector('.main') || (() => { const m = document.createElement('main'); m.className = 'main'; app.appendChild(m); return m; })();
    main.classList.remove('main--chat');

    if (path === '/' || path === '') {
        currentView = 'landing';
        main.innerHTML = `
            <div class="landing">
                <h1>Build AI agents.</h1>
                <h1>Share skills. Deploy bots.</h1>
                <p>Create no-code AI agents, install skills from the Hub, and deploy chatbots in minutes.</p>
                ${currentUser ? `
                    <a href="#" class="btn btn-primary" data-route="/agents">Go to Agents</a>
                ` : `
                    <a href="#" class="btn btn-primary" data-route="/login">Get Started</a>
                `}
            </div>
        `;
        main.querySelector('[data-route]')?.addEventListener('click', (e) => { e.preventDefault(); navigate(e.target.dataset.route); });
    } else if (path === '/login' || path === '/signup') {
        currentView = 'auth';
        renderAuth(main, path === '/signup');
    } else if (path.match(/^\/agents\/[^/]+\/analytics/)) {
        if (!currentUser) { navigate('/login'); return; }
        currentView = 'analytics';
        const agentId = path.split('/')[2];
        await renderAnalytics(main, agentId);
    } else if (path.match(/^\/agents\/[^/]+\/chat/)) {
        if (!currentUser) { navigate('/login'); return; }
        const agentId = path.split('/')[2];
        try {
            const { data } = await api('/chats', { method: 'POST', body: JSON.stringify({ agentId, forceNew: true }) });
            navigate(`/chat/${data.id}`);
        } catch (err) {
            showToast(err.message || 'Failed to open chat', 'error');
            navigate('/chat');
        }
        return;
    } else if (path === '/chat' || path.startsWith('/chat/') || path.startsWith('/chat?')) {
        if (!currentUser) { navigate('/login'); return; }
        currentView = 'chat';
        main.classList.add('main--chat');
        const pathname = path.split('?')[0];
        const directNewMatch = pathname.match(/^\/chat\/new\/([^/]+)$/);
        if (pathname === '/chat/new') {
            navigate('/chat', { replace: true });
            return;
        }
        if (directNewMatch?.[1]) {
            const routeAgentId = decodeURIComponent(directNewMatch[1]);
            try {
                const { data } = await api('/chats', { method: 'POST', body: JSON.stringify({ agentId: routeAgentId, forceNew: true }) });
                navigate(`/chat/${data.id}`, { replace: true });
            } catch (err) {
                showToast(err.message || 'Failed to open chat', 'error');
                navigate('/chat', { replace: true });
            }
            return;
        }
        const params = new URLSearchParams(path.includes('?') ? path.split('?')[1] : (location.search || ''));
        const agentParam = params.get('agent');
        if (agentParam) {
            try {
                const { data } = await api('/chats', { method: 'POST', body: JSON.stringify({ agentId: agentParam, forceNew: true }) });
                navigate(`/chat/${data.id}`, { replace: true });
            } catch (err) {
                showToast(err.message || 'Failed to open chat', 'error');
                navigate('/chat');
            }
            return;
        }
        const pathParts = pathname.split('/').filter(Boolean);
        const chatId = pathParts[0] === 'chat' && pathParts[1] ? pathParts[1] : null;
        await renderChatHub(main, chatId);
    } else if (path === '/agents' || path.startsWith('/agents')) {
        if (!currentUser) { navigate('/login'); return; }
        if (path === '/agents/hub' || path.match(/^\/agents\/hub\/[^/]+$/)) {
            const id = path.split('/').pop();
            navigate(id && id !== 'hub' ? `/hub/agents/${id}` : '/hub/agents');
            return;
        }
        currentView = 'agents';
        await renderAgents(main, path);
    } else if (path === '/skills' || path.startsWith('/skills')) {
        if (!currentUser) { navigate('/login'); return; }
        await renderSkills(main, path);
    } else if (path === '/hub' || path.startsWith('/hub/')) {
        if (!currentUser) { navigate('/login'); return; }
        await renderHub(main, path);
    } else if (path === '/settings') {
        if (!currentUser) { navigate('/login'); return; }
        await renderSettings(main);
    } else if (path === '/admin') {
        if (!currentUser) { navigate('/login'); return; }
        const canAdmin = currentUser.role?.is_admin || currentUser.role?.can_access_admin;
        if (!canAdmin) { showToast('Admin access required', 'error'); navigate('/agents'); return; }
        await renderAdmin(main);
    } else if (path === '/onboarding') {
        if (!currentUser) { navigate('/login'); return; }
        await renderOnboarding(main);
    } else if (path === '/deploy' || path.startsWith('/deploy')) {
        if (!currentUser) { navigate('/login'); return; }
        await renderDeploy(main, path);
    } else {
        main.innerHTML = '<div class="container"><p class="text-muted">Not found</p></div>';
    }

    renderNav();
    _lastRenderedPath = path;
}

// View module composition
const { renderAuth } = createAuthView({
    api,
    navigate,
    showToast,
    setCurrentUser,
    escapeHtml
});

const { renderAgents, renderAgentForm } = createAgentsView({
    api,
    navigate,
    showToast,
    showConfirm,
    getAgentAvatarUrl,
    escapeHtml,
    getToken,
    API_BASE,
    makeDropZone
});

const { renderChatHub, renderChatView, renderChatMessage } = createChatView({
    api,
    navigate,
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

const { renderAnalytics } = createAnalyticsView({
    api,
    navigate,
    showToast,
    getAgentAvatarUrl,
    escapeHtml,
    getSocketClients: ensureSocketClients
});

const { renderSkills, renderSkillForm } = createSkillsView({
    api,
    navigate,
    showToast,
    escapeHtml
});

const { renderHub } = createHubView({
    api,
    navigate,
    showToast,
    getAgentAvatarUrl,
    escapeHtml
});

const { renderDeploy } = createDeployView({
    api,
    navigate,
    showToast,
    showConfirm,
    escapeHtml
});

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

const { renderSettings } = createSettingsView({
    api,
    showToast,
    showConfirm,
    logout,
    applyAppearance,
    getCurrentUser,
    escapeHtml
});

const { renderOnboarding } = createOnboardingView({
    api,
    showToast,
    navigate,
    escapeHtml
});

// Init

export function bootstrapApp() {
    window.addEventListener('popstate', () => {
        const nextPath = location.pathname + location.search;
        triggerChatSummaryOnClose(_lastRenderedPath, nextPath);
        if (currentView === 'chat' && _activeSocket) {
            clearChatSocketListeners(_activeSocket);
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

export {
    navigate,
    render,
    renderNav,
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
    getSocketClients,
    setCurrentUser,
    getCurrentUser,
    getCurrentView,
    getActiveSocket
};

bootstrapApp();

