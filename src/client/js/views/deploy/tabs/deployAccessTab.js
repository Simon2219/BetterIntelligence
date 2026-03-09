import {
    DEPLOY_PERMISSION_KEYS,
    DEPLOY_PERMISSION_LABELS,
    normalizeDeployRole,
    normalizeDeployPermissions,
    deployBadgeClass
} from '../deployPermissions.js';
import { formatDeployAccessMode, summarizeDeployQuota } from '../deployFormatters.js';

const POLICY_MODES = [
    {
        id: 'public_sponsored',
        label: 'Public Sponsored',
        description: 'Anonymous consumers use the attached sponsor grant and quota.'
    },
    {
        id: 'authenticated_entitled',
        label: 'Authenticated',
        description: 'Consumers must sign in and hold an entitlement for this agent.'
    },
    {
        id: 'internal_only',
        label: 'Internal Only',
        description: 'Only deployment managers can use the deployment runtime.'
    }
];

function renderPermissionsGrid(perms, editable, escapeHtml) {
    return `
        <div class="deploy-permissions-grid">
            ${DEPLOY_PERMISSION_KEYS.map((key) => `<button type="button" class="deploy-perm-toggle ${perms[key] ? 'deploy-perm-toggle--on' : ''}" data-perm-key="${key}" aria-pressed="${perms[key] ? 'true' : 'false'}" ${editable ? '' : 'disabled'}>${escapeHtml(DEPLOY_PERMISSION_LABELS[key])}</button>`).join('')}
        </div>
    `;
}

