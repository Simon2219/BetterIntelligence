export async function renderModelStep(content, context) {
    const {
        formData,
        fetchProviders,
        configuredModelStatuses,
        escapeHtml,
        normalizeModelOptions
    } = context;

    content.innerHTML = `
        <div class="builder-section">
            <h3 class="builder-section__title">AI Model Configuration</h3>
            <p class="builder-section__desc">Choose which AI providers and models power this agent</p>
        </div>
        <div id="model-config"><div class="loading-spinner"></div> Detecting installed providers...</div>
    `;

    const providers = await fetchProviders(true);
    const el = content.querySelector('#model-config');
    if (!el) return;

    const textProviders = providers.filter((provider) => provider.capabilities?.text);
    const imageProviders = providers.filter((provider) => provider.capabilities?.image);
    const configuredStatuses = Array.isArray(configuredModelStatuses) ? configuredModelStatuses : [];

    el.innerHTML = `
        <div class="provider-status-bar">
            <div class="provider-status">
                <span class="status-dot ${providers.some((provider) => provider.capabilities?.text && provider.available) ? 'status-dot--online' : 'status-dot--offline'}"></span>
                Text AI: ${textProviders.length ? textProviders.map((provider) => `${provider.displayName || provider.name} (${provider.available ? 'online' : 'offline'}${!provider.available && provider.error ? ': ' + provider.error : ''})`).join(', ') : 'none configured'}
            </div>
            <div class="provider-status">
                <span class="status-dot ${providers.some((provider) => provider.capabilities?.image && provider.available) ? 'status-dot--online' : 'status-dot--offline'}"></span>
                Image AI: ${imageProviders.length ? imageProviders.map((provider) => `${provider.displayName || provider.name} (${provider.available ? 'online' : 'offline'}${!provider.available && provider.error ? ': ' + provider.error : ''})`).join(', ') : 'none configured'}
            </div>
        </div>
        <div class="form-row">
            <div class="form-group form-group--grow">
                <label class="form-label">Text Provider <span class="form-help" title="Which backend generates text responses.">?</span></label>
                <select id="agent-textProvider" class="form-input">
                    <option value="">-- Select --</option>
                    ${textProviders.map((provider) => `<option value="${provider.name}" data-display-name="${escapeHtml(provider.displayName || provider.name)}" ${formData.textProvider === provider.name ? 'selected' : ''}>${escapeHtml(provider.displayName || provider.name)}${provider.available ? '' : ' (offline)'}</option>`).join('')}
                </select>
            </div>
            <div class="form-group form-group--grow">
                <label class="form-label">Text Model <span class="form-help" title="The specific model for text generation.">?</span></label>
                <select id="agent-textModel" class="form-input">
                    <option value="">-- Select provider first --</option>
                </select>
                <p id="agent-textModel-empty" class="builder-model-empty" hidden></p>
                <div id="agent-textModel-status" class="builder-model-status" hidden></div>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group form-group--grow">
                <label class="form-label">Image Provider <span class="form-help" title="Which backend generates images.">?</span></label>
                <select id="agent-imageProvider" class="form-input">
                    <option value="">None (text only)</option>
                    ${imageProviders.map((provider) => `<option value="${provider.name}" data-display-name="${escapeHtml(provider.displayName || provider.name)}" ${formData.imageProvider === provider.name ? 'selected' : ''}>${escapeHtml(provider.displayName || provider.name)}${provider.available ? '' : ' (offline)'}</option>`).join('')}
                </select>
            </div>
            <div class="form-group form-group--grow">
                <label class="form-label">Image Model <span class="form-help" title="The checkpoint/model for image generation.">?</span></label>
                <select id="agent-imageModel" class="form-input">
                    <option value="">-- Select provider first --</option>
                </select>
                <p id="agent-imageModel-empty" class="builder-model-empty" hidden></p>
                <div id="agent-imageModel-status" class="builder-model-status" hidden></div>
            </div>
        </div>
    `;

    function setInlineHint(hintEl, message = '') {
        if (!hintEl) return;
        hintEl.textContent = message;
        hintEl.hidden = !message;
    }

    function setInlineStatus(statusEl, severity = '', message = '') {
        if (!statusEl) return;
        statusEl.classList.remove('builder-model-status--warning', 'builder-model-status--error');
        if (!message) {
            statusEl.hidden = true;
            statusEl.textContent = '';
            return;
        }
        statusEl.classList.add(severity === 'error' ? 'builder-model-status--error' : 'builder-model-status--warning');
        statusEl.hidden = false;
        statusEl.textContent = message;
    }

    function findConfiguredStatus(slot, providerName, modelId) {
        const slotKey = String(slot || '').trim().toLowerCase();
        const providerKey = String(providerName || '').trim().toLowerCase();
        const modelKey = String(modelId || '').trim();
        if (!slotKey || !providerKey || !modelKey) return null;
        return configuredStatuses.find((entry) =>
            String(entry?.slot || '').trim().toLowerCase() === slotKey
            && String(entry?.provider || '').trim().toLowerCase() === providerKey
            && String(entry?.modelId || '').trim() === modelKey
        ) || null;
    }

    function buildUnavailableMessage(slotLabel, providerLabel, modelLabel, status) {
        const reasons = Array.isArray(status?.reasons) ? status.reasons : [];
        const isInactive = status?.isActive === false || reasons.includes('deactivated');
        const isHidden = status?.isUserVisible === false || reasons.includes('hidden');
        const severity = isInactive ? 'error' : 'warning';
        let reasonText = 'currently unavailable';
        if (isInactive && isHidden) reasonText = 'inactive and hidden';
        else if (isInactive) reasonText = 'inactive';
        else if (isHidden) reasonText = 'hidden';
        const preferredLabel = String(status?.displayName || status?.modelId || modelLabel || '').trim() || 'selected model';
        return {
            severity,
            message: `${slotLabel} model "${preferredLabel}" is ${reasonText} for ${providerLabel}.`
        };
    }

    const textProvSel = el.querySelector('#agent-textProvider');
    const textModelSel = el.querySelector('#agent-textModel');
    const imgProvSel = el.querySelector('#agent-imageProvider');
    const imgModelSel = el.querySelector('#agent-imageModel');
    const textEmptyEl = el.querySelector('#agent-textModel-empty');
    const imageEmptyEl = el.querySelector('#agent-imageModel-empty');
    const textStatusEl = el.querySelector('#agent-textModel-status');
    const imageStatusEl = el.querySelector('#agent-imageModel-status');

    function syncModelStepDisplays() {
        formData.textProvider = textProvSel?.value || '';
        formData.textModel = textModelSel?.value || '';
        formData.imageProvider = imgProvSel?.value || '';
        formData.imageModel = imgModelSel?.value || '';

        formData.textProviderDisplay = textProvSel?.selectedOptions?.[0]?.dataset?.displayName || formData.textProvider;
        formData.textModelDisplay = textModelSel?.selectedOptions?.[0]?.dataset?.displayName || formData.textModel;
        formData.imageProviderDisplay = imgProvSel?.selectedOptions?.[0]?.dataset?.displayName || formData.imageProvider;
        formData.imageModelDisplay = imgModelSel?.selectedOptions?.[0]?.dataset?.displayName || formData.imageModel;
    }

    function populateModelDropdown({ selectEl, providerName, currentValue, slot, emptyEl, statusEl, slotLabel }) {
        const provider = providers.find((entry) => entry.name === providerName);
        const providerLabel = provider?.displayName || provider?.name || providerName || 'selected provider';
        selectEl.innerHTML = '';

        if (!providerName) {
            selectEl.innerHTML = '<option value="">-- Select provider first --</option>';
            setInlineHint(emptyEl, '');
            setInlineStatus(statusEl, '', '');
            selectEl.disabled = true;
            return;
        }

        const modelEntries = normalizeModelOptions(provider?.models);
        const defaultModelId = typeof provider?.defaultModel === 'string'
            ? provider.defaultModel
            : String(provider?.defaultModel?.id || provider?.defaultModel?.model || '').trim();
        const hasValidDefault = !!defaultModelId && modelEntries.some((m) => m.id === defaultModelId);

        if (!provider || !modelEntries.length) {
            setInlineHint(emptyEl, `No ${slotLabel.toLowerCase()} models are currently active and visible for ${providerLabel}.`);
            selectEl.disabled = true;
            selectEl.innerHTML = '<option value="">-- No models available --</option>';
            if (currentValue) {
                const configured = findConfiguredStatus(slot, providerName, currentValue);
                const unavailable = buildUnavailableMessage(slotLabel, providerLabel, currentValue, configured);
                setInlineStatus(statusEl, unavailable.severity, unavailable.message);
            } else {
                setInlineStatus(statusEl, '', '');
            }
            return;
        }

        setInlineHint(emptyEl, '');
        selectEl.disabled = false;

        modelEntries.forEach((modelEntry) => {
            const option = document.createElement('option');
            option.value = modelEntry.id;
            option.textContent = modelEntry.displayName;
            option.dataset.displayName = modelEntry.displayName;
            if (modelEntry.id === currentValue || (!currentValue && hasValidDefault && modelEntry.id === defaultModelId)) option.selected = true;
            selectEl.appendChild(option);
        });

        if (currentValue && !modelEntries.some((modelEntry) => modelEntry.id === currentValue)) {
            const configured = findConfiguredStatus(slot, providerName, currentValue);
            const unavailable = buildUnavailableMessage(slotLabel, providerLabel, currentValue, configured);
            setInlineStatus(statusEl, unavailable.severity, unavailable.message);
            if (!selectEl.value && selectEl.options.length > 0) {
                selectEl.selectedIndex = 0;
            }
        } else {
            setInlineStatus(statusEl, '', '');
        }
    }

    textModelSel.disabled = true;
    imgModelSel.disabled = true;

    populateModelDropdown({
        selectEl: textModelSel,
        providerName: formData.textProvider,
        currentValue: formData.textModel,
        slot: 'text',
        emptyEl: textEmptyEl,
        statusEl: textStatusEl,
        slotLabel: 'Text'
    });
    populateModelDropdown({
        selectEl: imgModelSel,
        providerName: formData.imageProvider,
        currentValue: formData.imageModel,
        slot: 'image',
        emptyEl: imageEmptyEl,
        statusEl: imageStatusEl,
        slotLabel: 'Image'
    });
    syncModelStepDisplays();

    textProvSel.addEventListener('change', () => {
        populateModelDropdown({
            selectEl: textModelSel,
            providerName: textProvSel.value,
            currentValue: '',
            slot: 'text',
            emptyEl: textEmptyEl,
            statusEl: textStatusEl,
            slotLabel: 'Text'
        });
        syncModelStepDisplays();
    });

    imgProvSel.addEventListener('change', () => {
        populateModelDropdown({
            selectEl: imgModelSel,
            providerName: imgProvSel.value,
            currentValue: '',
            slot: 'image',
            emptyEl: imageEmptyEl,
            statusEl: imageStatusEl,
            slotLabel: 'Image'
        });
        syncModelStepDisplays();
    });

    textModelSel.addEventListener('change', () => {
        populateModelDropdown({
            selectEl: textModelSel,
            providerName: textProvSel.value,
            currentValue: textModelSel.value,
            slot: 'text',
            emptyEl: textEmptyEl,
            statusEl: textStatusEl,
            slotLabel: 'Text'
        });
        syncModelStepDisplays();
    });

    imgModelSel.addEventListener('change', () => {
        populateModelDropdown({
            selectEl: imgModelSel,
            providerName: imgProvSel.value,
            currentValue: imgModelSel.value,
            slot: 'image',
            emptyEl: imageEmptyEl,
            statusEl: imageStatusEl,
            slotLabel: 'Image'
        });
        syncModelStepDisplays();
    });
}
