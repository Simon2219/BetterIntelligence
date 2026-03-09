import { formatDeployAccessMode, renderDeployStatCard, summarizeDeployQuota } from '../deployFormatters.js';

function renderQuotaGrid(quota, escapeHtml) {
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

export async function renderDeployStatsTab({
    content,
    slug,
    data,
    api,
    escapeHtml
}) {
    let days = 30;

    const draw = async () => {
        let stats;
        try {
            stats = (await api(`/deploy/${encodeURIComponent(slug)}/stats?days=${days}`))?.data || {};
        } catch (error) {
            content.innerHTML = `<div class="card"><p class="text-muted">${escapeHtml(error.message || 'Failed to load statistics')}</p></div>`;
            return;
        }

        const totals = stats?.totals || {};
        const timeline = Array.isArray(stats?.timeline) ? stats.timeline : [];
        const models = Array.isArray(stats?.models) ? stats.models : [];
        const accessPolicy = stats?.accessPolicy || data?.accessPolicy || {};
        const runtimeHealth = stats?.runtimeHealth || data?.runtimeHealth || {};
        content.innerHTML = `
            <div class="deploy-stats">
                <div class="deploy-stats__toolbar card"><h3>Deployment Statistics</h3><div class="deploy-stats__range" role="group" aria-label="Statistics time range">${[7, 30, 90].map((d) => `<button type="button" class="deploy-range-btn ${d === days ? 'deploy-range-btn--active' : ''}" data-days="${d}">${d}d</button>`).join('')}</div></div>
                <div class="deploy-overview__stats">
                    ${renderDeployStatCard('Chats', Number(totals.chats || 0).toLocaleString(), escapeHtml)}
                    ${renderDeployStatCard('Messages', Number(totals.messages || 0).toLocaleString(), escapeHtml)}
                    ${renderDeployStatCard('Requests', Number(totals.requests || 0).toLocaleString(), escapeHtml)}
                    ${renderDeployStatCard('Errors', Number(totals.errors || 0).toLocaleString(), escapeHtml)}
                    ${renderDeployStatCard('Tokens', Number(totals.totalTokens || 0).toLocaleString(), escapeHtml)}
                    ${renderDeployStatCard('Hosted Cost', `$${Number(totals.estimatedCostUsd || 0).toFixed(2)}`, escapeHtml)}
                    ${renderDeployStatCard('Error Rate', `${Number(totals.errorRate || 0).toFixed(2)}%`, escapeHtml)}
                    ${renderDeployStatCard('P95 Latency', `${Number(totals.p95LatencyMs || 0).toLocaleString()} ms`, escapeHtml)}
                </div>
                <div class="deploy-overview__grid">
                    <div class="card deploy-overview__card">
                        <h3 class="deploy-overview__card-title">Access & Runtime</h3>
                        <div class="deploy-overview__summary-list">
                            <div class="deploy-overview__summary-row">
                                <span class="deploy-overview__summary-label">Access mode</span>
                                <span class="deploy-inline-value">${escapeHtml(formatDeployAccessMode(accessPolicy?.consumer_access_mode))}</span>
                            </div>
                            <div class="deploy-overview__summary-row">
                                <span class="deploy-overview__summary-label">Runtime</span>
                                <span class="deploy-inline-value">${escapeHtml(runtimeHealth?.summary || 'No runtime summary')}</span>
                            </div>
                            <div class="deploy-overview__summary-row">
                                <span class="deploy-overview__summary-label">Sponsor quota</span>
                                <span class="deploy-inline-value">${escapeHtml(summarizeDeployQuota(accessPolicy?.sponsorQuota))}</span>
                            </div>
                        </div>
                        ${renderQuotaGrid(accessPolicy?.sponsorQuota, escapeHtml)}
                    </div>
                    <div class="card deploy-overview__card">
                        <h3 class="deploy-overview__card-title">Usage by Model</h3>
                        ${models.length ? `
                            <div class="deploy-model-usage-list">
                                ${models.map((model) => `
                                    <div class="deploy-control-row">
                                        <div>
                                            <div class="deploy-control-row__title">${escapeHtml(model.providerName || 'provider')} / ${escapeHtml(model.modelId || 'model')}</div>
                                            <div class="text-muted">${Number(model.totalTokens || 0).toLocaleString()} tokens · ${Number(model.requests || 0).toLocaleString()} requests</div>
                                        </div>
                                        <div class="deploy-chip deploy-chip--subtle">$${Number(model.estimatedCostUsd || 0).toFixed(2)}</div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<p class="text-muted">No model usage available for this range.</p>'}
                    </div>
                </div>
                <div class="card deploy-timeline">
                    <h4>Daily Timeline</h4>
                    ${timeline.length ? `<div class="deploy-timeline__table"><div class="deploy-timeline__row deploy-timeline__row--head"><span>Day</span><span>Chats</span><span>Messages</span><span>Requests</span><span>Errors</span><span>Tokens</span></div>${timeline.map((point) => `<div class="deploy-timeline__row"><span>${escapeHtml(point.day || '')}</span><span>${Number(point.chats || 0).toLocaleString()}</span><span>${Number(point.messages || 0).toLocaleString()}</span><span>${Number(point.requests || 0).toLocaleString()}</span><span>${Number(point.errors || 0).toLocaleString()}</span><span>${Number(point.totalTokens || 0).toLocaleString()}</span></div>`).join('')}</div>` : '<p class="text-muted">No statistics available for this range.</p>'}
                </div>
            </div>
        `;
        content.querySelectorAll('[data-days]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const next = parseInt(btn.getAttribute('data-days'), 10);
                if (!Number.isFinite(next) || next === days) return;
                days = next;
                await draw();
            });
        });
    };

    await draw();
}
