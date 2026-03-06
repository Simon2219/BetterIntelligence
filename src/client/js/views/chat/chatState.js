export function createChatStateController({ getCurrentUser } = {}) {
    function clampSidebarWidth(value) {
        const n = parseInt(value, 10);
        if (!Number.isFinite(n)) return 320;
        return Math.max(300, Math.min(520, n));
    }

    function getGroupState() {
        const userId = String(getCurrentUser?.()?.id || 'anon').toUpperCase();
        const key = `chat_groups_${userId}`;
        try {
            const raw = localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : {};
            return { key, map: parsed && typeof parsed === 'object' ? parsed : {} };
        } catch {
            return { key, map: {} };
        }
    }

    function setGroupState(state) {
        if (!state?.key) return;
        try {
            localStorage.setItem(state.key, JSON.stringify(state.map || {}));
        } catch {}
    }

    function getSidebarState() {
        const userId = String(getCurrentUser?.()?.id || 'anon').toUpperCase();
        const key = `chat_sidebar_ui_${userId}`;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return { key, width: 320, collapsed: false };
            const parsed = JSON.parse(raw);
            return {
                key,
                width: clampSidebarWidth(parsed?.width),
                collapsed: parsed?.collapsed === true
            };
        } catch {
            return { key, width: 320, collapsed: false };
        }
    }

    function setSidebarState(state) {
        if (!state?.key) return;
        try {
            localStorage.setItem(state.key, JSON.stringify({
                width: clampSidebarWidth(state.width),
                collapsed: state.collapsed === true
            }));
        } catch {}
    }

    function normalizeId(value) {
        return String(value || '').trim().toUpperCase();
    }

    return {
        clampSidebarWidth,
        getGroupState,
        setGroupState,
        getSidebarState,
        setSidebarState,
        normalizeId
    };
}
