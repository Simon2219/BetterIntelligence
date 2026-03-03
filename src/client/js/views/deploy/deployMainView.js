export function createDeployView(deps) {
    const { api, navigate, showToast, escapeHtml, showConfirm } = deps;
    const PERM_KEYS = ['view_chats', 'manage_chats', 'manage_config', 'manage_members'];
    const PERM_LABELS = {
        view_chats: 'View Chats',
        manage_chats: 'Manage Chats',
        manage_config: 'Manage Config',
        manage_members: 'Manage Members'
    };

    const normRole = (role) => {
        const r = String(role || '').trim().toLowerCase();
        return (r === 'owner' || r === 'admin') ? r : 'manager';
    };

    const fullPerms = () => ({ view_chats: true, manage_chats: true, manage_config: true, manage_members: true });
    const normPerms = (raw, role) => {
        const r = normRole(role);
        if (r === 'owner' || r === 'admin') return fullPerms();
        const p = raw && typeof raw === 'object' ? raw : {};
        return {
            view_chats: p.view_chats !== false,
            manage_chats: !!p.manage_chats,
            manage_config: !!p.manage_config,
            manage_members: !!p.manage_members
        };
    };

    const badgeClass = (role) => `deploy-role-badge deploy-role-badge--${normRole(role)}`;
    const roleLabel = (role) => { const r = normRole(role); return r[0].toUpperCase() + r.slice(1); };
    const fmtTime = (iso) => {
        if (!iso) return 'Never';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return 'Never';
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    function parsePath(path) {
        const safe = String(path || '/deploy');
        const [pathname, query = ''] = safe.split('?');
        const m = pathname.match(/^\/deploy\/([^/?#]+)/);
        const slug = m?.[1] ? decodeURIComponent(m[1]) : null;
        const params = new URLSearchParams(query);
        return { slug, tab: String(params.get('tab') || 'overview').toLowerCase(), params };
    }

    const slugify = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
    const caps = (access) => {
        const role = normRole(access?.role);
        const perms = normPerms(access?.permissions, role);
        const oa = role === 'owner' || role === 'admin';
        return {
            role,
            perms,
            canViewChats: oa || perms.view_chats || perms.manage_chats,
            canManageChats: oa || perms.manage_chats,
            canManageConfig: oa || perms.manage_config,
            canManageMembers: oa || perms.manage_members
        };
    };

    function listCard(row) {
        const role = normRole(row?.access?.role);
        const embedOn = !!row?.status?.embedEnabled;
        const apiOn = !!row?.status?.apiEnabled;
        return `
            <button type="button" class="deploy-list-card" data-open-slug="${escapeHtml(row.slug || '')}">
                <div class="deploy-list-card__head">
                    <div class="deploy-list-card__identity">
                        <span class="deploy-list-card__slug">/${escapeHtml(row.slug || '')}</span>
                        <span class="${badgeClass(role)}">${escapeHtml(roleLabel(role))}</span>
                    </div>
                    <div class="deploy-list-card__chips">
                        <span class="deploy-chip ${embedOn ? 'deploy-chip--ok' : 'deploy-chip--off'}">Embed ${embedOn ? 'On' : 'Off'}</span>
                        <span class="deploy-chip ${apiOn ? 'deploy-chip--ok' : 'deploy-chip--off'}">API ${apiOn ? 'On' : 'Off'}</span>
                    </div>
                </div>
                <div class="deploy-list-card__meta">
                    <div><div class="deploy-list-card__meta-label">Agent</div><div class="deploy-list-card__meta-value">${escapeHtml(row?.agent?.name || 'Unknown')}</div></div>
                    <div><div class="deploy-list-card__meta-label">Chats</div><div class="deploy-list-card__meta-value">${Number(row?.activity?.chatCount || 0).toLocaleString()}</div></div>
                    <div><div class="deploy-list-card__meta-label">Last Activity</div><div class="deploy-list-card__meta-value">${escapeHtml(fmtTime(row?.activity?.lastMessageAt))}</div></div>
                </div>
            </button>
        `;
    }

    async function renderDeployList(container, info) {
        const q = String(info?.params?.get('q') || '').trim();
        let deployments = [];
        let agents = [];
        try {
            const [dRes, aRes, hRes] = await Promise.all([
                api(`/deploy${q ? `?q=${encodeURIComponent(q)}` : ''}`),
                api('/agents').catch(() => ({ data: [] })),
                api('/agents/hub').catch(() => ({ data: [] }))
            ]);
            deployments = dRes?.data?.deployments || [];
            const map = new Map();
            [...(aRes?.data || []), ...(hRes?.data || [])].forEach((a) => {
                if (a?.id && !map.has(a.id)) map.set(a.id, a);
            });
            agents = [...map.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        } catch (err) {
            container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(err.message || 'Failed to load deployments')}</p></div>`;
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
                                ${agents.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name || a.id)}</option>`).join('')}
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
                    ${deployments.length ? deployments.map((d) => listCard(d)).join('') : '<div class="card"><p class="text-muted">No deployments found.</p></div>'}
                </div>
            </div>
        `;

        container.querySelectorAll('[data-open-slug]').forEach((el) => {
            el.addEventListener('click', () => {
                const slug = String(el.getAttribute('data-open-slug') || '').trim();
                if (slug) navigate(`/deploy/${encodeURIComponent(slug)}`);
            });
        });

        container.querySelector('#deploy-list-search-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const nq = String(container.querySelector('#deploy-list-search')?.value || '').trim();
            navigate(nq ? `/deploy?q=${encodeURIComponent(nq)}` : '/deploy');
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
            const s = slugify(slugInput.value);
            if (s !== slugInput.value) slugInput.value = s;
        });

        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const agentId = String(container.querySelector('#deploy-create-agent')?.value || '').trim();
            const slug = slugify(container.querySelector('#deploy-create-slug')?.value || '');
            const btn = form.querySelector('button[type="submit"]');
            if (!agentId || !slug) {
                showToast('Agent and slug are required', 'error');
                return;
            }
            btn.disabled = true;
            try {
                await api('/deploy', { method: 'POST', body: JSON.stringify({ agentId, slug }) });
                showToast('Deployment created', 'success');
                navigate(`/deploy/${encodeURIComponent(slug)}`);
            } catch (err) {
                showToast(err.message || 'Failed to create deployment', 'error');
            } finally {
                btn.disabled = false;
            }
        });
    }

    function workspaceHeader(data, activeTab, tabs) {
        const dep = data?.deployment || {};
        const ag = data?.agent || {};
        const role = normRole(data?.access?.role);
        return `
            <div class="deploy-workspace__header card">
                <div class="deploy-workspace__header-main">
                    <button type="button" class="btn btn-ghost btn-sm btn-chevron" data-route="/deploy">
                        <span class="ui-chevron ui-chevron--left" aria-hidden="true"></span><span>Back to Deployments</span>
                    </button>
                    <div class="deploy-workspace__title-wrap">
                        <h2 class="deploy-workspace__title">/${escapeHtml(dep.slug || '')}</h2>
                        <span class="${badgeClass(role)}">${escapeHtml(roleLabel(role))}</span>
                    </div>
                    <div class="deploy-workspace__subtitle">Agent: <strong>${escapeHtml(ag.name || 'Unknown')}</strong></div>
                </div>
                <div class="deploy-workspace__tabs" role="tablist" aria-label="Deployment workspace tabs">
                    ${tabs.map((t) => `<button type="button" class="deploy-workspace__tab ${activeTab === t.id ? 'deploy-workspace__tab--active' : ''}" data-switch-tab="${t.id}">${escapeHtml(t.label)}</button>`).join('')}
                </div>
            </div>
        `;
    }

    const statCard = (label, value) => `
        <div class="deploy-stat-card card"><div class="deploy-stat-card__value">${escapeHtml(String(value))}</div><div class="deploy-stat-card__label">${escapeHtml(label)}</div></div>
    `;

    function md(text) {
        let html = escapeHtml(String(text || ''));
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        return html.replace(/\n/g, '<br>');
    }

    function renderDepMsg(m, agentId) {
        const sender = String(m?.senderId || '').trim().toUpperCase();
        const aid = String(agentId || '').trim().toUpperCase();
        const role = sender && sender === aid ? 'assistant' : 'user';
        const body = role === 'assistant' ? md(m?.content || '') : escapeHtml(m?.content || '');
        const ts = fmtTime(m?.timestamp || m?.created_at);
        return `<div class="chat-msg chat-msg--${role}"><div class="chat-msg__content">${body || '<span class="text-muted">[No text]</span>'}</div><span class="chat-msg__time">${escapeHtml(ts)}</span></div>`;
    }

    async function renderOverview(content, slug, data, cap, root) {
        const dep = data?.deployment || {};
        const op = data?.operational || {};
        content.innerHTML = `
            <div class="deploy-overview">
                <div class="deploy-overview__stats">
                    ${statCard('Chats', Number(op.chatCount || 0).toLocaleString())}
                    ${statCard('Messages', Number(op.messageCount || 0).toLocaleString())}
                    ${statCard('Last Activity', fmtTime(op.lastMessageAt))}
                </div>
                <div class="deploy-overview__grid">
                    <div class="card deploy-overview__card">
                        <h3 class="deploy-overview__card-title">Embed</h3>
                        <p class="text-muted">Public embed endpoint for this deployment.</p>
                        <div class="deploy-link-row">
                            <code class="deploy-link-row__value" id="deploy-embed-url">${escapeHtml(`${location.origin}/embed/${dep.slug || slug}`)}</code>
                            <button type="button" class="btn btn-tonal btn-sm" id="copy-embed-url">Copy</button>
                        </div>
                    </div>
                    <div class="card deploy-overview__card">
                        <h3 class="deploy-overview__card-title">Configuration</h3>
                        <form id="deploy-config-form" class="deploy-config-form">
                            <div class="deploy-switch-row">
                                <div><div class="deploy-switch-row__label">Embed Enabled</div><div class="deploy-switch-row__hint">Allow external embed traffic for this deployment.</div></div>
                                <button type="button" class="deploy-switch ${dep.embedEnabled ? 'deploy-switch--on' : ''}" id="deploy-embed-toggle" aria-pressed="${dep.embedEnabled ? 'true' : 'false'}" ${cap.canManageConfig ? '' : 'disabled'}><span class="deploy-switch__knob"></span></button>
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="deploy-webhook-url">Webhook URL</label>
                                <input id="deploy-webhook-url" class="form-input" type="url" placeholder="https://example.com/webhook" value="${escapeHtml(dep.webhookUrl || '')}" ${cap.canManageConfig ? '' : 'disabled'}>
                            </div>
                            <div class="deploy-config-form__actions"><button class="btn btn-primary" type="submit" ${cap.canManageConfig ? '' : 'disabled'}>Save Configuration</button></div>
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

        if (!cap.canManageConfig) return;
        const toggle = content.querySelector('#deploy-embed-toggle');
        toggle?.addEventListener('click', () => {
            const next = !toggle.classList.contains('deploy-switch--on');
            toggle.classList.toggle('deploy-switch--on', next);
            toggle.setAttribute('aria-pressed', next ? 'true' : 'false');
        });

        content.querySelector('#deploy-config-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = content.querySelector('#deploy-config-form button[type="submit"]');
            btn.disabled = true;
            try {
                await api(`/deploy/${encodeURIComponent(slug)}/config`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        embedEnabled: !!content.querySelector('#deploy-embed-toggle')?.classList.contains('deploy-switch--on'),
                        webhookUrl: String(content.querySelector('#deploy-webhook-url')?.value || '').trim()
                    })
                });
                showToast('Deployment configuration updated', 'success');
                await renderWorkspace(root, slug, 'overview');
            } catch (err) {
                showToast(err.message || 'Failed to update configuration', 'error');
            } finally {
                btn.disabled = false;
            }
        });
    }

    async function renderChats(content, slug, cap) {
        let selectedId = null;
        let chats = [];

        const loadChats = async () => {
            const res = await api(`/deploy/${encodeURIComponent(slug)}/chats`);
            chats = res?.data?.chats || [];
            if (!selectedId && chats.length) selectedId = chats[0].id;
            if (selectedId && !chats.some((c) => String(c.id).toUpperCase() === String(selectedId).toUpperCase())) selectedId = chats[0]?.id || null;
        };

        const loadMsgs = async (chatId) => {
            if (!chatId) return [];
            const res = await api(`/deploy/${encodeURIComponent(slug)}/chats/${encodeURIComponent(chatId)}/messages`);
            return res?.data?.messages || [];
        };

        const draw = async () => {
            await loadChats();
            const sel = chats.find((c) => String(c.id).toUpperCase() === String(selectedId).toUpperCase()) || null;
            const messages = sel ? await loadMsgs(sel.id) : [];

            content.innerHTML = `
                <div class="deploy-chats">
                    <div class="deploy-chats__sidebar card">
                        <div class="deploy-chats__sidebar-head"><h3>Chats</h3><span class="deploy-chip deploy-chip--subtle">${Number(chats.length).toLocaleString()}</span></div>
                        <div class="deploy-chats__list">
                            ${chats.length ? chats.map((c) => {
        const selectedClass = sel && String(sel.id).toUpperCase() === String(c.id).toUpperCase() ? 'deploy-chat-row--selected' : '';
        const preview = String(c.last_message_preview || c.last_message || '').trim() || 'No messages yet';
        return `<button type="button" class="deploy-chat-row ${selectedClass}" data-chat-select="${escapeHtml(c.id)}"><div class="deploy-chat-row__head"><span class="deploy-chat-row__id">${escapeHtml(c.id)}</span><span class="deploy-chat-row__time">${escapeHtml(fmtTime(c.last_message_at || c.updated_at || c.created_at))}</span></div><div class="deploy-chat-row__preview">${escapeHtml(preview)}</div></button>`;
    }).join('') : '<p class="text-muted">No chats found for this deployment.</p>'}
                        </div>
                    </div>
                    <div class="deploy-chats__thread card">
                        ${sel ? `
                            <div class="deploy-thread__header"><h3>Chat ${escapeHtml(sel.id)}</h3><span class="deploy-chip deploy-chip--subtle">${escapeHtml(fmtTime(sel.last_message_at || sel.updated_at || sel.created_at))}</span></div>
                            <div class="deploy-thread__messages" id="deploy-thread-messages">${messages.length ? messages.map((m) => renderDepMsg(m, sel.ai_agent_id || sel.agent_id)).join('') : '<p class="text-muted">No messages yet.</p>'}</div>
                            ${cap.canManageChats ? `
                                <form id="deploy-operator-form" class="deploy-operator-form">
                                    <textarea id="deploy-operator-input" class="form-input" rows="3" placeholder="Type manual message or prompt for generation..."></textarea>
                                    <div class="deploy-operator-form__actions">
                                        <button class="btn btn-primary" type="button" data-op-action="manual">Send Manual</button>
                                        <button class="btn btn-tonal" type="button" data-op-action="generate">Generate Response</button>
                                    </div>
                                    <div class="form-hint">Generate uses your text as prompt. If empty, latest incoming user message is used.</div>
                                </form>
                            ` : '<p class="text-muted">You have read-only access to deployment chats.</p>'}
                        ` : '<p class="text-muted">Select a chat to view its transcript.</p>'}
                    </div>
                </div>
            `;

            content.querySelectorAll('[data-chat-select]').forEach((el) => {
                el.addEventListener('click', async () => {
                    selectedId = el.getAttribute('data-chat-select');
                    await draw();
                    if (window.matchMedia('(max-width: 70em)').matches) {
                        content.querySelector('.deploy-chats__thread')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });
            });

            const msgWrap = content.querySelector('#deploy-thread-messages');
            if (msgWrap) msgWrap.scrollTop = msgWrap.scrollHeight;

            const form = content.querySelector('#deploy-operator-form');
            if (!form || !sel) return;
            const input = content.querySelector('#deploy-operator-input');
            const buttons = [...content.querySelectorAll('[data-op-action]')];
            const runAction = async (mode) => {
                const text = String(input?.value || '').trim();
                if (mode === 'manual' && !text) {
                    showToast('Manual message cannot be empty', 'error');
                    return;
                }
                buttons.forEach((b) => { b.disabled = true; });
                try {
                    await api(`/chats/${encodeURIComponent(sel.id)}/operator-reply`, {
                        method: 'POST',
                        body: JSON.stringify({ mode, content: text || undefined, useLatestUserMessage: mode === 'generate' && !text })
                    });
                    showToast(mode === 'manual' ? 'Manual message sent' : 'Response generated', 'success');
                    if (input) input.value = '';
                    await draw();
                } catch (err) {
                    showToast(err.message || 'Operator action failed', 'error');
                } finally {
                    buttons.forEach((b) => { b.disabled = false; });
                }
            };

            buttons.forEach((b) => b.addEventListener('click', () => runAction(String(b.getAttribute('data-op-action') || '').trim())));
        };

        await draw();
    }

    const permsGrid = (perms, editable) => `
        <div class="deploy-permissions-grid">
            ${PERM_KEYS.map((k) => `<button type="button" class="deploy-perm-toggle ${perms[k] ? 'deploy-perm-toggle--on' : ''}" data-perm-key="${k}" aria-pressed="${perms[k] ? 'true' : 'false'}" ${editable ? '' : 'disabled'}>${escapeHtml(PERM_LABELS[k])}</button>`).join('')}
        </div>
    `;

    async function renderAccess(content, slug, cap) {
        if (!cap.canManageMembers) {
            content.innerHTML = '<div class="card"><p class="text-muted">You do not have access to manage deployment members.</p></div>';
            return;
        }

        let members = [];
        let searchResults = [];

        const loadMembers = async () => {
            const res = await api(`/deploy/${encodeURIComponent(slug)}/members`);
            members = res?.data?.members || [];
        };

        const rowHtml = (m) => {
            const role = normRole(m.role);
            const perms = normPerms(m.permissions || {}, role);
            const owner = role === 'owner' || !!m.isOwner;
            return `
                <div class="deploy-member" data-member-user="${escapeHtml(m.userId || '')}">
                    <div class="deploy-member__identity"><strong>${escapeHtml(m.displayName || m.username || m.userId || 'Unknown')}</strong><span class="text-muted">${escapeHtml(m.username || m.userId || '')}</span></div>
                    <div class="deploy-member__role" role="group" aria-label="Role">
                        ${owner ? `<span class="${badgeClass('owner')}">Owner</span>` : `<button type="button" class="deploy-role-pill ${role === 'admin' ? 'deploy-role-pill--active' : ''}" data-role-value="admin">Admin</button><button type="button" class="deploy-role-pill ${role === 'manager' ? 'deploy-role-pill--active' : ''}" data-role-value="manager">Manager</button>`}
                    </div>
                    <div class="deploy-member__permissions">${owner ? '<div class="text-muted">Full access</div>' : permsGrid(perms, role === 'manager')}</div>
                    <div class="deploy-member__actions">${owner ? '' : `<button type="button" class="btn btn-tonal btn-sm" data-member-save="${escapeHtml(m.userId || '')}">Save</button><button type="button" class="btn btn-ghost btn-sm" data-member-remove="${escapeHtml(m.userId || '')}">Remove</button>`}</div>
                </div>
            `;
        };

        const resultHtml = (u) => {
            const disabled = !!u.isMember || !!u.isOwner;
            const label = u.isOwner ? 'Owner' : u.isMember ? 'Member' : 'Add';
            return `
                <div class="deploy-member-search-result" data-search-user="${escapeHtml(u.userId || '')}">
                    <div><strong>${escapeHtml(u.displayName || u.username || u.userId || '')}</strong><div class="text-muted">${escapeHtml(u.username || u.userId || '')}</div></div>
                    <div class="deploy-member-search-result__actions">
                        <button type="button" class="btn btn-tonal btn-sm" data-add-role="manager" ${disabled ? 'disabled' : ''}>${disabled ? label : 'Add Manager'}</button>
                        <button type="button" class="btn btn-primary btn-sm" data-add-role="admin" ${disabled ? 'disabled' : ''}>${disabled ? label : 'Add Admin'}</button>
                    </div>
                </div>
            `;
        };

        const rowState = (row) => {
            const userId = String(row?.getAttribute('data-member-user') || '').trim();
            if (!userId) return null;
            const roleBtn = row.querySelector('[data-role-value].deploy-role-pill--active');
            const role = normRole(roleBtn?.getAttribute('data-role-value') || 'manager');
            const perms = normPerms({}, role);
            row.querySelectorAll('[data-perm-key]').forEach((btn) => {
                const key = String(btn.getAttribute('data-perm-key') || '').trim();
                if (PERM_KEYS.includes(key)) perms[key] = btn.classList.contains('deploy-perm-toggle--on');
            });
            return { userId, role, permissions: normPerms(perms, role) };
        };

        const refresh = async () => {
            await loadMembers();
            content.innerHTML = `
                <div class="deploy-access">
                    <div class="card">
                        <div class="deploy-access__header-row"><h3>Access & Permissions</h3><span class="deploy-chip deploy-chip--subtle">${Number(members.length).toLocaleString()} members</span></div>
                        <form id="deploy-member-search-form" class="deploy-member-search-form"><input id="deploy-member-search-input" class="form-input" type="search" placeholder="Find by userId or username"><button class="btn btn-tonal" type="submit">Search</button></form>
                        <div id="deploy-member-search-results" class="deploy-member-search-results">${searchResults.length ? searchResults.map((u) => resultHtml(u)).join('') : ''}</div>
                    </div>
                    <div class="card deploy-members-list">${members.length ? members.map((m) => rowHtml(m)).join('') : '<p class="text-muted">No members found.</p>'}</div>
                </div>
            `;

            content.querySelectorAll('.deploy-member').forEach((row) => {
                row.querySelectorAll('[data-role-value]').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        row.querySelectorAll('[data-role-value]').forEach((i) => i.classList.toggle('deploy-role-pill--active', i === btn));
                        const role = String(btn.getAttribute('data-role-value') || 'manager');
                        row.querySelectorAll('[data-perm-key]').forEach((pbtn) => {
                            if (role === 'admin') {
                                pbtn.classList.add('deploy-perm-toggle--on');
                                pbtn.setAttribute('aria-pressed', 'true');
                                pbtn.disabled = true;
                            } else {
                                pbtn.disabled = false;
                            }
                        });
                    });
                });
                row.querySelectorAll('[data-perm-key]').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        if (btn.disabled) return;
                        const next = !btn.classList.contains('deploy-perm-toggle--on');
                        btn.classList.toggle('deploy-perm-toggle--on', next);
                        btn.setAttribute('aria-pressed', next ? 'true' : 'false');
                    });
                });
            });

            content.querySelector('#deploy-member-search-form')?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const q = String(content.querySelector('#deploy-member-search-input')?.value || '').trim();
                if (!q || q.length < 2) {
                    searchResults = [];
                    await refresh();
                    return;
                }
                const btn = content.querySelector('#deploy-member-search-form button[type="submit"]');
                btn.disabled = true;
                try {
                    const res = await api(`/deploy/${encodeURIComponent(slug)}/member-search?q=${encodeURIComponent(q)}`);
                    searchResults = res?.data?.users || [];
                    await refresh();
                } catch (err) {
                    showToast(err.message || 'Member search failed', 'error');
                } finally {
                    btn.disabled = false;
                }
            });

            content.querySelectorAll('[data-search-user]').forEach((row) => {
                const userId = String(row.getAttribute('data-search-user') || '').trim();
                row.querySelectorAll('[data-add-role]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        const role = normRole(btn.getAttribute('data-add-role'));
                        btn.disabled = true;
                        try {
                            await api(`/deploy/${encodeURIComponent(slug)}/members`, {
                                method: 'POST',
                                body: JSON.stringify({ userId, role, permissions: normPerms({}, role) })
                            });
                            showToast('Member added', 'success');
                            searchResults = [];
                            await refresh();
                        } catch (err) {
                            showToast(err.message || 'Failed to add member', 'error');
                        } finally {
                            btn.disabled = false;
                        }
                    });
                });
            });

            content.querySelectorAll('[data-member-save]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const state = rowState(btn.closest('.deploy-member'));
                    if (!state) return;
                    btn.disabled = true;
                    try {
                        await api(`/deploy/${encodeURIComponent(slug)}/members/${encodeURIComponent(state.userId)}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ role: state.role, permissions: state.permissions })
                        });
                        showToast('Member updated', 'success');
                        await refresh();
                    } catch (err) {
                        showToast(err.message || 'Failed to update member', 'error');
                    } finally {
                        btn.disabled = false;
                    }
                });
            });

            content.querySelectorAll('[data-member-remove]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const userId = String(btn.getAttribute('data-member-remove') || '').trim();
                    if (!userId) return;
                    const ok = typeof showConfirm === 'function'
                        ? await showConfirm({ title: 'Remove Member', message: 'Remove this member from deployment access?', confirmText: 'Remove', cancelText: 'Cancel', danger: true })
                        : window.confirm('Remove this member from deployment access?');
                    if (!ok) return;
                    btn.disabled = true;
                    try {
                        await api(`/deploy/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
                        showToast('Member removed', 'success');
                        await refresh();
                    } catch (err) {
                        showToast(err.message || 'Failed to remove member', 'error');
                    } finally {
                        btn.disabled = false;
                    }
                });
            });
        };

        await refresh();
    }

    async function renderStats(content, slug) {
        let days = 30;
        const draw = async () => {
            let data;
            try {
                data = (await api(`/deploy/${encodeURIComponent(slug)}/stats?days=${days}`))?.data || {};
            } catch (err) {
                content.innerHTML = `<div class="card"><p class="text-muted">${escapeHtml(err.message || 'Failed to load statistics')}</p></div>`;
                return;
            }
            const t = data?.totals || {};
            const timeline = Array.isArray(data?.timeline) ? data.timeline : [];
            content.innerHTML = `
                <div class="deploy-stats">
                    <div class="deploy-stats__toolbar card"><h3>Deployment Statistics</h3><div class="deploy-stats__range" role="group" aria-label="Statistics time range">${[7, 30, 90].map((d) => `<button type="button" class="deploy-range-btn ${d === days ? 'deploy-range-btn--active' : ''}" data-days="${d}">${d}d</button>`).join('')}</div></div>
                    <div class="deploy-overview__stats">
                        ${statCard('Chats', Number(t.chats || 0).toLocaleString())}
                        ${statCard('Messages', Number(t.messages || 0).toLocaleString())}
                        ${statCard('Requests', Number(t.requests || 0).toLocaleString())}
                        ${statCard('Errors', Number(t.errors || 0).toLocaleString())}
                        ${statCard('Error Rate', `${Number(t.errorRate || 0).toFixed(2)}%`)}
                        ${statCard('P95 Latency', `${Number(t.p95LatencyMs || 0).toLocaleString()} ms`)}
                    </div>
                    <div class="card deploy-timeline">
                        <h4>Daily Timeline</h4>
                        ${timeline.length ? `<div class="deploy-timeline__table"><div class="deploy-timeline__row deploy-timeline__row--head"><span>Day</span><span>Chats</span><span>Messages</span><span>Requests</span><span>Errors</span><span>Tokens</span></div>${timeline.map((p) => `<div class="deploy-timeline__row"><span>${escapeHtml(p.day || '')}</span><span>${Number(p.chats || 0).toLocaleString()}</span><span>${Number(p.messages || 0).toLocaleString()}</span><span>${Number(p.requests || 0).toLocaleString()}</span><span>${Number(p.errors || 0).toLocaleString()}</span><span>${Number(p.totalTokens || 0).toLocaleString()}</span></div>`).join('')}</div>` : '<p class="text-muted">No statistics available for this range.</p>'}
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

    async function renderWorkspace(container, slug, requestedTab = 'overview') {
        let data;
        try {
            data = (await api(`/deploy/${encodeURIComponent(slug)}/manage`))?.data || {};
        } catch (err) {
            container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(err.message || 'Deployment not found')}</p></div>`;
            return;
        }

        const c = caps(data?.access || {});
        const tabs = [{ id: 'overview', label: 'Overview' }];
        if (c.canViewChats) tabs.push({ id: 'chats', label: 'Chats' });
        if (c.canManageMembers) tabs.push({ id: 'access', label: 'Access' });
        if (c.canViewChats) tabs.push({ id: 'stats', label: 'Statistics' });
        const tab = tabs.some((t) => t.id === requestedTab) ? requestedTab : tabs[0].id;

        container.innerHTML = `<div class="container deploy-workspace">${workspaceHeader(data, tab, tabs)}<div class="deploy-workspace__content" id="deploy-workspace-content"></div></div>`;
        container.querySelectorAll('[data-route]').forEach((el) => el.addEventListener('click', (e) => {
            e.preventDefault();
            const route = String(el.getAttribute('data-route') || '').trim();
            if (route) navigate(route);
        }));
        container.querySelectorAll('[data-switch-tab]').forEach((el) => el.addEventListener('click', () => {
            const next = String(el.getAttribute('data-switch-tab') || '').trim();
            if (next && next !== tab) navigate(`/deploy/${encodeURIComponent(slug)}?tab=${encodeURIComponent(next)}`);
        }));

        const content = container.querySelector('#deploy-workspace-content');
        if (!content) return;
        if (tab === 'overview') return renderOverview(content, slug, data, c, container);
        if (tab === 'chats') return renderChats(content, slug, c);
        if (tab === 'access') return renderAccess(content, slug, c);
        if (tab === 'stats') return renderStats(content, slug);
        content.innerHTML = '<div class="card"><p class="text-muted">Unsupported deployment tab.</p></div>';
    }

    async function renderDeploy(container, path) {
        const info = parsePath(path || '/deploy');
        if (!info.slug) return renderDeployList(container, info);
        return renderWorkspace(container, info.slug, info.tab);
    }

    return { renderDeploy };
}


