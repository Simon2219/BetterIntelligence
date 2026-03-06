export function renderBehaviorStep(content, context) {
    const {
        formData,
        escapeHtml,
        showToast,
        makeDropZone,
        getBehaviorRules,
        setBehaviorRules,
        getSampleDialogues,
        setSampleDialogues,
        getAllowedTopics,
        setAllowedTopics,
        getBlockedTopics,
        setBlockedTopics
    } = context;

    let behaviorRules = getBehaviorRules() || [];
    let sampleDialogues = getSampleDialogues() || [];
    let allowedTopics = getAllowedTopics() || [];
    let blockedTopics = getBlockedTopics() || [];

    const syncBehaviorRules = () => setBehaviorRules(behaviorRules);
    const syncSampleDialogues = () => setSampleDialogues(sampleDialogues);
    const syncAllowedTopics = () => setAllowedTopics(allowedTopics);
    const syncBlockedTopics = () => setBlockedTopics(blockedTopics);

    content.innerHTML = `
        <div class="builder-section">
            <h3 class="builder-section__title">Behavior & Guardrails</h3>
            <p class="builder-section__desc">Define rules, example conversations, and topic guardrails. Drag to reorder priority.</p>
        </div>

        <details class="collapsible-section" open>
            <summary class="collapsible-section__header">Behavior Rules <span class="badge badge-ghost">${behaviorRules.length}</span></summary>
            <div class="collapsible-section__body">
                <div id="rules-list" class="dnd-rules-list"></div>
                <div class="add-rule-form">
                    <div class="add-rule-form__row"><label class="add-rule-form__label">When</label><input type="text" id="rule-condition" class="form-input form-input--sm" placeholder="e.g. user asks about pricing"></div>
                    <div class="add-rule-form__row"><label class="add-rule-form__label">Then</label><input type="text" id="rule-action" class="form-input form-input--sm" placeholder="e.g. redirect to /pricing or give specific answer"></div>
                    <button type="button" class="btn btn-primary btn-sm" id="add-rule-btn">+ Add rule</button>
                </div>
            </div>
        </details>

        <details class="collapsible-section">
            <summary class="collapsible-section__header">Sample Dialogues <span class="badge badge-ghost">${sampleDialogues.length}</span></summary>
            <div class="collapsible-section__body">
                <div id="dialogues-list" class="dnd-rules-list"></div>
                <div class="add-rule-form">
                    <div class="add-rule-form__row"><label class="add-rule-form__label">User says</label><input type="text" id="dialogue-user" class="form-input form-input--sm" placeholder="e.g. What's your return policy?"></div>
                    <div class="add-rule-form__row"><label class="add-rule-form__label">Agent responds</label><input type="text" id="dialogue-assistant" class="form-input form-input--sm" placeholder="e.g. We offer 30-day returns..."></div>
                    <button type="button" class="btn btn-primary btn-sm" id="add-dialogue-btn">+ Add example</button>
                </div>
            </div>
        </details>

        <details class="collapsible-section">
            <summary class="collapsible-section__header">Response & Filters</summary>
            <div class="collapsible-section__body">
                <div class="form-row">
                    <div class="form-group form-group--grow">
                        <label class="form-label">Response Delay (sec) <span class="form-help" title="Simulate typing delay. 0 = no delay">?</span></label>
                        <div class="slider-row"><input type="number" id="agent-responseDelayMin" class="form-input form-input--sm form-input--inline-number" min="0" max="30" value="${formData.responseDelayMin ?? 0}"> <span>to</span> <input type="number" id="agent-responseDelayMax" class="form-input form-input--sm form-input--inline-number" min="0" max="30" value="${formData.responseDelayMax ?? 0}"> sec</div>
                    </div>
                    <div class="form-group form-group--grow">
                        <label class="form-label">Profanity Filter <span class="form-help" title="How to handle profane content">?</span></label>
                        <select id="agent-profanityFilter" class="form-input">
                            ${['allow', 'warn', 'block'].map((value) => `<option value="${value}" ${(formData.profanityFilter || 'allow') === value ? 'selected' : ''}>${value.charAt(0).toUpperCase() + value}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
        </details>

        <details class="collapsible-section">
            <summary class="collapsible-section__header">Topic Guardrails</summary>
            <div class="collapsible-section__body">
                <div class="form-group">
                    <label class="form-label">Allowed Topics <span class="form-help" title="Topics the agent will engage with. Click chips or type to add.">?</span></label>
                    <div class="topic-suggestions">
                        <span class="topic-suggestions__label">Quick add:</span>
                        ${['coding', 'math', 'creative writing', 'recipes', 'travel', 'general'].filter((topic) => !allowedTopics.includes(topic)).map((topic) => `<button type="button" class="chip topic-chip topic-chip--allow" data-topic="${escapeHtml(topic)}">+ ${escapeHtml(topic)}</button>`).join('')}
                    </div>
                    <div class="tag-input-container">
                        <div id="allowed-topics-list" class="tag-list">${allowedTopics.map((topic) => `<span class="tag-chip tag-chip--green" data-value="${escapeHtml(topic)}">${escapeHtml(topic)} <button type="button" class="tag-chip__remove">&times;</button></span>`).join('')}</div>
                        <input type="text" id="allowed-topic-input" class="form-input form-input--sm" placeholder="e.g. coding, math">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Blocked Topics <span class="form-help" title="Topics the agent will politely decline. Click chips or type to add.">?</span></label>
                    <div class="topic-suggestions">
                        <span class="topic-suggestions__label">Quick add:</span>
                        ${['politics', 'medical advice', 'legal', 'financial advice', 'personal data'].filter((topic) => !blockedTopics.includes(topic)).map((topic) => `<button type="button" class="chip topic-chip topic-chip--block" data-topic="${escapeHtml(topic)}">+ ${escapeHtml(topic)}</button>`).join('')}
                    </div>
                    <div class="tag-input-container">
                        <div id="blocked-topics-list" class="tag-list">${blockedTopics.map((topic) => `<span class="tag-chip tag-chip--red" data-value="${escapeHtml(topic)}">${escapeHtml(topic)} <button type="button" class="tag-chip__remove">&times;</button></span>`).join('')}</div>
                        <input type="text" id="blocked-topic-input" class="form-input form-input--sm" placeholder="e.g. politics, medical advice">
                    </div>
                </div>
            </div>
        </details>
    `;

    function renderRulesList() {
        const list = content.querySelector('#rules-list');
        list.innerHTML = '';
        behaviorRules.forEach((rule, index) => {
            const item = document.createElement('div');
            item.className = 'dnd-rule-item dnd-draggable';
            item.setAttribute('draggable', 'true');
            item.dataset.index = index;
            item.innerHTML = `
                <span class="dnd-grip">&#x2630;</span>
                <span class="dnd-rule-item__label">IF</span> <span class="dnd-rule-item__text">"${escapeHtml(rule.condition || rule.when || '')}"</span>
                <span class="dnd-rule-item__label">THEN</span> <span class="dnd-rule-item__text">"${escapeHtml(rule.action || rule.then || '')}"</span>
                <button type="button" class="dnd-pipeline-item__remove" data-i="${index}">&times;</button>
            `;
            item.addEventListener('dragstart', (event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('application/json', JSON.stringify({ type: 'reorder', _reorderIndex: index }));
                item.classList.add('dnd-dragging');
                requestAnimationFrame(() => { item.style.opacity = '0.4'; });
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('dnd-dragging');
                item.style.opacity = '';
            });
            list.appendChild(item);
        });

        list.querySelectorAll('.dnd-pipeline-item__remove').forEach((button) => {
            button.addEventListener('click', () => {
                behaviorRules.splice(parseInt(button.dataset.i, 10), 1);
                syncBehaviorRules();
                renderRulesList();
            });
        });

        makeDropZone(list, {
            onReorder(fromIndex, toIndex) {
                const [moved] = behaviorRules.splice(fromIndex, 1);
                behaviorRules.splice(toIndex, 0, moved);
                syncBehaviorRules();
                renderRulesList();
            }
        });
    }

    function renderDialoguesList() {
        const list = content.querySelector('#dialogues-list');
        list.innerHTML = '';
        sampleDialogues.forEach((dialogue, index) => {
            const item = document.createElement('div');
            item.className = 'dnd-rule-item dnd-draggable';
            item.setAttribute('draggable', 'true');
            item.dataset.index = index;
            item.innerHTML = `
                <span class="dnd-grip">&#x2630;</span>
                <span class="dnd-rule-item__label">User:</span> <span class="dnd-rule-item__text">"${escapeHtml(dialogue.user || '')}"</span>
                <span class="dnd-rule-item__arrow" aria-hidden="true"></span>
                <span class="dnd-rule-item__label">Agent:</span> <span class="dnd-rule-item__text">"${escapeHtml(dialogue.assistant || '')}"</span>
                <button type="button" class="dnd-pipeline-item__remove" data-i="${index}">&times;</button>
            `;
            item.addEventListener('dragstart', (event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('application/json', JSON.stringify({ type: 'reorder', _reorderIndex: index }));
                item.classList.add('dnd-dragging');
                requestAnimationFrame(() => { item.style.opacity = '0.4'; });
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('dnd-dragging');
                item.style.opacity = '';
            });
            list.appendChild(item);
        });

        list.querySelectorAll('.dnd-pipeline-item__remove').forEach((button) => {
            button.addEventListener('click', () => {
                sampleDialogues.splice(parseInt(button.dataset.i, 10), 1);
                syncSampleDialogues();
                renderDialoguesList();
            });
        });

        makeDropZone(list, {
            onReorder(fromIndex, toIndex) {
                const [moved] = sampleDialogues.splice(fromIndex, 1);
                sampleDialogues.splice(toIndex, 0, moved);
                syncSampleDialogues();
                renderDialoguesList();
            }
        });
    }

    renderRulesList();
    renderDialoguesList();

    content.querySelector('#add-rule-btn')?.addEventListener('click', () => {
        const condition = content.querySelector('#rule-condition')?.value?.trim();
        const action = content.querySelector('#rule-action')?.value?.trim();
        if (!condition || !action) {
            showToast('Both condition and action are required', 'error');
            return;
        }
        behaviorRules.push({ condition, action });
        syncBehaviorRules();
        content.querySelector('#rule-condition').value = '';
        content.querySelector('#rule-action').value = '';
        renderRulesList();
    });

    content.querySelector('#add-dialogue-btn')?.addEventListener('click', () => {
        const userText = content.querySelector('#dialogue-user')?.value?.trim();
        const assistantText = content.querySelector('#dialogue-assistant')?.value?.trim();
        if (!userText || !assistantText) {
            showToast('Both user and assistant messages are required', 'error');
            return;
        }
        sampleDialogues.push({ user: userText, assistant: assistantText });
        syncSampleDialogues();
        content.querySelector('#dialogue-user').value = '';
        content.querySelector('#dialogue-assistant').value = '';
        renderDialoguesList();
    });

    function setupTagInput(inputId, listId, chipClass, arr, syncFn) {
        const input = content.querySelector(`#${inputId}`);
        const list = content.querySelector(`#${listId}`);
        if (!input || !list) return;

        function addTag(value) {
            if (!value.trim() || arr.includes(value.trim())) return;
            arr.push(value.trim());
            syncFn();
            const chip = document.createElement('span');
            chip.className = `tag-chip ${chipClass}`;
            chip.dataset.value = value.trim();
            chip.innerHTML = `${escapeHtml(value.trim())} <button type="button" class="tag-chip__remove">&times;</button>`;
            chip.querySelector('.tag-chip__remove').addEventListener('click', () => {
                const idx = arr.indexOf(chip.dataset.value);
                if (idx >= 0) arr.splice(idx, 1);
                syncFn();
                chip.remove();
            });
            list.appendChild(chip);
        }

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addTag(input.value);
                input.value = '';
            }
        });

        list.querySelectorAll('.tag-chip__remove').forEach((button) => {
            button.addEventListener('click', () => {
                const value = button.parentElement.dataset.value;
                const idx = arr.indexOf(value);
                if (idx >= 0) arr.splice(idx, 1);
                syncFn();
                button.parentElement.remove();
            });
        });
    }

    setupTagInput('allowed-topic-input', 'allowed-topics-list', 'tag-chip--green', allowedTopics, syncAllowedTopics);
    setupTagInput('blocked-topic-input', 'blocked-topics-list', 'tag-chip--red', blockedTopics, syncBlockedTopics);

    content.querySelectorAll('.topic-chip--allow').forEach((button) => {
        button.addEventListener('click', () => {
            const topic = button.dataset.topic;
            if (topic && !allowedTopics.includes(topic)) {
                allowedTopics.push(topic);
                syncAllowedTopics();
                const list = content.querySelector('#allowed-topics-list');
                const chip = document.createElement('span');
                chip.className = 'tag-chip tag-chip--green';
                chip.dataset.value = topic;
                chip.innerHTML = `${escapeHtml(topic)} <button type="button" class="tag-chip__remove">&times;</button>`;
                chip.querySelector('.tag-chip__remove').addEventListener('click', () => {
                    allowedTopics = allowedTopics.filter((value) => value !== topic);
                    syncAllowedTopics();
                    chip.remove();
                });
                list.appendChild(chip);
                button.hidden = true;
            }
        });
    });

    content.querySelectorAll('.topic-chip--block').forEach((button) => {
        button.addEventListener('click', () => {
            const topic = button.dataset.topic;
            if (topic && !blockedTopics.includes(topic)) {
                blockedTopics.push(topic);
                syncBlockedTopics();
                const list = content.querySelector('#blocked-topics-list');
                const chip = document.createElement('span');
                chip.className = 'tag-chip tag-chip--red';
                chip.dataset.value = topic;
                chip.innerHTML = `${escapeHtml(topic)} <button type="button" class="tag-chip__remove">&times;</button>`;
                chip.querySelector('.tag-chip__remove').addEventListener('click', () => {
                    blockedTopics = blockedTopics.filter((value) => value !== topic);
                    syncBlockedTopics();
                    chip.remove();
                });
                list.appendChild(chip);
                button.hidden = true;
            }
        });
    });
}
