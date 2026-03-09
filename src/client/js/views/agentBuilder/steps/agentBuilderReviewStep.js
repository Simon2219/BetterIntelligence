function getCatalogTone(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'published' || normalized === 'approved') return 'success';
    if (normalized === 'pending_review') return 'warning';
    if (normalized === 'rejected' || normalized === 'suspended') return 'danger';
    return 'ghost';
}

function renderCatalogBadge(label, value) {
    if (!value) return '';
    const tone = getCatalogTone(value);
    return `<span class="badge badge-${tone}">${label}: ${value.replace(/_/g, ' ')}</span>`;
}

function getLatestReview(listing) {
    const reviews = Array.isArray(listing?.reviews) ? [...listing.reviews] : [];
    reviews.sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());
    return reviews[0] || null;
}

function renderCatalogPanel({
    agent,
    formData,
    catalogListing,
    catalogBusy,
    hasUnsavedChanges,
    listingsRoute,
    reviewsRoute,
    escapeHtml
}) {
    if (!agent) return '';
    const latestReview = getLatestReview(catalogListing);
    const reviewStatus = catalogListing?.currentRevision?.review_status || catalogListing?.approvedRevision?.review_status || '';
    const reviewNote = latestReview?.reason || catalogListing?.currentRevision?.submit_notes || '';
    const driftDetected = !!catalogListing?.driftDetected;
    const listingStatus = catalogListing?.status || 'not_created';
    const statusLine = catalogListing
        ? `${renderCatalogBadge('Listing', listingStatus)} ${renderCatalogBadge('Review', reviewStatus || 'draft')}`
        : '<span class="badge badge-ghost">Listing: not created</span>';
    const guidance = !catalogListing
        ? 'Create a public catalog listing from this saved agent, then submit it for review.'
        : driftDetected
            ? 'The saved agent has changed since the current catalog draft. Update the listing draft before submitting.'
            : hasUnsavedChanges
                ? 'You have unsaved builder changes. Save the agent before refreshing the listing draft.'
                : reviewStatus === 'pending_review'
                    ? 'This listing is already pending review.'
                    : 'The catalog draft is in sync with the latest saved agent.';

    return `
        <div class="review-catalog-panel">
            <div class="review-catalog-panel__header">
                <div>
                    <div class="review-catalog-panel__title">Catalog Publishing</div>
                    <p class="review-catalog-panel__desc">${escapeHtml(guidance)}</p>
                </div>
                ${catalogBusy ? '<span class="badge badge-ghost">Working...</span>' : ''}
            </div>
            <div class="review-catalog-panel__status">${statusLine}</div>
            ${reviewNote ? `<div class="review-catalog-panel__note"><span class="review-card__label">Latest review note</span><p>${escapeHtml(reviewNote)}</p></div>` : ''}
            <div class="review-catalog-panel__actions">
                ${!catalogListing ? `<button type="button" class="btn btn-primary" id="builder-create-listing" ${catalogBusy ? 'disabled' : ''}>Create Listing</button>` : ''}
                ${catalogListing ? `<button type="button" class="btn btn-ghost" id="builder-update-listing" ${catalogBusy ? 'disabled' : ''}>Update Listing</button>` : ''}
                ${catalogListing ? `<button type="button" class="btn btn-primary" id="builder-submit-listing" ${catalogBusy || reviewStatus === 'pending_review' ? 'disabled' : ''}>Submit for Review</button>` : ''}
                <a href="#" class="btn btn-ghost" data-route="${escapeHtml(listingsRoute)}">Open Listings</a>
                <a href="#" class="btn btn-ghost" data-route="${escapeHtml(reviewsRoute)}">Open Reviews</a>
            </div>
            ${catalogListing ? `
                <div class="review-catalog-panel__meta">
                    <span>Visibility: ${escapeHtml(catalogListing.visibility || 'private')}</span>
                    <span>Revision: #${catalogListing.currentRevision?.revision_number || catalogListing.approvedRevision?.revision_number || 1}</span>
                    <span>${driftDetected ? 'Draft update recommended' : 'Draft is current'}</span>
                </div>
            ` : ''}
        </div>
    `;
}

