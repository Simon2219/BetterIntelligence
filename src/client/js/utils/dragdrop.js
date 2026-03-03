/**
 * Shared drag-and-drop utility for BetterIntelligence builder.
 * Uses HTML5 DnD API with touch polyfill.
 */

export function makeDraggable(el, { type = 'item', data = {} } = {}) {
    el.setAttribute('draggable', 'true');
    el.classList.add('dnd-draggable');
    el.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/json', JSON.stringify({ type, ...data }));
        el.classList.add('dnd-dragging');
        requestAnimationFrame(() => el.style.opacity = '0.5');
    });
    el.addEventListener('dragend', () => {
        el.classList.remove('dnd-dragging');
        el.style.opacity = '';
    });
}

export function makeDropZone(container, { accept = null, onDrop, onReorder } = {}) {
    container.classList.add('dnd-dropzone');
    let dragOverEl = null;

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.classList.add('dnd-dropzone--active');

        const target = getClosestDraggable(e.target);
        if (target && target !== dragOverEl) {
            if (dragOverEl) dragOverEl.classList.remove('dnd-insert-before', 'dnd-insert-after');
            dragOverEl = target;
            const rect = target.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            if (e.clientY < mid) {
                target.classList.add('dnd-insert-before');
                target.classList.remove('dnd-insert-after');
            } else {
                target.classList.add('dnd-insert-after');
                target.classList.remove('dnd-insert-before');
            }
        }
    });

    container.addEventListener('dragleave', (e) => {
        if (!container.contains(e.relatedTarget)) {
            container.classList.remove('dnd-dropzone--active');
            clearInsertIndicators(container);
            dragOverEl = null;
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        container.classList.remove('dnd-dropzone--active');

        let payload;
        try { payload = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
        if (accept && payload.type !== accept) return;

        if (onReorder && payload._reorderIndex !== undefined) {
            const children = [...container.querySelectorAll('.dnd-draggable')];
            const target = getClosestDraggable(e.target);
            let toIndex = children.indexOf(target);
            if (toIndex < 0) toIndex = children.length;
            const rect = target?.getBoundingClientRect();
            if (rect && e.clientY > rect.top + rect.height / 2) toIndex++;
            if (toIndex > payload._reorderIndex) toIndex--;
            onReorder(payload._reorderIndex, Math.max(0, toIndex), payload);
        } else if (onDrop) {
            const target = getClosestDraggable(e.target);
            const children = [...container.querySelectorAll('.dnd-draggable')];
            let insertIndex = children.indexOf(target);
            if (insertIndex < 0) insertIndex = children.length;
            onDrop(payload, insertIndex);
        }

        clearInsertIndicators(container);
        dragOverEl = null;
    });
}

export function makeReorderable(container, { onReorder }) {
    container.querySelectorAll('.dnd-draggable').forEach((el, i) => {
        el.addEventListener('dragstart', (e) => {
            const existing = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
            e.dataTransfer.setData('application/json', JSON.stringify({ ...existing, _reorderIndex: i }));
        });
    });
    makeDropZone(container, { onReorder });
}

export function initReorderableList(container, items, { renderItem, onOrderChange }) {
    function render() {
        container.innerHTML = '';
        items.forEach((item, i) => {
            const el = renderItem(item, i);
            el.classList.add('dnd-draggable');
            el.setAttribute('draggable', 'true');
            el.dataset.index = i;

            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/json', JSON.stringify({ type: 'reorder', _reorderIndex: i }));
                el.classList.add('dnd-dragging');
                requestAnimationFrame(() => el.style.opacity = '0.5');
            });
            el.addEventListener('dragend', () => {
                el.classList.remove('dnd-dragging');
                el.style.opacity = '';
            });

            container.appendChild(el);
        });
    }

    makeDropZone(container, {
        onDrop: null,
        onReorder(fromIndex, toIndex) {
            const [moved] = items.splice(fromIndex, 1);
            items.splice(toIndex, 0, moved);
            render();
            if (onOrderChange) onOrderChange([...items]);
        }
    });

    render();
    return { render, getItems: () => [...items] };
}

function getClosestDraggable(el) {
    while (el && !el.classList?.contains('dnd-draggable')) el = el.parentElement;
    return el;
}

function clearInsertIndicators(container) {
    container.querySelectorAll('.dnd-insert-before, .dnd-insert-after').forEach(el => {
        el.classList.remove('dnd-insert-before', 'dnd-insert-after');
    });
}

// Touch polyfill
let touchDragData = null;
document.addEventListener('touchstart', (e) => {
    const el = e.target.closest?.('.dnd-draggable');
    if (!el) return;
    touchDragData = { el, startX: e.touches[0].clientX, startY: e.touches[0].clientY };
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (!touchDragData) return;
    const dx = e.touches[0].clientX - touchDragData.startX;
    const dy = e.touches[0].clientY - touchDragData.startY;
    if (Math.abs(dx) + Math.abs(dy) > 10) {
        touchDragData.el.classList.add('dnd-dragging');
    }
}, { passive: true });

document.addEventListener('touchend', () => {
    if (touchDragData?.el) touchDragData.el.classList.remove('dnd-dragging');
    touchDragData = null;
}, { passive: true });
