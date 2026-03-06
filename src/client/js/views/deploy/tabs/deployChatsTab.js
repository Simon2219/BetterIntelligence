export async function renderDeployChatsTab({
    content,
    slug,
    capabilities,
    api,
    showToast,
    escapeHtml,
    formatDeployTime,
    renderDeployMessage
}) {
    let selectedId = null;
    let chats = [];

    const loadChats = async () => {
        const response = await api(`/deploy/${encodeURIComponent(slug)}/chats`);
        chats = response?.data?.chats || [];
        if (!selectedId && chats.length) selectedId = chats[0].id;
        if (selectedId && !chats.some((chat) => String(chat.id).toUpperCase() === String(selectedId).toUpperCase())) {
            selectedId = chats[0]?.id || null;
        }
    };

    const loadMessages = async (chatId) => {
        if (!chatId) return [];
        const response = await api(`/deploy/${encodeURIComponent(slug)}/chats/${encodeURIComponent(chatId)}/messages`);
        return response?.data?.messages || [];
    };

    const render = async () => {
        await loadChats();
        const selected = chats.find((chat) => String(chat.id).toUpperCase() === String(selectedId).toUpperCase()) || null;
        const messages = selected ? await loadMessages(selected.id) : [];

        content.innerHTML = `
            <div class="deploy-chats">
                <div class="deploy-chats__sidebar card">
                    <div class="deploy-chats__sidebar-head"><h3>Chats</h3><span class="deploy-chip deploy-chip--subtle">${Number(chats.length).toLocaleString()}</span></div>
                    <div class="deploy-chats__list">
                        ${chats.length ? chats.map((chat) => {
            const selectedClass = selected && String(selected.id).toUpperCase() === String(chat.id).toUpperCase() ? 'deploy-chat-row--selected' : '';
            const preview = String(chat.last_message_preview || chat.last_message || '').trim() || 'No messages yet';
            return `<button type="button" class="deploy-chat-row ${selectedClass}" data-chat-select="${escapeHtml(chat.id)}"><div class="deploy-chat-row__head"><span class="deploy-chat-row__id">${escapeHtml(chat.id)}</span><span class="deploy-chat-row__time">${escapeHtml(formatDeployTime(chat.last_message_at || chat.updated_at || chat.created_at))}</span></div><div class="deploy-chat-row__preview">${escapeHtml(preview)}</div></button>`;
        }).join('') : '<p class="text-muted">No chats found for this deployment.</p>'}
                    </div>
                </div>
                <div class="deploy-chats__thread card">
                    ${selected ? `
                        <div class="deploy-thread__header"><h3>Chat ${escapeHtml(selected.id)}</h3><span class="deploy-chip deploy-chip--subtle">${escapeHtml(formatDeployTime(selected.last_message_at || selected.updated_at || selected.created_at))}</span></div>
                        <div class="deploy-thread__messages" id="deploy-thread-messages">${messages.length ? messages.map((message) => renderDeployMessage(message, selected.ai_agent_id || selected.agent_id)).join('') : '<p class="text-muted">No messages yet.</p>'}</div>
                        ${capabilities.canManageChats ? `
                            <form id="deploy-operator-form" class="deploy-operator-form">
                                <textarea id="deploy-operator-input" class="form-input" rows="3" placeholder="Type manual message or prompt for generation..."></textarea>
                                <div class="deploy-operator-form__actions">
                                    <button class="btn btn-primary" type="button" data-op-action="manual">Send Manual</button>
                                    <button class="btn btn-tonal" type="button" data-op-action="generate">Generate Response</button>
                                </div>
                                <div class="form-hint">Generate uses your text as prompt. If empty, latest incoming user message is used.</div>
                            </form>
                        ` : '<p class="text-muted">You have read-only access to deployment chats.</p>'}
                    ` : '<p class="text-muted">Select a chat to view its transcript.</p>'}
                </div>
            </div>
        `;

        content.querySelectorAll('[data-chat-select]').forEach((el) => {
            el.addEventListener('click', async () => {
                selectedId = el.getAttribute('data-chat-select');
                await render();
                if (window.matchMedia('(max-width: 70em)').matches) {
                    content.querySelector('.deploy-chats__thread')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        const messagesWrap = content.querySelector('#deploy-thread-messages');
        if (messagesWrap) messagesWrap.scrollTop = messagesWrap.scrollHeight;

        const form = content.querySelector('#deploy-operator-form');
        if (!form || !selected) return;
        const input = content.querySelector('#deploy-operator-input');
        const buttons = [...content.querySelectorAll('[data-op-action]')];
        const runAction = async (mode) => {
            const text = String(input?.value || '').trim();
            if (mode === 'manual' && !text) {
                showToast('Manual message cannot be empty', 'error');
                return;
            }
            buttons.forEach((button) => { button.disabled = true; });
            try {
                await api(`/chats/${encodeURIComponent(selected.id)}/operator-reply`, {
                    method: 'POST',
                    body: JSON.stringify({ mode, content: text || undefined, useLatestUserMessage: mode === 'generate' && !text })
                });
                showToast(mode === 'manual' ? 'Manual message sent' : 'Response generated', 'success');
                if (input) input.value = '';
                await render();
            } catch (error) {
                showToast(error.message || 'Operator action failed', 'error');
            } finally {
                buttons.forEach((button) => { button.disabled = false; });
            }
        };

        buttons.forEach((button) => button.addEventListener('click', () => runAction(String(button.getAttribute('data-op-action') || '').trim())));
    };

    await render();
}
