const {
    AIAgentRepository,
    SkillRepository,
    TagRepository,
    CatalogListingRepository
} = require('../database');
const notificationService = require('./notificationService');
const {
    LISTING_STATUS,
    REVIEW_STATUS,
    VISIBILITY,
    ASSET_TYPES,
    DEFAULT_FEATURE_GATES_BY_ASSET
} = require('./catalogConstants');
const { badRequest, forbidden, notFound, conflict } = require('../utils/httpErrors');

function parseJson(value, fallback) {
    try {
        return JSON.parse(value || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

function slugify(value, fallback = 'listing') {
    const base = String(value || fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return base || fallback;
}

function nextSlug(seed) {
    const base = slugify(seed, 'listing');
    let slug = base;
    let counter = 1;
    while (CatalogListingRepository.getBySlug(slug)) {
        counter += 1;
        slug = `${base}-${counter}`;
    }
    return slug;
}

function normalizeTags(tags) {
    if (!Array.isArray(tags)) return [];
    return [...new Set(tags.map((tag) => String(tag || '').trim()).filter(Boolean))].slice(0, 24);
}

function normalizeFeatureGates(assetType, featureGates = {}) {
    return {
        ...DEFAULT_FEATURE_GATES_BY_ASSET[assetType],
        ...(featureGates && typeof featureGates === 'object' ? featureGates : {})
    };
}

function normalizeQuotaLimits(quotaLimits = {}) {
    const normalized = {};
    Object.entries(quotaLimits || {}).forEach(([key, value]) => {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed >= 0) normalized[key] = parsed;
    });
    return normalized;
}

function normalizePlans(assetType, plans = []) {
    const source = Array.isArray(plans) && plans.length ? plans : [{
        code: 'default',
        name: 'Default Access',
        description: 'Manual access plan',
        billingMode: 'manual',
        featureGates: DEFAULT_FEATURE_GATES_BY_ASSET[assetType],
        quotaLimits: {},
        isDefault: true,
        isActive: true
    }];
    return source.map((plan, index) => ({
        id: plan.id || null,
        code: slugify(plan.code || plan.name || `plan-${index + 1}`, `plan-${index + 1}`),
        name: String(plan.name || `Plan ${index + 1}`).trim(),
        description: String(plan.description || '').trim(),
        billingMode: String(plan.billingMode || 'manual').trim().toLowerCase() || 'manual',
        priceCents: parseInt(plan.priceCents, 10) || 0,
        currency: String(plan.currency || 'usd').trim().toLowerCase() || 'usd',
        interval: String(plan.interval || 'month').trim().toLowerCase() || 'month',
        externalPriceRef: String(plan.externalPriceRef || '').trim(),
        featureGates: normalizeFeatureGates(assetType, plan.featureGates),
        quotaLimits: normalizeQuotaLimits(plan.quotaLimits),
        isDefault: index === 0 ? true : !!plan.isDefault,
        isActive: plan.isActive !== false
    }));
}

function requireOwnerMatches(ownerUserId, currentUserId) {
    if (!ownerUserId || String(ownerUserId).toUpperCase() !== String(currentUserId || '').toUpperCase()) {
        throw forbidden('Forbidden');
    }
}

function getSkillDefinition(skill) {
    if (!skill) return {};
    const definition = skill.definition_json || skill.definition || {};
    return {
        name: skill.name || definition.name || skill.slug || '',
        description: skill.description || definition.description || '',
        version: skill.version || definition.version || '1.0.0',
        instructions: skill.instructions_text || definition.instructions || '',
        metadata: skill.metadata_json || skill.metadata || definition.metadata || {}
    };
}

function getAssetOwner(assetType, assetId) {
    if (assetType === ASSET_TYPES.AGENT) {
        const agent = AIAgentRepository.getById(assetId);
        if (!agent) throw notFound('Agent not found');
        return { ownerUserId: agent.user_id, asset: agent };
    }
    if (assetType === ASSET_TYPES.SKILL) {
        const skill = SkillRepository.getById(assetId);
        if (!skill) throw notFound('Skill not found');
        return { ownerUserId: skill.creator_id, asset: skill };
    }
    if (assetType === ASSET_TYPES.BUNDLE) {
        return { ownerUserId: null, asset: null };
    }
    throw badRequest('Unsupported asset type');
}

function buildAgentSnapshot(agent) {
    return {
        ...agent,
        skillIds: SkillRepository.getAgentSkillIds(agent.id),
        tags: TagRepository.getAgentTagIds(agent.id)
            .map((tagId) => TagRepository.getById(tagId))
            .filter(Boolean)
            .map((tag) => ({ id: tag.id, name: tag.name }))
    };
}

function buildSkillSnapshot(skill) {
    return {
        ...skill,
        definition: getSkillDefinition(skill)
    };
}

function buildBundleSnapshot(items = [], creatorUserId) {
    return {
        type: ASSET_TYPES.BUNDLE,
        creatorUserId,
        items: items.map((item) => ({
            itemType: item.itemType,
            itemId: item.itemId,
            itemRevisionId: item.itemRevisionId || null,
            metadata: item.metadata || {}
        }))
    };
}

function normalizeBundleItems(items = [], currentUserId) {
    if (!Array.isArray(items) || !items.length) return [];
    return items.map((item) => {
        const itemType = String(item.itemType || item.type || '').trim().toLowerCase();
        const itemId = String(item.itemId || item.id || '').trim();
        if (!itemType || !itemId) throw badRequest('Bundle items require itemType and itemId');
        if (![ASSET_TYPES.AGENT, ASSET_TYPES.SKILL].includes(itemType)) {
            throw badRequest('Bundle items must be agents or skills');
        }
        const { ownerUserId } = getAssetOwner(itemType, itemId);
        requireOwnerMatches(ownerUserId, currentUserId);
        return {
            itemType,
            itemId,
            itemRevisionId: item.itemRevisionId || null,
            metadata: item.metadata || {}
        };
    });
}

function buildSnapshot(assetType, assetId, currentUserId, bundleItems = []) {
    if (assetType === ASSET_TYPES.AGENT) {
        const { ownerUserId, asset } = getAssetOwner(assetType, assetId);
        requireOwnerMatches(ownerUserId, currentUserId);
        return buildAgentSnapshot(asset);
    }
    if (assetType === ASSET_TYPES.SKILL) {
        const { ownerUserId, asset } = getAssetOwner(assetType, assetId);
        requireOwnerMatches(ownerUserId, currentUserId);
        return buildSkillSnapshot(asset);
    }
    if (assetType === ASSET_TYPES.BUNDLE) {
        return buildBundleSnapshot(bundleItems, currentUserId);
    }
    throw badRequest('Unsupported asset type');
}

function runPolicyChecks({ listing, revision, snapshot }) {
    const findings = [];
    const title = String(revision?.title || listing?.title || '').trim();
    const summary = String(revision?.summary || listing?.summary || '').trim();

    if (!title) findings.push({ severity: 'error', code: 'missing_title', message: 'Listing title is required.' });
    if (!summary) findings.push({ severity: 'warning', code: 'missing_summary', message: 'Listing summary is recommended before review.' });

    if (listing?.asset_type === ASSET_TYPES.AGENT) {
        const agent = snapshot || {};
        if (!agent.text_provider || !agent.text_model) {
            findings.push({ severity: 'error', code: 'missing_text_model', message: 'Agent requires a configured text provider and model.' });
        }
        if (agent.is_active === false) {
            findings.push({ severity: 'warning', code: 'agent_inactive', message: 'Inactive agents can be listed but will show degraded availability.' });
        }
    }

    if (listing?.asset_type === ASSET_TYPES.SKILL) {
        const definition = snapshot?.definition || {};
        if (!definition.name && !snapshot?.name) {
            findings.push({ severity: 'error', code: 'missing_skill_manifest', message: 'Skill manifest is incomplete.' });
        }
    }

    if (listing?.asset_type === ASSET_TYPES.BUNDLE) {
        if (!Array.isArray(snapshot?.items) || !snapshot.items.length) {
            findings.push({ severity: 'error', code: 'bundle_empty', message: 'Bundles require at least one agent or skill.' });
        }
    }

    return {
        findings,
        blocking: findings.some((item) => item.severity === 'error')
    };
}

function decorateListing(listing, currentUserId = null) {
    if (!listing) return null;
    const revisions = CatalogListingRepository.listRevisions(listing.id);
    const currentRevision = listing.current_revision_id ? CatalogListingRepository.getRevisionById(listing.current_revision_id) : null;
    const approvedRevision = listing.current_approved_revision_id ? CatalogListingRepository.getRevisionById(listing.current_approved_revision_id) : null;
    const activeRevision = approvedRevision || currentRevision || revisions[0] || null;
    const plans = CatalogListingRepository.listPlanTiers(listing.id, activeRevision?.id || null);
    const bundleItems = activeRevision ? CatalogListingRepository.listBundleItems(listing.id, activeRevision.id) : [];
    const reviews = CatalogListingRepository.listReviews(listing.id);
    return {
        ...listing,
        isOwner: !!currentUserId && String(listing.owner_id || '').toUpperCase() === String(currentUserId).toUpperCase(),
        currentRevision,
        approvedRevision,
        activeRevision,
        revisions,
        plans,
        bundleItems,
        reviews
    };
}

const catalogService = {
    getListingDetails(listingId, currentUserId = null) {
        const listing = CatalogListingRepository.getById(listingId);
        if (!listing) throw notFound('Listing not found');
        return decorateListing(listing, currentUserId);
    },

    getListingDetailsByAsset(assetType, assetId, currentUserId = null) {
        const listing = CatalogListingRepository.getByAsset(assetType, assetId);
        if (!listing) return null;
        return decorateListing(listing, currentUserId);
    },

    listOwnerListings(userId) {
        return CatalogListingRepository.listByOwner('user', userId).map((listing) => decorateListing(listing, userId));
    },

    listPublicListings({ assetType, q, limit, currentUserId = null } = {}) {
        return CatalogListingRepository.listPublic({ assetType, q, limit }).map((listing) => decorateListing(listing, currentUserId));
    },

    createListing({ currentUserId, assetType, assetId, title, summary, description, visibility, tags, metadata, plans, bundleItems } = {}) {
        const normalizedAssetType = String(assetType || '').trim().toLowerCase();
        if (![ASSET_TYPES.AGENT, ASSET_TYPES.SKILL, ASSET_TYPES.BUNDLE].includes(normalizedAssetType)) {
            throw badRequest('assetType must be agent, skill, or bundle');
        }

        if (normalizedAssetType !== ASSET_TYPES.BUNDLE) {
            const existing = CatalogListingRepository.getByAsset(normalizedAssetType, assetId);
            if (existing) throw conflict('A listing already exists for this asset');
        }

        let normalizedBundleItems = [];
        let normalizedAssetId = String(assetId || '').trim();
        if (normalizedAssetType === ASSET_TYPES.BUNDLE) {
            normalizedBundleItems = normalizeBundleItems(bundleItems, currentUserId);
            normalizedAssetId = '';
        } else {
            const { ownerUserId } = getAssetOwner(normalizedAssetType, normalizedAssetId);
            requireOwnerMatches(ownerUserId, currentUserId);
        }

        const listingSeedTitle = title || normalizedAssetId || normalizedAssetType;
        const listingId = undefined;
        const created = CatalogListingRepository.create({
            id: listingId,
            ownerType: 'user',
            ownerId: currentUserId,
            assetType: normalizedAssetType,
            assetId: normalizedAssetType === ASSET_TYPES.BUNDLE ? '' : normalizedAssetId,
            slug: nextSlug(listingSeedTitle),
            title: String(title || '').trim() || `Untitled ${normalizedAssetType}`,
            summary: String(summary || '').trim(),
            description: String(description || '').trim(),
            visibility: visibility || VISIBILITY.PRIVATE,
            status: LISTING_STATUS.DRAFT,
            tags: normalizeTags(tags),
            metadata: metadata || {}
        });

        if (normalizedAssetType === ASSET_TYPES.BUNDLE) {
            CatalogListingRepository.update(created.id, { assetId: created.id });
        }

        const snapshot = buildSnapshot(normalizedAssetType, normalizedAssetType === ASSET_TYPES.BUNDLE ? created.id : normalizedAssetId, currentUserId, normalizedBundleItems);
        const revision = CatalogListingRepository.createRevision({
            listingId: created.id,
            title: created.title,
            summary: created.summary,
            description: created.description,
            snapshot,
            safetyMetadata: { checks: [] },
            reviewStatus: REVIEW_STATUS.DRAFT,
            createdBy: currentUserId
        });
        CatalogListingRepository.update(created.id, { currentRevisionId: revision.id, assetId: normalizedAssetType === ASSET_TYPES.BUNDLE ? created.id : normalizedAssetId });
        CatalogListingRepository.replacePlanTiers(created.id, revision.id, normalizePlans(normalizedAssetType, plans));
        if (normalizedAssetType === ASSET_TYPES.BUNDLE) {
            CatalogListingRepository.replaceBundleItems(created.id, revision.id, normalizedBundleItems);
        }
        CatalogListingRepository.createAuditLog({
            actorUserId: currentUserId,
            entityType: 'listing',
            entityId: created.id,
            action: 'listing.created',
            afterState: { assetType: normalizedAssetType, assetId: normalizedAssetId || created.id }
        });
        return this.getListingDetails(created.id, currentUserId);
    },

    updateListing({ listingId, currentUserId, updates = {} } = {}) {
        const listing = CatalogListingRepository.getById(listingId);
        if (!listing) throw notFound('Listing not found');
        requireOwnerMatches(listing.owner_id, currentUserId);

        const before = listing;
        const updated = CatalogListingRepository.update(listing.id, {
            title: updates.title !== undefined ? String(updates.title || '').trim() : undefined,
            summary: updates.summary !== undefined ? String(updates.summary || '').trim() : undefined,
            description: updates.description !== undefined ? String(updates.description || '').trim() : undefined,
            visibility: updates.visibility,
            status: updates.status,
            tags: updates.tags !== undefined ? normalizeTags(updates.tags) : undefined,
            metadata: updates.metadata
        });
        CatalogListingRepository.createAuditLog({
            actorUserId: currentUserId,
            entityType: 'listing',
            entityId: listing.id,
            action: 'listing.updated',
            beforeState: before,
            afterState: updated
        });
        return this.getListingDetails(updated.id, currentUserId);
    },

    createRevision({ listingId, currentUserId, title, summary, description, submitNotes, plans, bundleItems } = {}) {
        const listing = CatalogListingRepository.getById(listingId);
        if (!listing) throw notFound('Listing not found');
        requireOwnerMatches(listing.owner_id, currentUserId);

        const normalizedBundleItems = listing.asset_type === ASSET_TYPES.BUNDLE
            ? normalizeBundleItems(bundleItems || CatalogListingRepository.listBundleItems(listing.id, listing.current_revision_id).map((item) => ({
                itemType: item.item_type,
                itemId: item.item_id,
                itemRevisionId: item.item_revision_id,
                metadata: item.metadata
            })), currentUserId)
            : [];
        const assetId = listing.asset_type === ASSET_TYPES.BUNDLE ? listing.asset_id : listing.asset_id;
        const snapshot = buildSnapshot(listing.asset_type, assetId, currentUserId, normalizedBundleItems);
        const revision = CatalogListingRepository.createRevision({
            listingId: listing.id,
            title: title !== undefined ? String(title || '').trim() : listing.title,
            summary: summary !== undefined ? String(summary || '').trim() : listing.summary,
            description: description !== undefined ? String(description || '').trim() : listing.description,
            snapshot,
            safetyMetadata: { checks: [] },
            submitNotes: String(submitNotes || '').trim(),
            reviewStatus: REVIEW_STATUS.DRAFT,
            createdBy: currentUserId
        });
        CatalogListingRepository.update(listing.id, { currentRevisionId: revision.id });
        CatalogListingRepository.replacePlanTiers(listing.id, revision.id, normalizePlans(listing.asset_type, plans));
        if (listing.asset_type === ASSET_TYPES.BUNDLE) {
            CatalogListingRepository.replaceBundleItems(listing.id, revision.id, normalizedBundleItems);
        }
        CatalogListingRepository.createAuditLog({
            actorUserId: currentUserId,
            entityType: 'revision',
            entityId: revision.id,
            action: 'revision.created',
            afterState: revision,
            metadata: { listingId: listing.id }
        });
        return this.getListingDetails(listing.id, currentUserId);
    },

    submitForReview({ listingId, revisionId, currentUserId, submitNotes } = {}) {
        const listing = CatalogListingRepository.getById(listingId);
        if (!listing) throw notFound('Listing not found');
        requireOwnerMatches(listing.owner_id, currentUserId);

        const targetRevision = revisionId
            ? CatalogListingRepository.getRevisionById(revisionId)
            : (listing.current_revision_id ? CatalogListingRepository.getRevisionById(listing.current_revision_id) : null);
        if (!targetRevision || targetRevision.listing_id !== listing.id) {
            throw badRequest('Revision not found');
        }

        const checks = runPolicyChecks({
            listing,
            revision: targetRevision,
            snapshot: targetRevision.snapshot
        });
        CatalogListingRepository.updateRevision(targetRevision.id, {
            submitNotes: submitNotes !== undefined ? String(submitNotes || '').trim() : targetRevision.submit_notes,
            reviewStatus: REVIEW_STATUS.PENDING,
            submittedAt: new Date().toISOString(),
            safetyMetadata: {
                ...(targetRevision.safety_metadata || {}),
                checks: checks.findings
            },
            policyVersion: 'catalog-v1'
        });
        CatalogListingRepository.update(listing.id, {
            status: LISTING_STATUS.PENDING_REVIEW,
            currentRevisionId: targetRevision.id
        });
        CatalogListingRepository.createReview({
            listingId: listing.id,
            revisionId: targetRevision.id,
            action: 'submit',
            decision: 'pending_review',
            reason: 'Submitted for catalog review',
            findings: checks.findings,
            policyVersion: 'catalog-v1'
        });
        notificationService.createNotification({
            userId: currentUserId,
            type: 'catalog_review',
            title: 'Listing submitted for review',
            body: listing.title,
            severity: checks.blocking ? 'warning' : 'info',
            meta: { listingId: listing.id, revisionId: targetRevision.id }
        });
        return this.getListingDetails(listing.id, currentUserId);
    },

    moderateListing({ listingId, revisionId, reviewerUserId, decision, reason, findings, publish = false } = {}) {
        const listing = CatalogListingRepository.getById(listingId);
        if (!listing) throw notFound('Listing not found');
        const targetRevision = revisionId
            ? CatalogListingRepository.getRevisionById(revisionId)
            : (listing.current_revision_id ? CatalogListingRepository.getRevisionById(listing.current_revision_id) : null);
        if (!targetRevision || targetRevision.listing_id !== listing.id) throw badRequest('Revision not found');

        const normalizedDecision = String(decision || '').trim().toLowerCase();
        if (!['approved', 'rejected', 'suspended'].includes(normalizedDecision)) {
            throw badRequest('decision must be approved, rejected, or suspended');
        }

        const nextStatus = normalizedDecision === 'approved'
            ? (publish || listing.visibility === VISIBILITY.PUBLIC ? LISTING_STATUS.PUBLISHED : LISTING_STATUS.APPROVED)
            : normalizedDecision === 'rejected'
                ? LISTING_STATUS.REJECTED
                : LISTING_STATUS.SUSPENDED;

        CatalogListingRepository.updateRevision(targetRevision.id, {
            reviewStatus: normalizedDecision,
            reviewedAt: new Date().toISOString(),
            policyVersion: 'catalog-v1',
            safetyMetadata: {
                ...(targetRevision.safety_metadata || {}),
                checks: Array.isArray(findings) ? findings : (targetRevision.safety_metadata?.checks || [])
            }
        });
        CatalogListingRepository.update(listing.id, {
            status: nextStatus,
            currentRevisionId: targetRevision.id,
            currentApprovedRevisionId: normalizedDecision === 'approved' ? targetRevision.id : listing.current_approved_revision_id
        });
        CatalogListingRepository.createReview({
            listingId: listing.id,
            revisionId: targetRevision.id,
            reviewerUserId,
            action: 'moderate',
            decision: normalizedDecision,
            reason: reason || '',
            findings: Array.isArray(findings) ? findings : [],
            policyVersion: 'catalog-v1'
        });
        notificationService.createNotification({
            userId: listing.owner_id,
            type: 'catalog_review',
            title: `Listing ${normalizedDecision}`,
            body: listing.title,
            severity: normalizedDecision === 'approved' ? 'success' : (normalizedDecision === 'rejected' ? 'warning' : 'error'),
            meta: { listingId: listing.id, revisionId: targetRevision.id, reason: reason || '' }
        });
        return this.getListingDetails(listing.id, listing.owner_id);
    },

    listModerationQueue() {
        return CatalogListingRepository.listPendingReviewQueue().map((entry) => decorateListing(entry.listing));
    },

    runPolicyChecks,
    decorateListing,
    normalizePlans,
    normalizeBundleItems,
    buildSnapshot,
    parseJson
};

module.exports = catalogService;
