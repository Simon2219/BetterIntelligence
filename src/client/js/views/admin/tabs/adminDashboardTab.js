export async function renderDashboardTab({ content, api, escapeHtml }) {
    try {
        const { data } = await api('/admin/dashboard');
        content.innerHTML = `
            <div class="card-grid admin-section-top">
                <div class="card"><div class="admin-stat-value">${data.userCount ?? 0}</div><div class="text-muted">Total Users</div></div>
                <div class="card"><div class="admin-stat-value">${data.roleCount ?? 0}</div><div class="text-muted">Roles</div></div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<p class="text-danger">${escapeHtml(error.message)}</p>`;
    }
}
