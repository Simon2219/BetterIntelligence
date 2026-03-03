const PROVIDER_DISPLAY_NAMES_SETTING_KEY = 'ai.provider_display_names';

function deriveModelDisplayName(modelId) {
    const raw = String(modelId || '').trim();
    if (!raw) return '';

    let name = raw;
    const hadProviderPrefix = name.includes('/');
    const hadSizeSuffix = name.includes(':');
    if (hadProviderPrefix) {
        name = name.split('/').pop() || name;
    }
    if (hadSizeSuffix) {
        name = name.split(':')[0] || name;
    }

    name = name.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

    const dashIdx = name.indexOf('-');
    if ((hadProviderPrefix || hadSizeSuffix) && dashIdx > 0) {
        const left = name.slice(0, dashIdx).trim();
        const right = name.slice(dashIdx + 1).trim();
        if (left && right) name = `${left} - ${right}`;
    }

    return name || raw;
}

function deriveProviderDisplayName(providerName) {
    const raw = String(providerName || '').trim();
    if (!raw) return '';

    const normalized = raw.toLowerCase();
    if (normalized === 'ollama') return 'Ollama';
    if (normalized === 'comfyui') return 'ComfyUI';
    if (normalized === 'openai') return 'OpenAI';
    if (normalized === 'anthropic') return 'Anthropic';
    if (normalized === 'groq') return 'Groq';
    if (normalized === 'gemini') return 'Gemini';

    if (raw.toUpperCase() === raw && raw.length <= 8) return raw;

    return raw
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map((part) => (part ? (part[0].toUpperCase() + part.slice(1)) : ''))
        .join(' ');
}

function createDisplayNamesApi(SettingsRepository) {
    function parseProviderDisplayNamesMap() {
        const raw = SettingsRepository.get(PROVIDER_DISPLAY_NAMES_SETTING_KEY);
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
            const normalized = {};
            Object.entries(parsed).forEach(([key, value]) => {
                const providerKey = String(key || '').trim().toLowerCase();
                const providerDisplayName = String(value || '').trim();
                if (providerKey && providerDisplayName) normalized[providerKey] = providerDisplayName;
            });
            return normalized;
        } catch {
            return {};
        }
    }

    function saveProviderDisplayNamesMap(map) {
        SettingsRepository.set(PROVIDER_DISPLAY_NAMES_SETTING_KEY, JSON.stringify(map || {}), 'ai_models');
    }

    function getProviderDisplayName(providerName, opts = {}) {
        const key = String(providerName || '').trim().toLowerCase();
        if (!key) return '';
        const map = parseProviderDisplayNamesMap();
        if (map[key]) return map[key];
        const derived = deriveProviderDisplayName(key) || key;
        if (opts.persistIfMissing !== false && derived) {
            map[key] = derived;
            saveProviderDisplayNamesMap(map);
        }
        return derived;
    }

    function setProviderDisplayName(providerName, displayName) {
        const key = String(providerName || '').trim().toLowerCase();
        if (!key) return '';
        const map = parseProviderDisplayNamesMap();
        const nextDisplayName = String(displayName || '').trim() || deriveProviderDisplayName(key) || key;
        map[key] = nextDisplayName;
        saveProviderDisplayNamesMap(map);
        return nextDisplayName;
    }

    function listProviderDisplayNames() {
        return parseProviderDisplayNamesMap();
    }

    return {
        deriveModelDisplayName,
        deriveProviderDisplayName,
        getProviderDisplayName,
        setProviderDisplayName,
        listProviderDisplayNames
    };
}

module.exports = {
    createDisplayNamesApi,
    deriveModelDisplayName,
    deriveProviderDisplayName
};
