export function createSettingsView(deps) {
    const { api, showToast, showConfirm, logout, applyAppearance, getCurrentUser, escapeHtml } = deps;

async function renderSettings(container) {
    const currentUser = getCurrentUser();
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const settings = currentUser?.settings && typeof currentUser.settings === 'object' ? currentUser.settings : {};
    const userTheme = settings.theme || theme;
    container.innerHTML = `
        <div class="container">
            <h2 class="settings-title">User Settings</h2>
            <div class="card settings-card">
                <div class="settings-section">
                    <h3 class="settings-section__title">Appearance</h3>
                    <div class="flex-between settings-row">
                        <span class="text-secondary">Dark mode</span>
                        <div class="form-toggle ${userTheme === 'dark' ? 'form-toggle--active' : ''}" id="theme-toggle">
                            <div class="form-toggle__knob"></div>
                        </div>
                    </div>
                </div>
                <div class="settings-section">
                    <h3 class="settings-section__title">Account</h3>
                    <button type="button" class="btn btn-ghost btn-block" id="change-password">Change Password</button>
                </div>
                <div class="settings-section">
                    <button type="button" class="btn btn-danger" id="settings-logout">Logout</button>
                </div>
            </div>
        </div>
    `;
    const themeToggle = container.querySelector('#theme-toggle');
    themeToggle?.addEventListener('click', async () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        themeToggle.classList.toggle('form-toggle--active', newTheme === 'dark');
        await applyAppearance();
        try {
            await api('/users/me', { method: 'PUT', body: JSON.stringify({ settings: { ...settings, theme: newTheme } }) });
            if (currentUser) currentUser.settings = { ...(currentUser.settings || {}), theme: newTheme };
            showToast('Theme updated', 'success');
        } catch (e) { showToast(e.message, 'error'); }
    });
    container.querySelector('#change-password')?.addEventListener('click', async () => {
        const { showPrompt } = await import('../components/Dialog.js');
        const current = await showPrompt({ title: 'Change Password', message: 'Enter your current password.', placeholder: 'Current password', type: 'password', label: 'Current Password' });
        if (!current) return;
        const newPass = await showPrompt({ title: 'New Password', message: 'Enter your new password (min 8 characters).', placeholder: 'New password', type: 'password', label: 'New Password' });
        if (!newPass) return;
        try {
            await api('/users/me/password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: newPass }) });
            showToast('Password changed. Please log in again.', 'success');
            setTimeout(logout, 1500);
        } catch (e) { showToast(e.message, 'error'); }
    });
    container.querySelector('#settings-logout')?.addEventListener('click', async () => {
        const confirmed = await showConfirm({ title: 'Logout', message: 'Are you sure you want to log out?', confirmText: 'Logout', danger: true });
        if (confirmed) logout();
    });
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

    return { renderSettings };
}
