export function skillCardHtml(skill, escapeHtml, showActions = false, categories = []) {
    return `
        <div class="card skill-card">
            ${showActions && categories.length ? `
            <button type="button" class="skill-category-arrow" data-skill-id="${skill.id}" title="Assign to category" aria-label="Assign category"><span class="ui-chevron" aria-hidden="true"></span></button>
            ` : ''}
            <div class="card-title">${escapeHtml(skill.name)}</div>
            <div class="card-meta">${escapeHtml(skill.description || '')}</div>
            ${showActions ? `
            <div class="card-actions">
                <span class="badge badge-ghost skill-visibility-badge">${(skill.visibility || 'private')}</span>
                <a href="#" class="btn btn-primary btn-sm" data-route="/skills/${encodeURIComponent(skill.id || skill.slug || skill.name)}/edit">Edit</a>
                ${skill.source === 'workspace' ? `<button class="btn btn-ghost btn-sm btn-publish" data-skill-id="${skill.id}" data-slug="${skill.slug || skill.name}">${skill.market?.listingId ? 'Submit Revision' : 'Create Listing'}</button>` : ''}
            </div>
            ` : '<div class="card-actions"></div>'}
        </div>
    `;
}
