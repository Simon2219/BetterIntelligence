const { run } = require('../core/query');

const log = require('../../services/Logger')('db');

function up() {
    try {
            run('ALTER TABLE ai_agents DROP COLUMN skills_order');
        } catch (e) {
            log.warn('Could not drop skills_order (SQLite 3.35+ required)', { err: e.message });
        }
}

module.exports = {
    id: '010',
    name: 'drop_skills_order',
    up
};
