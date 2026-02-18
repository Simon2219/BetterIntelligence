const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Config = require('../../../config/Config');
const SkillLoader = require('../services/SkillLoader');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, (req, res) => {
    try {
        const skills = SkillLoader.listSkillsForUser(req.user.id);
        res.json({ success: true, data: skills });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/', authenticate, (req, res) => {
    try {
        const { slug, name, description, instructions, version } = req.body;
        if (!slug || !name) return res.status(400).json({ success: false, error: 'slug and name required' });
        const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        if (!safeSlug) return res.status(400).json({ success: false, error: 'Invalid slug' });

        const base = path.resolve(Config.get('skills.basePath', './data/skills'));
        const workspaceDir = path.join(base, 'workspace', req.user.id);
        if (!fs.existsSync(workspaceDir)) fs.mkdirSync(workspaceDir, { recursive: true });
        const skillDir = path.join(workspaceDir, safeSlug);
        if (fs.existsSync(skillDir)) return res.status(409).json({ success: false, error: 'Skill already exists' });
        fs.mkdirSync(skillDir, { recursive: true });

        const content = `---
name: ${name}
description: ${description || ''}
version: ${version || '1.0.0'}
---

${instructions || ''}
`;
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
        const skill = SkillLoader.loadSkillFromDir(skillDir);
        res.status(201).json({ success: true, data: { ...skill, source: 'workspace' } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/:slug', authenticate, (req, res) => {
    try {
        const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        const skillPath = SkillLoader.getSkillPath(req.user.id, slug);
        if (!skillPath) return res.status(404).json({ success: false, error: 'Skill not found' });
        if (!skillPath.includes('workspace')) return res.status(403).json({ success: false, error: 'Can only edit workspace skills' });

        const { name, description, instructions, version } = req.body;
        const skillFile = path.join(skillPath, 'SKILL.md');
        const existing = fs.readFileSync(skillFile, 'utf8');
        const { metadata } = SkillLoader.parseFrontmatter(existing);
        const desc = description != null ? description : (metadata.description || '');
        const content = `---
name: ${name != null ? name : metadata.name}
description: ${desc}
version: ${version != null ? version : (metadata.version || '1.0.0')}
---

${instructions != null ? instructions : ''}
`;
        fs.writeFileSync(skillFile, content);
        const skill = SkillLoader.loadSkillFromDir(skillPath);
        res.json({ success: true, data: { ...skill, source: 'workspace' } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:slug', authenticate, (req, res) => {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const skillPath = SkillLoader.getSkillPath(req.user.id, slug);
    if (!skillPath) return res.status(404).json({ success: false, error: 'Skill not found' });
    const skill = SkillLoader.loadSkillFromDir(skillPath);
    res.json({ success: true, data: skill });
});

module.exports = router;
