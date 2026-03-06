export function renderPersonalityStep(content, context) {
    const {
        formData,
        escapeHtml,
        markDirty,
        promptTemplates
    } = context;

    const promptLength = (formData.systemPrompt || '').length;
    const stopTags = (formData.stopSequences || []).map((stop) => `<span class="tag-chip" data-value="${escapeHtml(stop)}">${escapeHtml(stop)} <button type="button" class="tag-chip__remove">&times;</button></span>`).join('');

    content.innerHTML = `
        <div class="builder-section">
            <h3 class="builder-section__title">Personality & Behavior</h3>
            <p class="builder-section__desc">Define how your agent thinks and responds</p>
        </div>

        <div class="form-group">
            <label class="form-label">Quick Templates <span class="form-help" title="Click a template to use it as a starting point.">?</span></label>
            <div class="template-chips" id="template-chips">
                ${promptTemplates.map((template, index) => `<button type="button" class="chip" data-idx="${index}">${template.label}</button>`).join('')}
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">System Prompt <span class="builder-tooltip" data-tip="The core instructions that shape your agent's personality."><button type="button" class="builder-tooltip__trigger" aria-label="Help">?</button><span class="builder-tooltip__popover">The core instructions that shape your agent's personality. Be clear and specific about how the agent should behave.</span></span> <span class="form-char-count" id="prompt-char-count">${promptLength} / 4000</span></label>
            <textarea id="agent-systemPrompt" class="form-input" rows="6" placeholder="You are a helpful assistant..." maxlength="4000">${escapeHtml(formData.systemPrompt)}</textarea>
        </div>

        <details class="collapsible-section" open>
            <summary class="collapsible-section__header">Personality Dimensions</summary>
            <div class="collapsible-section__body">
                <div class="form-row">
                    <div class="form-group form-group--grow">
                        <label class="form-label">Formality <span class="form-help" title="0 = very casual, 10 = extremely formal">?</span></label>
                        <div class="slider-row"><span class="slider-label">Casual</span><input type="range" id="agent-formality" class="form-range" min="0" max="10" step="1" value="${formData.formality}"><span class="slider-label">Formal</span><span id="formality-val" class="form-range-value">${formData.formality}</span><button type="button" class="btn-reset" data-target="agent-formality" data-default="5" title="Reset to default">&circlearrowleft;</button></div>
                    </div>
                    <div class="form-group form-group--grow">
                        <label class="form-label">Verbosity <span class="form-help" title="0 = terse one-liners, 10 = detailed explanations">?</span></label>
                        <div class="slider-row"><span class="slider-label">Brief</span><input type="range" id="agent-verbosity" class="form-range" min="0" max="10" step="1" value="${formData.verbosity}"><span class="slider-label">Detailed</span><span id="verbosity-val" class="form-range-value">${formData.verbosity}</span><button type="button" class="btn-reset" data-target="agent-verbosity" data-default="5" title="Reset to default">&circlearrowleft;</button></div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group form-group--grow">
                        <label class="form-label">Response Length <span class="form-help" title="Preferred length of responses">?</span></label>
                        <select id="agent-responseLength" class="form-input">
                            ${['short', 'medium', 'long'].map((value) => `<option value="${value}" ${(formData.responseLength || 'medium') === value ? 'selected' : ''}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group form-group--grow">
                        <label class="form-label">Creativity vs Factuality <span class="form-help" title="0 = stick to facts, 10 = more creative">?</span></label>
                        <div class="slider-row"><span class="slider-label">Factual</span><input type="range" id="agent-creativityFactuality" class="form-range" min="0" max="10" step="1" value="${formData.creativityFactuality ?? 5}"><span class="slider-label">Creative</span><span id="creativityFactuality-val" class="form-range-value">${formData.creativityFactuality ?? 5}</span></div>
                    </div>
                    <div class="form-group form-group--grow">
                        <label class="form-label">Mode <span class="form-help" title="Roleplay acts as a character, Assistant is factual">?</span></label>
                        <select id="agent-roleplayMode" class="form-input">
                            ${['assistant', 'roleplay'].map((value) => `<option value="${value}" ${(formData.roleplayMode || 'assistant') === value ? 'selected' : ''}>${value === 'assistant' ? 'Assistant (factual)' : 'Roleplay (in-character)'}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
        </details>

        <details class="collapsible-section">
            <summary class="collapsible-section__header">Greeting & Response Style</summary>
            <div class="collapsible-section__body">
                <div class="form-group">
                    <label class="form-label">Greeting Message <span class="form-help" title="Auto-sent as the first message when a new conversation starts. Leave blank for none.">?</span></label>
                    <textarea id="agent-greetingMessage" class="form-input" rows="2" placeholder="Hello! How can I help you today?" maxlength="500">${escapeHtml(formData.greetingMessage)}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group form-group--grow">
                        <label class="form-label">Response Format <span class="form-help" title="Controls how the agent formats its responses.">?</span></label>
                        <select id="agent-responseFormat" class="form-input">
                            ${['auto', 'plain', 'markdown', 'json'].map((value) => `<option value="${value}" ${formData.responseFormat === value ? 'selected' : ''}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group form-group--grow">
                        <label class="form-label">Memory Strategy <span class="form-help" title="How conversation history is managed. 'Full' sends all messages, 'Sliding window' sends recent ones.">?</span></label>
                        <select id="agent-memoryStrategy" class="form-input">
                            ${['full', 'sliding-window', 'summary'].map((value) => `<option value="${value}" ${formData.memoryStrategy === value ? 'selected' : ''}>${value}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
        </details>

        <details class="collapsible-section">
            <summary class="collapsible-section__header">Generation Controls</summary>
            <div class="collapsible-section__body">
                <div class="form-row">
                    <div class="form-group form-group--grow">
                        <label class="form-label">Temperature <span class="form-help" title="Controls randomness. Lower = more focused, Higher = more creative.">?</span></label>
                        <div class="slider-row"><input type="range" id="agent-temperature" class="form-range" min="0" max="2" step="0.1" value="${formData.temperature}"><span id="temp-value" class="form-range-value">${formData.temperature}</span><button type="button" class="btn-reset" data-target="agent-temperature" data-default="0.8" title="Reset to default">&circlearrowleft;</button></div>
                    </div>
                    <div class="form-group form-group--grow">
                        <label class="form-label">Max Tokens <span class="form-help" title="Maximum length of each response.">?</span></label>
                        <select id="agent-maxTokens" class="form-input">
                            ${[256, 512, 1024, 2048, 4096].map((value) => `<option value="${value}" ${formData.maxTokens === value ? 'selected' : ''}>${value} tokens</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group form-group--grow">
                        <label class="form-label">Context Window <span class="form-help" title="Number of history messages sent to the model.">?</span></label>
                        <div class="slider-row"><input type="range" id="agent-contextWindow" class="form-range" min="5" max="200" step="5" value="${formData.contextWindow}"><span id="contextWindow-val" class="form-range-value">${formData.contextWindow} msgs</span></div>
                    </div>
                </div>
            </div>
        </details>

        <details class="collapsible-section">
            <summary class="collapsible-section__header">Advanced Sampling</summary>
            <div class="collapsible-section__body">
                <div class="form-row">
                    <div class="form-group form-group--grow">
                        <label class="form-label">Top-P <span class="form-help" title="Nucleus sampling: limits to top P% probability mass.">?</span></label>
                        <div class="slider-row"><input type="range" id="agent-topP" class="form-range" min="0" max="1" step="0.05" value="${formData.topP}"><span id="topP-val" class="form-range-value">${formData.topP}</span></div>
                    </div>
                    <div class="form-group form-group--grow">
                        <label class="form-label">Top-K <span class="form-help" title="Limits to top K most probable tokens.">?</span></label>
                        <div class="slider-row"><input type="range" id="agent-topK" class="form-range" min="1" max="100" step="1" value="${formData.topK}"><span id="topK-val" class="form-range-value">${formData.topK}</span></div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group form-group--grow">
                        <label class="form-label">Repeat Penalty <span class="form-help" title="Penalizes repeated tokens. 1.0 = no penalty.">?</span></label>
                        <div class="slider-row"><input type="range" id="agent-repeatPenalty" class="form-range" min="0.5" max="2" step="0.05" value="${formData.repeatPenalty}"><span id="repeatPenalty-val" class="form-range-value">${formData.repeatPenalty}</span></div>
                    </div>
                    <div class="form-group form-group--grow">
                        <label class="form-label">Presence Penalty <span class="form-help" title="Penalizes tokens already present in the text.">?</span></label>
                        <div class="slider-row"><input type="range" id="agent-presencePenalty" class="form-range" min="0" max="2" step="0.1" value="${formData.presencePenalty}"><span id="presencePenalty-val" class="form-range-value">${formData.presencePenalty}</span></div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group form-group--grow">
                        <label class="form-label">Frequency Penalty <span class="form-help" title="Reduces repetition based on token frequency.">?</span></label>
                        <div class="slider-row"><input type="range" id="agent-frequencyPenalty" class="form-range" min="0" max="2" step="0.1" value="${formData.frequencyPenalty}"><span id="frequencyPenalty-val" class="form-range-value">${formData.frequencyPenalty}</span></div>
                    </div>
                    <div class="form-group form-group--grow">
                        <label class="form-label">Stop Sequences <span class="form-help" title="Tokens where the model stops generating. Press Enter to add.">?</span></label>
                        <div class="tag-input-container">
                            <div id="stop-sequences-list" class="tag-list">${stopTags}</div>
                            <input type="text" id="stop-seq-input" class="form-input form-input--sm" placeholder="Type and press Enter">
                        </div>
                    </div>
                </div>
            </div>
        </details>
    `;

    content.querySelectorAll('#template-chips .chip').forEach((button) => {
        button.addEventListener('click', () => {
            const template = promptTemplates[parseInt(button.dataset.idx, 10)];
            const textarea = content.querySelector('#agent-systemPrompt');
            textarea.value = template.prompt;
            textarea.dispatchEvent(new Event('input'));
            content.querySelectorAll('#template-chips .chip').forEach((chip) => chip.classList.remove('chip--active'));
            button.classList.add('chip--active');
        });
    });

    content.querySelector('#agent-systemPrompt')?.addEventListener('input', (event) => {
        content.querySelector('#prompt-char-count').textContent = `${event.target.value.length} / 4000`;
    });

    const sliders = [
        ['agent-temperature', 'temp-value', null],
        ['agent-formality', 'formality-val', null],
        ['agent-verbosity', 'verbosity-val', null],
        ['agent-creativityFactuality', 'creativityFactuality-val', null],
        ['agent-contextWindow', 'contextWindow-val', ' msgs'],
        ['agent-topP', 'topP-val', null],
        ['agent-topK', 'topK-val', null],
        ['agent-repeatPenalty', 'repeatPenalty-val', null],
        ['agent-presencePenalty', 'presencePenalty-val', null],
        ['agent-frequencyPenalty', 'frequencyPenalty-val', null]
    ];
    sliders.forEach(([inputId, valueId, suffix]) => {
        content.querySelector(`#${inputId}`)?.addEventListener('input', (event) => {
            const valueEl = content.querySelector(`#${valueId}`);
            if (valueEl) valueEl.textContent = event.target.value + (suffix || '');
        });
    });

    content.querySelectorAll('.btn-reset').forEach((button) => {
        button.addEventListener('click', () => {
            const target = content.querySelector(`#${button.dataset.target}`);
            if (target) {
                target.value = button.dataset.default;
                target.dispatchEvent(new Event('input'));
                markDirty();
            }
        });
    });

    content.querySelectorAll('input, textarea, select').forEach((element) => element.addEventListener('change', markDirty));

    const stopInput = content.querySelector('#stop-seq-input');
    const stopList = content.querySelector('#stop-sequences-list');
    if (stopInput && stopList) {
        function addStopTag(value) {
            if (!value.trim()) return;
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            chip.dataset.value = value;
            chip.innerHTML = `${escapeHtml(value)} <button type="button" class="tag-chip__remove">&times;</button>`;
            chip.querySelector('.tag-chip__remove').addEventListener('click', () => chip.remove());
            stopList.appendChild(chip);
        }

        stopInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addStopTag(stopInput.value);
                stopInput.value = '';
            }
        });

        stopList.querySelectorAll('.tag-chip__remove').forEach((button) => {
            button.addEventListener('click', () => button.parentElement.remove());
        });
    }
}
