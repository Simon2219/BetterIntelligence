const express = require('express');
const router = express.Router();
const {
    AIAgentRepository,
    SkillRepository,
    TagRepository,
    AgentCategoryRepository,
    UserPrivateTagRepository,
    CatalogEntitlementRepository,
    CatalogListingRepository
} = require('../database');
const { authenticate } = require('../middleware/auth');
const { hydrateAgentModelAvailability } = require('../ai/services/agentAvailabilityService');
const catalogEntitlementService = require('../services/catalogEntitlementService');
const catalogService = require('../services/catalogService');
const accDashboardService = require('../services/accDashboardService');
const { safeErrorMessage } = require('../utils/httpErrors');

function attachSkillIds(agent, userId) {
    if (!agent) return agent;
    if (Array.isArray(agent.skillIds)) return agent;
    agent.skillIds = SkillRepository.getAgentSkillEntryIds(agent.id, userId || agent.user_id);
    return agent;
}

function attachTags(agent) {
    if (!agent) return agent;
    if (Array.isArray(agent.tags)) {
        if (!agent.tags.length) return agent;
        if (typeof agent.tags[0] === 'object' && agent.tags[0]?.name) return agent;
        if (typeof agent.tags[0] === 'string') {
            agent.tags = agent.tags.map((tag) => ({ id: tag, name: tag }));
            return agent;
        }
    }
    agent.tags = TagRepository.getAgentTagIds(agent.id).map(tid => {
        const t = TagRepository.getById(tid);
        return t ? { id: t.id, name: t.name } : null;
    }).filter(Boolean);
    return agent;
}

function attachSubscription(agent, userId) {
    if (!agent) return agent;
    const entitlement = catalogEntitlementService.resolveAssetEntitlement({
        userId,
        assetType: 'agent',
        assetId: agent.id,
        action: 'chat'
    });
    agent.isOwner = agent.user_id && agent.user_id.toUpperCase() === userId.toUpperCase();
    agent.isSubscribed = !agent.isOwner && (
        entitlement.source === 'legacy_subscription'
        || !!entitlement.grant
        || !!entitlement.derivedGrant
    );
    agent.entitlement = entitlement;
    agent.market = {
        listingId: entitlement.listing?.id || null,
        status: entitlement.listing?.status || null,
        visibility: entitlement.listing?.visibility || null,
        source: entitlement.source,
        featureGates: entitlement.featureGates,
        quota: entitlement.quota,
        review: entitlement.revision ? {
            revisionId: entitlement.revision.id,
            reviewStatus: entitlement.revision.review_status
        } : null,
        deployability: {
            allowed: !!entitlement.allowed && entitlement.featureGates?.can_deploy !== false,
            reason: entitlement.allowed ? null : entitlement.reason
        }
    };
    return agent;
}

function attachCategoryIds(agent) {
    if (!agent) return agent;
    agent.categoryIds = AgentCategoryRepository.getAgentCategoryIds(agent.id);
    return agent;
}

function attachPrivateTags(agent, userId) {
    if (!agent || !userId) return agent;
    agent.userPrivateTags = UserPrivateTagRepository.getAgentPrivateTags(userId, agent.id);
    return agent;
}

function attachAvailability(agent) {
    if (!agent) return agent;
    return hydrateAgentModelAvailability(agent, { clone: false });
}

function enrichAgent(agent, userId) {
    if (!agent) return agent;
    attachSkillIds(agent, userId);
    attachAvailability(agent);
    attachCategoryIds(agent);
    attachTags(agent);
    attachPrivateTags(agent, userId);
    attachSubscription(agent, userId);
    delete agent.hub_published;
    return agent;
}

function hydrateAgentSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    return hydrateAgentModelAvailability({
        ...snapshot,
        personality: catalogService.parseJson(snapshot.personality, {}),
        behavior_rules: catalogService.parseJson(snapshot.behavior_rules, {}),
        sample_dialogues: catalogService.parseJson(snapshot.sample_dialogues, []),
        stop_sequences: catalogService.parseJson(snapshot.stop_sequences, []),
        metadata: catalogService.parseJson(snapshot.metadata, {}),
        is_active: snapshot.is_active === false ? false : snapshot.is_active !== 0
    }, { clone: true });
}

function getApprovedAgentRevision(agentId) {
    const listing = catalogService.listPublicListings({ assetType: 'agent', limit: 500 })
        .find((item) => String(item.asset_id) === String(agentId));
    return listing?.activeRevision || null;
}

function getApprovedAgentForPublicListing(agentId) {
    const revision = getApprovedAgentRevision(agentId);
    if (!revision?.snapshot) return null;
    return hydrateAgentSnapshot(revision.snapshot);
}

function getSharedAgentFromEntitlement(entitlement, fallbackAgentId) {
    const agent = catalogEntitlementService.getRuntimeAgentForResolvedEntitlement(entitlement, fallbackAgentId);
    if (!agent) return null;
    return hydrateAgentSnapshot(agent);
}

function getGrantedAgentIds(userId) {
    const ids = new Set();
    const directGrants = CatalogEntitlementRepository.listGrantsForSubject('user', userId, {
        status: 'active',
        assetType: 'agent'
    });
    directGrants.forEach((grant) => {
        if (grant.asset_id) ids.add(String(grant.asset_id));
    });

    const bundleGrants = CatalogEntitlementRepository.listGrantsForSubject('user', userId, {
        status: 'active',
        assetType: 'bundle'
    });
    bundleGrants.forEach((grant) => {
        const bundleItems = CatalogListingRepository.listBundleItems(
            grant.listing_id,
            grant.revision_id && String(grant.revision_id).startsWith('mrev_') ? grant.revision_id : null
        );
        bundleItems.forEach((item) => {
            if (String(item.item_type || '').toLowerCase() === 'agent' && item.item_id) {
                ids.add(String(item.item_id));
            }
        });
    });

    return [...ids];
}

const SAFE_AVATAR_URL_RE = /^(https?:\/\/|\/media\/|\/|data:image\/)/i;

function validateAgentData(data) {
    const errors = [];
    if (data.name !== undefined) {
        if (typeof data.name !== 'string' || data.name.trim().length < 1) errors.push('Name is required');
        if (data.name && data.name.length > 100) errors.push('Name must be under 100 characters');
    }
    if (data.avatarUrl !== undefined && data.avatarUrl) {
        if (typeof data.avatarUrl !== 'string' || !SAFE_AVATAR_URL_RE.test(data.avatarUrl.trim())) {
            errors.push('Avatar URL must use http, https, or a relative media path');
        }
    }
    if (data.tagline != null && String(data.tagline).length > 200) errors.push('Tagline must be under 200 characters');
    if (data.temperature !== undefined) {
        const t = Number(data.temperature);
        if (isNaN(t) || t < 0 || t > 2) errors.push('Temperature must be between 0 and 2');
    }
    if (data.maxTokens !== undefined) {
        const mt = Number(data.maxTokens);
        if (isNaN(mt) || mt < 1 || mt > 32768) errors.push('Max tokens must be between 1 and 32768');
    }
    if (data.topP !== undefined) {
        const v = Number(data.topP);
        if (isNaN(v) || v < 0 || v > 1) errors.push('Top-P must be between 0 and 1');
    }
    if (data.formality !== undefined) {
        const v = Number(data.formality);
        if (isNaN(v) || v < 0 || v > 10) errors.push('Formality must be between 0 and 10');
    }
    if (data.verbosity !== undefined) {
        const v = Number(data.verbosity);
        if (isNaN(v) || v < 0 || v > 10) errors.push('Verbosity must be between 0 and 10');
    }
    return errors;
}

