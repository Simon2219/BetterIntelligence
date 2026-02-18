const express = require('express');
const router = express.Router();
const { ConversationSystem, MessageSystem } = require('../database/Database');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, (req, res) => {
    try {
        const agentId = req.query.agentId;
        const convs = ConversationSystem.listForUser(req.user.id, agentId);
        res.json({ success: true, data: convs });
    } catch {
        res.status(500).json({ success: false, error: 'Failed to list conversations' });
    }
});

router.post('/', authenticate, (req, res) => {
    try {
        const { agentId } = req.body;
        if (!agentId) return res.status(400).json({ success: false, error: 'agentId required' });
        const conv = ConversationSystem.create(agentId, req.user.id);
        res.status(201).json({ success: true, data: conv });
    } catch {
        res.status(500).json({ success: false, error: 'Failed to create conversation' });
    }
});

router.get('/:id/messages', authenticate, (req, res) => {
    try {
        const conv = ConversationSystem.getById(req.params.id);
        if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });
        if (conv.user_id && conv.user_id.toUpperCase() !== req.user.id.toUpperCase()) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }
        const messages = MessageSystem.list(req.params.id);
        res.json({ success: true, data: messages });
    } catch {
        res.status(500).json({ success: false, error: 'Failed to get messages' });
    }
});

module.exports = router;
