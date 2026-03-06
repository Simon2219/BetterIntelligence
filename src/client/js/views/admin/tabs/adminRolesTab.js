export async function renderRolesTab({ content, api, escapeHtml, showToast }) {
    try {
        const { data } = await api('/roles');
        const roles = data.roles || [];
        const permissionColumns = data.permissionColumns || [];
        content.innerHTML = `
            <div class="admin-section-top">
                <p class="text-muted admin-section-note">${roles.length} roles. Click a role to edit.</p>
                <div class="card-grid">
                    ${roles.map((role) => `
                        <div class="card admin-role-card" data-role-id="${role.id}">
                            <div class="admin-role-card__name">${escapeHtml(role.name)}</div>
                            <div class="text-muted admin-role-card__desc">${escapeHtml(role.description || '')}</div>
                            <div class="admin-role-card__badges">
                                ${role.is_admin
            ? '<span class="badge badge-primary">Admin</span>'
            : permissionColumns.filter((perm) => role[perm]).map((perm) => `<span class="badge badge-ghost">${escapeHtml(perm.replace('can_', ''))}</span>`).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        content.querySelectorAll('[data-role-id]').forEach((row) => {
            row.addEventListener('click', () => showToast('Role editing: use API for now', 'info'));
        });
    } catch (error) {
        content.innerHTML = `<p class="text-danger">${escapeHtml(error.message)}</p>`;
    }
}
