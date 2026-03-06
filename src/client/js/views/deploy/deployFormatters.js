export function parseDeployPath(path) {
    const safe = String(path || '/deploy');
    const [pathname, query = ''] = safe.split('?');
    const match = pathname.match(/^\/deploy\/([^/?#]+)/);
    const slug = match?.[1] ? decodeURIComponent(match[1]) : null;
    const params = new URLSearchParams(query);
    return {
        slug,
        tab: String(params.get('tab') || 'overview').toLowerCase(),
        params
    };
}

export function slugifyDeployValue(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50);
}

export function formatDeployTime(iso) {
    if (!iso) return 'Never';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Never';
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function renderDeployStatCard(label, value, escapeHtml) {
    return `
        <div class="deploy-stat-card card"><div class="deploy-stat-card__value">${escapeHtml(String(value))}</div><div class="deploy-stat-card__label">${escapeHtml(label)}</div></div>
    `;
}

export function renderDeployMarkdown(text, escapeHtml) {
    let html = escapeHtml(String(text || ''));
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    return html.replace(/\n/g, '<br>');
}

export function renderDeployMessage(message, agentId, { escapeHtml, formatDeployTime }) {
    const sender = String(message?.senderId || '').trim().toUpperCase();
    const normalizedAgentId = String(agentId || '').trim().toUpperCase();
    const role = sender && sender === normalizedAgentId ? 'assistant' : 'user';
    const body = role === 'assistant'
        ? renderDeployMarkdown(message?.content || '', escapeHtml)
        : escapeHtml(message?.content || '');
    const timestamp = formatDeployTime(message?.timestamp || message?.created_at);
    return `<div class="chat-msg chat-msg--${role}"><div class="chat-msg__content">${body || '<span class="text-muted">[No text]</span>'}</div><span class="chat-msg__time">${escapeHtml(timestamp)}</span></div>`;
}
