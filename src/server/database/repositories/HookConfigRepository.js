const { run, all, get } = require('../core/query');


const HookConfigRepository = {
    listAll() {
        return all('SELECT * FROM hook_configs WHERE enabled = 1 ORDER BY event');
    },
    listByDeployment(deploymentId) {
        return all('SELECT * FROM hook_configs WHERE deployment_id = ? ORDER BY event', [deploymentId]);
    },
    add(deploymentId, event, url, enabled = 1) {
        run('INSERT INTO hook_configs (deployment_id, event, url, enabled) VALUES (?, ?, ?, ?)', [deploymentId, event, url, enabled ? 1 : 0]);
        return get('SELECT * FROM hook_configs WHERE id = last_insert_rowid()');
    },
    remove(id) {
        run('DELETE FROM hook_configs WHERE id = ?', [id]);
    },
    getById(id) {
        return get('SELECT * FROM hook_configs WHERE id = ?', [id]);
    }
};


module.exports = HookConfigRepository;
