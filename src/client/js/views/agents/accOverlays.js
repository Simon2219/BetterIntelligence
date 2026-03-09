import { el, icon } from '../../utils/dom.js';

function trapFocus(container, onEscape) {
    const selectors = [
        'button:not([disabled])',
        '[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    function getFocusable() {
        return [...container.querySelectorAll(selectors)]
            .filter((element) => element.offsetParent !== null || element === document.activeElement);
    }

    function handleKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            onEscape?.();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = getFocusable();
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    container.addEventListener('keydown', handleKeydown);
    return () => container.removeEventListener('keydown', handleKeydown);
}

export function openAccModal({
    title,
    subtitle = '',
    body,
    footer = null,
    width = '720px',
    closeOnOverlay = true
} = {}) {
    const overlay = el('div', { class: 'modal-overlay agents-control-modal-overlay' });
    const modal = el('div', {
        class: 'modal agents-control-modal',
        role: 'dialog',
        'aria-modal': 'true',
        style: { maxWidth: width }
    });

    const close = () => {
        releaseFocus?.();
        overlay.remove();
    };

    if (closeOnOverlay) {
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) close();
        });
    }

    const header = el(
        'div',
        { class: 'modal__header agents-control-modal__header' },
        el(
            'div',
            { class: 'agents-control-modal__titles' },
            el('h2', { class: 'modal__title' }, title || 'Details'),
            subtitle ? el('p', { class: 'agents-control-modal__subtitle' }, subtitle) : null
        ),
        el(
            'button',
            {
                class: 'modal__close',
                type: 'button',
                'aria-label': 'Close',
                onClick: close
            },
            icon('x', 18)
        )
    );

    const bodyNode = el('div', { class: 'modal__body agents-control-modal__body' });
    if (typeof body === 'string') bodyNode.innerHTML = body;
    else if (body instanceof Node) bodyNode.appendChild(body);

    modal.appendChild(header);
    modal.appendChild(bodyNode);

    if (footer) {
        const footerNode = el('div', { class: 'modal__footer agents-control-modal__footer' });
        if (typeof footer === 'string') footerNode.innerHTML = footer;
        else if (footer instanceof Node) footerNode.appendChild(footer);
        modal.appendChild(footerNode);
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const releaseFocus = trapFocus(modal, close);

    const removalObserver = new MutationObserver(() => {
        if (!document.body.contains(overlay)) {
            releaseFocus?.();
            removalObserver.disconnect();
        }
    });
    removalObserver.observe(document.body, { childList: true });

    requestAnimationFrame(() => {
        modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
    });

    return { overlay, modal, close };
}

let activeMenuCleanup = null;

export function openAccMenu(anchor, items = [], { align = 'right' } = {}) {
    activeMenuCleanup?.();
    if (!anchor || !items.length) return { close: () => {} };

    const rect = anchor.getBoundingClientRect();
    const menu = el('div', {
        class: `agents-control-menu agents-control-menu--${align}`,
        role: 'menu',
        tabindex: '-1'
    });

    const close = () => {
        document.removeEventListener('mousedown', onDocumentPointer);
        document.removeEventListener('keydown', onDocumentKeydown);
        window.removeEventListener('scroll', close, true);
        window.removeEventListener('resize', close);
        menu.remove();
        activeMenuCleanup = null;
    };

    const onDocumentPointer = (event) => {
        if (!menu.contains(event.target) && event.target !== anchor) close();
    };

    const onDocumentKeydown = (event) => {
        if (event.key === 'Escape') close();
    };

    items.forEach((item) => {
        if (item?.separator) {
            menu.appendChild(el('div', { class: 'agents-control-menu__divider' }));
            return;
        }
        const button = el(
            'button',
            {
                class: `agents-control-menu__item ${item.danger ? 'agents-control-menu__item--danger' : ''}`,
                type: 'button',
                role: 'menuitem',
                disabled: item.disabled === true
            },
            item.iconName ? el('span', { class: 'agents-control-menu__icon' }, icon(item.iconName, 16)) : null,
            el('span', { class: 'agents-control-menu__label' }, item.label || 'Action')
        );
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            if (item.disabled) return;
            close();
            await item.onSelect?.();
        });
        menu.appendChild(button);
    });

    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();
    const left = align === 'left'
        ? rect.left
        : Math.max(12, rect.right - menuRect.width);
    menu.style.left = `${Math.min(left, window.innerWidth - menuRect.width - 12)}px`;
    menu.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - menuRect.height - 12)}px`;

    setTimeout(() => {
        document.addEventListener('mousedown', onDocumentPointer);
        document.addEventListener('keydown', onDocumentKeydown);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        menu.focus();
    }, 0);

    activeMenuCleanup = close;
    return { close };
}
