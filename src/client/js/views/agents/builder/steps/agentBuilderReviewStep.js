export function renderReviewStep(content, context) {
    const {
        formData,
        agent,
        skillIds,
        behaviorRules,
        sampleDialogues,
        getAgentAvatarUrl,
        escapeHtml,
        navigate
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
                <img class="review-card__avatar" src="${formData.avatarUrl || getAgentAvatarUrl({ name: formData.name || 'A' }, { shape: 'circle' })}" alt="">
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
                        <span class="review-capability-radar__label">Skills &bull; Rules &bull; Dialogues &bull; Prompt &bull; Flexibility</span>
                    </div>
                </div>
            </div>
            <div class="review-card__prompt">
                <span class="review-card__label">System Prompt</span>
                <p class="review-card__prompt-text">${escapeHtml(promptPreview)}</p>
                <span class="text-muted u-text-xs">${promptLength} chars &middot; ~${Math.ceil(promptLength / 4)} tokens estimated</span>
            </div>
            ${formData.greetingMessage ? `<div class="review-card__prompt"><span class="review-card__label">Greeting</span><p class="review-card__prompt-text">${escapeHtml(formData.greetingMessage)}</p></div>` : ''}
            ${agent ? `
            <div class="agent-review-actions">
                <input type="checkbox" id="hub-publish" ${formData.hubPublished ? 'checked' : ''}>
                <label for="hub-publish">Publish to Bot Hub (others can subscribe)</label>
            </div>
            ` : ''}
        </div>
    `;

    content.querySelector('#hub-publish')?.addEventListener('change', (event) => {
        formData.hubPublished = event.target.checked;
    });

    content.querySelectorAll('[data-route]').forEach((element) => {
        element.addEventListener('click', (event) => {
            event.preventDefault();
            navigate(element.dataset.route);
        });
    });
}
