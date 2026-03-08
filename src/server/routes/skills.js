const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Config = require('../../../config/Config');
const SkillLoader = require('../services/SkillLoader');
const { SkillRepository, SkillCategoryRepository, UserPrivateTagRepository } = require('../database');
const { authenticate } = require('../middleware/auth');
const { safeErrorMessage } = require('../utils/httpErrors');

router.get('/categories', authenticate, (req, res) => {
    try {
        const categories = SkillCategoryRepository.list(req.user.id);
        res.json({ success: true, data: categories });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.post('/categories', authenticate, (req, res) => {
    try {
        const { name } = req.body;
        if (!name?.trim()) return res.status(400).json({ success: false, error: 'name required' });
        const cat = SkillCategoryRepository.create(req.user.id, name.trim());
        res.status(201).json({ success: true, data: cat });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/categories/reorder', authenticate, (req, res) => {
    try {
        const { order } = req.body;
        if (!Array.isArray(order)) return res.status(400).json({ success: false, error: 'order array required' });
        const cats = SkillCategoryRepository.list(req.user.id);
        const allowed = new Set(cats.map(c => c.id));
        const valid = order.filter(({ id }) => allowed.has(id));
        SkillCategoryRepository.updateCategorySortOrder(valid.map((item, i) => ({ id: item.id, sort_order: i })));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/reorder', authenticate, (req, res) => {
    try {
        const { categoryId, skillIds } = req.body;
        if (!categoryId || !Array.isArray(skillIds)) return res.status(400).json({ success: false, error: 'categoryId and skillIds required' });
        const cat = SkillCategoryRepository.getById(categoryId);
        if (!cat || cat.user_id.toUpperCase() !== req.user.id.toUpperCase()) return res.status(403).json({ success: false, error: 'Forbidden' });
        SkillCategoryRepository.reorderSkills(categoryId, skillIds);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/categories/:id', authenticate, (req, res) => {
    try {
        const cat = SkillCategoryRepository.getById(req.params.id);
        if (!cat || cat.user_id.toUpperCase() !== req.user.id.toUpperCase()) return res.status(403).json({ success: false, error: 'Forbidden' });
        const { name } = req.body;
        if (name !== undefined) SkillCategoryRepository.update(req.params.id, { name: String(name).trim() });
        res.json({ success: true, data: SkillCategoryRepository.getById(req.params.id) });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.delete('/categories/:id', authenticate, (req, res) => {
    try {
        const cat = SkillCategoryRepository.getById(req.params.id);
        if (!cat) return res.status(404).json({ success: false, error: 'Category not found' });
        if (cat.user_id.toUpperCase() !== req.user.id.toUpperCase()) return res.status(403).json({ success: false, error: 'Forbidden' });
        SkillCategoryRepository.delete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.get('/', authenticate, (req, res) => {
    try {
        const dbSkills = SkillRepository.listForUser(req.user.id);
        const base = path.resolve(Config.get('skills.basePath', './data/skills'));
        const result = dbSkills.map(s => {
            const skillPath = path.join(base, s.path);
            const loaded = SkillLoader.loadSkillFromDir(skillPath);
            const source = s.path.startsWith('bundled/') ? 'bundled' : s.path.startsWith('workspace/') ? 'workspace' : 'installed';
            const categoryIds = SkillCategoryRepository.getSkillCategoryIds(s.id);
            const userPrivateTags = UserPrivateTagRepository.getSkillPrivateTags(req.user.id, s.id);
            return { ...s, ...loaded, source, id: s.id, categoryIds, userPrivateTags };
        });
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.post('/', authenticate, (req, res) => {
    try {
        const { slug, name, description, instructions, version, visibility = 'private' } = req.body;
        if (!slug || !name) return res.status(400).json({ success: false, error: 'slug and name required' });
        const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        if (!safeSlug) return res.status(400).json({ success: false, error: 'Invalid slug' });
        const vis = visibility === 'public' ? 'public' : 'private';

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
        const relPath = path.relative(base, skillDir).replace(/\\/g, '/');
        const skillRow = SkillRepository.create({
            slug: safeSlug, path: relPath, creatorId: req.user.id,
            visibility: vis, name, description: description || '', version: version || '1.0.0'
        });
        const skill = SkillLoader.loadSkillFromDir(skillDir);
        res.status(201).json({ success: true, data: { ...skill, ...skillRow, source: 'workspace' } });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/:id', authenticate, (req, res) => {
    try {
        const param = req.params.id;
        let skill = SkillRepository.getById(param);
        if (!skill) {
            const userSkills = SkillRepository.listForUser(req.user.id);
            skill = userSkills.find(s => s.slug === param || s.id === param);
        }
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });
        const skillId = skill.id;
        if (!skill.path.startsWith('workspace/') || !skill.creator_id || skill.creator_id.toUpperCase() !== req.user.id.toUpperCase()) {
            return res.status(403).json({ success: false, error: 'Can only edit workspace skills' });
        }
        const base = path.resolve(Config.get('skills.basePath', './data/skills'));
        const skillPath = path.join(base, skill.path);
        const { name, description, instructions, version, visibility } = req.body;
        const existing = SkillLoader.loadSkillFromDir(skillPath);
        const skillFile = path.join(skillPath, 'SKILL.md');
        const { metadata } = SkillLoader.parseFrontmatter(fs.readFileSync(skillFile, 'utf8'));
        const desc = description != null ? description : (existing?.description || metadata?.description || '');
        const instructionsText = instructions != null ? String(instructions) : (existing?.instructions || '');
        const content = `---
name: ${name != null ? name : existing?.name || metadata?.name || skill.slug}
description: ${desc}
version: ${version != null ? version : (metadata?.version || '1.0.0')}
---

${instructionsText}
`;
        fs.writeFileSync(skillFile, content);
        const updates = {};
        if (name != null) updates.name = name;
        if (description != null) updates.description = description;
        if (version != null) updates.version = version;
        if (visibility !== undefined) updates.visibility = visibility === 'public' ? 'public' : 'private';
        if (Object.keys(updates).length) SkillRepository.update(skillId, updates);
        const loaded = SkillLoader.loadSkillFromDir(skillPath);
        res.json({ success: true, data: { ...skill, ...loaded, ...updates, source: 'workspace' } });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/:id/private-tags', authenticate, (req, res) => {
    try {
        const param = req.params.id;
        let skill = SkillRepository.getById(param);
        if (!skill) {
            const userSkills = SkillRepository.listForUser(req.user.id);
            skill = userSkills.find(s => s.slug === param || s.id === param);
        }
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });
        const skillId = skill.id;
        const userSkills = SkillRepository.listForUser(req.user.id);
        if (!userSkills.some(s => s.id === skillId)) return res.status(403).json({ success: false, error: 'Forbidden' });
        const { tagIds } = req.body;
        const myTags = UserPrivateTagRepository.list(req.user.id);
        const validIds = new Set(myTags.map(t => t.id));
        const toAssign = Array.isArray(tagIds) ? tagIds.filter(id => validIds.has(id)) : [];
        const current = UserPrivateTagRepository.getSkillPrivateTags(req.user.id, skillId).map(t => t.id);
        current.forEach(tid => UserPrivateTagRepository.unassignFromSkill(req.user.id, skillId, tid));
        toAssign.forEach(tid => UserPrivateTagRepository.assignToSkill(req.user.id, skillId, tid));
        res.json({ success: true, data: UserPrivateTagRepository.getSkillPrivateTags(req.user.id, skillId) });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/:id/category', authenticate, (req, res) => {
    try {
        const { categoryId } = req.body;
        const skill = SkillRepository.getById(req.params.id);
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });
        const userSkills = SkillRepository.listForUser(req.user.id);
        if (!userSkills.some(s => s.id === skill.id)) return res.status(403).json({ success: false, error: 'Forbidden' });
        SkillCategoryRepository.getSkillCategoryIds(skill.id).forEach(cid => SkillCategoryRepository.unassign(skill.id, cid));
        if (categoryId) {
            const cat = SkillCategoryRepository.getById(categoryId);
            if (!cat || cat.user_id.toUpperCase() !== req.user.id.toUpperCase()) return res.status(403).json({ success: false, error: 'Invalid category' });
            SkillCategoryRepository.assign(skill.id, categoryId);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.get('/:id', authenticate, (req, res) => {
    const param = req.params.id;
    let skill = SkillRepository.getById(param);
    if (!skill) {
        const userSkills = SkillRepository.listForUser(req.user.id);
        skill = userSkills.find(s => s.slug === param || s.id === param);
    }
    if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });
    const userSkills = SkillRepository.listForUser(req.user.id);
    if (!userSkills.some(s => s.id === skill.id)) return res.status(403).json({ success: false, error: 'Forbidden' });
    const base = path.resolve(Config.get('skills.basePath', './data/skills'));
    const loaded = SkillLoader.loadSkillFromDir(path.join(base, skill.path));
    const source = skill.path.startsWith('bundled/') ? 'bundled' : skill.path.startsWith('workspace/') ? 'workspace' : 'installed';
    res.json({ success: true, data: { ...skill, ...loaded, source } });
});

module.exports = router;