function renderQuotaGrid(quota, escapeHtml) {
    const metrics = Object.entries(quota?.metrics || {});
    if (!metrics.length) {
        return '<p class="text-muted">No sponsor quota is attached to this deployment.</p>';
    }
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

function renderPolicySection(policyData, capabilities, escapeHtml) {
    const accessPolicy = policyData?.accessPolicy || {};
    const runtimeHealth = policyData?.runtimeHealth || {};
    const catalog = policyData?.catalog || {};
    const revisions = Array.isArray(catalog?.revisions) ? catalog.revisions : [];
    const sponsorGrantOptions = Array.isArray(catalog?.sponsorGrantOptions) ? catalog.sponsorGrantOptions : [];
    const activeMode = String(accessPolicy?.consumer_access_mode || 'internal_only').trim().toLowerCase();
    const activeRevisionId = accessPolicy?.pinned_revision_id || '';
    const sponsorGrantId = accessPolicy?.sponsor_grant_id || '';
    const runtimeState = String(runtimeHealth?.state || 'unknown').toLowerCase();
    const runtimeLabel = runtimeState === 'ok'
        ? 'Ready'
        : runtimeState === 'warning'
            ? 'Degraded'
            : runtimeState === 'error'
                ? 'Blocked'
                : 'Unknown';

    return `
        <div class="card deploy-access-policy-card">
            <div class="deploy-access__header-row">
                <h3>Consumer Access Policy</h3>
                <span class="deploy-chip ${runtimeState === 'ok' ? 'deploy-chip--ok' : runtimeState === 'warning' ? 'deploy-chip--warn' : runtimeState === 'error' ? 'deploy-chip--danger' : 'deploy-chip--subtle'}">${escapeHtml(runtimeLabel)}</span>
            </div>
            <div class="deploy-policy-grid">
                <div class="deploy-policy-block">
                    <div class="deploy-policy-block__label">Access mode</div>
                    <div class="deploy-policy-mode-list">
                        ${POLICY_MODES.map((mode) => `
                            <button
                                type="button"
                                class="deploy-range-btn ${activeMode === mode.id ? 'deploy-range-btn--active' : ''}"
                                data-policy-mode="${mode.id}"
                                ${capabilities.canManageConfig ? '' : 'disabled'}
                            >${escapeHtml(mode.label)}</button>
                        `).join('')}
                    </div>
                    <div class="form-hint">${escapeHtml(POLICY_MODES.find((mode) => mode.id === activeMode)?.description || 'No policy description')}</div>
                </div>
                <div class="deploy-policy-block">
                    <label class="form-label" for="deploy-policy-revision">Pinned revision</label>
                    <select id="deploy-policy-revision" class="form-input" ${capabilities.canManageConfig ? '' : 'disabled'}>
                        <option value="">Use current approved/runtime revision</option>
                        ${revisions.map((revision) => `
                            <option value="${escapeHtml(revision.id)}" ${String(activeRevisionId) === String(revision.id) ? 'selected' : ''}>
                                Revision ${Number(revision.revisionNumber || 0)} · ${escapeHtml(revision.title || 'Untitled')} · ${escapeHtml(revision.reviewStatus || 'draft')}
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div class="deploy-policy-block">
                    <label class="form-label" for="deploy-policy-sponsor-grant">Sponsor grant</label>
                    <select id="deploy-policy-sponsor-grant" class="form-input" ${capabilities.canManageConfig ? '' : 'disabled'}>
                        <option value="">No sponsor grant</option>
                        ${sponsorGrantOptions.map((grant) => `
                            <option value="${escapeHtml(grant.id)}" ${String(sponsorGrantId) === String(grant.id) ? 'selected' : ''}>
                                ${escapeHtml(grant.grantType || 'grant')} · ${escapeHtml(grant.subjectType || 'subject')} · ${escapeHtml(summarizeDeployQuota(grant.quota))}
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div class="deploy-policy-block">
                    <div class="deploy-policy-block__label">Runtime summary</div>
                    <div class="deploy-inline-value">${escapeHtml(runtimeHealth?.summary || 'No runtime summary')}</div>
                    <div class="form-hint">Current mode: ${escapeHtml(formatDeployAccessMode(accessPolicy?.consumer_access_mode))}</div>
                </div>
            </div>
            ${renderQuotaGrid(accessPolicy?.sponsorQuota, escapeHtml)}
            ${capabilities.canManageConfig ? `
                <div class="deploy-config-form__actions">
                    <button class="btn btn-primary" type="button" id="deploy-policy-save">Save Policy</button>
                </div>
            ` : ''}
        </div>
    `;
}

export async function renderDeployAccessTab({
    content,
    slug,
    data,
    capabilities,
    api,
    showToast,
    showConfirm,
    escapeHtml
}) {
    if (!capabilities.canManageMembers && !capabilities.canManageConfig) {
        content.innerHTML = '<div class="card"><p class="text-muted">You do not have access to manage deployment settings.</p></div>';
        return;
    }

    let policyData = capabilities.canManageConfig ? {
        accessPolicy: data?.accessPolicy || null,
        runtimeHealth: data?.runtimeHealth || null,
        catalog: data?.catalog || null
    } : null;
    let members = [];
    let searchResults = [];

    const loadPolicy = async () => {
        if (!capabilities.canManageConfig) return;
        const response = await api(`/deploy/${encodeURIComponent(slug)}/access-policy`);
        policyData = response?.data || { accessPolicy: null, runtimeHealth: null, catalog: null };
    };

    const loadMembers = async () => {
        if (!capabilities.canManageMembers) {
            members = [];
            return;
        }
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
        await Promise.all([
            loadPolicy(),
            loadMembers()
        ]);

        content.innerHTML = `
            <div class="deploy-access">
                ${capabilities.canManageConfig ? renderPolicySection(policyData, capabilities, escapeHtml) : ''}
                ${capabilities.canManageMembers ? `
                    <div class="card">
                        <div class="deploy-access__header-row"><h3>Manager Access</h3><span class="deploy-chip deploy-chip--subtle">${Number(members.length).toLocaleString()} members</span></div>
                        <form id="deploy-member-search-form" class="deploy-member-search-form"><input id="deploy-member-search-input" class="form-input" type="search" placeholder="Find by userId or username"><button class="btn btn-tonal" type="submit">Search</button></form>
                        <div id="deploy-member-search-results" class="deploy-member-search-results">${searchResults.length ? searchResults.map((user) => renderSearchResult(user)).join('') : ''}</div>
                    </div>
                    <div class="card deploy-members-list">${members.length ? members.map((member) => renderMemberRow(member)).join('') : '<p class="text-muted">No members found.</p>'}</div>
                ` : ''}
            </div>
        `;

        content.querySelectorAll('[data-policy-mode]').forEach((button) => {
            button.addEventListener('click', () => {
                if (button.disabled) return;
                content.querySelectorAll('[data-policy-mode]').forEach((item) => item.classList.toggle('deploy-range-btn--active', item === button));
            });
        });

        content.querySelector('#deploy-policy-save')?.addEventListener('click', async () => {
            const saveButton = content.querySelector('#deploy-policy-save');
            if (!saveButton) return;
            saveButton.disabled = true;
            try {
                const activeMode = content.querySelector('[data-policy-mode].deploy-range-btn--active')?.getAttribute('data-policy-mode') || 'internal_only';
                const pinnedRevisionId = String(content.querySelector('#deploy-policy-revision')?.value || '').trim();
                const sponsorGrantId = String(content.querySelector('#deploy-policy-sponsor-grant')?.value || '').trim();
                policyData = (await api(`/deploy/${encodeURIComponent(slug)}/access-policy`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        consumerAccessMode: activeMode,
                        pinnedRevisionId: pinnedRevisionId || null,
                        sponsorGrantId: sponsorGrantId || null
                    })
                }))?.data || policyData;
                showToast('Deployment access policy updated', 'success');
                await refresh();
            } catch (error) {
                showToast(error.message || 'Failed to update deployment access policy', 'error');
            } finally {
                saveButton.disabled = false;
            }
        });

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
