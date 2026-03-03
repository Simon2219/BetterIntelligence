const express = require('express');
const router = express.Router();
const { UserPrivateTagRepository } = require('../database');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, (req, res) => {
    try {
        const tags = UserPrivateTagRepository.list(req.user.id);
        res.json({ success: true, data: tags });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/', authenticate, (req, res) => {
    try {
        const { name, color, style } = req.body;
        if (!name?.trim()) return res.status(400).json({ success: false, error: 'name required' });
        const tag = UserPrivateTagRepository.create(req.user.id, { name: name.trim(), color, style });
        res.status(201).json({ success: true, data: tag });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.put('/:id', authenticate, (req, res) => {
    try {
        const tag = UserPrivateTagRepository.getById(req.params.id);
        if (!tag || tag.user_id.toUpperCase() !== req.user.id.toUpperCase()) {
            return res.status(404).json({ success: false, error: 'Tag not found' });
        }
        const updated = UserPrivateTagRepository.update(req.params.id, req.user.id, req.body);
        res.json({ success: true, data: updated });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/:id', authenticate, (req, res) => {
    try {
        const ok = UserPrivateTagRepository.delete(req.params.id, req.user.id);
        if (!ok) return res.status(404).json({ success: false, error: 'Tag not found' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;


