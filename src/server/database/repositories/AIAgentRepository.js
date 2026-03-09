const { run, all, get } = require('../core/query');
const { generateId } = require('../core/ids');


const _parseAgent = (row) => {
    if (!row) return null;
    const j = (v, d) => { try { return JSON.parse(v || 'null') ?? d; } catch { return d; } };
    const { hub_published, ...rest } = row;
    return {
        ...rest,
        personality: j(row.personality, {}),
        behavior_rules: j(row.behavior_rules, {}),
        sample_dialogues: j(row.sample_dialogues, []),
        stop_sequences: j(row.stop_sequences, []),
        metadata: j(row.metadata, {}),
        is_active: row.is_active === 1
    };
};

const AIAgentRepository = {
    create(data) {
        const id = generateId(6);
        run(`INSERT INTO ai_agents (id, user_id, name, tagline, avatar_url, personality, backstory,
            behavior_rules, sample_dialogues, system_prompt, text_provider, text_model,
            image_provider, image_model, image_prompt_style, temperature, max_tokens, is_active, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, data.userId || null, data.name || 'Agent', data.tagline || '', data.avatarUrl || '',
             JSON.stringify(data.personality || {}), data.backstory || '',
             JSON.stringify(data.behaviorRules || {}), JSON.stringify(data.sampleDialogues || []),
             data.systemPrompt || '',
             data.textProvider || 'ollama', data.textModel || '',
             data.imageProvider || 'comfyui', data.imageModel || '', data.imagePromptStyle || 'photorealistic, high quality, detailed',
             data.temperature ?? 0.8, data.maxTokens || 512,
             data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1,
             JSON.stringify(data.metadata || {})]);
        return this.getById(id);
    },

    getById(id) {
        const r = get('SELECT * FROM ai_agents WHERE id = ?', [id]);
        return r ? _parseAgent(r) : null;
    },

    list(filters = {}) {
        let sql = 'SELECT * FROM ai_agents WHERE 1=1';
        const params = [];
        if (filters.userId) { sql += ' AND UPPER(user_id) = UPPER(?)'; params.push(filters.userId); }
        if (filters.isActive !== undefined) { sql += ' AND is_active = ?'; params.push(filters.isActive ? 1 : 0); }
        sql += ' ORDER BY updated_at DESC';
        if (filters.limit) { sql += ' LIMIT ?'; params.push(filters.limit); }
        return all(sql, params).map(_parseAgent);
    },

    update(id, updates) {
        const map = { userId: 'user_id', name: 'name', tagline: 'tagline', avatarUrl: 'avatar_url',
            personality: 'personality', backstory: 'backstory', behaviorRules: 'behavior_rules',
            sampleDialogues: 'sample_dialogues', systemPrompt: 'system_prompt',
            textProvider: 'text_provider', textModel: 'text_model', imageProvider: 'image_provider',
            imageModel: 'image_model', imagePromptStyle: 'image_prompt_style', temperature: 'temperature',
            maxTokens: 'max_tokens', isActive: 'is_active', metadata: 'metadata',
            topP: 'top_p', topK: 'top_k', repeatPenalty: 'repeat_penalty',
            presencePenalty: 'presence_penalty', frequencyPenalty: 'frequency_penalty',
            stopSequences: 'stop_sequences', responseFormat: 'response_format',
            greetingMessage: 'greeting_message', contextWindow: 'context_window',
            memoryStrategy: 'memory_strategy', formality: 'formality', verbosity: 'verbosity' };
        const sets = [];
        const vals = [];
        for (const [k, v] of Object.entries(updates)) {
            const col = map[k];
            if (!col) continue;
            let val = v;
            if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
            if (typeof val === 'boolean') val = val ? 1 : 0;
            sets.push(`${col} = ?`);
            vals.push(val);
        }
        if (sets.length === 0) return this.getById(id);
        sets.push("updated_at = datetime('now')");
        vals.push(id);
        run(`UPDATE ai_agents SET ${sets.join(', ')} WHERE id = ?`, vals);
        return this.getById(id);
    },

    delete(id) { run('DELETE FROM ai_agents WHERE id = ?', [id]); }
};


module.exports = AIAgentRepository;
