const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const Config = require('../../../config/Config');
const SkillLoader = require('../services/SkillLoader');
const { SkillRepository, SkillRegistryRepository } = require('../database');
const { authenticate } = require('../middleware/auth');
const { safeErrorMessage } = require('../utils/httpErrors');

router.get('/skills', (req, res) => {
    try {
        const dbSkills = SkillRepository.listPublicHub();
        const base = path.resolve(Config.get('skills.basePath', './data/skills'));
        const result = dbSkills.map(s => {
            const skillPath = path.join(base, s.path);
            const loaded = fs.existsSync(path.join(skillPath, 'SKILL.md')) ? SkillLoader.loadSkillFromDir(skillPath) : {};
            return { ...s, ...loaded, source: 'hub' };
        });
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.post('/publish', authenticate, (req, res) => {
    try {
        const { slug } = req.body || {};
        const safeSlug = (slug || '').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        if (!safeSlug) return res.status(400).json({ success: false, error: 'slug required' });

        const base = path.resolve(Config.get('skills.basePath', './data/skills'));
        const workspacePath = path.join(base, 'workspace', req.user.id, safeSlug);
        if (!fs.existsSync(path.join(workspacePath, 'SKILL.md'))) return res.status(404).json({ success: false, error: 'Skill not found in workspace' });

        const skill = SkillLoader.loadSkillFromDir(workspacePath);
        const relPath = path.relative(path.resolve(base), workspacePath).replace(/\\/g, '/');
        SkillRegistryRepository.upsert({ slug: safeSlug, path: relPath, creatorId: req.user.id, version: skill.version || '1.0.0' });
        const skillId = 'user:' + req.user.id + ':' + safeSlug;
        const existing = SkillRepository.getById(skillId);
        if (existing) {
            SkillRepository.update(skillId, { hubPublished: true, visibility: 'public' });
        } else {
            SkillRepository.create({ id: skillId, slug: safeSlug, path: relPath, creatorId: req.user.id, visibility: 'public', hubPublished: true, name: skill.name, description: skill.description || '', version: skill.version || '1.0.0' });
        }
        res.json({ success: true, data: { ...skill, slug: safeSlug, id: skillId, source: 'hub' } });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.post('/skills/:slug/install', authenticate, (req, res) => {
    try {
        const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        const base = path.resolve(Config.get('skills.basePath', './data/skills'));
        const installedDir = path.join(base, 'installed', req.user.id);
        if (!fs.existsSync(installedDir)) fs.mkdirSync(installedDir, { recursive: true });
        const dest = path.join(installedDir, slug);
        const skillId = 'installed:' + req.user.id + ':' + slug;
        const existingSkill = SkillRepository.getById(skillId);
        if (fs.existsSync(dest)) {
            const loaded = SkillLoader.loadSkillFromDir(dest);
            return res.json({ success: true, data: { ...loaded, ...(existingSkill || {}), id: existingSkill?.id || skillId, source: 'installed' } });
        }

        let sourcePath = path.join(base, 'bundled', slug);
        let sourceSkill = SkillRepository.getById('bundled:' + slug);
        if (!sourceSkill) {
            const hub = SkillRepository.listPublicHub().find(s => s.slug === slug);
            if (hub) {
                sourcePath = path.join(base, hub.path);
                sourceSkill = hub;
            }
        } else {
            sourcePath = path.join(base, sourceSkill.path);
        }
        if (!fs.existsSync(path.join(sourcePath, 'SKILL.md'))) return res.status(404).json({ success: false, error: 'Skill not found' });

        fs.mkdirSync(dest, { recursive: true });
        fs.copyFileSync(path.join(sourcePath, 'SKILL.md'), path.join(dest, 'SKILL.md'));
        const loaded = SkillLoader.loadSkillFromDir(dest);
        const relPath = 'installed/' + req.user.id + '/' + slug;
        SkillRepository.create({ id: skillId, slug, path: relPath, creatorId: null, visibility: 'private', name: loaded.name, description: loaded.description || '', version: loaded.version || '1.0.0' });
        res.json({ success: true, data: { ...loaded, id: skillId, slug, source: 'installed' } });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

module.exports = router;


