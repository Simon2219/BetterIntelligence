const express = require('express');
const router = express.Router();
const {
    RoleRepository,
    CatalogListingRepository,
    CatalogEntitlementRepository,
    AIAgentRepository,
    SkillRepository
} = require('../database');
const { authenticate } = require('../middleware/auth');
const catalogService = require('../services/catalogService');
const catalogEntitlementService = require('../services/catalogEntitlementService');
const { getBillingProvider } = require('../services/billing');
const { ASSET_TYPES } = require('../services/catalogConstants');
const { handleRouteError, badRequest, forbidden, notFound } = require('../utils/httpErrors');

function hasPermission(req, permission) {
    return RoleRepository.hasPermission(req.user?.role, permission);
}

function canManageListing(req, listing) {
    if (!listing) return false;
    if (String(listing.owner_id || '').toUpperCase() === String(req.user?.id || '').toUpperCase()) return true;
    return hasPermission(req, 'can_manage_marketplace');
}

function canModerate(req) {
    return hasPermission(req, 'can_moderate_marketplace');
}

function parseLimit(value, fallback = 50, max = 200) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
}

function getAssetSourceRoute(assetType, assetId) {
    if (assetType === ASSET_TYPES.AGENT) return `/agentBuilder/${assetId}`;
    if (assetType === ASSET_TYPES.SKILL) return '/skills';
    return `/agents?tab=listings`;
}

function buildListingPreview(listing) {
    if (!listing) return null;
    const latestReview = Array.isArray(listing.reviews) && listing.reviews.length ? listing.reviews[0] : null;
    const staleReasons = [
        !String(listing.summary || '').trim() ? 'Missing summary' : null,
        !(listing.plans || []).length ? 'Missing plan' : null,
        !listing.approvedRevision && String(listing.visibility || '').toLowerCase() === 'public' ? 'No approved revision' : null
    ].filter(Boolean);
    return {
        id: listing.id,
        title: listing.title,
        assetType: listing.asset_type,
        assetId: listing.asset_id,
        status: listing.status,
        visibility: listing.visibility,
        sourceRoute: getAssetSourceRoute(listing.asset_type, listing.asset_id),
        planSummary: (listing.plans || []).map((plan) => ({
            id: plan.id,
            code: plan.code,
            name: plan.name,
            isDefault: !!plan.is_default,
            featureGates: plan.feature_gates,
            quotaLimits: plan.quota_limits
        })),
        latestReview: latestReview ? {
            id: latestReview.id,
            decision: latestReview.decision || latestReview.action,
            reason: latestReview.reason || '',
            findings: latestReview.findings || [],
            timestamp: latestReview.created_at || null
        } : null,
        staleReasons,
        activeRevision: listing.activeRevision ? {
            id: listing.activeRevision.id,
            revisionNumber: listing.activeRevision.revision_number,
            reviewStatus: listing.activeRevision.review_status,
            submittedAt: listing.activeRevision.submitted_at || null
        } : null,
        approvedRevision: listing.approvedRevision ? {
            id: listing.approvedRevision.id,
            revisionNumber: listing.approvedRevision.revision_number,
            reviewStatus: listing.approvedRevision.review_status
        } : null
    };
}

function buildGrantLineage(grant) {
    if (!grant) return null;
    const parent = grant.parent_grant_id ? CatalogEntitlementRepository.getGrantById(grant.parent_grant_id) : null;
    const children = CatalogEntitlementRepository.listChildGrants(grant.id, { status: 'active' });
    return {
        scope: grant.grant_scope || 'direct',
        parentGrant: parent ? {
            id: parent.id,
            grantType: parent.grant_type,
            grantScope: parent.grant_scope || 'direct',
            subjectType: parent.subject_type,
            subjectId: parent.subject_id
        } : null,
        childGrantCount: children.length
    };
}

function listOwnedByAssetType(userId, assetType) {
    return catalogService.listOwnerListings(userId).filter((listing) => listing.asset_type === assetType);
}

