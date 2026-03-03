const { run } = require('../core/query');
const { ignoreDuplicateColumnError } = require('./helpers');

function up() {
    try { run(`ALTER TABLE ai_agents ADD COLUMN image_provider TEXT DEFAULT 'comfyui'`); } catch (e) { ignoreDuplicateColumnError(e); }
        try { run(`ALTER TABLE ai_agents ADD COLUMN image_model TEXT DEFAULT ''`); } catch (e) { ignoreDuplicateColumnError(e); }
        try { run(`ALTER TABLE ai_agents ADD COLUMN image_prompt_style TEXT DEFAULT 'photorealistic, high quality, detailed'`); } catch (e) { ignoreDuplicateColumnError(e); }
}

module.exports = {
    id: '003',
    name: 'agent_image',
    up
};
