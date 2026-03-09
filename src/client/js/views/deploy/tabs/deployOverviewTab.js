import {
    formatDeployAccessMode,
    renderDeployStatCard,
    summarizeDeployQuota
} from '../deployFormatters.js';

function renderRuntimeStatus(runtimeHealth, escapeHtml) {
    const state = String(runtimeHealth?.state || 'unknown').toLowerCase();
    const label = state === 'ok'
        ? 'Ready'
        : state === 'warning'
            ? 'Degraded'
            : state === 'error'
                ? 'Blocked'
                : 'Unknown';
    const toneClass = state === 'ok'
        ? 'deploy-chip--ok'
        : state === 'warning'
            ? 'deploy-chip--warn'
            : state === 'error'
                ? 'deploy-chip--danger'
                : 'deploy-chip--subtle';
    return `<span class="deploy-chip ${toneClass}" title="${escapeHtml(runtimeHealth?.summary || '')}">${escapeHtml(label)}</span>`;
}

function renderQuotaRows(quota, escapeHtml) {
    const metrics = Object.entries(quota?.metrics || {});
    if (!metrics.length) return '<p class="text-muted">No sponsor quota attached.</p>';
    return `
        <div class="deploy-quota-grid">
            ${metrics.map(([metricKey, metric]) => `
                <div class="deploy-quota-item">
                    <div class="deploy-quota-item__label">${escapeHtml(metricKey.replace(/^monthly_/, '').replace(/_/g, ' '))}</div>
                    <div class="deploy-quota-item__value">${Number(metric.used || 0).toLocaleString()} / ${Number(metric.limit || 0).toLocaleString()}</div>
                    <div class="deploy-quota-item__hint">${Number(metric.remaining || 0).toLocaleString()} left (${Number(metric.percentUsed || 0)}%)</div>
                </div>
            `).join('')}
        </div>
    `;
}

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
    const accessPolicy = data?.accessPolicy || {};
    const runtimeHealth = data?.runtimeHealth || {};
    const catalog = data?.catalog || {};
    const approvedRevision = Array.isArray(catalog?.revisions)
        ? catalog.revisions.find((revision) => revision.isApproved)
        : null;
    const embedUrl = `${location.origin}/embed/${deployment.slug || slug}`;
    const quotaLabel = summarizeDeployQuota(accessPolicy?.sponsorQuota);

    content.innerHTML = `
        <div class="deploy-overview">
            <div class="deploy-overview__stats">
                ${renderDeployStatCard('Chats', Number(operational.chatCount || 0).toLocaleString(), escapeHtml)}
                ${renderDeployStatCard('Messages', Number(operational.messageCount || 0).toLocaleString(), escapeHtml)}
                ${renderDeployStatCard('Requests 30d', Number(operational.requests30d || 0).toLocaleString(), escapeHtml)}
                ${renderDeployStatCard('Tokens 30d', Number(operational.totalTokens30d || 0).toLocaleString(), escapeHtml)}
                ${renderDeployStatCard('Cost 30d', `$${Number(operational.estimatedCostUsd30d || 0).toFixed(2)}`, escapeHtml)}
                ${renderDeployStatCard('Last Activity', formatDeployTime(operational.lastMessageAt), escapeHtml)}
            </div>
            <div class="deploy-overview__grid">
                <div class="card deploy-overview__card">
                    <h3 class="deploy-overview__card-title">Embed & API</h3>
                    <div class="deploy-overview__summary-list">
                        <div class="deploy-overview__summary-row">
                            <span class="deploy-overview__summary-label">Embed endpoint</span>
                            <div class="deploy-link-row">
                                <code class="deploy-link-row__value" id="deploy-embed-url">${escapeHtml(embedUrl)}</code>
                                <button type="button" class="btn btn-tonal btn-sm" id="copy-embed-url">Copy</button>
                            </div>
                        </div>
                        <div class="deploy-overview__summary-row">
                            <span class="deploy-overview__summary-label">API access</span>
                            <span class="deploy-inline-value">${deployment.apiEnabled ? 'Enabled' : 'Disabled until key is generated'}</span>
                        </div>
                    </div>
                    ${capabilities.canManageConfig ? `
                        <div class="deploy-config-form__actions">
                            <button class="btn btn-tonal" type="button" id="deploy-generate-api-key">${deployment.apiEnabled ? 'Regenerate API Key' : 'Generate API Key'}</button>
                        </div>
                    ` : ''}
                </div>
                <div class="card deploy-overview__card">
                    <h3 class="deploy-overview__card-title">Runtime Status</h3>
                    <div class="deploy-overview__summary-list">
                        <div class="deploy-overview__summary-row">
                            <span class="deploy-overview__summary-label">Health</span>
                            ${renderRuntimeStatus(runtimeHealth, escapeHtml)}
                        </div>
                        <div class="deploy-overview__summary-row">
                            <span class="deploy-overview__summary-label">Summary</span>
                            <span class="deploy-inline-value">${escapeHtml(runtimeHealth?.summary || 'No runtime summary')}</span>
                        </div>
                        <div class="deploy-overview__summary-row">
                            <span class="deploy-overview__summary-label">Consumer access</span>
                            <span class="deploy-inline-value">${escapeHtml(formatDeployAccessMode(accessPolicy?.consumer_access_mode))}</span>
                        </div>
                        <div class="deploy-overview__summary-row">
                            <span class="deploy-overview__summary-label">Pinned revision</span>
                            <span class="deploy-inline-value">${escapeHtml(accessPolicy?.pinnedRevision?.revisionNumber ? `Revision ${accessPolicy.pinnedRevision.revisionNumber}` : 'Using current runtime revision')}</span>
                        </div>
                        <div class="deploy-overview__summary-row">
                            <span class="deploy-overview__summary-label">Sponsor quota</span>
                            <span class="deploy-inline-value">${escapeHtml(quotaLabel)}</span>
                        </div>
                    </div>
                </div>
                <div class="card deploy-overview__card">
                    <h3 class="deploy-overview__card-title">Deployment Configuration</h3>
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
                <div class="card deploy-overview__card">
                    <h3 class="deploy-overview__card-title">Pinned Revision & Sponsorship</h3>
                    <div class="deploy-overview__summary-list">
                        <div class="deploy-overview__summary-row">
                            <span class="deploy-overview__summary-label">Listing</span>
                            <span class="deploy-inline-value">${escapeHtml(catalog?.listing?.title || 'No listing attached')}</span>
                        </div>
                        <div class="deploy-overview__summary-row">
                            <span class="deploy-overview__summary-label">Approved revision</span>
                            <span class="deploy-inline-value">${escapeHtml(approvedRevision?.revisionNumber ? `Revision ${approvedRevision.revisionNumber}` : 'None')}</span>
                        </div>
                    </div>
                    ${renderQuotaRows(accessPolicy?.sponsorQuota, escapeHtml)}
                    <div class="form-hint">Detailed access mode, pinned revision, and sponsor-grant controls live in the Access tab.</div>
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

    content.querySelector('#deploy-generate-api-key')?.addEventListener('click', async () => {
        const button = content.querySelector('#deploy-generate-api-key');
        if (!button) return;
        button.disabled = true;
        try {
            const response = await api(`/deploy/${encodeURIComponent(slug)}/api-key`, { method: 'POST' });
            showToast('API key generated. It is shown once in the response payload only.', 'success');
            const apiKey = response?.data?.apiKey || '';
            if (apiKey) {
                await navigator.clipboard.writeText(apiKey).catch(() => {});
                showToast('API key copied to clipboard', 'success');
            }
            await renderWorkspace(rootContainer, slug, 'overview');
        } catch (error) {
            showToast(error.message || 'Failed to generate API key', 'error');
        } finally {
            button.disabled = false;
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
