const express = require('express');
const router = express.Router();
const path = require('path');
const { DeploymentSystem, AIAgentSystem } = require('../database/Database');
const { authenticate } = require('../middleware/auth');

router.get('/:slug', (req, res) => {
    const dep = DeploymentSystem.getBySlug(req.params.slug);
    if (!dep) return res.status(404).json({ success: false, error: 'Deployment not found' });
    const agent = AIAgentSystem.getById(dep.agent_id);
    res.json({ success: true, data: { slug: dep.slug, agent: agent ? { name: agent.name } : null } });
});

router.post('/', authenticate, (req, res) => {
    try {
        const { agentId, slug } = req.body;
        if (!agentId || !slug) return res.status(400).json({ success: false, error: 'agentId and slug required' });
        const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        if (!safeSlug) return res.status(400).json({ success: false, error: 'Invalid slug' });
        const agent = AIAgentSystem.getById(agentId);
        if (!agent || (agent.user_id && agent.user_id.toUpperCase() !== req.user.id.toUpperCase())) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }
        const existing = DeploymentSystem.getBySlug(safeSlug);
        if (existing) return res.status(409).json({ success: false, error: 'Slug taken' });
        const dep = DeploymentSystem.create(agentId, safeSlug);
        res.status(201).json({ success: true, data: dep });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:slug/check', (req, res) => {
    const dep = DeploymentSystem.getBySlug(req.params.slug);
    res.json({ success: true, available: !dep });
});

module.exports = router;
