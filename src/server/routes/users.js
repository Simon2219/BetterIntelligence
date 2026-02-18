const express = require('express');
const router = express.Router();
const { UserSystem } = require('../database/Database');
const { authenticate } = require('../middleware/auth');
const { sanitizeUser } = require('./auth');

router.get('/me', authenticate, (req, res) => {
    const u = UserSystem.getWithRole(req.user.id);
    res.json({ success: true, data: sanitizeUser(u) });
});

router.put('/me', authenticate, (req, res) => {
    try {
        const allowed = ['displayName', 'avatarUrl', 'bio', 'settings'];
        const updates = {};
        for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
        UserSystem.update(req.user.id, updates);
        const u = UserSystem.getWithRole(req.user.id);
        res.json({ success: true, data: sanitizeUser(u) });
    } catch {
        res.status(500).json({ success: false, error: 'Update failed' });
    }
});

module.exports = router;