function canManageAsset(req, assetType, assetId) {
    if (canModerate(req)) return true;
    if (assetType === ASSET_TYPES.AGENT) {
        const agent = AIAgentRepository.getById(assetId);
        return !!agent && String(agent.user_id || '').toUpperCase() === String(req.user?.id || '').toUpperCase();
    }
    if (assetType === ASSET_TYPES.SKILL) {
        const skill = SkillRepository.getById(assetId);
        return !!skill && String(skill.creator_id || '').toUpperCase() === String(req.user?.id || '').toUpperCase();
    }
    if (assetType === ASSET_TYPES.BUNDLE) {
        const listing = CatalogListingRepository.getByAsset(assetType, assetId) || CatalogListingRepository.getById(assetId);
        return !!listing && canManageListing(req, listing);
    }
    return false;
}

function validateGrantPayload(payload = {}) {
    const assetType = String(payload.assetType || '').trim().toLowerCase();
    if (!Object.values(ASSET_TYPES).includes(assetType)) {
        throw badRequest('assetType must be agent, skill, or bundle');
    }

    const subjectType = String(payload.subjectType || 'user').trim().toLowerCase();
    if (!['user', 'deployment', 'org'].includes(subjectType)) {
        throw badRequest('subjectType must be user, deployment, or org');
    }

    const grantScope = payload.grantScope ? String(payload.grantScope).trim().toLowerCase() : null;
    if (grantScope && !['direct', 'bundle_derived', 'deployment_budget', 'deployment_sponsor'].includes(grantScope)) {
        throw badRequest('grantScope is invalid');
    }
    if ((grantScope === 'deployment_budget' || grantScope === 'deployment_sponsor') && subjectType !== 'deployment') {
        throw badRequest('Deployment budget and sponsor grants must target a deployment subject');
    }
}

