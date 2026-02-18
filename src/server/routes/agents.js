const express = require('express');
const router = express.Router();
const { AIAgentSystem } = require('../database/Database');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, (req, res) => {
    try {
        const agents = AIAgentSystem.list({ userId: req.user.id, limit: 100 });
        res.json({ success: true, data: agents });
    } catch {
        res.status(500).json({ success: false, error: 'Failed to list agents' });
    }
});

router.post('/', authenticate, (req, res) => {
    try {
        const data = { ...req.body, userId: req.user.id };
        const agent = AIAgentSystem.create(data);
        res.status(201).json({ success: true, data: agent });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message || 'Failed to create agent' });
    }
});

router.get('/:id', authenticate, (req, res) => {
    const a = AIAgentSystem.getById(req.params.id);
    if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
    if (a.user_id && a.user_id.toUpperCase() !== req.user.id.toUpperCase()) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    res.json({ success: true, data: a });
});

router.put('/:id', authenticate, (req, res) => {
    const a = AIAgentSystem.getById(req.params.id);
    if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
    if (a.user_id && a.user_id.toUpperCase() !== req.user.id.toUpperCase()) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    try {
        const updated = AIAgentSystem.update(req.params.id, req.body);
        res.json({ success: true, data: updated });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message || 'Update failed' });
    }
});

router.delete('/:id', authenticate, (req, res) => {
    const a = AIAgentSystem.getById(req.params.id);
    if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
    if (a.user_id && a.user_id.toUpperCase() !== req.user.id.toUpperCase()) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    AIAgentSystem.delete(req.params.id);
    res.json({ success: true });
});

module.exports = router;
