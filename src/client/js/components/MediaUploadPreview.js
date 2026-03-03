/**
 * MediaUploadPreview - Reusable preview modal for images/videos before send/upload.
 * Uses actual selection count: 1 image + allowCrop = dedicated crop window; 2+ = carousel.
 */
import { el, icon } from '../utils/dom.js';
import { showImageCropView } from './ImageCropView.js';

/**
 * Show preview modal. Options:
 * @param {Object} options
 * @param {File[]|string[]} options.items - Files or dataURLs (from camera)
 * @param {string} [options.title='Preview'] - Modal title
 * @param {string} [options.confirmLabel='Send'] - Confirm button text
 * @param {boolean} [options.allowCrop=true] - Allow crop for single images
 * @param {boolean} [options.singleOnly=false] - If true (e.g. avatar), use circle crop; else rectangle
 * @param {function} options.onConfirm - (processedItems: {file?: File, dataUrl?: string, type: string}[]) => void
 * @param {function} options.onCancel - () => void
 */
export function showMediaUploadPreview(options) {
    const {
        items = [],
        title = 'Preview',
        confirmLabel = 'Send',
        allowCrop = true,
        singleOnly = false,
        onConfirm,
        onCancel
    } = options;

    const displayItems = items.slice(0);
    if (displayItems.length === 0) {
        onCancel?.();
        return;
    }

    /** Single image + crop enabled → dedicated crop window (Cropper.js 2.x) */
    const isSingleImageWithCrop = displayItems.length === 1 && allowCrop && getItemType(displayItems[0]) === 'image';

    if (isSingleImageWithCrop) {
        const item = displayItems[0];
        let url;
        try {
            url = getPreviewUrl(item);
        } catch (err) {
            console.error('MediaUploadPreview: getPreviewUrl failed', err);
            showPreviewOverlay(displayItems, { title, confirmLabel, onConfirm, onCancel, getPreviewUrl, getItemType });
            return;
        }
        if (!url) {
            onCancel?.();
            return;
        }
        const cropShape = singleOnly ? 'circle' : 'rectangle';
        try {
            showImageCropView({
                imageUrl: url,
                shape: cropShape,
                title,
                confirmLabel,
                onConfirm: (dataUrl) => {
                    onConfirm?.([{ type: 'image', dataUrl }]);
                },
                onCancel
            });
        } catch (err) {
            console.error('MediaUploadPreview: showImageCropView failed', err);
            showPreviewOverlay(displayItems, { title, confirmLabel, onConfirm, onCancel, getPreviewUrl, getItemType });
        }
        return;
    }

    /** Multi-item or non-image → show carousel/preview */
    showPreviewOverlay(displayItems, { title, confirmLabel, onConfirm, onCancel, getPreviewUrl, getItemType });
}

function getPreviewUrl(item) {
    if (typeof item === 'string') return item;
    if (item instanceof File) return URL.createObjectURL(item);
    return item?.url || item?.preview;
}

function getItemType(item) {
    if (typeof item === 'string') return 'image';
    if (item instanceof File) return item.type.startsWith('video/') ? 'video' : 'image';
    return item?.type || 'image';
}

function showPreviewOverlay(displayItems, opts) {
    const { title, confirmLabel, onConfirm, onCancel, getPreviewUrl, getItemType } = opts;

    const overlay = el('div', { class: 'media-upload-preview-overlay', id: 'media-upload-preview' });

    function close() {
        overlay.remove();
        onCancel?.();
    }

    function confirm() {
        const results = [];
        for (let i = 0; i < displayItems.length; i++) {
            const item = displayItems[i];
            const type = getItemType(item);
            if (type === 'video') {
                results.push({ type: 'video', file: item instanceof File ? item : null, url: getPreviewUrl(item) });
            } else {
                if (item instanceof File) results.push({ type: 'image', file: item });
                else results.push({ type: 'image', dataUrl: item });
            }
        }
        overlay.remove();
        onConfirm?.(results);
    }

    const header = el('div', { class: 'media-upload-preview__header' },
        el('button', { class: 'media-upload-preview__close', onClick: close, 'aria-label': 'Cancel' }, icon('x', 24)),
        el('h3', { class: 'media-upload-preview__title' }, title),
        el('button', { class: 'btn btn--primary btn--sm', onClick: confirm }, confirmLabel)
    );

    const content = el('div', { class: 'media-upload-preview__content' });
    const track = displayItems.length > 1 ? el('div', { class: 'media-upload-preview__track' }) : content;

    displayItems.forEach((item, idx) => {
        const type = getItemType(item);
        const url = getPreviewUrl(item);
        const wrapper = el('div', { class: 'media-upload-preview__item', 'data-preview-index': String(idx) });

        if (type === 'video') {
            wrapper.appendChild(el('video', {
                src: url,
                controls: true,
                style: { maxWidth: '100%', maxHeight: '100%' }
            }));
        } else {
            wrapper.appendChild(el('img', { src: url, alt: 'Preview', style: { maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' } }));
        }
        track.appendChild(wrapper);
    });

    if (displayItems.length > 1) {
        content.classList.add('media-upload-preview__content--carousel');
        content.appendChild(track);
        const dots = el('div', { class: 'media-upload-preview__dots' });
        displayItems.forEach((_, i) => {
            dots.appendChild(el('button', {
                class: `media-upload-preview__dot ${i === 0 ? 'media-upload-preview__dot--active' : ''}`,
                'aria-label': `Image ${i + 1}`,
                onClick: () => {
                    const w = track.offsetWidth;
                    track.scrollTo({ left: w * i, behavior: 'smooth' });
                    dots.querySelectorAll('.media-upload-preview__dot').forEach((d, j) => {
                        d.classList.toggle('media-upload-preview__dot--active', j === i);
                    });
                }
            }));
        });
        track.addEventListener('scroll', () => {
            const w = track.offsetWidth;
            const idx = Math.round(track.scrollLeft / w);
            dots.querySelectorAll('.media-upload-preview__dot').forEach((d, j) => {
                d.classList.toggle('media-upload-preview__dot--active', j === idx);
            });
        });
        content.appendChild(dots);
    }

    overlay.appendChild(header);
    overlay.appendChild(content);
    overlay.appendChild(el('div', { class: 'media-upload-preview__backdrop', onClick: close }));
    document.body.appendChild(overlay);
}
