const express = require('express');
const router = express.Router();
const { AIAgentRepository, AnalyticsRepository } = require('../database');
const { authenticate } = require('../middleware/auth');
const { safeErrorMessage } = require('../utils/httpErrors');

router.get('/:agentId', authenticate, (req, res) => {
    try {
        const agent = AIAgentRepository.getById(req.params.agentId);
        if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });
        if (agent.user_id && agent.user_id.toUpperCase() !== req.user.id.toUpperCase()) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }
        const days = parseInt(req.query.days, 10) || 30;
        const stats = AnalyticsRepository.getStats(req.params.agentId, days);
        res.json({ success: true, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

module.exports = router;