function registerAssetRoutes(pathName, assetType) {
    router.get(`/${pathName}`, authenticate, (req, res) => {
        try {
            res.json({ success: true, data: listOwnedByAssetType(req.user.id, assetType) });
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    router.post(`/${pathName}`, authenticate, (req, res) => {
        try {
            const data = catalogService.createListing({
                currentUserId: req.user.id,
                assetType,
                assetId: req.body?.assetId,
                title: req.body?.title,
                summary: req.body?.summary,
                description: req.body?.description,
                visibility: req.body?.visibility,
                tags: req.body?.tags,
                metadata: req.body?.metadata,
                plans: req.body?.plans,
                bundleItems: req.body?.bundleItems
            });
            res.status(201).json({ success: true, data });
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    router.patch(`/${pathName}/:listingId`, authenticate, (req, res) => {
        try {
            const listing = catalogService.getListingDetails(req.params.listingId, req.user.id);
            if (listing.asset_type !== assetType) throw notFound('Listing not found');
            if (!canManageListing(req, listing)) throw forbidden('Forbidden');
            const data = catalogService.updateListing({
                listingId: req.params.listingId,
                currentUserId: req.user.id,
                updates: req.body || {}
            });
            res.json({ success: true, data });
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    router.get(`/${pathName}/:listingId/revisions`, authenticate, (req, res) => {
        try {
            const listing = catalogService.getListingDetails(req.params.listingId, req.user.id);
            if (listing.asset_type !== assetType) throw notFound('Listing not found');
            if (!canManageListing(req, listing)) throw forbidden('Forbidden');
            res.json({ success: true, data: listing.revisions });
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    router.post(`/${pathName}/:listingId/revisions`, authenticate, (req, res) => {
        try {
            const listing = catalogService.getListingDetails(req.params.listingId, req.user.id);
            if (listing.asset_type !== assetType) throw notFound('Listing not found');
            if (!canManageListing(req, listing)) throw forbidden('Forbidden');
            const data = catalogService.createRevision({
                listingId: req.params.listingId,
                currentUserId: req.user.id,
                title: req.body?.title,
                summary: req.body?.summary,
                description: req.body?.description,
                submitNotes: req.body?.submitNotes,
                plans: req.body?.plans,
                bundleItems: req.body?.bundleItems
            });
            res.status(201).json({ success: true, data });
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    router.post(`/${pathName}/:listingId/submit`, authenticate, (req, res) => {
        try {
            const listing = catalogService.getListingDetails(req.params.listingId, req.user.id);
            if (listing.asset_type !== assetType) throw notFound('Listing not found');
            if (!canManageListing(req, listing)) throw forbidden('Forbidden');
            const data = catalogService.submitForReview({
                listingId: req.params.listingId,
                revisionId: req.body?.revisionId,
                currentUserId: req.user.id,
                submitNotes: req.body?.submitNotes
            });
            res.json({ success: true, data });
        } catch (err) {
            handleRouteError(res, err);
        }
    });
}

registerAssetRoutes('agents', ASSET_TYPES.AGENT);
registerAssetRoutes('skills', ASSET_TYPES.SKILL);
registerAssetRoutes('bundles', ASSET_TYPES.BUNDLE);

router.get('/listings/:listingId', authenticate, (req, res) => {
    try {
        const listing = catalogService.getListingDetails(req.params.listingId, req.user.id);
        if (!canManageListing(req, listing) && !canModerate(req)) throw forbidden('Forbidden');
        res.json({ success: true, data: buildListingPreview(listing) });
    } catch (err) {
        handleRouteError(res, err);
    }
});

router.get('/reviews', authenticate, (req, res) => {
    try {
        if (!canModerate(req)) throw forbidden('Forbidden');
        res.json({ success: true, data: catalogService.listModerationQueue() });
    } catch (err) {
        handleRouteError(res, err);
    }
});

router.patch('/reviews/:reviewId', authenticate, (req, res) => {
    try {
        if (!canModerate(req)) throw forbidden('Forbidden');
        const review = CatalogListingRepository.getReviewById(req.params.reviewId);
        if (!review) throw notFound('Review not found');
        const data = catalogService.moderateListing({
            listingId: review.listing_id,
            revisionId: review.revision_id,
            reviewerUserId: req.user.id,
            decision: req.body?.decision,
            reason: req.body?.reason,
            findings: req.body?.findings,
            publish: req.body?.publish === true
        });
        res.json({ success: true, data });
    } catch (err) {
        handleRouteError(res, err);
    }
});

router.get('/grants', authenticate, (req, res) => {
    try {
        const scope = String(req.query.scope || 'all').trim().toLowerCase();
        const subjectGrants = scope === 'owned'
            ? []
            : CatalogEntitlementRepository.listGrantsForSubject('user', req.user.id);
        const ownedGrants = scope === 'subject'
            ? []
            : CatalogEntitlementRepository.listGrantsByOwner('user', req.user.id);
        const inboundAccessRequests = scope === 'subject'
            ? []
            : CatalogEntitlementRepository.listAccessRequestsForOwner(req.user.id);
        const outboundAccessRequests = scope === 'owned'
            ? []
            : CatalogEntitlementRepository.listAccessRequestsForRequester(req.user.id);
        const decorateGrant = (grant) => {
            const listing = grant.listing_id ? catalogService.getListingDetails(grant.listing_id, req.user.id) : null;
            const usage = catalogEntitlementService.getGrantUsageSummary(grant.id, { days: parseLimit(req.query.days, 30, 365) });
            return {
                ...grant,
                lineage: buildGrantLineage(grant),
                billingSubject: {
                    type: grant.billing_subject_type || grant.subject_type || null,
                    id: grant.billing_subject_id || grant.subject_id || null
                },
                linkedListing: buildListingPreview(listing),
                linkedAsset: {
                    assetType: grant.asset_type,
                    assetId: grant.asset_id,
                    route: getAssetSourceRoute(grant.asset_type, grant.asset_id)
                },
                quota: usage?.quota || null,
                parentQuota: usage?.parentQuota || null
            };
        };
        const decorateRequest = (request) => {
            const listing = request.listing_id ? catalogService.getListingDetails(request.listing_id, req.user.id) : null;
            return {
                ...request,
                linkedListing: buildListingPreview(listing),
                linkedAsset: listing ? {
                    assetType: listing.asset_type,
                    assetId: listing.asset_id,
                    route: getAssetSourceRoute(listing.asset_type, listing.asset_id)
                } : null
            };
        };
        res.json({
            success: true,
            data: {
                subjectGrants: subjectGrants.map(decorateGrant),
                ownedGrants: ownedGrants.map(decorateGrant),
                inboundAccessRequests: inboundAccessRequests.map(decorateRequest),
                outboundAccessRequests: outboundAccessRequests.map(decorateRequest)
            }
        });
    } catch (err) {
        handleRouteError(res, err);
    }
});

router.post('/grants', authenticate, (req, res) => {
    try {
        validateGrantPayload(req.body || {});
        const listing = req.body?.listingId
            ? catalogService.getListingDetails(req.body.listingId, req.user.id)
            : null;
        if (listing && !canManageListing(req, listing)) throw forbidden('Forbidden');
        if (!listing && !canManageAsset(req, req.body?.assetType, req.body?.assetId)) throw forbidden('Forbidden');
        const defaultPlan = listing?.plans?.find((plan) => plan.is_default) || listing?.plans?.[0] || null;
        const parentGrant = req.body?.parentGrantId ? CatalogEntitlementRepository.getGrantById(req.body.parentGrantId) : null;
        if (req.body?.parentGrantId && !parentGrant) throw notFound('Parent grant not found');
        if (parentGrant) {
            if (String(parentGrant.asset_type || '') !== String(req.body?.assetType || listing?.asset_type || '')) {
                throw badRequest('Parent grant asset type must match child grant asset type');
            }
            if (String(parentGrant.asset_id || '') !== String(req.body?.assetId || listing?.asset_id || '')) {
                throw badRequest('Parent grant asset id must match child grant asset id');
            }
        }

        const grant = CatalogEntitlementRepository.createGrant({
            ownerType: 'user',
            ownerId: req.user.id,
            listingId: req.body?.listingId || null,
            revisionId: req.body?.revisionId || listing?.activeRevision?.id || null,
            planId: req.body?.planId || null,
            assetType: req.body?.assetType || listing?.asset_type,
            assetId: req.body?.assetId || listing?.asset_id,
            subjectType: req.body?.subjectType || 'user',
            subjectId: req.body?.subjectId,
            grantType: req.body?.grantType || 'manual',
            status: req.body?.status || 'active',
            featureGates: req.body?.featureGates || defaultPlan?.feature_gates || null,
            quotaLimits: req.body?.quotaLimits || defaultPlan?.quota_limits || null,
            periodKind: req.body?.periodKind || 'monthly',
            externalRef: req.body?.externalRef || '',
            startsAt: req.body?.startsAt || null,
            endsAt: req.body?.endsAt || null,
            parentGrantId: parentGrant?.id || null,
            grantScope: req.body?.grantScope || null,
            billingSubjectType: req.body?.billingSubjectType || parentGrant?.billing_subject_type || null,
            billingSubjectId: req.body?.billingSubjectId || parentGrant?.billing_subject_id || null,
            actorScope: req.body?.actorScope || '',
            rollsToLatestApproved: req.body?.rollsToLatestApproved !== false,
            metadata: req.body?.metadata || {},
            createdBy: req.user.id
        });
        res.status(201).json({ success: true, data: grant });
    } catch (err) {
        handleRouteError(res, err);
    }
});

router.delete('/grants/:grantId', authenticate, (req, res) => {
    try {
        const grant = CatalogEntitlementRepository.getGrantById(req.params.grantId);
        if (!grant) throw notFound('Grant not found');
        const listing = grant.listing_id ? catalogService.getListingDetails(grant.listing_id, req.user.id) : null;
        const canManage = canManageListing(req, listing) || String(grant.owner_id || '').toUpperCase() === String(req.user.id || '').toUpperCase();
        if (!canManage && !canModerate(req)) throw forbidden('Forbidden');
        const data = CatalogEntitlementRepository.revokeGrant(req.params.grantId, {
            status: req.body?.status || 'revoked',
            metadata: { revokedBy: req.user.id }
        });
        res.json({ success: true, data });
    } catch (err) {
        handleRouteError(res, err);
    }
});

router.get('/access-requests', authenticate, (req, res) => {
    try {
        const scope = String(req.query.scope || 'all').trim().toLowerCase();
        const inbound = scope === 'outbound' ? [] : CatalogEntitlementRepository.listAccessRequestsForOwner(req.user.id);
        const outbound = scope === 'inbound' ? [] : CatalogEntitlementRepository.listAccessRequestsForRequester(req.user.id);
        const decorateRequest = (request) => {
            const listing = request.listing_id ? catalogService.getListingDetails(request.listing_id, req.user.id) : null;
            return {
                ...request,
                linkedListing: buildListingPreview(listing),
                linkedAsset: listing ? {
                    assetType: listing.asset_type,
                    assetId: listing.asset_id,
                    route: getAssetSourceRoute(listing.asset_type, listing.asset_id)
                } : null
            };
        };
        res.json({
            success: true,
            data: {
                inbound: inbound.map(decorateRequest),
                outbound: outbound.map(decorateRequest)
            }
        });
    } catch (err) {
        handleRouteError(res, err);
    }
});

router.post('/access-requests', authenticate, (req, res) => {
    try {
        const listingId = String(req.body?.listingId || '').trim();
        if (!listingId) throw badRequest('listingId is required');
        const listing = catalogService.getListingDetails(listingId, req.user.id);
        const existing = CatalogEntitlementRepository.listAccessRequestsForRequester(req.user.id, { status: 'pending' })
            .find((request) => request.listing_id === listing.id);
        if (existing) throw badRequest('A pending request already exists for this listing');
        const data = CatalogEntitlementRepository.createAccessRequest({
            listingId: listing.id,
            revisionId: req.body?.revisionId || listing.activeRevision?.id || null,
            requesterUserId: req.user.id,
            requestedSubjectType: req.body?.requestedSubjectType || 'user',
            requestedSubjectId: req.body?.requestedSubjectId || req.user.id,
            planId: req.body?.planId || null,
            note: req.body?.note || ''
        });
        res.status(201).json({ success: true, data });
    } catch (err) {
        handleRouteError(res, err);
    }
});

router.post('/access-requests/:requestId/approve', authenticate, (req, res) => {
    try {
        const request = CatalogEntitlementRepository.getAccessRequestById(req.params.requestId);
        if (!request) throw notFound('Access request not found');
        const listing = catalogService.getListingDetails(request.listing_id, req.user.id);
        if (!canManageListing(req, listing) && !canModerate(req)) throw forbidden('Forbidden');
        const resolvedRequest = CatalogEntitlementRepository.resolveAccessRequest(request.id, {
            status: 'approved',
            decisionReason: req.body?.reason || '',
            resolvedBy: req.user.id
        });
        const grant = CatalogEntitlementRepository.createGrant({
            ownerType: 'user',
            ownerId: listing.owner_id,
            listingId: listing.id,
            revisionId: request.revision_id || listing.activeRevision?.id || null,
            planId: request.plan_id || req.body?.planId || null,
            assetType: listing.asset_type,
            assetId: listing.asset_id,
            subjectType: request.requested_subject_type,
            subjectId: request.requested_subject_id || request.requester_user_id,
            grantType: 'access_request',
            status: 'active',
            grantScope: 'direct',
            billingSubjectType: request.requested_subject_type,
            billingSubjectId: request.requested_subject_id || request.requester_user_id,
            actorScope: 'end_user',
            featureGates: req.body?.featureGates || listing.plans?.find((plan) => plan.is_default)?.feature_gates || null,
            quotaLimits: req.body?.quotaLimits || listing.plans?.find((plan) => plan.is_default)?.quota_limits || null,
            metadata: { accessRequestId: request.id },
            createdBy: req.user.id
        });
        res.json({ success: true, data: { request: resolvedRequest, grant } });
    } catch (err) {
        handleRouteError(res, err);
    }
});

router.post('/access-requests/:requestId/reject', authenticate, (req, res) => {
    try {
        const request = CatalogEntitlementRepository.getAccessRequestById(req.params.requestId);
        if (!request) throw notFound('Access request not found');
        const listing = catalogService.getListingDetails(request.listing_id, req.user.id);
        if (!canManageListing(req, listing) && !canModerate(req)) throw forbidden('Forbidden');
        const data = CatalogEntitlementRepository.resolveAccessRequest(request.id, {
            status: 'rejected',
            decisionReason: req.body?.reason || '',
            resolvedBy: req.user.id
        });
        res.json({ success: true, data });
    } catch (err) {
        handleRouteError(res, err);
    }
});

router.get('/entitlements/resolve', authenticate, (req, res) => {
    try {
        const assetType = String(req.query.assetType || '').trim().toLowerCase();
        const assetId = String(req.query.assetId || '').trim();
        if (!assetType || !assetId) throw badRequest('assetType and assetId are required');
        const data = catalogEntitlementService.resolveAssetEntitlement({
            userId: req.user.id,
            subjectType: String(req.query.subjectType || 'user').trim().toLowerCase(),
            subjectId: req.query.subjectId ? String(req.query.subjectId) : req.user.id,
            assetType,
            assetId,
            action: req.query.action ? String(req.query.action).trim().toLowerCase() : null
        });
        res.json({ success: true, data });
    } catch (err) {
        handleRouteError(res, err);
    }
});

router.get('/grants/:grantId/usage', authenticate, (req, res) => {
    try {
        const grant = CatalogEntitlementRepository.getGrantById(req.params.grantId);
        if (!grant) throw notFound('Grant not found');
        const listing = grant.listing_id ? catalogService.getListingDetails(grant.listing_id, req.user.id) : null;
        const canManage = canManageListing(req, listing) || String(grant.owner_id || '').toUpperCase() === String(req.user.id || '').toUpperCase();
        if (!canManage && !canModerate(req)) throw forbidden('Forbidden');
        const data = catalogEntitlementService.getGrantUsageSummary(grant.id, {
            days: parseLimit(req.query.days, 30, 365),
            limit: parseLimit(req.query.limit, 50, 250)
        });
        res.json({ success: true, data });
    } catch (err) {
        handleRouteError(res, err);
    }
});

router.get('/assets/:assetType/:assetId/usage-attribution', authenticate, (req, res) => {
    try {
        const assetType = String(req.params.assetType || '').trim().toLowerCase();
        const assetId = String(req.params.assetId || '').trim();
        if (!assetType || !assetId) throw badRequest('assetType and assetId are required');
        const listing = catalogService.getListingDetailsByAsset(assetType, assetId, req.user.id);
        if (listing) {
            if (!canManageListing(req, listing) && !canModerate(req)) throw forbidden('Forbidden');
        } else if (!canManageAsset(req, assetType, assetId)) {
            throw forbidden('Forbidden');
        }
        const data = catalogEntitlementService.getAssetUsageAttribution(assetType, assetId, {
            days: parseLimit(req.query.days, 30, 365),
            limit: parseLimit(req.query.limit, 100, 300)
        });
        res.json({ success: true, data });
    } catch (err) {
        handleRouteError(res, err);
    }
});

router.get('/billing/provider', authenticate, (req, res) => {
    try {
        const provider = getBillingProvider();
        res.json({ success: true, data: { name: provider.getName() } });
    } catch (err) {
        handleRouteError(res, err);
    }
});

module.exports = router;
