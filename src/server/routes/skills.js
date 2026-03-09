const express = require('express');
const router = express.Router();
const {
    SkillRepository,
    SkillCategoryRepository,
    UserPrivateTagRepository
} = require('../database');
const { authenticate } = require('../middleware/auth');
const catalogEntitlementService = require('../services/catalogEntitlementService');
const SkillMaterializationService = require('../services/SkillMaterializationService');
const { safeErrorMessage } = require('../utils/httpErrors');

function attachCatalog(skillEntry, userId) {
    if (!skillEntry?.skillId && !skillEntry?.id) return skillEntry;
    const canonicalSkillId = skillEntry.skillId || skillEntry.id;
    const entitlement = catalogEntitlementService.resolveAssetEntitlement({
        userId,
        assetType: 'skill',
        assetId: canonicalSkillId,
        action: 'install'
    });
    return {
        ...skillEntry,
        market: {
            listingId: entitlement.listing?.id || null,
            status: entitlement.listing?.status || null,
            visibility: entitlement.listing?.visibility || null,
            source: entitlement.source,
            featureGates: entitlement.featureGates,
            quota: entitlement.quota
        }
    };
}

function getUserSkillEntry(userId, param) {
    const direct = SkillRepository.getLibraryEntryById(userId, param);
    if (direct) return direct;
    const skills = SkillRepository.listForUser(userId);
    return skills.find((skill) => skill.slug === param || skill.id === param || skill.entryId === param) || null;
}

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
        const allowed = new Set(cats.map((cat) => cat.id));
        const valid = order.filter(({ id }) => allowed.has(id));
        SkillCategoryRepository.updateCategorySortOrder(valid.map((item, index) => ({ id: item.id, sort_order: index })));
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
        const result = SkillRepository.listForUser(req.user.id).map((skillEntry) => {
            const categoryIds = SkillCategoryRepository.getSkillCategoryIds(skillEntry.id);
            const userPrivateTags = UserPrivateTagRepository.getSkillPrivateTags(req.user.id, skillEntry.id);
            return attachCatalog({ ...skillEntry, categoryIds, userPrivateTags }, req.user.id);
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
        const existing = SkillRepository.getById(`user:${req.user.id}:${safeSlug}`);
        if (existing && !existing.archived_at) return res.status(409).json({ success: false, error: 'Skill already exists' });

        const skillRow = SkillRepository.create({
            id: `user:${req.user.id}:${safeSlug}`,
            slug: safeSlug,
            creatorId: req.user.id,
            visibility: visibility === 'public' ? 'public' : 'private',
            version: version || '1.0.0',
            name,
            description: description || '',
            sourceType: 'workspace',
            instructionsText: instructions || '',
            definitionJson: {
                name,
                description: description || '',
                version: version || '1.0.0',
                instructions: instructions || '',
                metadata: {}
            }
        });

        const workspaceDir = SkillMaterializationService.getWorkspaceSkillDir(skillRow, req.user.id);
        SkillMaterializationService.materializeSkillToPath(skillRow, workspaceDir);
        const relativePath = `workspace/${req.user.id}/${skillRow.slug}`;
        const updated = SkillRepository.update(skillRow.id, {
            path: relativePath,
            materializedPath: relativePath,
            materializedAt: new Date().toISOString()
        });
        res.status(201).json({ success: true, data: attachCatalog({ ...updated, id: updated.id, skillId: updated.id, entryId: updated.id, source: 'workspace' }, req.user.id) });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/:id', authenticate, (req, res) => {
    try {
        const skillEntry = getUserSkillEntry(req.user.id, req.params.id);
        if (!skillEntry) return res.status(404).json({ success: false, error: 'Skill not found' });
        if (skillEntry.source !== 'workspace' || !skillEntry.creator_id || skillEntry.creator_id.toUpperCase() !== req.user.id.toUpperCase()) {
            return res.status(403).json({ success: false, error: 'Can only edit workspace skills' });
        }

        const { name, description, instructions, version, visibility } = req.body;
        const definition = {
            ...(skillEntry.definition || {}),
            name: name != null ? name : skillEntry.name,
            description: description != null ? description : (skillEntry.description || ''),
            version: version != null ? version : (skillEntry.version || '1.0.0'),
            instructions: instructions != null ? String(instructions) : (skillEntry.instructions || ''),
            metadata: skillEntry.metadata || {}
        };

        let updated = SkillRepository.update(skillEntry.skillId || skillEntry.id, {
            name,
            description,
            version,
            visibility: visibility === undefined ? undefined : (visibility === 'public' ? 'public' : 'private'),
            instructionsText: instructions != null ? String(instructions) : undefined,
            definitionJson: definition
        });
        const workspaceDir = SkillMaterializationService.getWorkspaceSkillDir(updated, req.user.id);
        SkillMaterializationService.materializeSkillToPath(updated, workspaceDir);
        const relativePath = `workspace/${req.user.id}/${updated.slug}`;
        updated = SkillRepository.update(updated.id, {
            path: relativePath,
            materializedPath: relativePath,
            materializedAt: new Date().toISOString()
        });
        res.json({ success: true, data: attachCatalog({ ...updated, id: updated.id, skillId: updated.id, entryId: updated.id, source: 'workspace' }, req.user.id) });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/:id/private-tags', authenticate, (req, res) => {
    try {
        const skillEntry = getUserSkillEntry(req.user.id, req.params.id);
        if (!skillEntry) return res.status(404).json({ success: false, error: 'Skill not found' });
        const { tagIds } = req.body;
        const myTags = UserPrivateTagRepository.list(req.user.id);
        const validIds = new Set(myTags.map((tag) => tag.id));
        const toAssign = Array.isArray(tagIds) ? tagIds.filter((id) => validIds.has(id)) : [];
        const current = UserPrivateTagRepository.getSkillPrivateTags(req.user.id, skillEntry.id).map((tag) => tag.id);
        current.forEach((tagId) => UserPrivateTagRepository.unassignFromSkill(req.user.id, skillEntry.id, tagId));
        toAssign.forEach((tagId) => UserPrivateTagRepository.assignToSkill(req.user.id, skillEntry.id, tagId));
        res.json({ success: true, data: UserPrivateTagRepository.getSkillPrivateTags(req.user.id, skillEntry.id) });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/:id/category', authenticate, (req, res) => {
    try {
        const { categoryId } = req.body;
        const skillEntry = getUserSkillEntry(req.user.id, req.params.id);
        if (!skillEntry) return res.status(404).json({ success: false, error: 'Skill not found' });
        SkillCategoryRepository.getSkillCategoryIds(skillEntry.id).forEach((cid) => SkillCategoryRepository.unassign(skillEntry.id, cid));
        if (categoryId) {
            const cat = SkillCategoryRepository.getById(categoryId);
            if (!cat || cat.user_id.toUpperCase() !== req.user.id.toUpperCase()) return res.status(403).json({ success: false, error: 'Invalid category' });
            SkillCategoryRepository.assign(skillEntry.id, categoryId);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.get('/:id', authenticate, (req, res) => {
    try {
        const skillEntry = getUserSkillEntry(req.user.id, req.params.id);
        if (!skillEntry) return res.status(404).json({ success: false, error: 'Skill not found' });
        const categoryIds = SkillCategoryRepository.getSkillCategoryIds(skillEntry.id);
        const userPrivateTags = UserPrivateTagRepository.getSkillPrivateTags(req.user.id, skillEntry.id);
        res.json({ success: true, data: attachCatalog({ ...skillEntry, categoryIds, userPrivateTags }, req.user.id) });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

module.exports = router;
