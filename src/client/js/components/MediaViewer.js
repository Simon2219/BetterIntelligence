/**
 * MediaViewer - Fullscreen carousel for images and videos
 * Supports zoom, swipe, keyboard nav, close via click-outside or Escape
 */

import { el, icon } from '../utils/dom.js';

let currentIndex = 0;
let mediaItems = [];
let overlayEl = null;
let scale = 1;
let translateX = 0;
let translateY = 0;
let lastDist = 0;
let lastCenterX = 0;

function resolveUrl(url) {
    if (!url) return '';
    return url.startsWith('/') ? url : `/media/${url}`;
}

function buildMediaItems(msg) {
    if (msg.media && Array.isArray(msg.media) && msg.media.length > 0) {
        return msg.media.map(m => ({ type: m.type || 'image', url: m.url || m.mediaUrl }));
    }
    if ((msg.type === 'image' || msg.type === 'video') && (msg.mediaUrl || msg.content)) {
        return [{ type: msg.type, url: msg.mediaUrl || msg.content }];
    }
    return [];
}

export function showMediaViewer(msg, initialIndex = 0) {
    const items = buildMediaItems(msg);
    if (items.length === 0) return;

    mediaItems = items;
    currentIndex = Math.min(initialIndex, items.length - 1);
    scale = 1;
    translateX = 0;
    translateY = 0;

    overlayEl = el('div', {
        class: 'media-viewer-overlay',
        id: 'media-viewer-overlay',
        onClick: (e) => {
            if (e.target.closest('.media-viewer__slide img, .media-viewer__slide video, .media-viewer__nav, .media-viewer__dot')) return;
            close();
        }
    });

    let closed = false;
    const close = (fromPopState = false) => {
        if (closed) return;
        closed = true;
        if (overlayEl) {
            overlayEl.remove();
            overlayEl = null;
        }
        document.removeEventListener('keydown', handleKeydown);
        window.removeEventListener('popstate', onPopState);
        if (!fromPopState && history.state?.mediaViewerOpen) history.back();
    };

    const onPopState = () => { close(true); };

    const handleKeydown = (e) => {
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowLeft') navigate(-1);
        if (e.key === 'ArrowRight') navigate(1);
    };

    const updateCounter = () => {
        const counterEl = qs('.media-viewer__counter');
        if (counterEl) counterEl.textContent = `${currentIndex + 1} / ${items.length}`;
    };
    const navigate = (delta) => {
        currentIndex = Math.max(0, Math.min(items.length - 1, currentIndex + delta));
        scale = 1;
        translateX = 0;
        translateY = 0;
        renderSlide();
        renderDots();
        updateCounter();
    };

    const qs = (sel) => overlayEl?.querySelector(sel);
    const renderSlide = () => {
        const slideContainer = qs('.media-viewer__slide');
        if (!slideContainer) return;
        slideContainer.innerHTML = '';
        const item = items[currentIndex];
        const url = resolveUrl(item.url);
        if (item.type === 'video') {
            const video = el('video', {
                src: url,
                controls: true,
                autoplay: true,
                playsinline: true,
                style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
            });
            slideContainer.appendChild(video);
        } else {
            const img = el('img', {
                src: url,
                alt: 'Media',
                class: 'media-viewer__img',
                draggable: false
            });
            img.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
            slideContainer.appendChild(img);

            const handleZoom = (e) => {
                e.preventDefault();
                if (e.deltaY) {
                    scale = Math.max(0.5, Math.min(4, scale + (e.deltaY > 0 ? -0.2 : 0.2)));
                    img.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
                }
            };
            slideContainer.addEventListener('wheel', handleZoom, { passive: false });

            slideContainer.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) lastDist = 0;
                else if (e.touches.length === 2) {
                    lastDist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
                    lastCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                }
            });
            slideContainer.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (e.touches.length === 2 && lastDist > 0) {
                    const dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
                    scale = Math.max(0.5, Math.min(4, scale * (dist / lastDist)));
                    lastDist = dist;
                    img.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
                }
            }, { passive: false });
            slideContainer.addEventListener('touchend', (e) => {
                if (e.touches.length === 1) lastDist = 0;
            });
        }
    };

    const renderDots = () => {
        const dotsEl = qs('.media-viewer__dots');
        if (!dotsEl || items.length <= 1) return;
        dotsEl.innerHTML = '';
        items.forEach((_, i) => {
            const dot = el('button', {
                class: `media-viewer__dot ${i === currentIndex ? 'media-viewer__dot--active' : ''}`,
                'aria-label': `Slide ${i + 1}`,
                onClick: () => {
                    currentIndex = i;
                    scale = 1;
                    translateX = 0;
                    translateY = 0;
                    renderSlide();
                    renderDots();
                    updateCounter();
                }
            });
            dotsEl.appendChild(dot);
        });
    };

    const backdrop = el('div', { class: 'media-viewer__backdrop' });
    overlayEl.appendChild(backdrop);

    const header = el('div', { class: 'media-viewer__header' },
        el('span', {
            class: 'media-viewer__counter',
            style: { visibility: items.length > 1 ? 'visible' : 'hidden' }
        }, `${currentIndex + 1} / ${items.length}`)
    );
    overlayEl.appendChild(header);

    const carousel = el('div', { class: 'media-viewer__carousel' });
    const slideContainer = el('div', { class: 'media-viewer__slide' });
    carousel.appendChild(slideContainer);

    let touchStartX = 0;
    carousel.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1 && scale <= 1) touchStartX = e.touches[0].clientX;
    });
    carousel.addEventListener('touchend', (e) => {
        if (e.changedTouches.length === 1 && scale <= 1) {
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) {
                if (diff > 0) navigate(1);
                else navigate(-1);
            }
        }
    });

    overlayEl.appendChild(carousel);

    const navPrev = items.length > 1 ? el('button', {
        class: 'media-viewer__nav media-viewer__nav--prev media-viewer__nav--desktop-only',
        onClick: () => navigate(-1),
        'aria-label': 'Previous'
    }, icon('chevronLeft', 32)) : null;
    const navNext = items.length > 1 ? el('button', {
        class: 'media-viewer__nav media-viewer__nav--next media-viewer__nav--desktop-only',
        onClick: () => navigate(1),
        'aria-label': 'Next'
    }, icon('chevronRight', 32)) : null;

    if (navPrev) overlayEl.appendChild(navPrev);
    if (navNext) overlayEl.appendChild(navNext);

    overlayEl.appendChild(el('div', { class: 'media-viewer__dots' }));

    document.addEventListener('keydown', handleKeydown);
    history.pushState({ mediaViewerOpen: true }, '');
    window.addEventListener('popstate', onPopState);
    document.body.appendChild(overlayEl);

    renderSlide();
    renderDots();
}
