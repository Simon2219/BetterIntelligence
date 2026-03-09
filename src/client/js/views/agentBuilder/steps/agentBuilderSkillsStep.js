export function renderSkillsStep(content, context) {
    const {
        api,
        container,
        escapeHtml,
        makeDropZone,
        getSkillIds,
        setSkillIds
    } = context;

    let skillIds = [...(getSkillIds() || [])];
    const syncSkillIds = () => {
        setSkillIds(skillIds);
    };

    content.innerHTML = `
        <div class="builder-section">
            <h3 class="builder-section__title">Skills Pipeline <span class="builder-tooltip"><button type="button" class="builder-tooltip__trigger" aria-label="Help">?</button><span class="builder-tooltip__popover">Add skills to give your agent specific capabilities. Drag from Available into Active. Order matters: skills run top to bottom.</span></span></h3>
            <p class="builder-section__desc">Drag skills from the available panel into the active pipeline. Drag within the pipeline to reorder.</p>
        </div>
        <div id="skills-dnd-container"><div class="loading-spinner"></div> Loading skills...</div>
    `;

    (async () => {
        try {
            const [{ data: skills }, { data: categories }] = await Promise.all([
                api('/skills'),
                api('/skills/categories').catch(() => ({ data: [] }))
            ]);
            if (!content.isConnected) return;
            const el = container.querySelector('#skills-dnd-container');
            if (!el) return;
            const cats = categories || [];
            const byCat = {};
            const uncat = [];
            const editable = (skills || []).filter((skill) => skill.source === 'installed' || skill.source === 'workspace');
            for (const skill of editable) {
                const categoryId = (skill.categoryIds || [])[0];
                if (categoryId) {
                    if (!byCat[categoryId]) byCat[categoryId] = [];
                    byCat[categoryId].push(skill);
                } else {
                    uncat.push(skill);
                }
            }

            el.innerHTML = `
                <div class="dnd-layout">
                    <div class="dnd-panel">
                        <h4 class="dnd-panel__title">Available Skills</h4>
                        <div class="dnd-panel__section-label">Search by name or description</div>
                        <input type="text" id="skill-search" class="form-input form-input--sm skill-search" placeholder="Search skills...">
                        <div class="dnd-panel__list" id="available-skills"></div>
                        <div id="skill-preview-panel" class="skill-preview skill-preview--hidden"></div>
                    </div>
                    <div class="dnd-panel dnd-panel--pipeline">
                        <h4 class="dnd-panel__title">Active Skills <span class="badge badge-ghost">${skillIds.length}</span></h4>
                        <div class="dnd-panel__list dnd-dropzone" id="pipeline-skills"></div>
                        <div class="dnd-panel__empty ${skillIds.length ? 'dnd-panel__empty--hidden' : ''}" id="pipeline-empty">Drop skills here...</div>
                    </div>
                </div>
            `;

            const availableEl = el.querySelector('#available-skills');
            const pipelineEl = el.querySelector('#pipeline-skills');
            const emptyEl = el.querySelector('#pipeline-empty');

            function refreshPipelineUI() {
                pipelineEl.innerHTML = '';
                skillIds.forEach((skillId, index) => {
                    const skill = skills.find((entry) => entry.id === skillId || (entry.slug || entry.name) === skillId);
                    const item = document.createElement('div');
                    item.className = 'dnd-pipeline-item dnd-draggable';
                    item.setAttribute('draggable', 'true');
                    item.dataset.index = index;
                    item.innerHTML = `
                        <span class="dnd-grip">&#x2630;</span>
                        <span class="dnd-pipeline-item__num">${index + 1}</span>
                        <span class="dnd-pipeline-item__name">${escapeHtml(skill?.name || skillId)}</span>
                        ${skill?.version ? `<span class="badge badge-ghost skills-badge-2xs">${escapeHtml(skill.version)}</span>` : ''}
                        <button type="button" class="dnd-pipeline-item__remove" data-skill-id="${escapeHtml(skillId)}">&times;</button>
                    `;
                    item.addEventListener('dragstart', (event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('application/json', JSON.stringify({ type: 'reorder', _reorderIndex: index, skillId }));
                        item.classList.add('dnd-dragging');
                        requestAnimationFrame(() => { item.style.opacity = '0.4'; });
                    });
                    item.addEventListener('dragend', () => {
                        item.classList.remove('dnd-dragging');
                        item.style.opacity = '';
                    });
                    pipelineEl.appendChild(item);
                });

                pipelineEl.querySelectorAll('.dnd-pipeline-item__remove').forEach((button) => {
                    button.addEventListener('click', () => {
                        const id = button.dataset.skillId;
                        skillIds = skillIds.filter((skillId) => skillId !== id);
                        syncSkillIds();
                        refreshAll();
                    });
                });

                emptyEl.classList.toggle('dnd-panel__empty--hidden', skillIds.length > 0);
                el.querySelector('.dnd-panel--pipeline .dnd-panel__title .badge').textContent = skillIds.length;
            }

            function addSkillCard(skill, host) {
                const id = skill.id || skill.slug || skill.name;
                const inPipeline = skillIds.includes(id);
                const card = document.createElement('div');
                card.className = `dnd-available-skill ${inPipeline ? 'dnd-available-skill--used' : ''}`;
                card.setAttribute('draggable', !inPipeline ? 'true' : 'false');
                card.dataset.skillName = skill.name;
                card.innerHTML = `
                    <strong>${escapeHtml(skill.name)}</strong>
                    <span class="text-muted dnd-available-skill__desc">${escapeHtml(skill.description || '')}</span>
                    ${inPipeline ? '<span class="badge badge-ghost skills-badge-xs">in pipeline</span>' : ''}
                `;
                if (!inPipeline) {
                    card.addEventListener('dragstart', (event) => {
                        event.dataTransfer.effectAllowed = 'copy';
                        event.dataTransfer.setData('application/json', JSON.stringify({ type: 'add-skill', skillId: id }));
                        card.classList.add('dnd-dragging');
                    });
                    card.addEventListener('dragend', () => card.classList.remove('dnd-dragging'));
                    card.addEventListener('dblclick', () => {
                        if (!skillIds.includes(id)) {
                            skillIds.push(id);
                            syncSkillIds();
                            refreshAll();
                        }
                    });
                }
                host.appendChild(card);
            }

            function refreshAvailableUI() {
                availableEl.innerHTML = '';
                const query = (el.querySelector('#skill-search')?.value || '').toLowerCase();
                const matches = (skill) => !query || (skill.name || '').toLowerCase().includes(query) || (skill.description || '').toLowerCase().includes(query);
                cats.forEach((cat) => {
                    const items = (byCat[cat.id] || []).filter(matches);
                    if (!items.length) return;
                    const section = document.createElement('details');
                    section.className = 'collapsible-section';
                    section.innerHTML = `<summary class="collapsible-section__header">${escapeHtml(cat.name)} <span class="badge badge-ghost">${items.length}</span></summary><div class="collapsible-section__body"></div>`;
                    items.forEach((skill) => addSkillCard(skill, section.querySelector('.collapsible-section__body')));
                    availableEl.appendChild(section);
                });
                if (uncat.filter(matches).length) {
                    const section = document.createElement('details');
                    section.className = 'collapsible-section';
                    section.open = true;
                    section.innerHTML = `<summary class="collapsible-section__header">Uncategorized <span class="badge badge-ghost">${uncat.filter(matches).length}</span></summary><div class="collapsible-section__body"></div>`;
                    uncat.filter(matches).forEach((skill) => addSkillCard(skill, section.querySelector('.collapsible-section__body')));
                    availableEl.appendChild(section);
                }
            }

            function refreshAll() {
                refreshAvailableUI();
                refreshPipelineUI();
            }

            makeDropZone(pipelineEl, {
                onDrop(payload, insertIndex) {
                    if (payload.type === 'add-skill' && payload.skillId && !skillIds.includes(payload.skillId)) {
                        skillIds.splice(insertIndex, 0, payload.skillId);
                        syncSkillIds();
                        refreshAll();
                    }
                },
                onReorder(fromIndex, toIndex) {
                    const [moved] = skillIds.splice(fromIndex, 1);
                    skillIds.splice(toIndex, 0, moved);
                    syncSkillIds();
                    refreshAll();
                }
            });

            refreshAll();

            const searchInput = el.querySelector('#skill-search');
            const previewPanel = el.querySelector('#skill-preview-panel');
            searchInput?.addEventListener('input', () => {
                const query = searchInput.value.toLowerCase();
                availableEl.querySelectorAll('.collapsible-section').forEach((section) => {
                    let visible = 0;
                    section.querySelectorAll('.dnd-available-skill').forEach((card) => {
                        const name = card.querySelector('strong')?.textContent?.toLowerCase() || '';
                        const desc = card.querySelector('.text-muted')?.textContent?.toLowerCase() || '';
                        const show = !query || name.includes(query) || desc.includes(query);
                        card.style.display = show ? '' : 'none';
                        if (show) visible++;
                    });
                    section.style.display = visible ? '' : 'none';
                });
            });

            availableEl.addEventListener('click', (event) => {
                const card = event.target.closest('.dnd-available-skill');
                if (!card) return;
                const name = card.querySelector('strong')?.textContent;
                const skill = skills.find((entry) => entry.name === name);
                if (skill && previewPanel) {
                    previewPanel.classList.remove('skill-preview--hidden');
                    previewPanel.innerHTML = `<strong>${escapeHtml(skill.name)}</strong> <span class="text-muted">(v${escapeHtml(skill.version || '1.0')})</span><br><br>${escapeHtml(skill.instructions || skill.description || 'No instructions')}`;
                }
            });
        } catch (error) {
            const el = container.querySelector('#skills-dnd-container');
            if (el) el.innerHTML = `<p class="text-muted">Failed to load skills: ${escapeHtml(error.message)}</p>`;
        }
    })();
}
