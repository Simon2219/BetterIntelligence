import { renderDeployStatCard } from '../deployFormatters.js';

export async function renderDeployOverviewTab({
    content,
    slug,
    data,
    capabilities,
    rootContainer,
    api,
    showToast,
    escapeHtml,
    formatDeployTime,
    renderWorkspace
}) {
    const deployment = data?.deployment || {};
    const operational = data?.operational || {};
    content.innerHTML = `
        <div class="deploy-overview">
            <div class="deploy-overview__stats">
                ${renderDeployStatCard('Chats', Number(operational.chatCount || 0).toLocaleString(), escapeHtml)}
                ${renderDeployStatCard('Messages', Number(operational.messageCount || 0).toLocaleString(), escapeHtml)}
                ${renderDeployStatCard('Last Activity', formatDeployTime(operational.lastMessageAt), escapeHtml)}
            </div>
            <div class="deploy-overview__grid">
                <div class="card deploy-overview__card">
                    <h3 class="deploy-overview__card-title">Embed</h3>
                    <p class="text-muted">Public embed endpoint for this deployment.</p>
                    <div class="deploy-link-row">
                        <code class="deploy-link-row__value" id="deploy-embed-url">${escapeHtml(`${location.origin}/embed/${deployment.slug || slug}`)}</code>
                        <button type="button" class="btn btn-tonal btn-sm" id="copy-embed-url">Copy</button>
                    </div>
                </div>
                <div class="card deploy-overview__card">
                    <h3 class="deploy-overview__card-title">Configuration</h3>
                    <form id="deploy-config-form" class="deploy-config-form">
                        <div class="deploy-switch-row">
                            <div><div class="deploy-switch-row__label">Embed Enabled</div><div class="deploy-switch-row__hint">Allow external embed traffic for this deployment.</div></div>
                            <button type="button" class="deploy-switch ${deployment.embedEnabled ? 'deploy-switch--on' : ''}" id="deploy-embed-toggle" aria-pressed="${deployment.embedEnabled ? 'true' : 'false'}" ${capabilities.canManageConfig ? '' : 'disabled'}><span class="deploy-switch__knob"></span></button>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="deploy-webhook-url">Webhook URL</label>
                            <input id="deploy-webhook-url" class="form-input" type="url" placeholder="https://example.com/webhook" value="${escapeHtml(deployment.webhookUrl || '')}" ${capabilities.canManageConfig ? '' : 'disabled'}>
                        </div>
                        <div class="deploy-config-form__actions"><button class="btn btn-primary" type="submit" ${capabilities.canManageConfig ? '' : 'disabled'}>Save Configuration</button></div>
                    </form>
                </div>
            </div>
        </div>
    `;

    content.querySelector('#copy-embed-url')?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(content.querySelector('#deploy-embed-url')?.textContent || '');
            showToast('Embed URL copied', 'success');
        } catch {
            showToast('Could not copy embed URL', 'error');
        }
    });

    if (!capabilities.canManageConfig) return;
    const toggle = content.querySelector('#deploy-embed-toggle');
    toggle?.addEventListener('click', () => {
        const next = !toggle.classList.contains('deploy-switch--on');
        toggle.classList.toggle('deploy-switch--on', next);
        toggle.setAttribute('aria-pressed', next ? 'true' : 'false');
    });

    content.querySelector('#deploy-config-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submit = content.querySelector('#deploy-config-form button[type="submit"]');
        submit.disabled = true;
        try {
            await api(`/deploy/${encodeURIComponent(slug)}/config`, {
                method: 'PATCH',
                body: JSON.stringify({
                    embedEnabled: !!content.querySelector('#deploy-embed-toggle')?.classList.contains('deploy-switch--on'),
                    webhookUrl: String(content.querySelector('#deploy-webhook-url')?.value || '').trim()
                })
            });
            showToast('Deployment configuration updated', 'success');
            await renderWorkspace(rootContainer, slug, 'overview');
        } catch (error) {
            showToast(error.message || 'Failed to update configuration', 'error');
        } finally {
            submit.disabled = false;
        }
    });
}
