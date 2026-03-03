const { run, all, get } = require('../core/query');


const SubscriptionRepository = {
    subscribe(userId, agentId) {
        try {
            run('INSERT OR IGNORE INTO agent_subscriptions (user_id, agent_id) VALUES (?, ?)', [userId, agentId]);
            return true;
        } catch { return false; }
    },
    unsubscribe(userId, agentId) {
        run('DELETE FROM agent_subscriptions WHERE user_id = ? AND agent_id = ?', [userId, agentId]);
    },
    isSubscribed(userId, agentId) {
        return !!get('SELECT 1 FROM agent_subscriptions WHERE user_id = ? AND agent_id = ?', [userId, agentId]);
    },
    listSubscribedAgentIds(userId) {
        return all('SELECT agent_id FROM agent_subscriptions WHERE user_id = ?', [userId]).map(r => r.agent_id);
    }
};


module.exports = SubscriptionRepository;
