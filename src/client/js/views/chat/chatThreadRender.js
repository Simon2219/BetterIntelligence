import { evaluateAgentModelHealth } from '../../utils/modelHealth.js';
import { parseMetadata, messageRole } from './chatMessageRenderer.js';
import { createThreadScrollChrome } from './chatThreadScrollChrome.js';
import { setupThreadSocket } from './chatThreadSocket.js';
import { bindMessageInteraction, bindMediaUpload } from './chatThreadMedia.js';

export function createThreadRenderer({
    api,
    getCurrentUser,
    getAgentAvatarUrl,
    escapeHtml,
    showToast,
    createSocket,
    clearChatSocketListeners,
    showMediaUploadPreview,
    showMediaViewer,
    icon,
    getToken,
    API_BASE,
    renderChatMessage,
    formatTimestamp,
    copyIcon
} = {}) {
    async function renderChatView(container, chatId) {
        const currentUser = getCurrentUser();
        try {
            const [{ data: chat }, { data: messagesData }] = await Promise.all([
                api(`/chats/${chatId}`),
                api(`/chats/${chatId}/messages`)
            ]);
            const messages = messagesData?.messages || messagesData || [];

            if (currentUser) {
                api(`/chats/${chatId}/read`, { method: 'PUT', body: JSON.stringify({}) }).catch(() => {});
            }

            const chatAgent = chat.agent || null;
            let agent = chatAgent ? { ...chatAgent } : null;
            const agentId = chat.ai_agent_id || chat.agent_id || chatAgent?.id || null;
            if (agentId) {
                const fullAgent = await api(`/agents/${agentId}`).then((r) => r.data).catch(() => null);
                if (fullAgent) {
                    agent = { ...(agent || {}), ...fullAgent };
                }
            }
            if (!agent) agent = chatAgent || null;

            const modelHealth = evaluateAgentModelHealth(agent || {});
            const modelHealthChip = modelHealth.state === 'ok'
                ? `<span class="agent-chat__health-chip agent-chat__health-chip--ok" title="${escapeHtml(modelHealth.summaryText)}">Ready</span>`
                : modelHealth.state === 'warning'
                    ? `<span class="agent-chat__health-chip agent-chat__health-chip--warning" title="${escapeHtml(modelHealth.summaryText)}">Partial</span>`
                    : modelHealth.state === 'error'
                        ? `<span class="agent-chat__health-chip agent-chat__health-chip--error" title="${escapeHtml(modelHealth.summaryText)}">Unavailable</span>`
                        : `<span class="agent-chat__health-chip agent-chat__health-chip--unknown" title="${escapeHtml(modelHealth.summaryText)}">No model</span>`;
            const modelHealthBanner = modelHealth.state === 'warning'
                ? `<div class="agent-chat__model-status agent-chat__model-status--warning">${escapeHtml(modelHealth.summaryText)}. Some capabilities may fail.</div>`
                : modelHealth.state === 'error'
                    ? `<div class="agent-chat__model-status agent-chat__model-status--error">${escapeHtml(modelHealth.summaryText)}. This agent cannot respond until a model is active and visible.</div>`
                    : '';

            const normalizedMessages = messages.map((message) => {
                const meta = parseMetadata(message.metadata);
                if (message.media && Array.isArray(message.media)) meta.media = message.media;
                return {
                    ...message,
                    role: messageRole(message, chat, currentUser),
                    content: message.content,
                    created_at: message.timestamp || message.created_at,
                    metadata: meta,
                    type: message.type,
                    mediaUrl: message.media_url || message.mediaUrl,
                    media: message.media
                };
            });

            const isDeploymentChat = String(chat.chatType || '').toLowerCase() === 'deployment';
            const deploymentLabel = isDeploymentChat
                ? `<span class="chat-thread-tag">/${escapeHtml(chat.deployment?.slug || 'deployment')} · ${escapeHtml(chat.access?.role || 'member')}</span>`
                : '';

            container.innerHTML = `
                <div class="agent-chat">
                    <div class="agent-chat__header">
                        <img class="agent-chat__avatar" src="${getAgentAvatarUrl(agent, { shape: 'circle' })}" alt="">
                        <div class="agent-chat__info">
                            <div class="agent-chat__name">${escapeHtml(agent?.name || 'Agent')} ${deploymentLabel}</div>
                            <div class="agent-chat__meta-row">
                                <div class="agent-chat__meta">${escapeHtml(agent?.text_model_display || agent?.textModelDisplayName || agent?.text_model || agent?.text_provider_display || agent?.textProviderDisplayName || agent?.text_provider || '-')}</div>
                                ${modelHealthChip}
                            </div>
                        </div>
                    </div>
                    ${modelHealthBanner}
                    <div class="agent-chat__messages-wrap">
                        <div class="agent-chat__messages" id="chat-msgs">
                            ${normalizedMessages.length ? normalizedMessages.map((message) => renderChatMessage(message)).join('') : '<div class="agent-chat__empty-msg"><p>Start a conversation with <strong>' + escapeHtml(agent?.name || 'Agent') + '</strong></p></div>'}
                        </div>
                        <div class="agent-chat__scrollbar" id="chat-scrollbar" aria-hidden="true">
                            <div class="agent-chat__scroll-track" id="chat-scroll-track">
                                <button type="button" class="agent-chat__scroll-thumb" id="chat-scroll-thumb" title="Scroll chat"></button>
                                <span class="agent-chat__scroll-label" id="chat-scroll-label"></span>
                            </div>
                            <button type="button" class="agent-chat__scroll-jump" id="chat-scroll-jump" title="Jump to latest message" aria-label="Jump to latest message">
                                <span class="agent-chat__scroll-jump-icon" aria-hidden="true"></span>
                            </button>
                        </div>
                    </div>
                    <div id="chat-typing" class="agent-chat__typing" hidden>
                        <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
                        <span>${escapeHtml(agent?.name || 'Agent')} is thinking...</span>
                    </div>
                    <div id="chat-error" class="agent-chat__error" hidden></div>
                    <div class="agent-chat__input ${isDeploymentChat ? 'agent-chat__input--deploy' : ''}">
                        ${isDeploymentChat ? '' : '<input type="file" id="chat-attach" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm" multiple class="u-hidden"><button id="chat-attach-btn" class="btn btn-ghost btn-sm" title="Attach image or video" type="button"></button>'}
                        <input type="text" id="chat-input" class="form-input" placeholder="${isDeploymentChat ? 'Type a manual message or generation prompt...' : 'Type a message...'}" autocomplete="off">
                        ${isDeploymentChat ? '<button id="chat-send-manual" class="btn btn-primary">Send Manual</button><button id="chat-send-generate" class="btn btn-tonal">Generate Response</button>' : '<button id="chat-regen" class="btn btn-ghost btn-sm" title="Regenerate last response" hidden>&#x21bb;</button><button id="chat-send" class="btn btn-primary">Send</button>'}
                    </div>
                </div>
            `;

            const msgEl = container.querySelector('#chat-msgs');
            const inputEl = container.querySelector('#chat-input');
            const typingEl = container.querySelector('#chat-typing');
            const errorEl = container.querySelector('#chat-error');
            const scrollChromeEl = container.querySelector('#chat-scrollbar');
            const scrollTrackEl = container.querySelector('#chat-scroll-track');
            const scrollThumbEl = container.querySelector('#chat-scroll-thumb');
            const scrollLabelEl = container.querySelector('#chat-scroll-label');
            const scrollJumpEl = container.querySelector('#chat-scroll-jump');

            const { syncScrollChrome } = createThreadScrollChrome({
                msgEl,
                scrollChromeEl,
                scrollTrackEl,
                scrollThumbEl,
                scrollLabelEl,
                scrollJumpEl
            });

            if (isDeploymentChat) {
                const canManage = !!(chat.access?.isOwner || chat.access?.isAdmin || chat.access?.permissions?.manage_chats);
                if (!canManage) {
                    inputEl.disabled = true;
                    container.querySelector('#chat-send-manual')?.setAttribute('disabled', 'disabled');
                    container.querySelector('#chat-send-generate')?.setAttribute('disabled', 'disabled');
                }

                const manualBtn = container.querySelector('#chat-send-manual');
                const generateBtn = container.querySelector('#chat-send-generate');
                const buttons = [manualBtn, generateBtn].filter(Boolean);

                async function runOperator(mode) {
                    const text = String(inputEl.value || '').trim();
                    if (mode === 'manual' && !text) {
                        showToast('Manual message cannot be empty', 'error');
                        return;
                    }

                    buttons.forEach((b) => { b.disabled = true; });
                    errorEl.hidden = true;
                    try {
                        await api(`/chats/${encodeURIComponent(chat.id)}/operator-reply`, {
                            method: 'POST',
                            body: JSON.stringify({
                                mode,
                                content: text || undefined,
                                useLatestUserMessage: mode === 'generate' && !text
                            })
                        });
                        if (inputEl) inputEl.value = '';
                        await renderChatView(container, chatId);
                    } catch (err) {
                        errorEl.textContent = err.message || 'Failed to send operator action';
                        errorEl.hidden = false;
                        setTimeout(() => { errorEl.hidden = true; }, 8000);
                    } finally {
                        buttons.forEach((b) => { b.disabled = false; });
                    }
                }

                manualBtn?.addEventListener('click', () => runOperator('manual'));
                generateBtn?.addEventListener('click', () => runOperator('generate'));
                inputEl?.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        runOperator('manual');
                    }
                });
                return;
            }

            const sendBtn = container.querySelector('#chat-send');
            const regenBtn = container.querySelector('#chat-regen');
            const attachBtn = container.querySelector('#chat-attach-btn');
            const attachInput = container.querySelector('#chat-attach');
            const isModelUnavailable = modelHealth.state === 'error';

            const autoScrollRef = { value: true };
            const lastUserMessageRef = {
                value: normalizedMessages.filter((m) => m.role === 'user').pop()?.content || ''
            };

            function setComposerEnabled(enabled) {
                const allowInput = enabled && !isModelUnavailable;
                sendBtn.disabled = !allowInput;
                inputEl.disabled = !allowInput;
                if (attachBtn) {
                    attachBtn.disabled = !allowInput;
                    attachBtn.classList.toggle('is-disabled', !allowInput);
                }
            }

            const { socket, sendMessage } = setupThreadSocket({
                createSocket,
                clearChatSocketListeners,
                chatId,
                msgEl,
                typingEl,
                errorEl,
                inputEl,
                regenBtn,
                setComposerEnabled,
                isModelUnavailable,
                formatTimestamp,
                escapeHtml,
                copyIcon,
                showToast,
                autoScrollRef,
                lastUserMessageRef
            });

            sendBtn.addEventListener('click', sendMessage);
            inputEl.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
            if (!isModelUnavailable) inputEl.focus();
            setComposerEnabled(true);

            bindMediaUpload({
                attachBtn,
                attachInput,
                icon,
                isModelUnavailable,
                showToast,
                showMediaUploadPreview,
                API_BASE,
                getToken,
                chatId,
                socket
            });

            bindMessageInteraction({
                msgEl,
                showToast,
                showMediaViewer
            });

            msgEl.addEventListener('scroll', () => {
                const atBottom = msgEl.scrollHeight - msgEl.scrollTop - msgEl.clientHeight < 60;
                autoScrollRef.value = atBottom;
                syncScrollChrome(true);
            });

            regenBtn?.addEventListener('click', () => {
                if (!lastUserMessageRef.value || !socket) return;
                inputEl.value = lastUserMessageRef.value;
                sendMessage();
            });
        } catch (err) {
            container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(err.message)}</p></div>`;
        }
    }

    return { renderChatView };
}
