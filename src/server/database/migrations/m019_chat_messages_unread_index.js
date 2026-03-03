const { run } = require('../core/query');

function up() {
    run('CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON chat_messages(chat_id, read)');
}

module.exports = {
    id: '019',
    name: 'chat_messages_unread_index',
    up
};
