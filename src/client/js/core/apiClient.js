export function createApiClient({
    apiBase = '/api',
    getAccessToken,
    setAccessToken,
    getCurrentUser,
    setCurrentUser,
    onAccessTokenChanged,
    onUnauthorized
} = {}) {
    function getToken() {
        return typeof getAccessToken === 'function' ? getAccessToken() : null;
    }

    function setToken(token) {
        if (typeof setAccessToken === 'function') {
            setAccessToken(token ? String(token) : null);
        }
        if (typeof onAccessTokenChanged === 'function') {
            onAccessTokenChanged(token ? String(token) : null);
        }
    }

    async function refreshAccessToken() {
        const refreshRes = await fetch(`${apiBase}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });
        const refreshData = await refreshRes.json().catch(() => ({}));
        if (!refreshRes.ok || !refreshData.data?.accessToken) return null;
        setToken(refreshData.data.accessToken);
        if (refreshData.data.user && typeof setCurrentUser === 'function') {
            setCurrentUser(refreshData.data.user);
        }
        return refreshData.data;
    }

    async function api(path, opts = {}, isRetry = false) {
        const token = getToken();
        const headers = { ...(opts.headers || {}) };
        if (!(opts.body instanceof FormData)) {
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        }
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${apiBase}${path}`, { ...opts, headers, credentials: 'include' });
        const data = await res.json().catch(() => ({}));

        const isRefreshPath = path.includes('/auth/refresh') || path.includes('/auth/logout');
        if (res.status === 401 && !isRetry && !isRefreshPath) {
            try {
                const refreshed = await refreshAccessToken();
                if (refreshed?.accessToken) {
                    return api(path, opts, true);
                }
            } catch {}

            setToken(null);
            if (typeof setCurrentUser === 'function') setCurrentUser(null);
            if (typeof onUnauthorized === 'function') onUnauthorized();
            throw new Error('Session expired');
        }

        if (!res.ok) throw new Error(data.error || res.statusText);
        return data;
    }

    return {
        apiBase,
        getToken,
        setToken,
        refreshAccessToken,
        api
    };
}
