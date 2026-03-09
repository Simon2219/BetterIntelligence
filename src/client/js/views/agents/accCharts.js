function safeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCompactNumber(value) {
    return new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: 1
    }).format(safeNumber(value));
}

export function formatInteger(value) {
    return Math.round(safeNumber(value)).toLocaleString();
}

export function formatCurrency(value) {
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: safeNumber(value) >= 100 ? 0 : 2
    }).format(safeNumber(value));
}

export function formatPercent(value) {
    return `${safeNumber(value).toFixed(safeNumber(value) >= 10 ? 0 : 1)}%`;
}

export function formatRelativeDate(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Never';
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getMetricValue(point, metricKey) {
    if (metricKey === 'tokens') return safeNumber(point?.totalTokens);
    if (metricKey === 'cost') return safeNumber(point?.estimatedCostUsd);
    if (metricKey === 'errors') return safeNumber(point?.errors);
    return safeNumber(point?.requests);
}

export function formatMetricValue(metricKey, value) {
    if (metricKey === 'tokens') return formatCompactNumber(value);
    if (metricKey === 'cost') return formatCurrency(value);
    if (metricKey === 'errors') return formatInteger(value);
    return formatInteger(value);
}

export function renderSparkline(points = [], metricKey = 'requests', { strokeClass = 'agents-sparkline__path' } = {}) {
    const values = points.map((point) => getMetricValue(point, metricKey));
    if (!values.length || values.every((value) => value <= 0)) {
        return '<div class="agents-sparkline agents-sparkline--empty"><span>No data</span></div>';
    }
    const width = 120;
    const height = 36;
    const max = Math.max(...values, 1);
    const coords = values.map((value, index) => {
        const x = values.length === 1 ? width / 2 : (index * width) / (values.length - 1);
        const y = height - ((value / max) * (height - 4)) - 2;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    return `
        <div class="agents-sparkline" aria-hidden="true">
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
                <polyline class="${strokeClass}" points="${coords.join(' ')}"></polyline>
            </svg>
        </div>
    `;
}

export function renderTrendChart(points = [], metricKey = 'requests', { escapeHtml: escapeHtmlOpt, title = 'Trend', compareSummary = null } = {}) {
    const escapeHtml = typeof escapeHtmlOpt === 'function' ? escapeHtmlOpt : (v) => String(v ?? '');
    const values = points.map((point) => getMetricValue(point, metricKey));
    const width = Math.max(320, (points.length - 1) * 32 + 48);
    const height = 220;
    const paddingX = 24;
    const paddingY = 20;
    const plotWidth = Math.max(1, width - (paddingX * 2));
    const plotHeight = Math.max(1, height - (paddingY * 2) - 28);
    const max = Math.max(...values, 1);
    const coords = points.map((point, index) => {
        const x = points.length === 1 ? width / 2 : paddingX + (index * plotWidth) / Math.max(1, points.length - 1);
        const y = paddingY + (plotHeight - ((getMetricValue(point, metricKey) / max) * plotHeight));
        return {
            point,
            x,
            y
        };
    });
    const polyline = coords.map((coord) => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`).join(' ');
    const area = [
        `${paddingX},${paddingY + plotHeight}`,
        ...coords.map((coord) => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`),
        `${paddingX + plotWidth},${paddingY + plotHeight}`
    ].join(' ');
    const guideLines = [0.25, 0.5, 0.75].map((ratio) => paddingY + (plotHeight * ratio));

    return `
        <div class="agents-trend-chart ${!points.length ? 'agents-trend-chart--empty' : ''}">
            <div class="agents-trend-chart__header">
                <div class="agents-trend-chart__title">
                    <h3>${escapeHtml(title)}</h3>
                    ${compareSummary?.label ? `<p>${escapeHtml(compareSummary.label)}</p>` : ''}
                </div>
                <span class="agents-trend-chart__value">${escapeHtml(formatMetricValue(metricKey, values[values.length - 1] || 0))}</span>
            </div>
            ${!points.length ? '<p class="text-muted">No usage trend yet.</p>' : `
                <div class="agents-trend-chart__scroll">
                    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(title)}">
                        ${guideLines.map((lineY) => `<line class="agents-trend-chart__grid" x1="${paddingX}" y1="${lineY.toFixed(2)}" x2="${paddingX + plotWidth}" y2="${lineY.toFixed(2)}"></line>`).join('')}
                        <polygon class="agents-trend-chart__area" points="${area}"></polygon>
                        <polyline class="agents-trend-chart__line" points="${polyline}"></polyline>
                        ${coords.map((coord) => `
                            <g class="agents-trend-chart__point-wrap">
                                <circle class="agents-trend-chart__point" cx="${coord.x.toFixed(2)}" cy="${coord.y.toFixed(2)}" r="3"></circle>
                                <title>${escapeHtml(String(coord.point?.day || ''))}: ${escapeHtml(formatMetricValue(metricKey, getMetricValue(coord.point, metricKey)))}</title>
                            </g>
                        `).join('')}
                    </svg>
                    <div class="agents-trend-chart__labels">
                        ${coords.map((coord) => `<span>${escapeHtml(String(coord.point?.day || '').slice(5).replace('-', '/'))}</span>`).join('')}
                    </div>
                </div>
            `}
        </div>
    `;
}

export function renderProgressBar({ percent = 0, label = '', tone = 'default', detail = '' } = {}) {
    const safePercent = Math.max(0, Math.min(100, Math.round(safeNumber(percent))));
    return `
        <div class="agents-progress">
            <div class="agents-progress__meta">
                <span>${label}</span>
                <span>${detail || `${safePercent}%`}</span>
            </div>
            <div class="agents-progress__track">
                <div class="agents-progress__bar agents-progress__bar--${tone}" style="width:${safePercent}%"></div>
            </div>
        </div>
    `;
}
