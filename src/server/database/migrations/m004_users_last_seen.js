const { run } = require('../core/query');
const { ignoreDuplicateColumnError } = require('./helpers');

function up() {
    try { run(`ALTER TABLE users ADD COLUMN last_seen TEXT DEFAULT NULL`); } catch (e) { ignoreDuplicateColumnError(e); }
}

module.exports = {
    id: '004',
    name: 'users_last_seen',
    up
};
