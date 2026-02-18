const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const Config = require('../../../config/Config');
const SkillLoader = require('../services/SkillLoader');
const { authenticate } = require('../middleware/auth');

router.get('/skills', (req, res) => {
    try {
        const bundled = path.join(path.resolve(Config.get('skills.basePath', './data/skills')), 'bundled');
        const skills = SkillLoader.listSkillsForUser(null).filter(s => s.source === 'bundled');
        res.json({ success: true, data: skills });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/skills/:slug/install', authenticate, (req, res) => {
    try {
        const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        const bundledPath = path.join(path.resolve(Config.get('skills.basePath', './data/skills')), 'bundled', slug);
        const installedDir = path.join(path.resolve(Config.get('skills.basePath', './data/skills')), 'installed', req.user.id);
        if (!fs.existsSync(path.join(bundledPath, 'SKILL.md'))) return res.status(404).json({ success: false, error: 'Skill not found' });
        if (!fs.existsSync(installedDir)) fs.mkdirSync(installedDir, { recursive: true });
        const dest = path.join(installedDir, slug);
        if (fs.existsSync(dest)) return res.json({ success: true, data: SkillLoader.loadSkillFromDir(dest) });
        fs.mkdirSync(dest, { recursive: true });
        fs.copyFileSync(path.join(bundledPath, 'SKILL.md'), path.join(dest, 'SKILL.md'));
        const skill = SkillLoader.loadSkillFromDir(dest);
        res.json({ success: true, data: { ...skill, source: 'installed' } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
