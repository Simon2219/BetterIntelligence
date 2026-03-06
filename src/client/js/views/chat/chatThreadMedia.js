export function bindMessageInteraction({
    msgEl,
    showToast,
    showMediaViewer
} = {}) {
    msgEl.addEventListener('click', (event) => {
        const copyBtn = event.target.closest('.btn-copy-msg');
        if (copyBtn) {
            const contentNode = copyBtn.closest('.chat-msg')?.querySelector('.chat-msg__content');
            if (contentNode) {
                navigator.clipboard.writeText(contentNode.textContent || '').then(() => showToast('Copied', 'success'));
            }
            return;
        }

        const mediaThumb = event.target.closest('.chat-msg__media-thumb, .chat-msg__image');
        if (!mediaThumb) return;
        const msg = mediaThumb.closest('.chat-msg');
        const idx = parseInt(mediaThumb.dataset.index || '0', 10);
        let msgData = {
            type: msg?.dataset?.msgType || 'image',
            mediaUrl: msg?.dataset?.mediaUrl || '',
            media: (() => { try { return JSON.parse(msg?.dataset?.media || '[]'); } catch { return []; } })()
        };
        if (!msgData.media?.length && msgData.mediaUrl) msgData.media = [{ type: msgData.type, url: msgData.mediaUrl }];
        if (!msgData.media?.length && mediaThumb.src) {
            msgData.media = [{ type: 'image', url: mediaThumb.src.replace(/^https?:\/\/[^/]+/, '') }];
        }
        if (msgData.media?.length) showMediaViewer(msgData, idx);
    });
}

export function bindMediaUpload({
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
} = {}) {
    if (!attachBtn || !attachInput) return;
    attachBtn.appendChild(icon('paperclip', 20));
    attachBtn.addEventListener('click', () => {
        if (isModelUnavailable) return;
        attachInput.click();
    });

    attachInput.addEventListener('change', async (event) => {
        if (isModelUnavailable) {
            event.target.value = '';
            showToast('This agent cannot respond until at least one model is active and visible.', 'warning');
            return;
        }
        const files = [...(event.target.files || [])].filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
        event.target.value = '';
        if (!files.length) return;

        showMediaUploadPreview({
            items: files,
            title: 'Preview',
            confirmLabel: 'Send',
            allowCrop: files.length === 1 && files[0].type.startsWith('image/'),
            onConfirm: async (results) => {
                const media = [];
                try {
                    for (const result of results) {
                        if (result.type === 'video' && result.file) {
                            const formData = new FormData();
                            formData.append('file', result.file);
                            formData.append('chatId', chatId);
                            const res = await fetch(`${API_BASE}/media/upload`, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${getToken()}` },
                                body: formData,
                                credentials: 'include'
                            });
                            const data = await res.json();
                            if (data.success && data.data?.url) media.push({ type: 'video', url: data.data.url });
                            continue;
                        }

                        if (result.type !== 'image') continue;
                        if (result.dataUrl) {
                            const res = await fetch(`${API_BASE}/media/capture`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                                body: JSON.stringify({ imageData: result.dataUrl, chatId, mimeType: 'image/jpeg' }),
                                credentials: 'include'
                            });
                            const data = await res.json();
                            if (data.success && data.data?.url) media.push({ type: 'image', url: data.data.url });
                            continue;
                        }

                        if (result.file) {
                            const formData = new FormData();
                            formData.append('file', result.file);
                            formData.append('chatId', chatId);
                            const res = await fetch(`${API_BASE}/media/upload`, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${getToken()}` },
                                body: formData,
                                credentials: 'include'
                            });
                            const data = await res.json();
                            if (data.success && data.data?.url) media.push({ type: 'image', url: data.data.url });
                        }
                    }
                    if (media.length && socket) socket.emit('chat:send', { chatId, content: '', media });
                    else showToast('Upload failed', 'error');
                } catch (err) {
                    showToast(err.message || 'Upload failed', 'error');
                }
            },
            onCancel: () => {}
        });
    });
}
