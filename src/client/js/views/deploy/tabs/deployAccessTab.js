import {
    DEPLOY_PERMISSION_KEYS,
    DEPLOY_PERMISSION_LABELS,
    normalizeDeployRole,
    normalizeDeployPermissions,
    deployBadgeClass
} from '../deployPermissions.js';

function renderPermissionsGrid(perms, editable, escapeHtml) {
    return `
        <div class="deploy-permissions-grid">
            ${DEPLOY_PERMISSION_KEYS.map((key) => `<button type="button" class="deploy-perm-toggle ${perms[key] ? 'deploy-perm-toggle--on' : ''}" data-perm-key="${key}" aria-pressed="${perms[key] ? 'true' : 'false'}" ${editable ? '' : 'disabled'}>${escapeHtml(DEPLOY_PERMISSION_LABELS[key])}</button>`).join('')}
        </div>
    `;
}

export async function renderDeployAccessTab({
    content,
    slug,
    capabilities,
    api,
    showToast,
    showConfirm,
    escapeHtml
}) {
    if (!capabilities.canManageMembers) {
        content.innerHTML = '<div class="card"><p class="text-muted">You do not have access to manage deployment members.</p></div>';
        return;
    }

    let members = [];
    let searchResults = [];

    const loadMembers = async () => {
        const response = await api(`/deploy/${encodeURIComponent(slug)}/members`);
        members = response?.data?.members || [];
    };

    const renderMemberRow = (member) => {
        const role = normalizeDeployRole(member.role);
        const perms = normalizeDeployPermissions(member.permissions || {}, role);
        const owner = role === 'owner' || !!member.isOwner;
        return `
            <div class="deploy-member" data-member-user="${escapeHtml(member.userId || '')}">
                <div class="deploy-member__identity"><strong>${escapeHtml(member.displayName || member.username || member.userId || 'Unknown')}</strong><span class="text-muted">${escapeHtml(member.username || member.userId || '')}</span></div>
                <div class="deploy-member__role" role="group" aria-label="Role">
                    ${owner ? `<span class="${deployBadgeClass('owner')}">Owner</span>` : `<button type="button" class="deploy-role-pill ${role === 'admin' ? 'deploy-role-pill--active' : ''}" data-role-value="admin">Admin</button><button type="button" class="deploy-role-pill ${role === 'manager' ? 'deploy-role-pill--active' : ''}" data-role-value="manager">Manager</button>`}
                </div>
                <div class="deploy-member__permissions">${owner ? '<div class="text-muted">Full access</div>' : renderPermissionsGrid(perms, role === 'manager', escapeHtml)}</div>
                <div class="deploy-member__actions">${owner ? '' : `<button type="button" class="btn btn-tonal btn-sm" data-member-save="${escapeHtml(member.userId || '')}">Save</button><button type="button" class="btn btn-ghost btn-sm" data-member-remove="${escapeHtml(member.userId || '')}">Remove</button>`}</div>
            </div>
        `;
    };

    const renderSearchResult = (user) => {
        const disabled = !!user.isMember || !!user.isOwner;
        const label = user.isOwner ? 'Owner' : user.isMember ? 'Member' : 'Add';
        return `
            <div class="deploy-member-search-result" data-search-user="${escapeHtml(user.userId || '')}">
                <div><strong>${escapeHtml(user.displayName || user.username || user.userId || '')}</strong><div class="text-muted">${escapeHtml(user.username || user.userId || '')}</div></div>
                <div class="deploy-member-search-result__actions">
                    <button type="button" class="btn btn-tonal btn-sm" data-add-role="manager" ${disabled ? 'disabled' : ''}>${disabled ? label : 'Add Manager'}</button>
                    <button type="button" class="btn btn-primary btn-sm" data-add-role="admin" ${disabled ? 'disabled' : ''}>${disabled ? label : 'Add Admin'}</button>
                </div>
            </div>
        `;
    };

    const readRowState = (row) => {
        const userId = String(row?.getAttribute('data-member-user') || '').trim();
        if (!userId) return null;
        const roleBtn = row.querySelector('[data-role-value].deploy-role-pill--active');
        const role = normalizeDeployRole(roleBtn?.getAttribute('data-role-value') || 'manager');
        const perms = normalizeDeployPermissions({}, role);
        row.querySelectorAll('[data-perm-key]').forEach((btn) => {
            const key = String(btn.getAttribute('data-perm-key') || '').trim();
            if (DEPLOY_PERMISSION_KEYS.includes(key)) perms[key] = btn.classList.contains('deploy-perm-toggle--on');
        });
        return { userId, role, permissions: normalizeDeployPermissions(perms, role) };
    };

    const refresh = async () => {
        await loadMembers();
        content.innerHTML = `
            <div class="deploy-access">
                <div class="card">
                    <div class="deploy-access__header-row"><h3>Access & Permissions</h3><span class="deploy-chip deploy-chip--subtle">${Number(members.length).toLocaleString()} members</span></div>
                    <form id="deploy-member-search-form" class="deploy-member-search-form"><input id="deploy-member-search-input" class="form-input" type="search" placeholder="Find by userId or username"><button class="btn btn-tonal" type="submit">Search</button></form>
                    <div id="deploy-member-search-results" class="deploy-member-search-results">${searchResults.length ? searchResults.map((user) => renderSearchResult(user)).join('') : ''}</div>
                </div>
                <div class="card deploy-members-list">${members.length ? members.map((member) => renderMemberRow(member)).join('') : '<p class="text-muted">No members found.</p>'}</div>
            </div>
        `;

        content.querySelectorAll('.deploy-member').forEach((row) => {
            row.querySelectorAll('[data-role-value]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    row.querySelectorAll('[data-role-value]').forEach((item) => item.classList.toggle('deploy-role-pill--active', item === btn));
                    const role = String(btn.getAttribute('data-role-value') || 'manager');
                    row.querySelectorAll('[data-perm-key]').forEach((permBtn) => {
                        if (role === 'admin') {
                            permBtn.classList.add('deploy-perm-toggle--on');
                            permBtn.setAttribute('aria-pressed', 'true');
                            permBtn.disabled = true;
                        } else {
                            permBtn.disabled = false;
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

        content.querySelector('#deploy-member-search-form')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const q = String(content.querySelector('#deploy-member-search-input')?.value || '').trim();
            if (!q || q.length < 2) {
                searchResults = [];
                await refresh();
                return;
            }
            const submit = content.querySelector('#deploy-member-search-form button[type="submit"]');
            submit.disabled = true;
            try {
                const response = await api(`/deploy/${encodeURIComponent(slug)}/member-search?q=${encodeURIComponent(q)}`);
                searchResults = response?.data?.users || [];
                await refresh();
            } catch (error) {
                showToast(error.message || 'Member search failed', 'error');
            } finally {
                submit.disabled = false;
            }
        });

        content.querySelectorAll('[data-search-user]').forEach((row) => {
            const userId = String(row.getAttribute('data-search-user') || '').trim();
            row.querySelectorAll('[data-add-role]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const role = normalizeDeployRole(btn.getAttribute('data-add-role'));
                    btn.disabled = true;
                    try {
                        await api(`/deploy/${encodeURIComponent(slug)}/members`, {
                            method: 'POST',
                            body: JSON.stringify({ userId, role, permissions: normalizeDeployPermissions({}, role) })
                        });
                        showToast('Member added', 'success');
                        searchResults = [];
                        await refresh();
                    } catch (error) {
                        showToast(error.message || 'Failed to add member', 'error');
                    } finally {
                        btn.disabled = false;
                    }
                });
            });
        });

        content.querySelectorAll('[data-member-save]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const state = readRowState(btn.closest('.deploy-member'));
                if (!state) return;
                btn.disabled = true;
                try {
                    await api(`/deploy/${encodeURIComponent(slug)}/members/${encodeURIComponent(state.userId)}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ role: state.role, permissions: state.permissions })
                    });
                    showToast('Member updated', 'success');
                    await refresh();
                } catch (error) {
                    showToast(error.message || 'Failed to update member', 'error');
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
                } catch (error) {
                    showToast(error.message || 'Failed to remove member', 'error');
                } finally {
                    btn.disabled = false;
                }
            });
        });
    };

    await refresh();
}
