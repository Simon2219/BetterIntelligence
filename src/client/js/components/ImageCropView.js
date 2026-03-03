/**
 * ImageCropView - Full-screen dedicated crop window using Cropper.js 2.x.
 * Uses Web Components API: Cropper class + cropper-selection.$toCanvas().
 */
import { el, icon } from '../utils/dom.js';

// Cropper.js 2.x from node_modules (served at /lib/cropperjs)
import Cropper from '/lib/cropperjs/cropper.esm.js';

const CROPPER_SELECTION = 'cropper-selection';

/**
 * Template: image fixed in place, crop rectangle movable and resizable (free aspect ratio).
 * - cropper-image: no translatable/scalable = image stays fixed
 * - cropper-selection: movable resizable = user drags and resizes the crop box
 * - Resize handles on all edges for free aspect ratio
 */
function getTemplate(aspectRatio) {
    const aspectAttr = aspectRatio === 1 ? ' aspect-ratio="1"' : '';
    return (
        '<cropper-canvas theme-color="var(--accent)">' +
        '<cropper-image initial-center-size="contain"></cropper-image>' +
        '<cropper-shade theme-color="rgba(0, 0, 0, 0.8)"></cropper-shade>' +
        '<cropper-selection initial-coverage="0.8" outlined movable resizable' + aspectAttr + '>' +
        '<cropper-handle action="move" theme-color="rgba(255, 255, 255, 0.2)"></cropper-handle>' +
        '<cropper-handle action="n-resize"></cropper-handle>' +
        '<cropper-handle action="e-resize"></cropper-handle>' +
        '<cropper-handle action="s-resize"></cropper-handle>' +
        '<cropper-handle action="w-resize"></cropper-handle>' +
        '<cropper-handle action="ne-resize"></cropper-handle>' +
        '<cropper-handle action="nw-resize"></cropper-handle>' +
        '<cropper-handle action="se-resize"></cropper-handle>' +
        '<cropper-handle action="sw-resize"></cropper-handle>' +
        '</cropper-selection>' +
        '</cropper-canvas>'
    );
}

function escHtml(s) {
    if (s == null) return '';
    const str = String(s);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Show full-screen crop for a single image.
 * @param {Object} options
 * @param {string} options.imageUrl - Object URL or data URL
 * @param {'circle'|'rectangle'} options.shape
 * @param {string} [options.title='Crop Image'] - Modal title
 * @param {string} [options.confirmLabel='Apply'] - Confirm button text
 * @param {function} options.onConfirm - (dataUrl: string) => void
 * @param {function} options.onCancel - () => void
 */
export function showImageCropView(options) {
    const {
        imageUrl,
        shape = 'rectangle',
        title = 'Crop Image',
        confirmLabel = 'Apply',
        onConfirm,
        onCancel
    } = options;

    const container = el('div', { class: 'image-crop-view' });
    const header = el('div', { class: 'image-crop-view__header' },
        el('button', { type: 'button', class: 'image-crop-view__close', 'aria-label': 'Cancel' }),
        el('h3', { class: 'image-crop-view__title' }, escHtml(title)),
        el('button', { type: 'button', class: 'image-crop-view__confirm btn btn--primary btn--sm' }, escHtml(confirmLabel))
    );
    const closeBtn = header.querySelector('.image-crop-view__close');
    closeBtn.appendChild(icon('x', 24));

    const area = el('div', { class: 'image-crop-view__area' });
    const img = el('img', { alt: 'Crop', class: 'image-crop-view__img' });
    img.src = imageUrl;
    area.appendChild(img);

    const info = el('div', { class: 'image-crop-view__info' }, 'Drag and resize the crop area • Pinch or scroll to zoom image');
    container.appendChild(header);
    container.appendChild(area);
    container.appendChild(info);

    let cropper = null;

    function close() {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        container.remove();
        if (typeof imageUrl === 'string' && imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(imageUrl);
        }
        onCancel?.();
    }

    async function confirm() {
        const selection = cropper?.getCropperSelection?.();
        if (!selection) return;

        const opts = {};
        if (shape === 'circle') {
            opts.width = 1024;
            opts.height = 1024;
        }

        try {
            const canvas = await selection.$toCanvas(opts);
            if (!canvas) {
                close();
                return;
            }
            let dataUrl;
            if (shape === 'circle') {
                const round = document.createElement('canvas');
                const size = canvas.width;
                round.width = size;
                round.height = size;
                const ctx = round.getContext('2d');
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(canvas, 0, 0);
                dataUrl = round.toDataURL('image/jpeg', 0.92);
            } else {
                dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            }
            if (cropper) cropper.destroy();
            container.remove();
            if (typeof imageUrl === 'string' && imageUrl.startsWith('blob:')) {
                URL.revokeObjectURL(imageUrl);
            }
            onConfirm?.(dataUrl);
        } catch (err) {
            console.error('ImageCropView: $toCanvas failed', err);
            close();
        }
    }

    header.querySelector('.image-crop-view__close').addEventListener('click', close);
    header.querySelector('.image-crop-view__confirm').addEventListener('click', () => confirm());

    document.body.appendChild(container);

    img.onload = () => {
        try {
            const aspectRatio = shape === 'circle' ? 1 : NaN;
            cropper = new Cropper(img, {
                container: area,
                template: getTemplate(aspectRatio)
            });
            if (shape === 'circle') {
                const sel = area.querySelector(CROPPER_SELECTION);
                if (sel) sel.classList.add('image-crop-view__area--circle');
            }
            // Center image to fit: contain = scale down only, center, preserve ratio (no upscale)
            const cropperImage = cropper.getCropperImage?.();
            if (cropperImage?.$center) {
                const centerFit = () => { cropperImage.$center('contain'); };
                if (cropperImage.$ready) {
                    cropperImage.$ready(centerFit);
                } else {
                    requestAnimationFrame(() => requestAnimationFrame(centerFit));
                }
            }
        } catch (err) {
            console.error('ImageCropView: Cropper init failed', err);
            close();
        }
    };

    img.onerror = () => {
        close();
    };
}
