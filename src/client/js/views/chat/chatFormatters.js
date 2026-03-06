function getLocaleDateOrder() {
    try {
        const parts = new Intl.DateTimeFormat(undefined, {
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(new Date(2026, 10, 25));
        const monthIdx = parts.findIndex((p) => p.type === 'month');
        const dayIdx = parts.findIndex((p) => p.type === 'day');
        if (monthIdx === -1 || dayIdx === -1) return 'MD';
        return dayIdx < monthIdx ? 'DM' : 'MD';
    } catch {
        return 'MD';
    }
}

function isLocale12Hour() {
    try {
        const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
        if (typeof resolved.hour12 === 'boolean') return resolved.hour12;
        const hc = String(resolved.hourCycle || '').toLowerCase();
        return hc === 'h11' || hc === 'h12';
    } catch {
        return true;
    }
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

export function createChatFormatters({ escapeHtml } = {}) {
    const sidebarDateOrder = getLocaleDateOrder();
    const sidebarUse12Hour = isLocale12Hour();

    function simpleMarkdown(text) {
        let html = escapeHtml(String(text || ''));
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    function formatTimestamp(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatSidebarDateTime(value) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const month = pad2(d.getMonth() + 1);
        const day = pad2(d.getDate());
        const datePart = sidebarDateOrder === 'DM' ? `${day}/${month}` : `${month}/${day}`;
        const timePart = d.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
            hour12: sidebarUse12Hour
        });
        return `${datePart} ${timePart}`;
    }

    function resolveMediaUrl(url) {
        if (!url) return '';
        return url.startsWith('/') ? url : `/media/${url}`;
    }

    return {
        simpleMarkdown,
        formatTimestamp,
        formatSidebarDateTime,
        resolveMediaUrl
    };
}
