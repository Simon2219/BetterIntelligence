const { run, get } = require('../core/query');

function up() {
    const hasColumn = get(`SELECT 1 as ok
        FROM pragma_table_info('chats')
        WHERE name = 'thread_summary_message_count'`);
    if (!hasColumn?.ok) {
        run(`ALTER TABLE chats ADD COLUMN thread_summary_message_count INTEGER DEFAULT 0`);
    }

    run(`UPDATE chats
        SET thread_summary_message_count = (
            SELECT COUNT(*)
            FROM chat_messages m
            WHERE UPPER(m.chat_id) = UPPER(chats.id)
        )
        WHERE COALESCE(thread_summary, '') <> ''
          AND COALESCE(thread_summary_message_count, 0) = 0`);
}

module.exports = {
    id: '022',
    name: 'chat_summary_message_count',
    up
};
