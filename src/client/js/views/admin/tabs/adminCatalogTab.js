export async function renderCatalogTab({ content, api, escapeHtml, showToast }) {
    const { data } = await api('/catalog/reviews');
    const queue = data || [];

    content.innerHTML = `
        <div class="admin-grid">
            <div class="card">
                <h3>Catalog Review Queue</h3>
                <p class="text-muted">Pending: ${Number(queue.length || 0)} | Approved: 0 | Rejected: 0</p>
            </div>
            <div class="card">
                <h3>Pending Reviews</h3>
                ${queue.length ? queue.map((listing) => `
                    <div class="agents-control-row">
                        <div>
                            <div class="agents-control-row__title">${escapeHtml(listing.title || 'Untitled')}</div>
                            <div class="text-muted">${escapeHtml(listing.asset_type || 'asset')} | ${escapeHtml(listing.visibility || 'private')}</div>
                        </div>
                        <div class="admin-catalog-actions">
                            <button class="btn btn-primary btn-sm" data-catalog-action="approve" data-review-id="${escapeHtml(listing.reviews?.[0]?.id || '')}">Approve</button>
                            <button class="btn btn-ghost btn-sm" data-catalog-action="reject" data-review-id="${escapeHtml(listing.reviews?.[0]?.id || '')}">Reject</button>
                        </div>
                    </div>
                `).join('') : '<p class="text-muted">No pending catalog reviews.</p>'}
            </div>
        </div>
    `;

    content.querySelectorAll('[data-catalog-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            const reviewId = String(button.dataset.reviewId || '').trim();
            if (!reviewId) {
                showToast('Missing review identifier', 'error');
                return;
            }
            const decision = button.dataset.catalogAction;
            try {
                await api(`/catalog/reviews/${encodeURIComponent(reviewId)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ decision })
                });
                showToast(`Listing ${decision}d`, 'success');
                await renderCatalogTab({ content, api, escapeHtml, showToast });
            } catch (error) {
                showToast(error.message || 'Failed to moderate listing', 'error');
            }
        });
    });
}
