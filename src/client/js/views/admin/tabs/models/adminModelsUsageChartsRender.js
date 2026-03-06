export function renderUsageChartHtml({
    fullPoints,
    bucket,
    activeMetric,
    escapeHtml,
    formatNumber,
    formatCompactNumber,
    periodLabel
}) {
    const maxRequests = Math.max(...fullPoints.map((p) => p.requests || 0), 0);
    const maxTokens = Math.max(...fullPoints.map((p) => p.totalTokens || 0), 0);
    const maxErrors = Math.max(...fullPoints.map((p) => p.errorCount || 0), 0);
    const metricMeta = {
        requests: { label: 'Requests', value: (p) => p.requests || 0, max: maxRequests, className: 'requests' },
        tokens: { label: 'Tokens', value: (p) => p.totalTokens || 0, max: maxTokens, className: 'tokens' },
        errors: { label: 'Errors', value: (p) => p.errorCount || 0, max: maxErrors, className: 'errors' }
    };
    const hasAnyData = fullPoints.some((p) => (p.requests || 0) > 0 || (p.totalTokens || 0) > 0 || (p.errorCount || 0) > 0);

    if (!activeMetric) {
        return `
            <div class="admin-model-chart ${!hasAnyData ? 'admin-model-chart--empty' : ''}">
                ${!hasAnyData ? '<div class="admin-model-chart__empty">No data available</div>' : ''}
                ${fullPoints.map((point) => {
            const req = point.requests || 0;
            const tok = point.totalTokens || 0;
            const err = point.errorCount || 0;
            const reqHeight = req > 0 && maxRequests > 0 ? Math.max(8, Math.round((req / maxRequests) * 100)) : 0;
            const tokHeight = tok > 0 && maxTokens > 0 ? Math.max(8, Math.round((tok / maxTokens) * 100)) : 0;
            const errHeight = err > 0 && maxErrors > 0 ? Math.max(8, Math.round((err / maxErrors) * 100)) : 0;
            return `
                        <div class="admin-model-chart__bar-wrap" title="${escapeHtml(point.period)} - ${formatNumber(req)} requests - ${formatNumber(tok)} tokens - ${formatNumber(err)} errors">
                            <div class="admin-model-chart__values">
                                ${req > 0 ? `<span class="admin-model-chart__value admin-model-chart__value--requests">${formatCompactNumber(req)}</span>` : ''}
                                ${tok > 0 ? `<span class="admin-model-chart__value admin-model-chart__value--tokens">${formatCompactNumber(tok)}</span>` : ''}
                                ${err > 0 ? `<span class="admin-model-chart__value admin-model-chart__value--errors">${formatCompactNumber(err)}</span>` : ''}
                            </div>
                            <div class="admin-model-chart__bars">
                                ${reqHeight > 0 ? `<div class="admin-model-chart__bar admin-model-chart__bar--requests" style="height:${reqHeight}%"></div>` : ''}
                                ${tokHeight > 0 ? `<div class="admin-model-chart__bar admin-model-chart__bar--tokens" style="height:${tokHeight}%"></div>` : ''}
                                ${errHeight > 0 ? `<div class="admin-model-chart__bar admin-model-chart__bar--errors" style="height:${errHeight}%"></div>` : ''}
                            </div>
                            <span class="admin-model-chart__label">${escapeHtml(periodLabel(point.period, bucket))}</span>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }

    const meta = metricMeta[activeMetric];
    const values = fullPoints.map((p) => meta.value(p));
    const maxValue = meta.max || 0;
    const hasMetricData = values.some((v) => v > 0);
    const pointCount = fullPoints.length;
    const chartWidth = Math.max(280, (pointCount - 1) * 28 + 48);
    const svgWidth = chartWidth;
    const svgHeight = 186;
    const padL = 22;
    const padR = 20;
    const padT = 18;
    const padB = 32;
    const plotW = Math.max(1, svgWidth - padL - padR);
    const plotH = Math.max(1, svgHeight - padT - padB);
    const stride = pointCount > 120 ? Math.ceil(pointCount / 28) : pointCount > 70 ? Math.ceil(pointCount / 20) : 1;

    const coords = fullPoints.map((p, idx) => {
        const raw = meta.value(p);
        const ratio = maxValue > 0 ? raw / maxValue : 0;
        const x = padL + (pointCount > 1 ? (idx * plotW) / (pointCount - 1) : plotW / 2);
        const y = padT + (1 - ratio) * plotH;
        return { idx, x, y, raw, period: p.period };
    });
    const linePoints = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');

    return `
        <div class="admin-model-chart admin-model-chart--line ${!hasMetricData ? 'admin-model-chart--empty' : ''}">
            ${!hasMetricData ? '<div class="admin-model-chart__empty">No data available</div>' : ''}
            <div class="admin-model-line" style="width:${chartWidth}px">
                <svg class="admin-model-line__svg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(meta.label)} line chart">
                    <line class="admin-model-line__axis" x1="${padL}" y1="${svgHeight - padB}" x2="${svgWidth - padR}" y2="${svgHeight - padB}"></line>
                    ${hasMetricData ? `<polyline class="admin-model-line__path admin-model-line__path--${meta.className}" points="${linePoints}"></polyline>` : ''}
                    ${coords.map((c) => {
            if (!hasMetricData) return '';
            const showPoint = c.raw > 0 || c.idx % stride === 0;
            if (!showPoint) return '';
            const showValue = c.raw > 0 && (pointCount <= 80 || c.idx % stride === 0);
            return `
                            <g class="admin-model-line__point-group admin-model-line__point-group--${meta.className}">
                                <circle class="admin-model-line__point" cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="2.8"></circle>
                                ${showValue ? `<text class="admin-model-line__value" x="${c.x.toFixed(2)}" y="${Math.max(10, c.y - 7).toFixed(2)}">${escapeHtml(formatCompactNumber(c.raw))}</text>` : ''}
                            </g>
                        `;
        }).join('')}
                </svg>
                <div class="admin-model-line__labels">
                    ${coords.map((c) => `<span class="admin-model-line__label ${c.idx % stride === 0 ? '' : 'admin-model-line__label--muted'}">${c.idx % stride === 0 ? escapeHtml(periodLabel(c.period, bucket)) : ''}</span>`).join('')}
                </div>
            </div>
        </div>
    `;
}

