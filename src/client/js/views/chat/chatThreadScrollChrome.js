export function createThreadScrollChrome({
    msgEl,
    scrollChromeEl,
    scrollTrackEl,
    scrollThumbEl,
    scrollLabelEl,
    scrollJumpEl
} = {}) {
    let scrollChromeHideTimer = null;
    let isDraggingThumb = false;
    let dragStartY = 0;
    let dragStartTop = 0;

    function formatIndexLabel(messageIndex, totalMessages) {
        if (!totalMessages) return '';
        const idx = new Intl.NumberFormat().format(messageIndex);
        const total = new Intl.NumberFormat().format(totalMessages);
        return `${idx}/${total}`;
    }

    function revealScrollChrome() {
        if (!scrollChromeEl) return;
        scrollChromeEl.classList.add('agent-chat__scrollbar--active');
        if (scrollChromeHideTimer) clearTimeout(scrollChromeHideTimer);
        scrollChromeHideTimer = setTimeout(() => {
            if (!isDraggingThumb) {
                scrollChromeEl.classList.remove('agent-chat__scrollbar--active');
            }
        }, 900);
    }

    function resolveMessageIndex() {
        const messages = [...msgEl.querySelectorAll('.chat-msg')];
        const total = messages.length;
        if (!total) return { index: 0, total: 0 };
        const maxScroll = Math.max(1, msgEl.scrollHeight - msgEl.clientHeight);
        const ratio = Math.max(0, Math.min(1, msgEl.scrollTop / maxScroll));
        const index = Math.max(1, Math.min(total, Math.round(ratio * (total - 1)) + 1));
        return { index, total };
    }

    function syncScrollChrome(visible = false) {
        if (!scrollChromeEl || !scrollTrackEl || !scrollThumbEl || !scrollLabelEl || !scrollJumpEl) return;
        const trackHeight = scrollTrackEl.clientHeight || msgEl.clientHeight || 0;
        const maxScroll = Math.max(0, msgEl.scrollHeight - msgEl.clientHeight);
        const hasOverflow = maxScroll > 0;
        scrollChromeEl.classList.toggle('agent-chat__scrollbar--hidden', !hasOverflow);
        if (!hasOverflow) {
            scrollLabelEl.textContent = '';
            return;
        }

        const ratio = msgEl.clientHeight / Math.max(msgEl.scrollHeight, 1);
        const thumbHeight = Math.max(trackHeight * ratio, Math.min(trackHeight * 0.3, 40));
        const maxThumbTop = Math.max(trackHeight - thumbHeight, 0);
        const progress = maxScroll > 0 ? Math.max(0, Math.min(1, msgEl.scrollTop / maxScroll)) : 0;
        const thumbTop = progress * maxThumbTop;

        scrollThumbEl.style.height = `${thumbHeight}px`;
        scrollThumbEl.style.transform = `translateY(${thumbTop}px)`;
        scrollLabelEl.style.transform = `translateY(${thumbTop}px)`;

        const { index, total } = resolveMessageIndex();
        scrollLabelEl.textContent = formatIndexLabel(index, total);
        scrollJumpEl.classList.toggle('agent-chat__scroll-jump--visible', msgEl.scrollTop < maxScroll - 8);

        if (visible) revealScrollChrome();
    }

    function onThumbDragMove(clientY) {
        if (!isDraggingThumb || !scrollTrackEl) return;
        const trackHeight = scrollTrackEl.clientHeight || 0;
        const thumbHeight = scrollThumbEl.getBoundingClientRect().height || 0;
        const maxThumbTop = Math.max(trackHeight - thumbHeight, 0);
        const nextTop = Math.max(0, Math.min(maxThumbTop, dragStartTop + (clientY - dragStartY)));
        const progress = maxThumbTop > 0 ? nextTop / maxThumbTop : 0;
        const maxScroll = Math.max(0, msgEl.scrollHeight - msgEl.clientHeight);
        msgEl.scrollTop = progress * maxScroll;
        syncScrollChrome(true);
    }

    scrollThumbEl?.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        isDraggingThumb = true;
        dragStartY = event.clientY;
        const thumbTransform = scrollThumbEl.style.transform || '';
        const match = thumbTransform.match(/translateY\\(([-\\d.]+)px\\)/);
        dragStartTop = match ? parseFloat(match[1]) : 0;
        scrollThumbEl.setPointerCapture?.(event.pointerId);
        revealScrollChrome();
    });

    scrollThumbEl?.addEventListener('pointermove', (event) => {
        if (!isDraggingThumb) return;
        onThumbDragMove(event.clientY);
    });

    scrollThumbEl?.addEventListener('pointerup', (event) => {
        if (!isDraggingThumb) return;
        isDraggingThumb = false;
        scrollThumbEl?.releasePointerCapture?.(event.pointerId);
        syncScrollChrome(true);
    });

    scrollThumbEl?.addEventListener('pointercancel', (event) => {
        if (!isDraggingThumb) return;
        isDraggingThumb = false;
        scrollThumbEl?.releasePointerCapture?.(event.pointerId);
        syncScrollChrome(true);
    });

    scrollTrackEl?.addEventListener('click', (event) => {
        if (!scrollTrackEl || event.target === scrollThumbEl) return;
        const rect = scrollTrackEl.getBoundingClientRect();
        const y = event.clientY - rect.top;
        const ratio = rect.height > 0 ? Math.max(0, Math.min(1, y / rect.height)) : 0;
        const maxScroll = Math.max(0, msgEl.scrollHeight - msgEl.clientHeight);
        msgEl.scrollTop = ratio * maxScroll;
        syncScrollChrome(true);
    });

    scrollJumpEl?.addEventListener('click', () => {
        msgEl.scrollTop = msgEl.scrollHeight;
        syncScrollChrome(true);
    });

    msgEl.scrollTop = msgEl.scrollHeight;
    syncScrollChrome();
    requestAnimationFrame(() => syncScrollChrome());

    return { syncScrollChrome };
}
