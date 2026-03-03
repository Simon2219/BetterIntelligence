/**
 * Toast - Custom notification component (replaces browser alerts)
 */

import { el, icon, qs } from '../utils/dom.js';

const DURATION = 3000;

export function showToast(message, type = 'info', duration = DURATION) {
    const container = qs('#toast-container');
    if (!container) return;

    const toast = el('div', { class: `toast toast--${type}` },
        el('span', { class: 'toast__message' }, message),
        el('button', { class: 'toast__close', onClick: () => removeToast(toast), type: 'button', 'aria-label': 'Close' },
            icon('x', 14)
        )
    );
    container.appendChild(toast);
    setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 200ms ease';
    setTimeout(() => toast.remove(), 200);
}

export default { show: showToast };
