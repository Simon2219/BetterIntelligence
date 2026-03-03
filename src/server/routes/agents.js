const express = require('express');
const router = express.Router();
const { AIAgentRepository, SkillRepository, SubscriptionRepository, TagRepository, AgentCategoryRepository, UserPrivateTagRepository } = require('../database');
const { authenticate } = require('../middleware/auth');
const { hydrateAgentModelAvailability } = require('../services/agentAvailabilityService');

function attachSkillIds(agent) {
    if (!agent) return agent;
    agent.skillIds = SkillRepository.getAgentSkillIds(agent.id);
    return agent;
}

function attachTags(agent) {
    if (!agent) return agent;
    agent.tags = TagRepository.getAgentTagIds(agent.id).map(tid => {
        const t = TagRepository.getById(tid);
        return t ? { id: t.id, name: t.name } : null;
    }).filter(Boolean);
    return agent;
}

function attachSubscription(agent, userId) {
    if (!agent) return agent;
    agent.isSubscribed = SubscriptionRepository.isSubscribed(userId, agent.id);
    agent.isOwner = agent.user_id && agent.user_id.toUpperCase() === userId.toUpperCase();
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

function validateAgentData(data) {
    const errors = [];
    if (data.name !== undefined) {
        if (typeof data.name !== 'string' || data.name.trim().length < 1) errors.push('Name is required');
        if (data.name && data.name.length > 100) errors.push('Name must be under 100 characters');
    }
    if (data.tagline !== undefined && data.tagline.length > 200) errors.push('Tagline must be under 200 characters');
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
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/categories', authenticate, (req, res) => {
    try {
        const { name } = req.body;
        if (!name?.trim()) return res.status(400).json({ success: false, error: 'name required' });
        const cat = AgentCategoryRepository.create(req.user.id, name.trim());
        res.status(201).json({ success: true, data: cat });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
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
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/categories/:id', authenticate, (req, res) => {
    try {
        const cat = AgentCategoryRepository.getById(req.params.id);
        if (!cat) return res.status(404).json({ success: false, error: 'Category not found' });
        if (cat.user_id.toUpperCase() !== req.user.id.toUpperCase()) return res.status(403).json({ success: false, error: 'Forbidden' });
        AgentCategoryRepository.delete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.put('/categories/:id', authenticate, (req, res) => {
    try {
        const cat = AgentCategoryRepository.getById(req.params.id);
        if (!cat || cat.user_id.toUpperCase() !== req.user.id.toUpperCase()) return res.status(403).json({ success: false, error: 'Forbidden' });
        const { name } = req.body;
        if (name !== undefined) AgentCategoryRepository.update(req.params.id, { name: String(name).trim() });
        res.json({ success: true, data: AgentCategoryRepository.getById(req.params.id) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
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
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/tags', authenticate, (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        const tags = q ? TagRepository.search(q, req.user.id, 20) : TagRepository.listForUser(req.user.id);
        res.json({ success: true, data: tags });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/', authenticate, (req, res) => {
    try {
        const own = AIAgentRepository.list({ userId: req.user.id, limit: 100 });
        const subIds = SubscriptionRepository.listSubscribedAgentIds(req.user.id);
        const subAgents = subIds
            .filter(id => !own.some(a => a.id === id))
            .map(id => AIAgentRepository.getById(id))
            .filter(Boolean);
        const agents = [...own.map(a => ({ ...a, isOwner: true, isSubscribed: false })), ...subAgents.map(a => ({ ...a, isOwner: false, isSubscribed: true }))]
            .map(attachSkillIds)
            .map(attachAvailability)
            .map(a => attachPrivateTags(attachTags(attachCategoryIds(a)), req.user.id));
        res.json({ success: true, data: agents });
    } catch {
        res.status(500).json({ success: false, error: 'Failed to list agents' });
    }
});

router.post('/', authenticate, (req, res) => {
    try {
        let data = { ...req.body, userId: req.user.id };
        if (req.body.copyFrom) {
            const src = AIAgentRepository.getById(req.body.copyFrom);
            if (!src) return res.status(404).json({ success: false, error: 'Source agent not found' });
            const canCopy = src.user_id?.toUpperCase() === req.user.id.toUpperCase() || SubscriptionRepository.isSubscribed(req.user.id, src.id) || (src.hub_published === 1);
            if (!canCopy) return res.status(403).json({ success: false, error: 'Cannot copy this agent' });
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
            data.skillIds = SkillRepository.getAgentSkillIds(src.id);
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
        res.status(201).json({ success: true, data: attachPrivateTags(attachSkillIds(attachAvailability(attachTags(attachCategoryIds(agent)))), req.user.id) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message || 'Failed to create agent' });
    }
});

router.get('/hub', authenticate, (req, res) => {
    try {
        const agents = AIAgentRepository.listHubPublished(100);
        const withMeta = agents.map(a => {
            const parsed = AIAgentRepository.getById ? AIAgentRepository.getById(a.id) : a;
            return attachSubscription(attachPrivateTags(attachTags(attachCategoryIds(attachSkillIds(attachAvailability(parsed || a)))), req.user.id), req.user.id);
        });
        res.json({ success: true, data: withMeta });
    } catch {
        res.status(500).json({ success: false, error: 'Failed to list hub agents' });
    }
});

router.get('/:id', authenticate, (req, res) => {
    const a = AIAgentRepository.getById(req.params.id);
    if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
    const isOwner = a.user_id && a.user_id.toUpperCase() === req.user.id.toUpperCase();
    const isSub = SubscriptionRepository.isSubscribed(req.user.id, a.id);
    if (!isOwner && !isSub && a.hub_published !== 1) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const out = attachSubscription(attachPrivateTags(attachTags(attachCategoryIds(attachSkillIds(attachAvailability(a)))), req.user.id), req.user.id);
    if (!isOwner) {
        delete out.system_prompt;
        delete out.personality;
        delete out.behavior_rules;
        delete out.sample_dialogues;
        delete out.backstory;
    }
    res.json({ success: true, data: out });
});

router.post('/:id/subscribe', authenticate, (req, res) => {
    const a = AIAgentRepository.getById(req.params.id);
    if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
    if (a.hub_published !== 1 && a.user_id?.toUpperCase() !== req.user.id.toUpperCase()) {
        return res.status(403).json({ success: false, error: 'Agent not available to subscribe' });
    }
    SubscriptionRepository.subscribe(req.user.id, req.params.id);
    res.json({ success: true });
});

router.delete('/:id/subscribe', authenticate, (req, res) => {
    SubscriptionRepository.unsubscribe(req.user.id, req.params.id);
    res.json({ success: true });
});

router.put('/:id/private-tags', authenticate, (req, res) => {
    const a = AIAgentRepository.getById(req.params.id);
    if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
    const canAccess = a.user_id?.toUpperCase() === req.user.id.toUpperCase() || SubscriptionRepository.isSubscribed(req.user.id, a.id) || a.hub_published === 1;
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
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
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
            return res.json({ success: true, data: attachSubscription(attachPrivateTags(attachTags(attachCategoryIds(attachSkillIds(attachAvailability(out || a)))), req.user.id), req.user.id) });
        }
        const cat = cats.find(c => c.id === categoryId);
        if (!cat) return res.status(400).json({ success: false, error: 'Category not found' });
        AgentCategoryRepository.getAgentCategoryIds(req.params.id).forEach(cid => AgentCategoryRepository.unassign(req.params.id, cid));
        AgentCategoryRepository.assign(req.params.id, categoryId);
        const updated = AIAgentRepository.getById(req.params.id);
        res.json({ success: true, data: attachSubscription(attachPrivateTags(attachTags(attachCategoryIds(attachSkillIds(attachAvailability(updated)))), req.user.id), req.user.id) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.put('/:id', authenticate, (req, res) => {
    const a = AIAgentRepository.getById(req.params.id);
    if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
    if (a.user_id && a.user_id.toUpperCase() !== req.user.id.toUpperCase()) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    try {
        const { skillIds, tagNames, ...rest } = req.body;
        const errors = validateAgentData(rest);
        if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });
        const updated = AIAgentRepository.update(req.params.id, rest);
        if (Array.isArray(skillIds)) SkillRepository.assignToAgent(req.params.id, skillIds);
        if (Array.isArray(tagNames)) {
            const tagIds = tagNames.map(n => TagRepository.getOrCreate(n, req.user.id)).filter(Boolean).map(t => t.id);
            TagRepository.setAgentTags(req.params.id, tagIds);
        }
        res.json({ success: true, data: attachSubscription(attachPrivateTags(attachTags(attachCategoryIds(attachSkillIds(attachAvailability(updated)))), req.user.id), req.user.id) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message || 'Update failed' });
    }
});

router.delete('/:id', authenticate, (req, res) => {
    const a = AIAgentRepository.getById(req.params.id);
    if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
    if (a.user_id && a.user_id.toUpperCase() !== req.user.id.toUpperCase()) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    AIAgentRepository.delete(req.params.id);
    res.json({ success: true });
});

module.exports = router;

