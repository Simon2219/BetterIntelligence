const { run } = require('../core/query');
const { ignoreDuplicateColumnError } = require('./helpers');

function up() {
    const cols = [
            ['top_p', 'REAL DEFAULT 0.9'],
            ['top_k', 'INTEGER DEFAULT 40'],
            ['repeat_penalty', 'REAL DEFAULT 1.1'],
            ['presence_penalty', 'REAL DEFAULT 0'],
            ['frequency_penalty', 'REAL DEFAULT 0'],
            ['stop_sequences', "TEXT DEFAULT '[]'"],
            ['response_format', "TEXT DEFAULT 'auto'"],
            ['greeting_message', "TEXT DEFAULT ''"],
            ['context_window', 'INTEGER DEFAULT 50'],
            ['memory_strategy', "TEXT DEFAULT 'full'"],
            ['formality', 'INTEGER DEFAULT 5'],
            ['verbosity', 'INTEGER DEFAULT 5'],
        ];
        for (const [name, def] of cols) {
            try { run(`ALTER TABLE ai_agents ADD COLUMN ${name} ${def}`); } catch (e) { ignoreDuplicateColumnError(e); }
        }
}

module.exports = {
    id: '005',
    name: 'advanced_model_params',
    up
};
