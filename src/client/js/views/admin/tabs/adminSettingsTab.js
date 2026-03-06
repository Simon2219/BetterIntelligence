export async function renderSettingsTab({ content, api, escapeHtml, showToast }) {
    try {
        const { data } = await api('/admin/config');
        const cfg = data || {};
        const keys = [
            ['auth.accessTokenExpiryMinutes', 'Access token expiry (minutes)', cfg.auth?.accessTokenExpiryMinutes ?? 60],
            ['ai.enabled', 'AI enabled', cfg.ai?.enabled ?? true],
            ['ai.ollamaUrl', 'Ollama URL', cfg.ai?.ollamaUrl ?? ''],
            ['ai.comfyuiUrl', 'ComfyUI URL', cfg.ai?.comfyuiUrl ?? '']
        ];

        content.innerHTML = `
            <div class="admin-section-top">
                <p class="text-muted admin-section-note">Runtime config. Changes apply immediately.</p>
                <div class="form-group">
                    ${keys.map(([key, label, value]) => `
                        <label class="form-label">${escapeHtml(label)}</label>
                        <input
                            type="${typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'checkbox' : 'text'}"
                            class="form-input admin-config-input"
                            data-config-key="${escapeHtml(key)}"
                            value="${typeof value === 'boolean' ? '' : escapeHtml(String(value))}"
                            ${typeof value === 'boolean' && value ? 'checked' : ''}
                        />
                    `).join('')}
                </div>
                <button class="btn btn-primary" id="save-settings">Save Settings</button>
            </div>
        `;

        content.querySelector('#save-settings')?.addEventListener('click', async () => {
            const settings = {};
            content.querySelectorAll('[data-config-key]').forEach((input) => {
                let value = input.type === 'checkbox' ? input.checked : input.value;
                if (input.type === 'number') value = parseInt(value, 10) || 0;
                settings[input.dataset.configKey] = value;
            });
            try {
                await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ settings }) });
                showToast('Settings saved', 'success');
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    } catch (error) {
        content.innerHTML = `<p class="text-danger">${escapeHtml(error.message)}</p>`;
    }
}
