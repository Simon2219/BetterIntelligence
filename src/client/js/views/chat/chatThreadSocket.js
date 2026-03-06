export function setupThreadSocket({
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
} = {}) {
    const socket = createSocket();
    if (socket) {
        clearChatSocketListeners(socket);
        socket.emit('chat:join', { chatId });

        socket.on('agent:stream', (payload) => {
            if ((payload.conversationId || payload.chatId) === chatId && payload.chunk) {
                let last = msgEl.querySelector('.msg--streaming');
                if (!last) {
                    last = document.createElement('div');
                    last.className = 'chat-msg chat-msg--assistant msg--streaming';
                    last.innerHTML = '<div class="chat-msg__content"></div>';
                    msgEl.appendChild(last);
                }
                const node = last.querySelector('.chat-msg__content');
                node.textContent = (node.textContent || '') + payload.chunk;
                if (autoScrollRef.value) msgEl.scrollTop = msgEl.scrollHeight;
            }
        });

        socket.on('agent:done', (payload) => {
            if ((payload.conversationId || payload.chatId) !== chatId) return;
            const stream = msgEl.querySelector('.msg--streaming');
            if (stream) {
                stream.classList.remove('msg--streaming');
                stream.innerHTML += `<div class="chat-msg__actions"><button class="btn-copy-msg" title="Copy">${copyIcon}</button></div><span class="chat-msg__time">${formatTimestamp(new Date().toISOString())}</span>`;
            }
            typingEl.hidden = true;
            setComposerEnabled(true);
            regenBtn.hidden = false;
            if (!isModelUnavailable) inputEl.focus();
            if (autoScrollRef.value) msgEl.scrollTop = msgEl.scrollHeight;
        });

        socket.on('agent:media', (payload) => {
            if ((payload.conversationId || payload.chatId) !== chatId || !payload.media) return;
            payload.media.filter((m) => m.type === 'image' && m.url).forEach((m, idx) => {
                const mediaItems = [{ type: 'image', url: m.url }];
                const wrap = document.createElement('div');
                wrap.className = 'chat-msg chat-msg--assistant';
                wrap.dataset.msgType = 'image';
                wrap.dataset.mediaUrl = m.url;
                wrap.dataset.media = JSON.stringify(mediaItems);
                const url = (m.url || '').startsWith('/') ? m.url : `/media/${m.url}`;
                wrap.innerHTML = `<div class="chat-msg__content"><img src="${escapeHtml(url)}" alt="Generated image" class="chat-msg__media-thumb chat-msg__image" data-index="${idx}"></div>`;
                msgEl.appendChild(wrap);
            });
            if (autoScrollRef.value) msgEl.scrollTop = msgEl.scrollHeight;
        });

        socket.on('agent:error', (payload) => {
            typingEl.hidden = true;
            setComposerEnabled(true);
            errorEl.textContent = payload.error || 'Something went wrong';
            errorEl.hidden = false;
            setTimeout(() => { errorEl.hidden = true; }, 8000);
        });

        socket.on('chat:typing', (payload) => {
            if ((payload.conversationId || payload.chatId) === chatId) typingEl.hidden = !payload.isTyping;
        });

        socket.on('disconnect', () => {
            typingEl.hidden = true;
            setComposerEnabled(true);
        });

        socket.on('connect_error', () => {
            typingEl.hidden = true;
            setComposerEnabled(true);
            errorEl.textContent = 'Connection failed. Please refresh to try again.';
            errorEl.hidden = false;
            setTimeout(() => { errorEl.hidden = true; }, 8000);
        });
    }

    async function sendMessage() {
        if (isModelUnavailable) {
            showToast('This agent cannot respond until at least one model is active and visible.', 'warning');
            return;
        }
        const text = inputEl.value.trim();
        if (!text) return;

        const userEl = document.createElement('div');
        userEl.className = 'chat-msg chat-msg--user';
        userEl.innerHTML = `<div class="chat-msg__content">${escapeHtml(text)}</div>`;
        msgEl.querySelector('.agent-chat__empty-msg')?.remove();
        msgEl.appendChild(userEl);
        inputEl.value = '';
        msgEl.scrollTop = msgEl.scrollHeight;
        errorEl.hidden = true;

        lastUserMessageRef.value = text;
        if (socket) {
            if (!socket.connected) socket.connect();
            setComposerEnabled(false);
            typingEl.hidden = false;
            socket.emit('chat:send', { chatId, content: text });
        } else {
            showToast('Socket not connected', 'error');
        }
    }

    return { socket, sendMessage };
}
