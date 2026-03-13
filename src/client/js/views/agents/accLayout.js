export const ACC_GRID_COLUMNS = 16;
export const ACC_GRID_BASE_SPAN = 4;
export const ACC_GRID_ROW_HEIGHT_PX = 8;
export const ACC_GRID_GAP_PX = 16;

function toKey(value) {
    return String(value || '').trim();
}

function normalizePartition(value) {
    return value === 'pinned' ? 'pinned' : 'unpinned';
}

export function getPanelSpan(panel) {
    const explicit = Number(panel?.span || panel?.widthUnits || panel?.dataset?.panelSpan || 0);
    if (explicit === 8) return 8;
    return 4;
}

export function estimatePanelHeightUnits(panel) {
    const explicit = Number(panel?.estimatedHeightUnits || panel?.dataset?.panelEstimatedUnits || 0);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return getPanelSpan(panel) === 8 ? 16 : 12;
}

export function pxToRowUnits(heightPx) {
    return Math.max(1, Math.ceil((Number(heightPx || 0) + ACC_GRID_GAP_PX) / (ACC_GRID_ROW_HEIGHT_PX + ACC_GRID_GAP_PX)));
}

export function rowUnitsToPx(units) {
    const normalized = Math.max(1, Number(units || 1));
    return (normalized * ACC_GRID_ROW_HEIGHT_PX) + ((normalized - 1) * ACC_GRID_GAP_PX);
}

export function getCollapsedHeightUnits(panel, measurements = {}) {
    const key = toKey(panel?.key || panel?.dataset?.panelKey);
    const measured = measurements?.[key];
    if (measured?.collapsedUnits) return measured.collapsedUnits;
    return 5;
}

export function getExpandedHeightUnits(panel, measurements = {}) {
    const key = toKey(panel?.key || panel?.dataset?.panelKey);
    const measured = measurements?.[key];
    if (measured?.expandedUnits) return measured.expandedUnits;
    return estimatePanelHeightUnits(panel);
}

export function getPanelHeightUnits(panel, measurements = {}) {
    const key = toKey(panel?.key || panel?.dataset?.panelKey);
    return panel?.collapsed
        ? getCollapsedHeightUnits({ key }, measurements)
        : getExpandedHeightUnits(panel, measurements);
}

export function getColumnStarts(span) {
    const starts = [];
    for (let column = 0; column <= ACC_GRID_COLUMNS - span; column += ACC_GRID_BASE_SPAN) {
        starts.push(column);
    }
    return starts;
}

function canPlace(occupancy, x, y, w, h) {
    for (let row = y; row < y + h; row += 1) {
        const occupied = occupancy.get(row);
        if (!occupied) continue;
        for (let column = x; column < x + w; column += 1) {
            if (occupied.has(column)) return false;
        }
    }
    return true;
}

function occupy(occupancy, x, y, w, h) {
    for (let row = y; row < y + h; row += 1) {
        if (!occupancy.has(row)) occupancy.set(row, new Set());
        const occupied = occupancy.get(row);
        for (let column = x; column < x + w; column += 1) {
            occupied.add(column);
        }
    }
}

function computeMaxBottom(items = []) {
    return items.reduce((maxBottom, item) => Math.max(maxBottom, (item?.y || 0) + (item?.h || 0)), 0);
}

function normalizeLockedItem(item = {}, measurements = {}) {
    const key = toKey(item.key);
    const width = getPanelSpan(item);
    const height = Number(item.h || item.heightUnits || getPanelHeightUnits({
        key,
        collapsed: !!item.collapsed,
        span: width
    }, measurements));
    return {
        ...item,
        key,
        partition: normalizePartition(item.partition),
        x: Number(item.x || 0),
        y: Number(item.y || 0),
        w: width,
        h: Math.max(1, height)
    };
}

function normalizeSpec(spec = {}, measurements = {}) {
    const key = toKey(spec.key || spec.dataset?.panelKey);
    const width = getPanelSpan(spec);
    return {
        ...spec,
        key,
        partition: normalizePartition(spec.partition),
        w: width,
        h: Math.max(1, getPanelHeightUnits({
            key,
            collapsed: !!spec.collapsed,
            span: width
        }, measurements))
    };
}

function sortItems(items = []) {
    const partitionOrder = { pinned: 0, unpinned: 1 };
    return [...items].sort((left, right) => {
        const leftPartition = partitionOrder[normalizePartition(left.partition)];
        const rightPartition = partitionOrder[normalizePartition(right.partition)];
        if (leftPartition !== rightPartition) return leftPartition - rightPartition;
        if ((left.y || 0) !== (right.y || 0)) return (left.y || 0) - (right.y || 0);
        if ((left.x || 0) !== (right.x || 0)) return (left.x || 0) - (right.x || 0);
        return String(left.key || '').localeCompare(String(right.key || ''));
    });
}

