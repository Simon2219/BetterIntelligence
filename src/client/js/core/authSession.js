function applyUserTheme(user) {
    const theme = user?.settings?.theme;
    if (theme && ['dark', 'light'].includes(theme)) {
        document.documentElement.setAttribute('data-theme', theme);
    }
}

export function createAuthSession({
    getToken,
    setToken,
    setCurrentUser,
    refreshAccessToken,
    api,
    ensureSocket,
    destroyActiveSocket,
    navigate
} = {}) {
    async function checkSession() {
        try {
            const refreshed = await refreshAccessToken();
            if (refreshed?.user) {
                setCurrentUser(refreshed.user);
                applyUserTheme(refreshed.user);
                ensureSocket?.();
                return true;
            }
        } catch {}

        if (!getToken?.()) {
            setToken?.(null);
            setCurrentUser?.(null);
            destroyActiveSocket?.();
            return false;
        }

        try {
            const { data } = await api('/auth/session');
            if (data?.user && getToken?.()) {
                setCurrentUser?.(data.user);
                applyUserTheme(data.user);
                ensureSocket?.();
                return true;
            }
        } catch {}

        setToken?.(null);
        setCurrentUser?.(null);
        destroyActiveSocket?.();
        return false;
    }

    async function logout() {
        try {
            await api('/auth/logout', { method: 'POST' });
        } catch {}
        setToken?.(null);
        setCurrentUser?.(null);
        destroyActiveSocket?.();
        navigate?.('/');
    }

    return {
        checkSession,
        logout,
        applyUserTheme
    };
}