router.get('/categories', authenticate, (req, res) => {
    try {
        const categories = AgentCategoryRepository.list(req.user.id);
        const withCount = categories.map(c => ({
            ...c,
            agentCount: AgentCategoryRepository.getAgentCountByCategory(c.id)
        }));
        res.json({ success: true, data: withCount });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.post('/categories', authenticate, (req, res) => {
    try {
        const { name } = req.body;
        if (!name?.trim()) return res.status(400).json({ success: false, error: 'name required' });
        const cat = AgentCategoryRepository.create(req.user.id, name.trim());
        res.status(201).json({ success: true, data: cat });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/categories/reorder', authenticate, (req, res) => {
    try {
        const { order } = req.body;
        if (!Array.isArray(order)) return res.status(400).json({ success: false, error: 'order array required' });
        const cats = AgentCategoryRepository.list(req.user.id);
        const allowed = new Set(cats.map(c => c.id));
        const valid = order.filter(({ id }) => allowed.has(id));
        AgentCategoryRepository.updateCategorySortOrder(valid.map((item, i) => ({ id: item.id, sort_order: i })));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.delete('/categories/:id', authenticate, (req, res) => {
    try {
        const cat = AgentCategoryRepository.getById(req.params.id);
        if (!cat) return res.status(404).json({ success: false, error: 'Category not found' });
        if (cat.user_id.toUpperCase() !== req.user.id.toUpperCase()) return res.status(403).json({ success: false, error: 'Forbidden' });
        AgentCategoryRepository.delete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/categories/:id', authenticate, (req, res) => {
    try {
        const cat = AgentCategoryRepository.getById(req.params.id);
        if (!cat || cat.user_id.toUpperCase() !== req.user.id.toUpperCase()) return res.status(403).json({ success: false, error: 'Forbidden' });
        const { name } = req.body;
        if (name !== undefined) AgentCategoryRepository.update(req.params.id, { name: String(name).trim() });
        res.json({ success: true, data: AgentCategoryRepository.getById(req.params.id) });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/categories/:id/reorder', authenticate, (req, res) => {
    try {
        const cat = AgentCategoryRepository.getById(req.params.id);
        if (!cat || cat.user_id.toUpperCase() !== req.user.id.toUpperCase()) return res.status(403).json({ success: false, error: 'Forbidden' });
        const { agentIds } = req.body;
        if (!Array.isArray(agentIds)) return res.status(400).json({ success: false, error: 'agentIds array required' });
        AgentCategoryRepository.reorderAgents(req.params.id, agentIds);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.get('/tags', authenticate, (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        const tags = q ? TagRepository.search(q, req.user.id, 20) : TagRepository.listForUser(req.user.id);
        res.json({ success: true, data: tags });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.get('/dashboard', authenticate, (req, res) => {
    try {
        const days = req.query.days ? parseInt(req.query.days, 10) : 30;
        const compareDays = req.query.compareDays ? parseInt(req.query.compareDays, 10) : null;
        const sections = req.query.sections
            ? String(req.query.sections).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
            : null;
        const data = accDashboardService.getDashboard(req.user, { days, compareDays, sections });
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.get('/', authenticate, (req, res) => {
    try {
        const own = AIAgentRepository.list({ userId: req.user.id, limit: 100 });
        const subIds = getGrantedAgentIds(req.user.id);
        const subAgents = subIds
            .filter(id => !own.some(a => a.id === id))
            .map(id => AIAgentRepository.getById(id))
            .filter(Boolean);
        const agents = [...own, ...subAgents].map(a => enrichAgent(a, req.user.id));
        res.json({ success: true, data: agents });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.post('/', authenticate, (req, res) => {
    try {
        let data = { ...req.body, userId: req.user.id };
        if (req.body.copyFrom) {
            const liveSource = AIAgentRepository.getById(req.body.copyFrom);
            if (!liveSource) return res.status(404).json({ success: false, error: 'Source agent not found' });
            let entitlement = null;
            try {
                entitlement = catalogEntitlementService.assertUserCanCopyAgent({ userId: req.user.id, agentId: liveSource.id });
            } catch {
                return res.status(403).json({ success: false, error: 'Cannot copy this agent' });
            }
            const src = liveSource?.user_id && liveSource.user_id.toUpperCase() === req.user.id.toUpperCase()
                ? liveSource
                : (getSharedAgentFromEntitlement(entitlement, liveSource.id) || getApprovedAgentForPublicListing(liveSource.id) || liveSource);
            data = {
                name: (req.body.name || src.name) + ' (Copy)',
                tagline: src.tagline,
                avatarUrl: src.avatar_url,
                systemPrompt: src.system_prompt,
                personality: src.personality,
                behaviorRules: src.behavior_rules,
                sampleDialogues: src.sample_dialogues,
                textProvider: src.text_provider,
                textModel: src.text_model,
                imageProvider: src.image_provider,
                imageModel: src.image_model,
                temperature: src.temperature,
                maxTokens: src.max_tokens,
                topP: src.top_p,
                topK: src.top_k,
                repeatPenalty: src.repeat_penalty,
                greetingMessage: src.greeting_message,
                responseFormat: src.response_format,
                contextWindow: src.context_window,
                memoryStrategy: src.memory_strategy,
                formality: src.formality,
                verbosity: src.verbosity,
                userId: req.user.id
            };
            data.skillIds = Array.isArray(src.skillIds) && src.skillIds.length
                ? [...src.skillIds]
                : SkillRepository.getAgentSkillEntryIds(src.id, req.user.id);
        }
        const errors = validateAgentData({ ...data, name: data.name || '' });
        if (!data.name || !data.name.trim()) errors.unshift('Name is required');
        if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });
        const { skillIds, tagNames, copyFrom, ...rest } = data;
        const agent = AIAgentRepository.create(rest);
        if (Array.isArray(skillIds) && skillIds.length) SkillRepository.assignToAgent(agent.id, skillIds);
        if (Array.isArray(tagNames) && tagNames.length) {
            const tagIds = tagNames.map(n => TagRepository.getOrCreate(n, req.user.id)).filter(Boolean).map(t => t.id);
            TagRepository.setAgentTags(agent.id, tagIds);
        }
        res.status(201).json({ success: true, data: enrichAgent(agent, req.user.id) });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// Catch-all for legacy /agents/hub paths that should route to /hub instead
router.all('/hub', (req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
});

router.get('/:id', authenticate, (req, res) => {
    try {
        const live = AIAgentRepository.getById(req.params.id);
        const entitlement = catalogEntitlementService.resolveAssetEntitlement({
            userId: req.user.id,
            assetType: 'agent',
            assetId: req.params.id
        });
        const liveOwner = live?.user_id && live.user_id.toUpperCase() === req.user.id.toUpperCase();
        const approvedSnapshot = getApprovedAgentForPublicListing(req.params.id);
        const sharedSnapshot = getSharedAgentFromEntitlement(entitlement, req.params.id);
        const a = liveOwner ? (live || approvedSnapshot) : (sharedSnapshot || approvedSnapshot || live);
        if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
        const isOwner = !!liveOwner;
        if (!isOwner && !entitlement.allowed) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }
        const out = enrichAgent(a, req.user.id);
        if (!isOwner) {
            delete out.system_prompt;
            delete out.personality;
            delete out.behavior_rules;
            delete out.sample_dialogues;
            delete out.backstory;
        }
        res.json({ success: true, data: out });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/:id/private-tags', authenticate, (req, res) => {
    const a = AIAgentRepository.getById(req.params.id);
    if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
    const canAccess = catalogEntitlementService.resolveAssetEntitlement({
        userId: req.user.id,
        assetType: 'agent',
        assetId: a.id
    }).allowed;
    if (!canAccess) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
        const { tagIds } = req.body;
        const myTags = UserPrivateTagRepository.list(req.user.id);
        const validIds = new Set(myTags.map(t => t.id));
        const toAssign = Array.isArray(tagIds) ? tagIds.filter(id => validIds.has(id)) : [];
        const current = UserPrivateTagRepository.getAgentPrivateTags(req.user.id, req.params.id).map(t => t.id);
        current.forEach(tid => UserPrivateTagRepository.unassignFromAgent(req.user.id, req.params.id, tid));
        toAssign.forEach(tid => UserPrivateTagRepository.assignToAgent(req.user.id, req.params.id, tid));
        res.json({ success: true, data: UserPrivateTagRepository.getAgentPrivateTags(req.user.id, req.params.id) });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/:id/category', authenticate, (req, res) => {
    const a = AIAgentRepository.getById(req.params.id);
    if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
    if (a.user_id && a.user_id.toUpperCase() !== req.user.id.toUpperCase()) return res.status(403).json({ success: false, error: 'Forbidden' });
    try {
        const { categoryId } = req.body;
        const cats = AgentCategoryRepository.list(req.user.id);
        if (!categoryId) {
            AgentCategoryRepository.getAgentCategoryIds(req.params.id).forEach(cid => AgentCategoryRepository.unassign(req.params.id, cid));
            const out = AIAgentRepository.getById(req.params.id);
            return res.json({ success: true, data: enrichAgent(out || a, req.user.id) });
        }
        const cat = cats.find(c => c.id === categoryId);
        if (!cat) return res.status(400).json({ success: false, error: 'Category not found' });
        AgentCategoryRepository.getAgentCategoryIds(req.params.id).forEach(cid => AgentCategoryRepository.unassign(req.params.id, cid));
        AgentCategoryRepository.assign(req.params.id, categoryId);
        const updated = AIAgentRepository.getById(req.params.id);
        res.json({ success: true, data: enrichAgent(updated, req.user.id) });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.put('/:id', authenticate, (req, res) => {
    const a = AIAgentRepository.getById(req.params.id);
    if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
    if (a.user_id && a.user_id.toUpperCase() !== req.user.id.toUpperCase()) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    try {
        const ALLOWED_UPDATE_FIELDS = [
            'name', 'tagline', 'description', 'avatarUrl', 'systemPrompt', 'personality',
            'backstory', 'temperature', 'maxTokens', 'topP', 'topK',
            'repeatPenalty', 'presencePenalty', 'frequencyPenalty', 'stopSequences',
            'greetingMessage', 'responseFormat', 'contextWindow', 'memoryStrategy',
            'formality', 'verbosity', 'textProvider', 'textModel',
            'imageProvider', 'imageModel', 'behaviorRules', 'sampleDialogues',
            'metadata', 'visibility', 'status', 'categoryId'
        ];
        const { skillIds, tagNames, ...rawRest } = req.body;
        const rest = {};
        for (const key of ALLOWED_UPDATE_FIELDS) {
            if (key in rawRest) rest[key] = rawRest[key];
        }
        const errors = validateAgentData(rest);
        if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });
        const updated = AIAgentRepository.update(req.params.id, rest);
        if (Array.isArray(skillIds)) SkillRepository.assignToAgent(req.params.id, skillIds);
        if (Array.isArray(tagNames)) {
            const tagIds = tagNames.map(n => TagRepository.getOrCreate(n, req.user.id)).filter(Boolean).map(t => t.id);
            TagRepository.setAgentTags(req.params.id, tagIds);
        }
        res.json({ success: true, data: enrichAgent(updated, req.user.id) });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.delete('/:id', authenticate, (req, res) => {
    try {
        const a = AIAgentRepository.getById(req.params.id);
        if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
        if (a.user_id && a.user_id.toUpperCase() !== req.user.id.toUpperCase()) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }
        AIAgentRepository.delete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

module.exports = router;