export function renderReviewStep(content, context) {
    const {
        formData,
        agent,
        skillIds,
        behaviorRules,
        sampleDialogues,
        getAgentAvatarUrl,
        escapeHtml,
        navigate,
        catalogListing,
        catalogBusy,
        hasUnsavedChanges,
        listingsRoute,
        reviewsRoute,
        onCreateListing,
        onUpdateListing,
        onSubmitListing
    } = context;

    const name = formData.name || 'Agent';
    const textModel = formData.textModelDisplay || formData.textModel || '(not set)';
    const textProvider = formData.textProviderDisplay || formData.textProvider || '(not set)';
    const imageProvider = formData.imageProviderDisplay || formData.imageProvider || 'none';
    const skillCount = skillIds.length;
    const rulesCount = behaviorRules.length;
    const dialoguesCount = sampleDialogues.length;
    const promptLength = (formData.systemPrompt || '').length;
    const promptPreview = formData.systemPrompt
        ? formData.systemPrompt.substring(0, 120) + (formData.systemPrompt.length > 120 ? '...' : '')
        : '(no prompt set)';

    content.innerHTML = `
        <div class="builder-section">
            <h3 class="builder-section__title">Review & ${agent ? 'Save' : 'Create'}</h3>
            <p class="builder-section__desc">Check your agent configuration before ${agent ? 'saving' : 'creating'}</p>
        </div>
        <div class="review-card">
            <div class="review-card__header">
                <img class="review-card__avatar" src="${escapeHtml(getAgentAvatarUrl({ avatar_url: formData.avatarUrl, name: formData.name || 'A' }, { shape: 'circle' }))}" alt="">
                <div>
                    <div class="review-card__name">${escapeHtml(name)}</div>
                    <div class="review-card__tagline">${escapeHtml(formData.tagline || 'No tagline')}</div>
                </div>
            </div>
            <div class="review-card__grid">
                <div class="review-card__item"><span class="review-card__label">Text Provider</span><span class="review-card__value">${escapeHtml(textProvider)}</span></div>
                <div class="review-card__item"><span class="review-card__label">Text Model</span><span class="review-card__value">${escapeHtml(textModel)}</span></div>
                <div class="review-card__item"><span class="review-card__label">Image Provider</span><span class="review-card__value">${escapeHtml(imageProvider)}</span></div>
                <div class="review-card__item"><span class="review-card__label">Skills</span><span class="review-card__value">${skillCount} selected</span></div>
                <div class="review-card__item"><span class="review-card__label">Rules</span><span class="review-card__value">${rulesCount} rules</span></div>
                <div class="review-card__item"><span class="review-card__label">Dialogues</span><span class="review-card__value">${dialoguesCount} examples</span></div>
                <div class="review-card__item"><span class="review-card__label">Temperature</span><div class="review-health-bar"><div class="review-health-bar__fill" style="width:${(formData.temperature || 0) * 100}%"></div></div></div>
                <div class="review-card__item"><span class="review-card__label">Max Tokens</span><span class="review-card__value">${formData.maxTokens}</span></div>
                <div class="review-card__item"><span class="review-card__label">Top-P / Top-K</span><span class="review-card__value">${formData.topP} / ${formData.topK}</span></div>
                <div class="review-card__item"><span class="review-card__label">Formality</span><div class="review-health-bar"><div class="review-health-bar__fill" style="width:${((formData.formality || 0) / 10) * 100}%"></div></div></div>
                <div class="review-card__item"><span class="review-card__label">Verbosity</span><div class="review-health-bar"><div class="review-health-bar__fill" style="width:${((formData.verbosity || 0) / 10) * 100}%"></div></div></div>
                <div class="review-card__item"><span class="review-card__label">Context Window</span><span class="review-card__value">${formData.contextWindow} msgs</span></div>
                <div class="review-card__item review-card__item--span2">
                    <span class="review-card__label">Capability profile</span>
                    <div class="review-capability-radar">
                        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                            <defs><linearGradient id="radarFill" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.4"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0.1"/></linearGradient></defs>
                            ${(() => {
                                const count = 5;
                                const radius = 45;
                                const centerX = 50;
                                const centerY = 50;
                                const values = [
                                    Math.min(1, skillCount / 5),
                                    Math.min(1, rulesCount / 3),
                                    Math.min(1, dialoguesCount / 3),
                                    Math.min(1, (formData.systemPrompt || '').length / 500),
                                    ((formData.formality ?? 5) + (formData.verbosity ?? 5)) / 20
                                ];
                                const points = values.map((value, index) => {
                                    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
                                    return `${centerX + radius * value * Math.cos(angle)},${centerY + radius * value * Math.sin(angle)}`;
                                }).join(' ');
                                const gridPoints = [0.25, 0.5, 0.75, 1].map((grid) => values.map((_, index) => {
                                    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
                                    return `${centerX + radius * grid * Math.cos(angle)},${centerY + radius * grid * Math.sin(angle)}`;
                                }).join(' '));
                                const labels = ['Skills', 'Rules', 'Dia.', 'Prompt', 'Flex'];
                                return `
                                ${gridPoints.map((point) => `<polygon points="${point}" fill="none" stroke="var(--border)" stroke-width="0.5"/>`).join('')}
                                <polygon points="${points}" fill="url(#radarFill)" stroke="var(--accent)" stroke-width="1.5"/>
                                ${labels.map((label, index) => {
                                    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
                                    const x = centerX + (radius + 8) * Math.cos(angle);
                                    const y = centerY + (radius + 8) * Math.sin(angle);
                                    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="7" fill="var(--text-muted)">${label}</text>`;
                                }).join('')}
                                `;
                            })()}
                        </svg>
                        <span class="review-capability-radar__label">Skills | Rules | Dialogues | Prompt | Flexibility</span>
                    </div>
                </div>
            </div>
            <div class="review-card__prompt">
                <span class="review-card__label">System Prompt</span>
                <p class="review-card__prompt-text">${escapeHtml(promptPreview)}</p>
                <span class="text-muted u-text-xs">${promptLength} chars | ~${Math.ceil(promptLength / 4)} tokens estimated</span>
            </div>
            ${formData.greetingMessage ? `<div class="review-card__prompt"><span class="review-card__label">Greeting</span><p class="review-card__prompt-text">${escapeHtml(formData.greetingMessage)}</p></div>` : ''}
            ${renderCatalogPanel({ agent, formData, catalogListing, catalogBusy, hasUnsavedChanges, listingsRoute, reviewsRoute, escapeHtml })}
        </div>
    `;

    content.querySelector('#builder-create-listing')?.addEventListener('click', async () => {
        await onCreateListing?.();
    });

    content.querySelector('#builder-update-listing')?.addEventListener('click', async () => {
        await onUpdateListing?.();
    });

    content.querySelector('#builder-submit-listing')?.addEventListener('click', async () => {
        await onSubmitListing?.();
    });

    content.querySelectorAll('[data-route]').forEach((element) => {
        element.addEventListener('click', (event) => {
            event.preventDefault();
            navigate(element.dataset.route);
        });
    });
}
