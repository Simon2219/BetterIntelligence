export function renderIdentityStep(content, context) {
    const {
        formData,
        getAgentAvatarUrl,
        escapeHtml,
        api,
        getToken,
        API_BASE,
        showToast
    } = context;

    const avatarSrc = getAgentAvatarUrl({ avatar_url: formData.avatarUrl, name: formData.name || 'A' }, { shape: 'circle' });
    content.innerHTML = `
        <div class="builder-section">
            <h3 class="builder-section__title">Agent Identity</h3>
            <p class="builder-section__desc">Choose how your agent looks and introduces itself</p>
        </div>
        <div class="agent-identity-layout">
            <div class="avatar-preview">
                <img id="avatar-preview-img" src="${escapeHtml(avatarSrc)}" alt="Avatar" class="avatar-preview__img">
                <button type="button" class="btn btn-ghost btn-sm" id="agent-avatar-edit">Edit Avatar</button>
                <input type="file" id="agent-avatar-file" accept="image/jpeg,image/png,image/gif,image/webp" class="agent-avatar-file-input">
            </div>
            <div class="agent-identity-main">
                <div class="form-group">
                    <label class="form-label">Name <span class="form-required">*</span> <span class="builder-tooltip" data-tip="The display name of your agent. This appears on agent cards and in the chat header."><button type="button" class="builder-tooltip__trigger" aria-label="Help">?</button><span class="builder-tooltip__popover">The display name of your agent. This appears on agent cards and in the chat header.</span></span></label>
                    <input type="text" id="agent-name" class="form-input" value="${escapeHtml(formData.name)}" placeholder="e.g. Luna, CodeBot" required maxlength="50">
                </div>
                <div class="form-group">
                    <label class="form-label">Tagline <span class="form-help" title="Short description on agent cards">?</span></label>
                    <textarea id="agent-tagline" class="form-input" rows="2" placeholder="e.g. Your friendly coding companion" maxlength="200">${escapeHtml(formData.tagline)}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Tags <span class="form-help" title="Tags help others find your agent in the Hub. Start typing to search.">?</span></label>
                    <div class="tag-input-container">
                        <div id="agent-tags-list" class="tag-list">${(formData.tagNames || []).map((tag) => `<span class="tag-chip" data-value="${escapeHtml(tag)}">${escapeHtml(tag)} <button type="button" class="tag-chip__remove">&times;</button></span>`).join('')}</div>
                        <input type="text" id="agent-tags-input" class="form-input form-input--sm agent-tags-input" placeholder="Type to search tags..." autocomplete="off">
                        <div id="agent-tags-dropdown" class="chat-hub__dropdown agent-tags-dropdown"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Avatar URL or upload <span class="form-help" title="Paste image URL or use Edit Avatar to upload">?</span></label>
                    <div class="agent-avatar-url-row">
                        <input type="text" id="agent-avatarUrl" class="form-input agent-avatar-url-input" value="${escapeHtml(formData.avatarUrl)}" placeholder="https://... or upload via Edit Avatar">
                    </div>
                </div>
            </div>
        </div>
    `;

    const nameEl = content.querySelector('#agent-name');
    const avatarUrlEl = content.querySelector('#agent-avatarUrl');
    const previewImg = content.querySelector('#avatar-preview-img');

    nameEl.addEventListener('input', () => {
        if (!avatarUrlEl.value.trim()) {
            previewImg.src = getAgentAvatarUrl({ name: nameEl.value || 'A' }, { shape: 'circle' });
        }
    });

    avatarUrlEl.addEventListener('input', () => {
        formData.avatarUrl = avatarUrlEl.value.trim();
        previewImg.src = formData.avatarUrl || getAgentAvatarUrl({ name: nameEl.value || 'A' }, { shape: 'circle' });
    });

    const avatarEditBtn = content.querySelector('#agent-avatar-edit');
    const avatarFileInput = content.querySelector('#agent-avatar-file');

    (function setupTags() {
        const tagList = content.querySelector('#agent-tags-list');
        const tagInput = content.querySelector('#agent-tags-input');
        const dropdown = content.querySelector('#agent-tags-dropdown');
        let debounceTimer;

        tagInput?.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const query = tagInput.value.trim();
            if (!query) {
                dropdown.style.display = 'none';
                return;
            }
            debounceTimer = setTimeout(async () => {
                try {
                    const { data: tags } = await api(`/agents/tags?q=${encodeURIComponent(query)}`);
                    if (!tags?.length) {
                        dropdown.style.display = 'none';
                        return;
                    }
                    dropdown.innerHTML = tags.map((tag) => `
                        <div class="chat-hub__dropdown-item tag-suggestion-item" data-name="${escapeHtml(tag.name)}">
                            <span>${escapeHtml(tag.name)}</span>
                            <span class="text-muted tag-suggestion-item__count">${tag.agent_count ?? 0} agents</span>
                        </div>
                    `).join('');
                    dropdown.style.display = 'block';
                    dropdown.querySelectorAll('.chat-hub__dropdown-item').forEach((option) => {
                        option.addEventListener('click', () => {
                            const name = option.dataset.name;
                            if (!name || [...tagList.querySelectorAll('.tag-chip')].some((chip) => chip.dataset.value === name)) return;
                            const chip = document.createElement('span');
                            chip.className = 'tag-chip';
                            chip.dataset.value = name;
                            chip.innerHTML = `${escapeHtml(name)} <button type="button" class="tag-chip__remove">&times;</button>`;
                            chip.querySelector('.tag-chip__remove').addEventListener('click', () => chip.remove());
                            tagList.appendChild(chip);
                            tagInput.value = '';
                            dropdown.style.display = 'none';
                        });
                    });
                } catch {
                    dropdown.style.display = 'none';
                }
            }, 200);
        });

        tagInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                const first = dropdown.querySelector('.chat-hub__dropdown-item');
                if (first) {
                    first.click();
                } else if (tagInput.value.trim()) {
                    const name = tagInput.value.trim();
                    if (![...tagList.querySelectorAll('.tag-chip')].some((chip) => chip.dataset.value === name)) {
                        const chip = document.createElement('span');
                        chip.className = 'tag-chip';
                        chip.dataset.value = name;
                        chip.innerHTML = `${escapeHtml(name)} <button type="button" class="tag-chip__remove">&times;</button>`;
                        chip.querySelector('.tag-chip__remove').addEventListener('click', () => chip.remove());
                        tagList.appendChild(chip);
                    }
                    tagInput.value = '';
                    dropdown.style.display = 'none';
                }
            } else if (event.key === 'Escape') {
                dropdown.style.display = 'none';
            }
        });

        document.addEventListener('click', (event) => {
            if (!content.contains(event.target)) dropdown.style.display = 'none';
        });

        tagList?.querySelectorAll('.tag-chip__remove').forEach((button) => button.addEventListener('click', () => button.closest('.tag-chip')?.remove()));
    })();

    avatarEditBtn?.addEventListener('click', () => avatarFileInput?.click());
    avatarFileInput?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const formDataUpload = new FormData();
            formDataUpload.append('file', file);
            const token = getToken();
            const response = await fetch(`${API_BASE}/media/upload`, {
                method: 'POST',
                body: formDataUpload,
                credentials: 'include',
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(json.error || response.statusText);
            if (json.data?.url) {
                const fullUrl = json.data.url.startsWith('http') ? json.data.url : (window.location.origin + json.data.url);
                formData.avatarUrl = fullUrl;
                avatarUrlEl.value = fullUrl;
                previewImg.src = fullUrl;
            }
        } catch (error) {
            showToast(error.message, 'error');
        }
        event.target.value = '';
    });
}
