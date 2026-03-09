export function renderKnowledgeStep(content, context) {
    const {
        agentId,
        api,
        showToast,
        escapeHtml
    } = context;

    content.innerHTML = `
        <div class="builder-section">
            <h3 class="builder-section__title">Knowledge Base</h3>
            <p class="builder-section__desc">Upload documents to give your agent reference material. The agent will search these when answering questions.</p>
        </div>
        ${!agentId ? '<p class="text-muted">Save the agent first, then add knowledge documents here.</p>' : `
            <div class="knowledge-upload-zone" id="knowledge-drop">
                <div class="knowledge-upload-zone__content">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <p>Drop a .txt, .md, or .csv file here, or enter text below</p>
                    <span class="text-muted knowledge-upload-zone__hint">Max 500KB per document</span>
                </div>
            </div>
            <div class="form-row knowledge-row-top">
                <div class="form-group form-group--grow">
                    <label class="form-label">Document Title</label>
                    <input type="text" id="kb-title" class="form-input" placeholder="e.g. Product FAQ">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Content</label>
                <textarea id="kb-content" class="form-input" rows="6" placeholder="Paste document text here..."></textarea>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="kb-upload-btn">Add Document</button>
            <div id="kb-docs-list" class="knowledge-docs-list"><div class="loading-spinner"></div></div>
        `}
    `;

    if (!agentId) return;

    const docsListEl = content.querySelector('#kb-docs-list');

    async function loadDocs() {
        try {
            const { data: docs } = await api(`/knowledge/${agentId}/documents`);
            if (!content.isConnected) return;
            if (!docs.length) {
                docsListEl.innerHTML = '<p class="text-muted knowledge-docs-empty">No documents yet.</p>';
                return;
            }
            const totalTokens = docs.reduce((sum, doc) => sum + (doc.token_count || 0), 0);
            docsListEl.innerHTML = `
                <p class="text-muted knowledge-docs-summary">Documents (${docs.length}) &mdash; Total context: ~${(totalTokens / 1000).toFixed(1)}k tokens</p>
                ${docs.map((doc) => `
                    <div class="knowledge-doc-item">
                        <div class="knowledge-doc-item__info">
                            <strong>${escapeHtml(doc.title)}</strong>
                            <span class="text-muted">${(doc.chunk_count || 0)} chunks, ~${((doc.token_count || 0) / 1000).toFixed(1)}k tokens</span>
                        </div>
                        <button type="button" class="btn btn-ghost btn-sm kb-delete" data-id="${doc.id}">&times;</button>
                    </div>
                `).join('')}
            `;
            docsListEl.querySelectorAll('.kb-delete').forEach((button) => {
                button.addEventListener('click', async () => {
                    try {
                        await api(`/knowledge/${agentId}/documents/${button.dataset.id}`, { method: 'DELETE' });
                        showToast('Document removed', 'success');
                        loadDocs();
                    } catch (error) {
                        showToast(error.message, 'error');
                    }
                });
            });
        } catch (error) {
            docsListEl.innerHTML = `<p class="text-muted">${escapeHtml(error.message)}</p>`;
        }
    }

    content.querySelector('#kb-upload-btn')?.addEventListener('click', async () => {
        const title = content.querySelector('#kb-title')?.value?.trim();
        const text = content.querySelector('#kb-content')?.value?.trim();
        if (!title || !text) {
            showToast('Title and content required', 'error');
            return;
        }
        if (text.length > 512000) {
            showToast('Content must be under 500KB', 'error');
            return;
        }
        const button = content.querySelector('#kb-upload-btn');
        button.disabled = true;
        button.textContent = 'Uploading...';
        try {
            await api(`/knowledge/${agentId}/documents`, {
                method: 'POST',
                body: JSON.stringify({ title, content: text })
            });
            content.querySelector('#kb-title').value = '';
            content.querySelector('#kb-content').value = '';
            showToast(`Document added (~${Math.ceil(text.length / 4)} tokens)`, 'success');
            loadDocs();
        } catch (error) {
            showToast(error.message, 'error');
        }
        button.disabled = false;
        button.textContent = 'Add Document';
    });

    const dropZone = content.querySelector('#knowledge-drop');
    if (dropZone) {
        dropZone.addEventListener('dragover', (event) => {
            event.preventDefault();
            dropZone.classList.add('knowledge-upload-zone--active');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('knowledge-upload-zone--active'));
        dropZone.addEventListener('drop', (event) => {
            event.preventDefault();
            dropZone.classList.remove('knowledge-upload-zone--active');
            const files = event.dataTransfer.files;
            if (!files.length) return;
            const file = files[0];
            const allowed = ['.txt', '.md', '.csv', '.text', '.markdown'];
            const extension = `.${file.name.split('.').pop().toLowerCase()}`;
            if (!allowed.includes(extension) && !file.type.startsWith('text/')) {
                showToast('Only .txt, .md, and .csv files are supported', 'error');
                return;
            }
            if (file.size > 512000) {
                showToast('File must be under 500KB', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (eventLoad) => {
                content.querySelector('#kb-content').value = eventLoad.target.result;
                if (!content.querySelector('#kb-title').value) {
                    content.querySelector('#kb-title').value = file.name.replace(/\.\w+$/, '');
                }
            };
            reader.readAsText(file);
        });
    }

    loadDocs();
}
