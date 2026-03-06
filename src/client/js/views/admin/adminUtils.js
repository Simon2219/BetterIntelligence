export function formatNumber(value) {
    const num = Number(value) || 0;
    return num.toLocaleString();
}

export function formatCompactNumber(value) {
    const num = Number(value) || 0;
    const abs = Math.abs(num);
    if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return formatNumber(num);
}

export function normalizeUsageTileMode(mode) {
    return mode === 'total' ? 'total' : 'split';
}

export function createUsageTileModeGetters(uiState) {
    function getUsageTileMode(tileId) {
        return normalizeUsageTileMode(uiState.usageTileModes[tileId]);
    }

    function applyUsageTileMode(tileEl, mode) {
        const normalized = normalizeUsageTileMode(mode);
        tileEl.dataset.usageMode = normalized;
        tileEl.classList.toggle('is-split', normalized === 'split');
        tileEl.classList.toggle('is-total', normalized === 'total');
        tileEl.setAttribute('aria-pressed', normalized === 'total' ? 'true' : 'false');
    }

    return { getUsageTileMode, applyUsageTileMode };
}

export function createRenderSplitValueTile({ escapeHtml, getUsageTileMode }) {
    return function renderSplitValueTile({ label, userValue, internalValue, className = '', tileId = '' }) {
        const user = Number(userValue) || 0;
        const internal = Number(internalValue) || 0;
        const total = user + internal;
        const resolvedTileId = String(tileId || `${label}-${className || 'tile'}`);
        const mode = getUsageTileMode(resolvedTileId);
        return `
            <button
                type="button"
                class="admin-model-stat admin-model-stat--volume admin-model-stat--split admin-model-stat--toggle ${escapeHtml(className)} ${mode === 'total' ? 'is-total' : 'is-split'}"
                data-usage-tile="${escapeHtml(resolvedTileId)}"
                data-usage-mode="${escapeHtml(mode)}"
                aria-pressed="${mode === 'total' ? 'true' : 'false'}"
                aria-label="${escapeHtml(label)} statistic tile"
            >
                <span class="admin-model-stat__label">${escapeHtml(label)}</span>
                <div class="admin-model-stat__split-grid">
                    <div class="admin-model-stat__split-cell admin-model-stat__split-cell--user">
                        <strong>${formatCompactNumber(user)}</strong>
                    </div>
                    <div class="admin-model-stat__split-cell admin-model-stat__split-cell--internal">
                        <strong>${formatCompactNumber(internal)}</strong>
                    </div>
                </div>
                <span class="admin-model-stat__total-value">${formatCompactNumber(total)}</span>
                <span class="admin-model-stat__split-pill" aria-hidden="true"><span>User</span><span>Internal</span></span>
                <span class="admin-model-stat__total-pill" aria-hidden="true">Total</span>
            </button>
        `;
    };
}

export function toPeriodKeyUtc(date, bucket) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    if (bucket === 'hour') {
        const h = String(date.getUTCHours()).padStart(2, '0');
        return `${y}-${m}-${d} ${h}:00`;
    }
    return `${y}-${m}-${d}`;
}

export function buildUsageTimeline(points, usageMeta, bucket, days) {
    const safeBucket = bucket === 'hour' ? 'hour' : 'day';
    const now = new Date();
    const sinceDate = usageMeta?.since ? new Date(usageMeta.since) : new Date(now.getTime() - ((days || 30) * 86400000));
    const start = Number.isNaN(sinceDate.getTime()) ? new Date(now.getTime() - ((days || 30) * 86400000)) : sinceDate;
    if (safeBucket === 'hour') {
        start.setUTCMinutes(0, 0, 0);
        now.setUTCMinutes(0, 0, 0);
    } else {
        start.setUTCHours(0, 0, 0, 0);
        now.setUTCHours(0, 0, 0, 0);
    }

    const stepMs = safeBucket === 'hour' ? 3600000 : 86400000;
    const byPeriod = new Map((points || []).map((p) => [String(p.period || ''), p]));
    const full = [];
    for (let t = start.getTime(); t <= now.getTime(); t += stepMs) {
        const key = toPeriodKeyUtc(new Date(t), safeBucket);
        const found = byPeriod.get(key) || {};
        full.push({
            period: key,
            requests: Number(found.requests) || 0,
            totalTokens: Number(found.totalTokens) || 0,
            errorCount: Number(found.errorCount) || 0
        });
    }
    return full;
}

export function periodLabel(period, bucket) {
    const text = String(period || '');
    if (bucket === 'hour') return text.slice(5).replace(':00', 'h');
    return text.slice(5);
}

export function encodeModelKey(providerName, modelId) {
    return `${encodeURIComponent(String(providerName || '').trim())}::${encodeURIComponent(String(modelId || '').trim())}`;
}

export function decodeModelKey(modelKey) {
    if (!modelKey || !modelKey.includes('::')) return null;
    const [providerPart, modelPart] = modelKey.split('::');
    return {
        providerName: decodeURIComponent(providerPart || ''),
        modelId: decodeURIComponent(modelPart || '')
    };
}

export async function confirmDialog({ showConfirm, title, message, confirmText = 'Confirm', danger = false }) {
    if (typeof showConfirm === 'function') {
        return showConfirm({
            title,
            message,
            confirmText,
            cancelText: 'Cancel',
            danger
        });
    }
    return window.confirm(`${title}\n\n${message}`);
}

export function normalizeHex(value) {
    const v = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
}
