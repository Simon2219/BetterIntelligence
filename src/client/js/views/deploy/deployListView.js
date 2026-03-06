import { deployBadgeClass, deployRoleLabel, normalizeDeployRole } from './deployPermissions.js';
import { formatDeployTime, slugifyDeployValue } from './deployFormatters.js';

function renderDeployListCard(row, { escapeHtml }) {
    const role = normalizeDeployRole(row?.access?.role);
    const embedOn = !!row?.status?.embedEnabled;
    const apiOn = !!row?.status?.apiEnabled;
    return `
        <button type="button" class="deploy-list-card" data-open-slug="${escapeHtml(row.slug || '')}">
            <div class="deploy-list-card__head">
                <div class="deploy-list-card__identity">
                    <span class="deploy-list-card__slug">/${escapeHtml(row.slug || '')}</span>
                    <span class="${deployBadgeClass(role)}">${escapeHtml(deployRoleLabel(role))}</span>
                </div>
                <div class="deploy-list-card__chips">
                    <span class="deploy-chip ${embedOn ? 'deploy-chip--ok' : 'deploy-chip--off'}">Embed ${embedOn ? 'On' : 'Off'}</span>
                    <span class="deploy-chip ${apiOn ? 'deploy-chip--ok' : 'deploy-chip--off'}">API ${apiOn ? 'On' : 'Off'}</span>
                </div>
            </div>
            <div class="deploy-list-card__meta">
                <div><div class="deploy-list-card__meta-label">Agent</div><div class="deploy-list-card__meta-value">${escapeHtml(row?.agent?.name || 'Unknown')}</div></div>
                <div><div class="deploy-list-card__meta-label">Chats</div><div class="deploy-list-card__meta-value">${Number(row?.activity?.chatCount || 0).toLocaleString()}</div></div>
                <div><div class="deploy-list-card__meta-label">Last Activity</div><div class="deploy-list-card__meta-value">${escapeHtml(formatDeployTime(row?.activity?.lastMessageAt))}</div></div>
            </div>
        </button>
    `;
}

export async function renderDeployList({
    container,
    info,
    api,
    navigate,
    showToast,
    escapeHtml
}) {
    const q = String(info?.params?.get('q') || '').trim();
    let deployments = [];
    let agents = [];
    try {
        const [deploymentsRes, agentsRes, hubAgentsRes] = await Promise.all([
            api(`/deploy${q ? `?q=${encodeURIComponent(q)}` : ''}`),
            api('/agents').catch(() => ({ data: [] })),
            api('/agents/hub').catch(() => ({ data: [] }))
        ]);
        deployments = deploymentsRes?.data?.deployments || [];
        const merged = new Map();
        [...(agentsRes?.data || []), ...(hubAgentsRes?.data || [])].forEach((agent) => {
            if (agent?.id && !merged.has(agent.id)) merged.set(agent.id, agent);
        });
        agents = [...merged.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    } catch (error) {
        container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(error.message || 'Failed to load deployments')}</p></div>`;
        return;
    }

    container.innerHTML = `
        <div class="container deploy-screen">
            <div class="view-header deploy-screen__header">
                <h2 class="view-header__title">Deployments</h2>
                <div class="view-header__actions deploy-screen__actions">
                    <form class="deploy-search" id="deploy-list-search-form">
                        <input class="form-input form-input--sm" id="deploy-list-search" type="search" placeholder="Search deployments" value="${escapeHtml(q)}">
                        <button class="btn btn-tonal btn-sm" type="submit">Search</button>
                    </form>
                    <button class="btn btn-primary" type="button" id="deploy-open-create">New Deployment</button>
                </div>
            </div>

            <div class="card deploy-create-panel deploy-create-panel--hidden" id="deploy-create-panel">
                <div class="deploy-create-panel__head">
                    <h3 class="deploy-create-panel__title">Create Deployment</h3>
                    <button class="btn btn-ghost btn-sm" type="button" id="deploy-close-create">Close</button>
                </div>
                <form id="deploy-create-form" class="deploy-create-form">
                    <div class="form-group">
                        <label class="form-label" for="deploy-create-agent">Agent</label>
                        <select id="deploy-create-agent" class="form-input" required>
                            <option value="">Select an agent...</option>
                            ${agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name || agent.id)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="deploy-create-slug">Slug</label>
                        <input id="deploy-create-slug" class="form-input" type="text" minlength="3" maxlength="50" placeholder="support-bot" required>
                        <div class="form-hint">Lowercase letters, numbers, and hyphens.</div>
                    </div>
                    <div class="deploy-create-form__actions"><button class="btn btn-primary" type="submit">Create Deployment</button></div>
                </form>
            </div>

            <div class="deploy-list">
                ${deployments.length ? deployments.map((deployment) => renderDeployListCard(deployment, { escapeHtml })).join('') : '<div class="card"><p class="text-muted">No deployments found.</p></div>'}
            </div>
        </div>
    `;

    container.querySelectorAll('[data-open-slug]').forEach((el) => {
        el.addEventListener('click', () => {
            const slug = String(el.getAttribute('data-open-slug') || '').trim();
            if (slug) navigate(`/deploy/${encodeURIComponent(slug)}`);
        });
    });

    container.querySelector('#deploy-list-search-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const nextQ = String(container.querySelector('#deploy-list-search')?.value || '').trim();
        navigate(nextQ ? `/deploy?q=${encodeURIComponent(nextQ)}` : '/deploy');
    });

    const panel = container.querySelector('#deploy-create-panel');
    const form = container.querySelector('#deploy-create-form');
    const slugInput = container.querySelector('#deploy-create-slug');

    container.querySelector('#deploy-open-create')?.addEventListener('click', () => {
        panel?.classList.remove('deploy-create-panel--hidden');
        setTimeout(() => container.querySelector('#deploy-create-agent')?.focus(), 20);
    });

    container.querySelector('#deploy-close-create')?.addEventListener('click', () => {
        panel?.classList.add('deploy-create-panel--hidden');
        form?.reset();
    });

    slugInput?.addEventListener('input', () => {
        const slug = slugifyDeployValue(slugInput.value);
        if (slug !== slugInput.value) slugInput.value = slug;
    });

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const agentId = String(container.querySelector('#deploy-create-agent')?.value || '').trim();
        const slug = slugifyDeployValue(container.querySelector('#deploy-create-slug')?.value || '');
        const submit = form.querySelector('button[type="submit"]');
        if (!agentId || !slug) {
            showToast('Agent and slug are required', 'error');
            return;
        }
        submit.disabled = true;
        try {
            await api('/deploy', { method: 'POST', body: JSON.stringify({ agentId, slug }) });
            showToast('Deployment created', 'success');
            navigate(`/deploy/${encodeURIComponent(slug)}`);
        } catch (error) {
            showToast(error.message || 'Failed to create deployment', 'error');
        } finally {
            submit.disabled = false;
        }
    });
}
