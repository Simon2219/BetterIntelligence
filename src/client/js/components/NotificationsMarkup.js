function sortNotifications(items) {
    return items
        .slice()
        .sort((left, right) => {
            const leftRead = left?.read === true ? 1 : 0;
            const rightRead = right?.read === true ? 1 : 0;
            if (leftRead !== rightRead) return leftRead - rightRead;
            const leftTs = new Date(left?.createdAt || left?.created_at || 0).getTime();
            const rightTs = new Date(right?.createdAt || right?.created_at || 0).getTime();
            return rightTs - leftTs;
        });
}

export function renderNotificationsListHtml({ items, expandedIds, escapeHtml, maxItems = 40 }) {
    if (!Array.isArray(items) || !items.length) {
        return '<div class="topbar__notifications-empty">No notifications</div>';
    }

    const sorted = sortNotifications(items);
    const unreadCount = sorted.filter((item) => item?.read !== true).length;

    return `
        <div class="topbar__notifications-toolbar">
            <span class="topbar__notifications-count">${unreadCount} unread</span>
            <button type="button" class="topbar__notifications-read-all" data-read-all-notifications ${unreadCount <= 0 ? 'disabled' : ''}>Read All</button>
        </div>
        ${sorted.slice(0, maxItems).map((item) => {
            const severity = ['info', 'success', 'warning', 'danger'].includes(item.severity) ? item.severity : 'info';
            const readClass = item.read ? 'topbar__notification--read' : '';
            const isExpanded = expandedIds?.has?.(item.id) === true;
            const collapsedClass = isExpanded ? 'topbar__notification--expanded' : 'topbar__notification--collapsed';
            const createdAt = new Date(item.createdAt || item.created_at || Date.now());
            const dateLabel = Number.isNaN(createdAt.getTime()) ? '' : createdAt.toLocaleString();
            return `
                <div class="topbar__notification ${readClass} ${collapsedClass}" data-notification-id="${escapeHtml(item.id || '')}">
                    <div class="topbar__notification-head">
                        <span class="topbar__notification-dot topbar__notification-dot--${severity}"></span>
                        <strong>${escapeHtml(item.title || 'Notification')}</strong>
                        ${dateLabel ? `<span class="topbar__notification-time-inline">${escapeHtml(dateLabel)}</span>` : ''}
                        ${item.read ? '' : '<button type="button" class="topbar__notification-ack" data-ack-notification>Mark read</button>'}
                        <button type="button" class="topbar__notification-toggle" data-toggle-notification aria-label="Toggle notification details"></button>
                    </div>
                    <div class="topbar__notification-body">${escapeHtml(item.body || '')}</div>
                </div>
            `;
        }).join('')}
    `;
}
