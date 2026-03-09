const express = require('express');
const router = express.Router();
const {
    SkillRepository,
    SkillInstallationRepository,
    UserRepository,
    CatalogEntitlementRepository
} = require('../database');
const { authenticate, authenticateOptional } = require('../middleware/auth');
const catalogService = require('../services/catalogService');
const catalogEntitlementService = require('../services/catalogEntitlementService');
const SkillMaterializationService = require('../services/SkillMaterializationService');
const { DEFAULT_FEATURE_GATES_BY_ASSET } = require('../services/catalogConstants');
const { safeErrorMessage } = require('../utils/httpErrors');

function parseJson(value, fallback) {
    try {
        return JSON.parse(value || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

function hydrateAgentSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    return {
        ...snapshot,
        personality: parseJson(snapshot.personality, {}),
        behavior_rules: parseJson(snapshot.behavior_rules, {}),
        sample_dialogues: parseJson(snapshot.sample_dialogues, []),
        stop_sequences: parseJson(snapshot.stop_sequences, []),
        metadata: parseJson(snapshot.metadata, {}),
        is_active: snapshot.is_active === false ? false : snapshot.is_active !== 0
    };
}

function sanitizeCreator(userId, cache = new Map()) {
    const key = String(userId || '').trim();
    if (!key) return null;
    if (cache.has(key)) return cache.get(key);
    const user = UserRepository.getById(key);
    const value = user ? {
        id: user.id,
        displayName: user.display_name || user.username || 'Creator',
        avatarUrl: user.avatar_url || '',
        bio: user.bio || ''
    } : null;
    cache.set(key, value);
    return value;
}

function buildPersonalityProfile(agent = {}) {
    const metadata = parseJson(agent.metadata, {});
    const clamp = (value, fallback = 5) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(0, Math.min(10, Math.round(parsed)));
    };
    const responseLength = String(metadata.responseLength || 'medium').trim().toLowerCase();
    const roleplayMode = String(metadata.roleplayMode || 'assistant').trim().toLowerCase();
    const axes = [
        { key: 'formality', label: 'Formality', value: clamp(agent.formality, 5) },
        { key: 'verbosity', label: 'Verbosity', value: clamp(agent.verbosity, 5) },
        { key: 'response_length', label: 'Depth', value: responseLength === 'short' ? 3 : responseLength === 'long' ? 9 : 6 },
        { key: 'creativity', label: 'Creativity', value: clamp(metadata.creativityFactuality, 5) },
        { key: 'roleplay', label: 'Roleplay', value: roleplayMode === 'roleplay' ? 8 : 3 }
    ];
    const dominantTraits = [...axes]
        .sort((left, right) => right.value - left.value)
        .slice(0, 2)
        .map((axis) => axis.label);
    return {
        shape: 'pentagon',
        axes,
        dominantTraits,
        summary: `${dominantTraits.join(' and ') || 'Balanced'} personality profile`
    };
}

function buildPublicAgentDto(listing, agent, entitlement = null, creator = null) {
    const metadata = parseJson(agent.metadata, {});
    return {
        id: listing.asset_id,
        name: agent.name || listing.title,
        tagline: agent.tagline || listing.summary || '',
        avatar_url: agent.avatar_url || '',
        tags: Array.isArray(agent.tags) ? agent.tags.slice(0, 12) : [],
        text_provider: agent.text_provider || '',
        text_provider_display: agent.text_provider_display || agent.textProviderDisplayName || agent.text_provider || '',
        text_model: agent.text_model || '',
        text_model_display: agent.text_model_display || agent.textModelDisplayName || agent.text_model || '',
        image_provider: agent.image_provider || '',
        image_provider_display: agent.image_provider_display || agent.imageProviderDisplayName || agent.image_provider || '',
        image_model: agent.image_model || '',
        image_model_display: agent.image_model_display || agent.imageModelDisplayName || agent.image_model || '',
        greeting_message: agent.greeting_message || '',
        response_format: agent.response_format || 'auto',
        formality: agent.formality ?? 5,
        verbosity: agent.verbosity ?? 5,
        roleplay_mode: metadata.roleplayMode || 'assistant',
        response_length: metadata.responseLength || 'medium',
        personalityProfile: buildPersonalityProfile(agent),
        creator,
        isSubscribed: !!entitlement && (
            entitlement.source === 'legacy_subscription'
            || !!entitlement.grant
            || !!entitlement.derivedGrant
        ),
        market: {
            listingId: listing.id,
            slug: listing.slug,
            status: listing.status,
            visibility: listing.visibility,
            reviewStatus: listing.activeRevision?.review_status || null
        }
    };
}

function buildPublicSkillDto(listing, skill, definition, creator = null, isInstalled = false) {
    const metadata = definition?.metadata && typeof definition.metadata === 'object' ? definition.metadata : {};
    const capabilities = Array.isArray(metadata.capabilities)
        ? metadata.capabilities.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
        : [];
    return {
        id: skill.id,
        slug: skill.slug,
        name: definition?.name || skill.name,
        description: definition?.description || skill.description || '',
        version: definition?.version || skill.version || '1.0.0',
        capabilities,
        creator,
        isInstalled: !!isInstalled,
        source: 'hub',
        market: {
            listingId: listing.id,
            listingSlug: listing.slug,
            status: listing.status,
            visibility: listing.visibility,
            reviewStatus: listing.activeRevision?.review_status || null
        }
    };
}

function getPublicAgentListings(userId) {
    const creatorCache = new Map();
    const listings = catalogService.listPublicListings({
        assetType: 'agent',
        limit: 100,
        currentUserId: userId || null
    });
    return listings.map((listing) => {
        const agent = hydrateAgentSnapshot(listing.activeRevision?.snapshot);
        if (!agent) return null;
        const entitlement = userId ? catalogEntitlementService.resolveAssetEntitlement({
            userId,
            assetType: 'agent',
            assetId: listing.asset_id,
            action: 'chat'
        }) : null;
        return buildPublicAgentDto(listing, agent, entitlement, sanitizeCreator(listing.owner_id, creatorCache));
    }).filter(Boolean);
}

function getPublicSkillListings(userId) {
    const creatorCache = new Map();
    const installedSkillIds = userId
        ? new Set((SkillInstallationRepository.listForUser(userId, { status: 'installed' }) || []).map((row) => String(row.skill_id)))
        : new Set();
    const listings = catalogService.listPublicListings({
        assetType: 'skill',
        limit: 100,
        currentUserId: userId || null
    });
    return listings.map((listing) => {
        const skill = SkillRepository.getById(listing.asset_id);
        if (!skill) return null;
        const definition = listing.activeRevision?.snapshot?.definition || skill.definition || {};
        return buildPublicSkillDto(
            listing,
            skill,
            definition,
            sanitizeCreator(listing.owner_id, creatorCache),
            installedSkillIds.has(String(skill.id))
        );
    }).filter(Boolean);
}

function getPublicAgentTagFacets(userId) {
    const counts = new Map();
    getPublicAgentListings(userId).forEach((agent) => {
        (agent.tags || []).forEach((tag) => {
            const name = String(tag?.name || tag || '').trim();
            if (!name) return;
            counts.set(name, (counts.get(name) || 0) + 1);
        });
    });
    return [...counts.entries()]
        .map(([name, agent_count]) => ({ name, agent_count }))
        .sort((left, right) => {
            if (right.agent_count !== left.agent_count) return right.agent_count - left.agent_count;
            return String(left.name).localeCompare(String(right.name));
        });
}

function getPublicSkillListingBySlug(slug, userId) {
    return catalogService.listPublicListings({
        assetType: 'skill',
        limit: 200,
        currentUserId: userId || null
    }).find((listing) => {
        const skill = SkillRepository.getById(listing.asset_id);
        return String(listing.slug || '').toLowerCase() === String(slug || '').toLowerCase()
            || String(skill?.slug || '').toLowerCase() === String(slug || '').toLowerCase();
    }) || null;
}

function getDefaultPlan(listing) {
    return listing?.plans?.find((plan) => plan.is_default) || listing?.plans?.[0] || null;
}

router.get('/agents', authenticateOptional, (req, res) => {
    try {
        res.json({ success: true, data: getPublicAgentListings(req.user?.id) });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.get('/agents/tags', authenticateOptional, (req, res) => {
    try {
        res.json({ success: true, data: getPublicAgentTagFacets(req.user?.id) });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.get('/agents/:agentId', authenticateOptional, (req, res) => {
    try {
        const agent = getPublicAgentListings(req.user?.id)
            .find((item) => String(item.id) === String(req.params.agentId));
        if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });
        res.json({ success: true, data: agent });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.get('/skills', authenticateOptional, (req, res) => {
    try {
        res.json({ success: true, data: getPublicSkillListings(req.user?.id) });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.get('/skills/:slug', authenticateOptional, (req, res) => {
    try {
        const listing = getPublicSkillListingBySlug(req.params.slug, req.user?.id);
        if (!listing) return res.status(404).json({ success: false, error: 'Skill not found' });
        const skill = getPublicSkillListings(req.user?.id)
            .find((item) => item.market?.listingId === listing.id || String(item.slug) === String(req.params.slug));
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });
        res.json({ success: true, data: skill });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.post('/agents/:agentId/subscribe', authenticate, (req, res) => {
    try {
        const entitlement = catalogEntitlementService.resolveAssetEntitlement({
            userId: req.user.id,
            assetType: 'agent',
            assetId: req.params.agentId,
            action: 'chat'
        });
        const listingAllowsSubscribe = entitlement.listing
            && entitlement.listing.visibility === 'public'
            && ['approved', 'published'].includes(String(entitlement.listing.status || '').toLowerCase());
        if (!listingAllowsSubscribe) {
            return res.status(403).json({ success: false, error: 'Agent not available to subscribe' });
        }
        const existingGrant = CatalogEntitlementRepository.findMatchingGrant({
            subjectType: 'user',
            subjectId: req.user.id,
            assetType: 'agent',
            assetId: req.params.agentId,
            listingId: entitlement.listing.id
        });
        if (!existingGrant) {
            const defaultPlan = getDefaultPlan(entitlement.listing);
            CatalogEntitlementRepository.createGrant({
                ownerType: 'user',
                ownerId: entitlement.listing.owner_id,
                listingId: entitlement.listing.id,
                revisionId: entitlement.revision?.id || entitlement.listing.current_approved_revision_id || entitlement.listing.current_revision_id,
                planId: defaultPlan?.id || null,
                assetType: 'agent',
                assetId: req.params.agentId,
                subjectType: 'user',
                subjectId: req.user.id,
                grantType: 'legacy_subscription',
                status: 'active',
                grantScope: 'direct',
                billingSubjectType: 'user',
                billingSubjectId: req.user.id,
                actorScope: 'end_user',
                featureGates: defaultPlan?.feature_gates || entitlement.featureGates,
                quotaLimits: defaultPlan?.quota_limits || {},
                metadata: { source: 'hub_subscribe_endpoint', acquiredFrom: 'hub' },
                createdBy: req.user.id
            });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.delete('/agents/:agentId/subscribe', authenticate, (req, res) => {
    try {
        const grants = CatalogEntitlementRepository.listGrantsForSubject('user', req.user.id, { status: 'active', assetType: 'agent' })
            .filter((grant) => String(grant.asset_id) === String(req.params.agentId) && grant.grant_type === 'legacy_subscription');
        grants.forEach((grant) => {
            CatalogEntitlementRepository.revokeGrant(grant.id, {
                status: 'revoked',
                metadata: { source: 'hub_unsubscribe_endpoint', revokedBy: req.user.id }
            });
        });
        res.json({ success: true });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: safeErrorMessage(err) });
    }
});

router.post('/skills/:slug/install', authenticate, (req, res) => {
    try {
        const listing = getPublicSkillListingBySlug(req.params.slug, req.user.id);
        if (!listing) return res.status(404).json({ success: false, error: 'Skill not found' });
        const skill = SkillRepository.getById(listing.asset_id);
        if (!skill) return res.status(404).json({ success: false, error: 'Skill not found' });

        let entitlement;
        try {
            entitlement = catalogEntitlementService.assertUserCanInstallSkill({
                userId: req.user.id,
                skillId: skill.id
            });
        } catch (err) {
            const listingAllowsInstall = listing.visibility === 'public'
                && ['approved', 'published'].includes(String(listing.status || '').toLowerCase());
            if (!listingAllowsInstall) throw err;

            const existingGrant = CatalogEntitlementRepository.findMatchingGrant({
                subjectType: 'user',
                subjectId: req.user.id,
                assetType: 'skill',
                assetId: skill.id,
                listingId: listing.id
            });
            if (!existingGrant) {
                const defaultPlan = getDefaultPlan(listing);
                CatalogEntitlementRepository.createGrant({
                    ownerType: 'user',
                    ownerId: listing.owner_id,
                    listingId: listing.id,
                    revisionId: listing.activeRevision?.id || listing.current_approved_revision_id || listing.current_revision_id || null,
                    planId: defaultPlan?.id || null,
                    assetType: 'skill',
                    assetId: skill.id,
                    subjectType: 'user',
                    subjectId: req.user.id,
                    grantType: 'manual',
                    status: 'active',
                    grantScope: 'direct',
                    billingSubjectType: 'user',
                    billingSubjectId: req.user.id,
                    actorScope: 'end_user',
                    featureGates: defaultPlan?.feature_gates || DEFAULT_FEATURE_GATES_BY_ASSET.skill,
                    quotaLimits: defaultPlan?.quota_limits || {},
                    metadata: { source: 'hub_install_endpoint', acquiredFrom: 'hub' },
                    createdBy: req.user.id
                });
            }
            entitlement = catalogEntitlementService.assertUserCanInstallSkill({
                userId: req.user.id,
                skillId: skill.id
            });
        }

        const installationId = `installed:${req.user.id}:${skill.slug}`;
        const installation = SkillInstallationRepository.upsertInstalled({
            id: installationId,
            userId: req.user.id,
            skillId: skill.id,
            listingId: listing.id,
            revisionId: listing.activeRevision?.id || listing.current_approved_revision_id || listing.current_revision_id || null,
            grantId: entitlement.grant?.id || null,
            status: 'installed',
            metadata: {
                source: 'hub_install',
                listingSlug: listing.slug
            }
        });

        const installedDir = SkillMaterializationService.getInstalledSkillDir(req.user.id, skill.slug);
        SkillMaterializationService.materializeSkillToPath(skill, installedDir);

        res.json({
            success: true,
            data: {
                id: installation.id,
                installationId: installation.id,
                skillId: skill.id,
                slug: skill.slug,
                name: skill.name,
                description: skill.description || '',
                version: skill.version || '1.0.0',
                source: 'installed',
                market: {
                    listingId: listing.id,
                    status: listing.status,
                    visibility: listing.visibility
                }
            }
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ success: false, error: safeErrorMessage(err) });
    }
});

module.exports = router;