function buildPartitionLayout(specs = [], {
    lockedItems = [],
    startRow = 0
} = {}) {
    const occupancy = new Map();
    const placedItems = [];
    const locked = lockedItems.map((item) => ({ ...item }));
    locked.forEach((item) => occupy(occupancy, item.x, item.y, item.w, item.h));
    placedItems.push(...locked);

    let maxBottom = Math.max(startRow, computeMaxBottom(locked));
    specs.forEach((spec) => {
        const starts = getColumnStarts(spec.w);
        let placed = null;
        for (let row = startRow; !placed; row += 1) {
            for (const column of starts) {
                if (!canPlace(occupancy, column, row, spec.w, spec.h)) continue;
                occupy(occupancy, column, row, spec.w, spec.h);
                placed = {
                    ...spec,
                    x: column,
                    y: row,
                    w: spec.w,
                    h: spec.h
                };
                maxBottom = Math.max(maxBottom, row + spec.h);
                break;
            }
        }
        placedItems.push(placed);
    });

    return {
        items: placedItems,
        maxBottom
    };
}

export function buildAccPanelLayout(specs = [], options = {}) {
    const measurements = options.measurements || {};
    const normalizedSpecs = specs
        .map((spec) => normalizeSpec(spec, spec.measurements || measurements))
        .filter((spec) => spec.key);
    const specMap = new Map(normalizedSpecs.map((spec) => [spec.key, spec]));

    const normalizedLockedItems = (options.lockedItems || [])
        .map((item) => {
            const itemKey = toKey(item.key);
            const inferredPartition = item.partition || specMap.get(itemKey)?.partition || 'unpinned';
            return normalizeLockedItem({
                ...item,
                key: itemKey,
                partition: inferredPartition
            }, measurements);
        })
        .filter((item) => item.key);

    const lockedKeys = new Set(normalizedLockedItems.map((item) => item.key));
    const pinnedSpecs = normalizedSpecs.filter((spec) => spec.partition === 'pinned' && !lockedKeys.has(spec.key));
    const unpinnedSpecs = normalizedSpecs.filter((spec) => spec.partition !== 'pinned' && !lockedKeys.has(spec.key));
    const pinnedLocked = normalizedLockedItems.filter((item) => item.partition === 'pinned');
    const unpinnedLocked = normalizedLockedItems.filter((item) => item.partition !== 'pinned');
    const partitionStartRows = options.partitionStartRows || {};

    const pinnedStartRow = Math.max(0, Number(partitionStartRows.pinned || 0));
    const pinnedLayout = buildPartitionLayout(pinnedSpecs, {
        lockedItems: pinnedLocked,
        startRow: pinnedStartRow
    });
    const unpinnedStartRow = Math.max(
        Number(partitionStartRows.unpinned ?? pinnedLayout.maxBottom) || 0,
        pinnedLayout.maxBottom
    );
    const unpinnedLayout = buildPartitionLayout(unpinnedSpecs, {
        lockedItems: unpinnedLocked,
        startRow: unpinnedStartRow
    });

    const items = sortItems([...pinnedLayout.items, ...unpinnedLayout.items]);
    const byKey = new Map(items.map((item) => [item.key, item]));

    return {
        items,
        byKey,
        totalRows: Math.max(unpinnedLayout.maxBottom, pinnedLayout.maxBottom, 1),
        partitionBounds: {
            pinned: {
                startRow: pinnedStartRow,
                endRow: Math.max(pinnedLayout.maxBottom, pinnedStartRow)
            },
            unpinned: {
                startRow: unpinnedStartRow,
                endRow: Math.max(unpinnedLayout.maxBottom, unpinnedStartRow)
            }
        }
    };
}

export function getGridMetrics(gridRect) {
    const width = Math.max(0, Number(gridRect?.width || 0));
    const height = Math.max(0, Number(gridRect?.height || 0));
    const columnWidth = width
        ? ((width - ((ACC_GRID_COLUMNS - 1) * ACC_GRID_GAP_PX)) / ACC_GRID_COLUMNS)
        : 0;
    return {
        width,
        height,
        columnWidth,
        rowHeight: ACC_GRID_ROW_HEIGHT_PX,
        gap: ACC_GRID_GAP_PX
    };
}

export function layoutItemToPixels(item, gridRect) {
    if (!item || !gridRect) {
        return {
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            right: 0,
            bottom: 0,
            centerX: 0,
            centerY: 0
        };
    }
    const metrics = getGridMetrics(gridRect);
    const left = gridRect.left + (item.x * (metrics.columnWidth + metrics.gap));
    const top = gridRect.top + (item.y * (metrics.rowHeight + metrics.gap));
    const width = (item.w * metrics.columnWidth) + ((item.w - 1) * metrics.gap);
    const height = rowUnitsToPx(item.h);
    return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        centerX: left + (width / 2),
        centerY: top + (height / 2)
    };
}

export function measurePanelHeights(panel) {
    const header = panel?.querySelector('.agents-panel__header');
    const contentInner = panel?.querySelector('.agents-panel__content-inner');
    if (!header) {
        return { collapsedUnits: 5, expandedUnits: 12 };
    }
    const headerHeight = header.getBoundingClientRect().height;
    const bodyHeight = contentInner ? contentInner.scrollHeight : 0;
    return {
        collapsedUnits: pxToRowUnits(headerHeight),
        expandedUnits: Math.max(pxToRowUnits(headerHeight + bodyHeight), pxToRowUnits(headerHeight))
    };
}
