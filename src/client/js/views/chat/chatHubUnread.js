export function createChatHubUnreadController({
    normalizeId,
    rerenderHub
} = {}) {
    let liveUnreadEventHandler = null;

    function findChatItem(container, chatId) {
        const targetId = normalizeId(chatId);
        if (!targetId) return null;
        return [...container.querySelectorAll('.chat-hub__item[data-chat-id]')]
            .find((node) => normalizeId(node.getAttribute('data-chat-id')) === targetId) || null;
    }

    function setItemUnreadBadge(item, count) {
        const nextCount = Math.max(0, parseInt(count, 10) || 0);
        const right = item.querySelector('.chat-hub__item-right') || item.querySelector('.chat-hub__item-row');
        if (!right) return;
        let badge = right.querySelector('.chat-hub__item-unread');
        if (nextCount <= 0) {
            badge?.remove();
            item.classList.remove('chat-hub__item--unread');
            return;
        }
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'chat-hub__item-unread';
            right.appendChild(badge);
        }
        badge.textContent = String(nextCount);
        item.classList.add('chat-hub__item--unread');
    }

    function incrementGroupUnread(item, delta = 1) {
        const groupHeaderHead = item
            .closest('.chat-hub__group')
            ?.querySelector('.chat-hub__group-head');
        if (!groupHeaderHead) return;
        let badge = groupHeaderHead.querySelector('.chat-hub__group-unread');
        const current = badge ? (parseInt(badge.textContent || '0', 10) || 0) : 0;
        const next = Math.max(0, current + delta);
        if (next <= 0) {
            badge?.remove();
            return;
        }
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'chat-hub__group-unread';
            groupHeaderHead.appendChild(badge);
        }
        badge.textContent = String(next);
    }

    function removeLiveUnreadUpdates() {
        if (liveUnreadEventHandler) {
            window.removeEventListener('bi:conversation:new_message', liveUnreadEventHandler);
            liveUnreadEventHandler = null;
        }
    }

    function installLiveUnreadUpdates(container, selectedChatId) {
        removeLiveUnreadUpdates();

        liveUnreadEventHandler = async (event) => {
            if (!container || !document.body.contains(container)) return;
            const payload = event?.detail || {};
            const incomingChatId = payload.conversationId || payload.chatId;
            if (!incomingChatId) return;

            const incomingId = normalizeId(incomingChatId);
            const selectedId = normalizeId(selectedChatId);
            if (incomingId && selectedId && incomingId === selectedId) return;

            const item = findChatItem(container, incomingChatId);
            if (!item) {
                try {
                    await rerenderHub?.(container, selectedChatId);
                } catch {}
                return;
            }

            const badge = item.querySelector('.chat-hub__item-unread');
            const current = parseInt(badge?.textContent || '0', 10) || 0;
            setItemUnreadBadge(item, current + 1);
            incrementGroupUnread(item, 1);
        };

        window.addEventListener('bi:conversation:new_message', liveUnreadEventHandler);
    }

    return {
        installLiveUnreadUpdates,
        removeLiveUnreadUpdates
    };
}
