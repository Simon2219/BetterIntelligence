const Config = require('../../../config/Config');
const { SettingsRepository, generateId } = require('../database');

const DEFAULT_COLOR_KEYS = [
    'bg-primary',
    'bg-secondary',
    'bg-card',
    'bg-hover',
    'text-primary',
    'text-secondary',
    'text-muted',
    'accent',
    'accent-primary',
    'accent-secondary',
    'accent-hover',
    'success',
    'danger',
    'warning',
    'info',
    'border'
];

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function deepEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function parseSettingJson(key, fallback) {
    const raw = SettingsRepository.get(key);
    if (!raw) return fallback;
    try {
        const parsed = JSON.parse(raw);
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}

function normalizeColorMap(colors, theme = 'dark') {
    const defaults = Config.getColors(theme) || {};
    const merged = { ...defaults, ...(colors || {}) };
    const normalized = {};
    DEFAULT_COLOR_KEYS.forEach((key) => {
        const val = merged[key];
        if (typeof val === 'string' && val.trim()) normalized[key] = val.trim();
        else if (typeof defaults[key] === 'string' && defaults[key].trim()) normalized[key] = defaults[key].trim();
        else normalized[key] = '#000000';
    });
    return normalized;
}

function normalizePalette(input, index = 0, fallbackTheme = 'dark') {
    const now = new Date().toISOString();
    return {
        id: String(input?.id || `pal_${generateId(8)}`),
        name: String(input?.name || `Palette ${index + 1}`).trim() || `Palette ${index + 1}`,
        sortOrder: Number.isFinite(Number(input?.sortOrder)) ? Number(input.sortOrder) : index,
        colors: normalizeColorMap(input?.colors || {}, fallbackTheme),
        createdAt: input?.createdAt || now,
        updatedAt: input?.updatedAt || input?.createdAt || now
    };
}

function syncResolvedColorsInMemory(resolved) {
    Config.set('colors.dark', resolved.dark);
    Config.set('colors.light', resolved.light);
}

function ensurePaletteState() {
    let palettes = parseSettingJson('appearance.palettes', null);
    let assignments = parseSettingJson('appearance.assignments', null);

    const validPalettes = Array.isArray(palettes) && palettes.length > 0;
    const validAssignments = assignments && typeof assignments === 'object';

    if (!validPalettes || !validAssignments) {
        const now = new Date().toISOString();
        const seeded = [
            {
                id: 'default-dark',
                name: 'Default Dark',
                sortOrder: 0,
                colors: normalizeColorMap(Config.getColors('dark') || {}, 'dark'),
                createdAt: now,
                updatedAt: now
            },
            {
                id: 'default-light',
                name: 'Default Light',
                sortOrder: 1,
                colors: normalizeColorMap(Config.getColors('light') || {}, 'light'),
                createdAt: now,
                updatedAt: now
            }
        ];
        palettes = seeded;
        assignments = { dark: seeded[0].id, light: seeded[1].id };
        persistState(palettes, assignments);
        return { palettes: clone(palettes), assignments: clone(assignments) };
    }

    const originalPalettes = clone(palettes);
    const originalAssignments = clone(assignments);

    const normalizedPalettes = palettes
        .map((p, idx) => normalizePalette(p, idx, (p?.name || '').toLowerCase().includes('light') ? 'light' : 'dark'))
        .sort((a, b) => a.sortOrder - b.sortOrder);

    const paletteIds = new Set(normalizedPalettes.map((p) => p.id));
    const normalizedAssignments = {
        dark: paletteIds.has(assignments.dark) ? assignments.dark : normalizedPalettes[0]?.id || null,
        light: paletteIds.has(assignments.light) ? assignments.light : (normalizedPalettes[1]?.id || normalizedPalettes[0]?.id || null)
    };

    const resolved = resolveAppearance(normalizedPalettes, normalizedAssignments);
    const storedDark = parseSettingJson('colors.dark', null);
    const storedLight = parseSettingJson('colors.light', null);
    const shouldPersist = !deepEqual(originalPalettes, normalizedPalettes)
        || !deepEqual(originalAssignments, normalizedAssignments)
        || !deepEqual(storedDark, resolved.dark)
        || !deepEqual(storedLight, resolved.light);

    if (shouldPersist) persistState(normalizedPalettes, normalizedAssignments);
    else syncResolvedColorsInMemory(resolved);

    return { palettes: clone(normalizedPalettes), assignments: clone(normalizedAssignments) };
}

function resolveAppearance(palettes, assignments) {
    const list = (palettes || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const byId = new Map(list.map((p) => [p.id, p]));

    const darkPalette = byId.get(assignments?.dark) || list[0] || null;
    const lightPalette = byId.get(assignments?.light) || list[1] || list[0] || null;

    const dark = normalizeColorMap(darkPalette?.colors || {}, 'dark');
    const light = normalizeColorMap(lightPalette?.colors || {}, 'light');

    return { dark, light };
}

function persistResolvedColors(resolved) {
    SettingsRepository.set('colors.dark', JSON.stringify(resolved.dark), 'appearance');
    SettingsRepository.set('colors.light', JSON.stringify(resolved.light), 'appearance');
    Config.set('colors.dark', resolved.dark);
    Config.set('colors.light', resolved.light);
}

function persistState(palettes, assignments) {
    SettingsRepository.set('appearance.palettes', JSON.stringify(palettes), 'appearance');
    SettingsRepository.set('appearance.assignments', JSON.stringify(assignments), 'appearance');
    const resolved = resolveAppearance(palettes, assignments);
    persistResolvedColors(resolved);
    return resolved;
}

function getAdminColorsPayload() {
    const { palettes, assignments } = ensurePaletteState();
    const resolved = resolveAppearance(palettes, assignments);
    return { palettes, assignments, resolved };
}

function createPalette({ name, colors }) {
    const { palettes, assignments } = ensurePaletteState();
    const created = normalizePalette({
        id: `pal_${generateId(10)}`,
        name,
        colors,
        sortOrder: palettes.length,
        createdAt: new Date().toISOString()
    }, palettes.length, 'dark');

    const next = [...palettes, created];
    const resolved = persistState(next, assignments);
    return { palettes: next, assignments, resolved, palette: created };
}

function updatePalette(paletteId, { name, colors }) {
    const { palettes, assignments } = ensurePaletteState();
    const idx = palettes.findIndex((p) => p.id === paletteId);
    if (idx < 0) {
        const err = new Error('Palette not found');
        err.statusCode = 404;
        throw err;
    }

    const existing = palettes[idx];
    const nextPalette = {
        ...existing,
        name: typeof name === 'string' && name.trim() ? name.trim() : existing.name,
        colors: colors ? normalizeColorMap(colors, 'dark') : existing.colors,
        updatedAt: new Date().toISOString()
    };

    const next = palettes.slice();
    next[idx] = nextPalette;
    const resolved = persistState(next, assignments);
    return { palettes: next, assignments, resolved, palette: nextPalette };
}

function deletePalette(paletteId) {
    const { palettes, assignments } = ensurePaletteState();
    if (assignments.dark === paletteId || assignments.light === paletteId) {
        const err = new Error('Cannot delete a palette assigned to light or dark theme');
        err.statusCode = 400;
        throw err;
    }

    const next = palettes.filter((p) => p.id !== paletteId);
    if (next.length === palettes.length) {
        const err = new Error('Palette not found');
        err.statusCode = 404;
        throw err;
    }

    const normalized = next.map((p, idx) => ({ ...p, sortOrder: idx, updatedAt: new Date().toISOString() }));
    const resolved = persistState(normalized, assignments);
    return { palettes: normalized, assignments, resolved };
}

function reorderPalettes(order) {
    const { palettes, assignments } = ensurePaletteState();
    if (!Array.isArray(order)) {
        const err = new Error('order must be an array of palette ids');
        err.statusCode = 400;
        throw err;
    }

    const byId = new Map(palettes.map((p) => [p.id, p]));
    const ordered = [];
    order.forEach((id) => {
        if (byId.has(id)) {
            ordered.push(byId.get(id));
            byId.delete(id);
        }
    });
    byId.forEach((palette) => ordered.push(palette));

    const next = ordered.map((p, idx) => ({ ...p, sortOrder: idx, updatedAt: new Date().toISOString() }));
    const resolved = persistState(next, assignments);
    return { palettes: next, assignments, resolved };
}

function updateAssignments({ darkPaletteId, lightPaletteId }) {
    const { palettes, assignments } = ensurePaletteState();
    const validIds = new Set(palettes.map((p) => p.id));

    const nextAssignments = {
        dark: validIds.has(darkPaletteId) ? darkPaletteId : assignments.dark,
        light: validIds.has(lightPaletteId) ? lightPaletteId : assignments.light
    };

    const resolved = persistState(palettes, nextAssignments);
    return { palettes, assignments: nextAssignments, resolved };
}

function updateThemeColors(theme, colors) {
    if (!theme || !['dark', 'light'].includes(theme)) {
        const err = new Error('theme must be dark or light');
        err.statusCode = 400;
        throw err;
    }

    const { palettes, assignments } = ensurePaletteState();
    const assignedId = assignments[theme];
    const idx = palettes.findIndex((p) => p.id === assignedId);
    if (idx < 0) {
        const err = new Error('Assigned palette not found');
        err.statusCode = 404;
        throw err;
    }

    const next = palettes.slice();
    next[idx] = {
        ...next[idx],
        colors: normalizeColorMap(colors, theme),
        updatedAt: new Date().toISOString()
    };

    const resolved = persistState(next, assignments);
    return { palettes: next, assignments, resolved, theme, colors: resolved[theme] };
}

function getResolvedAppearance() {
    const { palettes, assignments } = ensurePaletteState();
    return resolveAppearance(palettes, assignments);
}

module.exports = {
    DEFAULT_COLOR_KEYS,
    ensurePaletteState,
    getAdminColorsPayload,
    getResolvedAppearance,
    createPalette,
    updatePalette,
    deletePalette,
    reorderPalettes,
    updateAssignments,
    updateThemeColors
};

