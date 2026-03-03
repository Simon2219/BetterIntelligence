/**
 * Dialog - Custom modal dialogs replacing browser prompt() and confirm()
 * Returns Promises so callers can await results.
 */

import { el, icon } from '../utils/dom.js';

export function showConfirm({ title = 'Confirm', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
    return new Promise((resolve) => {
        const overlay = el('div', { class: 'modal-overlay' });
        const close = (result) => { overlay.remove(); resolve(result); };

        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

        const modal = el('div', { class: 'modal', style: { maxWidth: '400px' } },
            el('div', { class: 'modal__header' },
                el('h2', { class: 'modal__title' }, title),
                el('button', { class: 'modal__close', type: 'button', onClick: () => close(false), 'aria-label': 'Close' }, icon('x', 18))
            ),
            el('div', { class: 'modal__body' },
                el('p', { class: 'modal__message' }, message)
            ),
            el('div', { class: 'modal__footer' },
                el('button', { class: 'btn btn-ghost', onClick: () => close(false) }, cancelText),
                el('button', {
                    class: danger ? 'btn btn-danger' : 'btn btn-primary',
                    onClick: () => close(true)
                }, confirmText)
            )
        );

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => modal.querySelector(danger ? '.btn-danger' : '.btn-primary')?.focus());
    });
}

export function showConfirm3({ title = 'Confirm', message = '', discardText = 'Discard', keepText = 'Keep Editing', saveText = 'Save', danger = false } = {}) {
    return new Promise((resolve) => {
        const overlay = el('div', { class: 'modal-overlay' });
        const close = (result) => { overlay.remove(); resolve(result); };

        overlay.addEventListener('click', (e) => { if (e.target === overlay) close('keep'); });

        const modal = el('div', { class: 'modal', style: { maxWidth: '420px' } },
            el('div', { class: 'modal__header' },
                el('h2', { class: 'modal__title' }, title),
                el('button', { class: 'modal__close', type: 'button', onClick: () => close('keep'), 'aria-label': 'Close' }, icon('x', 18))
            ),
            el('div', { class: 'modal__body' },
                el('p', { class: 'modal__message' }, message)
            ),
            el('div', { class: 'modal__footer', style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' } },
                el('button', { class: 'btn btn-danger', onClick: () => close('discard') }, discardText),
                el('button', { class: 'btn btn-ghost', onClick: () => close('keep') }, keepText),
                el('button', { class: 'btn btn-primary', onClick: () => close('save') }, saveText)
            )
        );

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => modal.querySelector('.btn-primary')?.focus());
    });
}

export function showPrompt({ title = 'Input', message = '', placeholder = '', value = '', type = 'text', label = '' } = {}) {
    return new Promise((resolve) => {
        const overlay = el('div', { class: 'modal-overlay' });
        const close = (result) => { overlay.remove(); resolve(result); };

        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

        const input = el('input', {
            class: 'form-input',
            type,
            placeholder,
            value,
            id: 'dialog-prompt-input'
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(input.value); });

        const modal = el('div', { class: 'modal', style: { maxWidth: '420px' } },
            el('div', { class: 'modal__header' },
                el('h2', { class: 'modal__title' }, title),
                el('button', { class: 'modal__close', type: 'button', onClick: () => close(null), 'aria-label': 'Close' }, icon('x', 18))
            ),
            el('div', { class: 'modal__body' },
                message ? el('p', { class: 'modal__message', style: { marginBottom: '1rem' } }, message) : null,
                el('div', { class: 'form-group' },
                    label ? el('label', { class: 'form-label' }, label) : null,
                    input
                )
            ),
            el('div', { class: 'modal__footer' },
                el('button', { class: 'btn btn-ghost', onClick: () => close(null) }, 'Cancel'),
                el('button', { class: 'btn btn-primary', onClick: () => close(input.value) }, 'OK')
            )
        );

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => { input.focus(); input.select(); });
    });
}
