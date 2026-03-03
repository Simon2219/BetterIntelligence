export async function fetchResolvedAppearance(api) {
    const { data } = await api('/appearance');
    return data || { dark: {}, light: {} };
}

export function applyThemeVariables(theme, resolvedAppearance) {
    const colors = resolvedAppearance?.[theme] || resolvedAppearance?.dark || {};
    Object.entries(colors).forEach(([key, value]) => {
        if (typeof value === 'string' && value.trim()) {
            document.documentElement.style.setProperty('--' + key, value);
        }
    });
    return colors;
}

export async function fetchAdminPalettes(api) {
    const { data } = await api('/admin/colors');
    return data;
}

export async function createPalette(api, payload) {
    const { data } = await api('/admin/palettes', {
        method: 'POST',
        body: JSON.stringify(payload || {})
    });
    return data;
}

export async function updatePalette(api, paletteId, payload) {
    const { data } = await api(`/admin/palettes/${encodeURIComponent(paletteId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload || {})
    });
    return data;
}

export async function deletePalette(api, paletteId) {
    const { data } = await api(`/admin/palettes/${encodeURIComponent(paletteId)}`, {
        method: 'DELETE'
    });
    return data;
}

export async function reorderPalettes(api, order) {
    const { data } = await api('/admin/palettes/reorder', {
        method: 'PUT',
        body: JSON.stringify({ order })
    });
    return data;
}

export async function updatePaletteAssignments(api, darkPaletteId, lightPaletteId) {
    const { data } = await api('/admin/palette-assignments', {
        method: 'PUT',
        body: JSON.stringify({ darkPaletteId, lightPaletteId })
    });
    return data;
}
