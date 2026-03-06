import { renderDeployStatCard } from '../deployFormatters.js';

export async function renderDeployStatsTab({
    content,
    slug,
    api,
    escapeHtml
}) {
    let days = 30;

    const draw = async () => {
        let data;
        try {
            data = (await api(`/deploy/${encodeURIComponent(slug)}/stats?days=${days}`))?.data || {};
        } catch (error) {
            content.innerHTML = `<div class="card"><p class="text-muted">${escapeHtml(error.message || 'Failed to load statistics')}</p></div>`;
            return;
        }

        const totals = data?.totals || {};
        const timeline = Array.isArray(data?.timeline) ? data.timeline : [];
        content.innerHTML = `
            <div class="deploy-stats">
                <div class="deploy-stats__toolbar card"><h3>Deployment Statistics</h3><div class="deploy-stats__range" role="group" aria-label="Statistics time range">${[7, 30, 90].map((d) => `<button type="button" class="deploy-range-btn ${d === days ? 'deploy-range-btn--active' : ''}" data-days="${d}">${d}d</button>`).join('')}</div></div>
                <div class="deploy-overview__stats">
                    ${renderDeployStatCard('Chats', Number(totals.chats || 0).toLocaleString(), escapeHtml)}
                    ${renderDeployStatCard('Messages', Number(totals.messages || 0).toLocaleString(), escapeHtml)}
                    ${renderDeployStatCard('Requests', Number(totals.requests || 0).toLocaleString(), escapeHtml)}
                    ${renderDeployStatCard('Errors', Number(totals.errors || 0).toLocaleString(), escapeHtml)}
                    ${renderDeployStatCard('Error Rate', `${Number(totals.errorRate || 0).toFixed(2)}%`, escapeHtml)}
                    ${renderDeployStatCard('P95 Latency', `${Number(totals.p95LatencyMs || 0).toLocaleString()} ms`, escapeHtml)}
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
