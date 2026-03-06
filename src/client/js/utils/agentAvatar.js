import { buildAgentAvatarSvg } from '../components/AgentAvatarSvg.js';

export const AGENT_AVATAR_PALETTES = [
    { a: '#1d4ed8', b: '#2563eb', c: '#60a5fa', ink: '#e0ecff' },
    { a: '#0f766e', b: '#0891b2', c: '#22d3ee', ink: '#dff8ff' },
    { a: '#334155', b: '#475569', c: '#94a3b8', ink: '#f1f5f9' },
    { a: '#0e7490', b: '#0284c7', c: '#38bdf8', ink: '#e0f2fe' },
    { a: '#2563eb', b: '#3b82f6', c: '#93c5fd', ink: '#f8fbff' }
];

export function hashString(input) {
    const str = String(input || '');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

export function getAgentAvatarInitial(agent) {
    const source = String(agent?.name || '').trim();
    const first = source ? source[0] : 'A';
    const clean = String(first).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return clean || 'A';
}

export function normalizeAvatarShape(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw.includes('rect') || raw.includes('square') || raw.includes('rounded')) return 'rect';
    if (raw.includes('circle') || raw.includes('round')) return 'circle';
    return '';
}

export function getAgentAvatarShape(agent, options = {}) {
    const modelPref = normalizeAvatarShape(
        agent?.avatar_shape
        || agent?.avatarShape
        || agent?.avatar_default
        || agent?.avatarDefault
        || agent?.avatar_mode
        || agent?.avatarMode
        || agent?.avatar_style
        || agent?.avatarStyle
    );
    if (modelPref) return modelPref;
    const uiPref = normalizeAvatarShape(options?.shape || options?.fallback || options?.variant);
    if (uiPref) return uiPref;
    return 'circle';
}

export function buildAvatarSvg(initial, palette, shape) {
    return buildAgentAvatarSvg(initial, palette, shape);
}

export function getAgentAvatarUrl(agent, options = {}) {
    const url = agent?.avatar_url || agent?.avatarUrl;
    if (url && typeof url === 'string' && url.trim()) return url;
    const seed = hashString(agent?.id || agent?.name || 'agent');
    const palette = AGENT_AVATAR_PALETTES[seed % AGENT_AVATAR_PALETTES.length];
    const initial = getAgentAvatarInitial(agent);
    const shape = getAgentAvatarShape(agent, options);
    const svg = buildAvatarSvg(initial, palette, shape);
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
