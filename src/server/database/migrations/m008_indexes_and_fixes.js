const { run } = require('../core/query');

function up() {
    run('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)');
        run('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at)');
        run('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)');
        run('CREATE INDEX IF NOT EXISTS idx_deployments_agent ON agent_deployments(agent_id)');
        run('CREATE INDEX IF NOT EXISTS idx_hooks_agent ON hook_configs(agent_id)');
        run('CREATE INDEX IF NOT EXISTS idx_hooks_deployment ON hook_configs(deployment_id)');
}

module.exports = {
    id: '008',
    name: 'indexes_and_fixes',
    up
};
