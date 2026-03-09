const {
    AIAgentRepository,
    AIModelRepository,
    SkillRepository,
    DeploymentMemberRepository,
    DeploymentRepository,
    CatalogListingRepository,
    CatalogEntitlementRepository,
    DeploymentAccessPolicyRepository,
    UsageAttributionRepository
} = require('../database');
const {
    ASSET_TYPES,
    SUBJECT_TYPES,
    GRANT_STATUS,
    GRANT_SCOPES,
    DEPLOYMENT_ACCESS_MODE,
    DEFAULT_FEATURE_GATES_BY_ASSET,
    ACTION_TO_GATE,
    USAGE_ATTRIBUTION_LEG_TYPES
} = require('./catalogConstants');
const { hydrateAgentModelAvailability } = require('../ai/services/agentAvailabilityService');
const { forbidden, notFound, unauthorized } = require('../utils/httpErrors');
const notificationService = require('./notificationService');

function parseJsonValue(value, fallback) {
    if (typeof value !== 'string') return value ?? fallback;
    try {
        return JSON.parse(value || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

function getCurrentPeriodKey(now = new Date()) {
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function toUpper(value) {
    return String(value || '').trim().toUpperCase();
}

function isOwner(userId, ownerId) {
    return !!ownerId && toUpper(ownerId) === toUpper(userId);
}

function normalizeAgentSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    return {
        ...snapshot,
        personality: parseJsonValue(snapshot.personality, {}),
        behavior_rules: parseJsonValue(snapshot.behavior_rules, {}),
        sample_dialogues: parseJsonValue(snapshot.sample_dialogues, []),
        stop_sequences: parseJsonValue(snapshot.stop_sequences, []),
        metadata: parseJsonValue(snapshot.metadata, {}),
        is_active: snapshot.is_active === false ? false : snapshot.is_active !== 0
    };
}

function normalizeGrantFeatureGates(assetType, source = {}) {
    return {
        ...DEFAULT_FEATURE_GATES_BY_ASSET[assetType],
        ...(source || {})
    };
}

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function estimateUsageCost({ providerName, modelId, promptTokens = 0, completionTokens = 0, requests = 1 } = {}) {
    if (!providerName || !modelId) return 0;
    const model = AIModelRepository.getByProviderAndModel(providerName, modelId);
    const metadata = parseJsonValue(model?.metadata, {});
    const promptRate = toNumber(metadata?.promptTokenCostUsd);
    const completionRate = toNumber(metadata?.completionTokenCostUsd);
    const imageRate = toNumber(metadata?.imageRequestCostUsd);
    return Number((
        (toNumber(promptTokens) * promptRate)
        + (toNumber(completionTokens) * completionRate)
        + (toNumber(requests) * imageRate)
    ).toFixed(6));
}

function getAssetOwnerInfo(assetType, assetId) {
    if (assetType === ASSET_TYPES.AGENT) {
        const agent = AIAgentRepository.getById(assetId);
        return agent ? { ownerId: agent.user_id, asset: agent } : { ownerId: null, asset: null };
    }
    if (assetType === ASSET_TYPES.SKILL) {
        const skill = SkillRepository.getById(assetId);
        return skill ? { ownerId: skill.creator_id, asset: skill } : { ownerId: null, asset: null };
    }
    if (assetType === ASSET_TYPES.BUNDLE) {
        const listing = CatalogListingRepository.getByAsset(assetType, assetId) || CatalogListingRepository.getById(assetId);
        return listing ? { ownerId: listing.owner_id, asset: listing } : { ownerId: null, asset: null };
    }
    return { ownerId: null, asset: null };
}

function resolveQuotaSnapshot(grant) {
    const quotaLimits = grant?.quota_limits || {};
    const periodKey = getCurrentPeriodKey();
    const counters = grant?.id ? CatalogEntitlementRepository.listUsageCounters(grant.id, periodKey) : [];
    const usageMap = {};
    counters.forEach((counter) => {
        usageMap[counter.metric_key] = Number(counter.usage_value || 0);
    });

    const metrics = {};
    Object.entries(quotaLimits).forEach(([metric, limit]) => {
        const numericLimit = parseInt(limit, 10);
        if (!Number.isFinite(numericLimit) || numericLimit <= 0) return;
        const used = Number(usageMap[metric] || 0);
        const remaining = Math.max(0, numericLimit - used);
        metrics[metric] = {
            limit: numericLimit,
            used,
            remaining,
            exhausted: remaining <= 0,
            percentUsed: numericLimit > 0 ? Math.min(100, Math.round((used / numericLimit) * 100)) : 0
        };
    });
    return {
        periodKey,
        metrics
    };
}

function metricForAction(action) {
    if (action === 'chat') return 'monthly_invocations';
    if (action === 'deploy') return 'monthly_deployments';
    return null;
}

function quotaAllows(grant, action) {
    const metricKey = metricForAction(action);
    const snapshot = resolveQuotaSnapshot(grant);
    if (!metricKey || !snapshot.metrics[metricKey]) {
        return { allowed: true, quota: snapshot };
    }
    return {
        allowed: !snapshot.metrics[metricKey].exhausted,
        quota: snapshot
    };
}

function quotaAllowsChain(grant, action) {
    const lineage = getGrantLineage(grant);
    const checks = lineage.map((item) => ({
        grant: item,
        ...quotaAllows(item, action)
    }));
    const blocked = checks.find((check) => !check.allowed);
    return {
        allowed: !blocked,
        quota: checks[0]?.quota || { periodKey: getCurrentPeriodKey(), metrics: {} },
        parentQuota: checks[1]?.quota || null,
        chain: checks
    };
}

function buildResolvedEntitlement({
    allowed = false,
    reason = null,
    source = 'none',
    assetType,
    assetId,
    owner = false,
    listing = null,
    grant = null,
    parentGrant = null,
    derivedGrant = null,
    featureGates = null,
    quota = null,
    parentQuota = null,
    revision = null,
    subjectType = SUBJECT_TYPES.USER,
    subjectId = null,
    grantScope = null,
    billingSubject = null
} = {}) {
    return {
        allowed,
        reason,
        source,
        owner,
        assetType,
        assetId,
        subjectType,
        subjectId,
        listing,
        revision,
        grant,
        parentGrant,
        derivedGrant,
        grantScope: grantScope || getGrantScope(grant),
        billingSubject: billingSubject || resolveBillingSubject(grant, { subjectType, subjectId }),
        featureGates: featureGates || normalizeGrantFeatureGates(assetType, grant?.feature_gates),
        quota: quota || (grant ? resolveQuotaSnapshot(grant) : { periodKey: getCurrentPeriodKey(), metrics: {} }),
        parentQuota
    };
}

function getListingAndRevision(assetType, assetId) {
        const listing = CatalogListingRepository.getByAsset(assetType, assetId) || (assetType === ASSET_TYPES.BUNDLE ? CatalogListingRepository.getById(assetId) : null);
    if (!listing) return { listing: null, revision: null };
    const revisionId = listing.current_approved_revision_id || listing.current_revision_id || null;
    const revision = revisionId ? CatalogListingRepository.getRevisionById(revisionId) : null;
    return { listing, revision };
}

function getBundleDerivedGrant(subjectType, subjectId, assetType, assetId) {
    const bundleGrants = CatalogEntitlementRepository.listGrantsForSubject(subjectType, subjectId, {
        status: GRANT_STATUS.ACTIVE,
        assetType: ASSET_TYPES.BUNDLE
    });
    for (const grant of bundleGrants) {
        const revisionId = grant.revision_id || grant.listing_id;
        const items = CatalogListingRepository.listBundleItems(grant.listing_id, revisionId && String(revisionId).startsWith('mrev_') ? revisionId : null);
        const matched = items.find((item) => item.item_type === assetType && String(item.item_id) === String(assetId));
        if (matched) return { bundleGrant: grant, bundleItem: matched };
    }
    return null;
}

function getGrantRevision(grant, fallbackListing) {
    const revisionId = grant?.rolls_to_latest_approved === false
        ? (grant?.revision_id || null)
        : (fallbackListing?.current_approved_revision_id || fallbackListing?.current_revision_id || grant?.revision_id || null);
    return revisionId ? CatalogListingRepository.getRevisionById(revisionId) : null;
}

function getGrantParent(grant) {
    if (!grant?.parent_grant_id) return null;
    return CatalogEntitlementRepository.getGrantById(grant.parent_grant_id);
}

function getGrantLineage(grant) {
    const lineage = [];
    let current = grant || null;
    const seen = new Set();
    while (current?.id && !seen.has(current.id)) {
        lineage.push(current);
        seen.add(current.id);
        current = current.parent_grant_id ? CatalogEntitlementRepository.getGrantById(current.parent_grant_id) : null;
    }
    return lineage;
}

function resolveBillingSubject(grant, fallback = {}) {
    if (!grant) {
        return {
            type: fallback.subjectType || null,
            id: fallback.subjectId || null
        };
    }
    return {
        type: grant.billing_subject_type || grant.subject_type || fallback.subjectType || null,
        id: grant.billing_subject_id || grant.subject_id || fallback.subjectId || null
    };
}

function getGrantScope(grant) {
    return String(grant?.grant_scope || '').trim().toLowerCase() || GRANT_SCOPES.DIRECT;
}

function getDefaultDeploymentPolicy(deployment) {
    return {
        deployment_id: deployment.id,
        consumer_access_mode: deployment.embed_enabled ? DEPLOYMENT_ACCESS_MODE.PUBLIC_SPONSORED : DEPLOYMENT_ACCESS_MODE.INTERNAL_ONLY,
        pinned_revision_id: null,
        sponsor_grant_id: null,
        metadata: {},
        created_at: null,
        updated_at: null
    };
}

function getDeploymentListing(deployment) {
    return CatalogListingRepository.getByAsset(ASSET_TYPES.AGENT, deployment?.agent_id);
}

function getPinnedRevisionForDeployment(deployment, policy, listing) {
    const revisionId = policy?.pinned_revision_id || listing?.current_approved_revision_id || listing?.current_revision_id || null;
    return revisionId ? CatalogListingRepository.getRevisionById(revisionId) : null;
}

function getDeploymentBudgetGrant(parentGrant, deployment) {
    if (!parentGrant?.id || !deployment?.id) return null;
    return CatalogEntitlementRepository.findMatchingChildGrant({
        parentGrantId: parentGrant.id,
        subjectType: SUBJECT_TYPES.DEPLOYMENT,
        subjectId: deployment.id,
        assetType: ASSET_TYPES.AGENT,
        assetId: deployment.agent_id,
        grantScope: GRANT_SCOPES.DEPLOYMENT_BUDGET
    });
}

function withActionGate(resolved, action) {
    if (!action) return resolved;
    const gate = ACTION_TO_GATE[action];
    if (gate && resolved.featureGates && resolved.featureGates[gate] === false) {
        return {
            ...resolved,
            allowed: false,
            reason: 'feature_not_enabled'
        };
    }
    if (resolved.allowed && resolved.grant) {
        const quotaCheck = quotaAllowsChain(resolved.grant, action);
        if (!quotaCheck.allowed) {
            return {
                ...resolved,
                allowed: false,
                reason: 'quota_exhausted',
                quota: quotaCheck.quota,
                parentQuota: quotaCheck.parentQuota
            };
        }
        return {
            ...resolved,
            quota: quotaCheck.quota,
            parentQuota: quotaCheck.parentQuota,
            parentGrant: resolved.parentGrant || quotaCheck.chain?.[1]?.grant || null
        };
    }
    return resolved;
}

function getResolvedLineage(resolved) {
    const grant = resolved?.grant || null;
    const parentGrant = resolved?.parentGrant || getGrantParent(grant);
    return { grant, parentGrant };
}

function resolveAssetOwnerUserId(assetType, assetId) {
    return getAssetOwnerInfo(assetType, assetId)?.ownerId || null;
}

function getAttachedSkillIdsForAsset(assetType, assetId, explicitSkillIds = null) {
    if (Array.isArray(explicitSkillIds) && explicitSkillIds.length) {
        return [...new Set(explicitSkillIds.map((item) => String(item || '').trim()).filter(Boolean))];
    }
    if (assetType !== ASSET_TYPES.AGENT || !assetId) return [];
    return SkillRepository.getAgentSkillIds(assetId);
}

function splitAmount(total, count, index) {
    const numericTotal = Number(total || 0);
    if (!Number.isFinite(numericTotal) || numericTotal <= 0 || count <= 0) return 0;
    if (Number.isInteger(numericTotal)) {
        const base = Math.floor(numericTotal / count);
        const remainder = numericTotal % count;
        return base + (index < remainder ? 1 : 0);
    }
    const base = numericTotal / count;
    return index === count - 1
        ? Number((numericTotal - (base * (count - 1))).toFixed(6))
        : Number(base.toFixed(6));
}

function buildSkillOwnerShareLegs({
    usageEventId,
    assetId,
    actorUserId = null,
    ownerUserId = null,
    providerName = null,
    modelId = null,
    promptTokens = 0,
    completionTokens = 0,
    totalTokens = 0,
    estimatedCostUsd = 0,
    deploymentId = null,
    explicitSkillIds = null
} = {}) {
    const skillIds = getAttachedSkillIdsForAsset(ASSET_TYPES.AGENT, assetId, explicitSkillIds);
    if (!skillIds.length) return [];
    const count = skillIds.length;
    return skillIds.map((skillId, index) => {
        const skill = SkillRepository.getById(skillId);
        if (!skill?.creator_id) return null;
        return {
            usageEventId,
            legType: USAGE_ATTRIBUTION_LEG_TYPES.SKILL_OWNER_SHARE,
            primarySubjectType: SUBJECT_TYPES.USER,
            primarySubjectId: skill.creator_id,
            assetType: ASSET_TYPES.SKILL,
            assetId: skillId,
            deploymentId,
            actorUserId: actorUserId || null,
            ownerUserId: skill.creator_id,
            promptTokens: splitAmount(promptTokens, count, index),
            completionTokens: splitAmount(completionTokens, count, index),
            totalTokens: splitAmount(totalTokens, count, index),
            requests: 1,
            estimatedCostUsd: splitAmount(estimatedCostUsd, count, index),
            metadata: {
                sourceAssetType: ASSET_TYPES.AGENT,
                sourceAssetId: assetId,
                agentOwnerUserId: ownerUserId || null,
                providerName,
                modelId,
                attributionMode: 'attached_agent_skills_equal_split'
            }
        };
    }).filter(Boolean);
}

function buildUsageAttributionLegs(payload = {}) {
    const metadata = payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
    const usageEventId = Number(payload.usageEventId || metadata.usageEventId || 0) || null;
    if (!usageEventId) return [];

    const promptTokens = parseInt(payload.promptTokens, 10) || 0;
    const completionTokens = parseInt(payload.completionTokens, 10) || 0;
    const totalTokens = parseInt(payload.totalTokens, 10) || (promptTokens + completionTokens);
    const requests = 1;
    const providerName = String(payload.providerName || '').trim().toLowerCase();
    const modelId = String(payload.modelId || '').trim();
    const estimatedCostUsd = estimateUsageCost({
        providerName,
        modelId,
        promptTokens,
        completionTokens,
        requests
    });

    const assetType = String(metadata.assetType || (payload.agentId ? ASSET_TYPES.AGENT : '')).trim().toLowerCase() || ASSET_TYPES.AGENT;
    const assetId = String(metadata.assetId || payload.agentId || '').trim();
    if (!assetId) return [];

    const grant = metadata.grantId ? CatalogEntitlementRepository.getGrantById(metadata.grantId) : null;
    const parentGrant = metadata.parentGrantId
        ? CatalogEntitlementRepository.getGrantById(metadata.parentGrantId)
        : getGrantParent(grant);
    const billingSubject = grant
        ? resolveBillingSubject(grant, {
            subjectType: metadata.subjectType || (payload.userId ? SUBJECT_TYPES.USER : null),
            subjectId: metadata.subjectId || payload.userId || null
        })
        : {
            type: metadata.billingSubjectType || metadata.subjectType || (payload.userId ? SUBJECT_TYPES.USER : null),
            id: metadata.billingSubjectId || metadata.subjectId || payload.userId || null
        };
    const actorUserId = payload.userId || metadata.actorUserId || null;
    const ownerUserId = metadata.assetOwnerUserId || metadata.ownerUserId || resolveAssetOwnerUserId(assetType, assetId) || null;
    const deploymentId = metadata.deploymentId || null;

    const legs = [{
        usageEventId,
        legType: USAGE_ATTRIBUTION_LEG_TYPES.BILLABLE_PRIMARY,
        primarySubjectType: billingSubject.type || null,
        primarySubjectId: billingSubject.id || null,
        assetType,
        assetId,
        grantId: grant?.id || null,
        parentGrantId: parentGrant?.id || null,
        deploymentId,
        actorUserId,
        ownerUserId,
        promptTokens,
        completionTokens,
        totalTokens,
        requests,
        estimatedCostUsd,
        metadata: {
            source: payload.source || null,
            providerName,
            modelId
        }
    }];

    if (grant) {
        if (getGrantScope(grant) === GRANT_SCOPES.DEPLOYMENT_BUDGET || getGrantScope(grant) === GRANT_SCOPES.DEPLOYMENT_SPONSOR) {
            legs.push({
                usageEventId,
                legType: USAGE_ATTRIBUTION_LEG_TYPES.DEPLOYMENT_BUDGET,
                primarySubjectType: grant.subject_type,
                primarySubjectId: grant.subject_id,
                assetType,
                assetId,
                grantId: grant.id,
                parentGrantId: parentGrant?.id || null,
                deploymentId: deploymentId || grant.subject_id || null,
                actorUserId,
                ownerUserId,
                promptTokens,
                completionTokens,
                totalTokens,
                requests,
                estimatedCostUsd,
                metadata: {
                    grantScope: getGrantScope(grant)
                }
            });
        } else {
            legs.push({
                usageEventId,
                legType: USAGE_ATTRIBUTION_LEG_TYPES.GRANT_QUOTA,
                primarySubjectType: grant.subject_type,
                primarySubjectId: grant.subject_id,
                assetType,
                assetId,
                grantId: grant.id,
                parentGrantId: parentGrant?.id || null,
                deploymentId,
                actorUserId,
                ownerUserId,
                promptTokens,
                completionTokens,
                totalTokens,
                requests,
                estimatedCostUsd,
                metadata: {
                    grantScope: getGrantScope(grant)
                }
            });
        }
    }

    if (parentGrant) {
        legs.push({
            usageEventId,
            legType: USAGE_ATTRIBUTION_LEG_TYPES.GRANT_QUOTA,
            primarySubjectType: parentGrant.subject_type,
            primarySubjectId: parentGrant.subject_id,
            assetType,
            assetId,
            grantId: parentGrant.id,
            deploymentId,
            actorUserId,
            ownerUserId,
            promptTokens,
            completionTokens,
            totalTokens,
            requests,
            estimatedCostUsd,
            metadata: {
                childGrantId: grant?.id || null,
                grantScope: getGrantScope(parentGrant)
            }
        });
    }

    if (actorUserId) {
        legs.push({
            usageEventId,
            legType: USAGE_ATTRIBUTION_LEG_TYPES.END_USER_HISTORY,
            primarySubjectType: SUBJECT_TYPES.USER,
            primarySubjectId: actorUserId,
            assetType,
            assetId,
            grantId: grant?.id || null,
            parentGrantId: parentGrant?.id || null,
            deploymentId,
            actorUserId,
            ownerUserId,
            promptTokens,
            completionTokens,
            totalTokens,
            requests,
            estimatedCostUsd,
            metadata: {
                source: payload.source || null
            }
        });
    }

    if (assetType === ASSET_TYPES.AGENT && ownerUserId) {
        legs.push({
            usageEventId,
            legType: USAGE_ATTRIBUTION_LEG_TYPES.ASSET_OWNER_SHARE,
            primarySubjectType: SUBJECT_TYPES.USER,
            primarySubjectId: ownerUserId,
            assetType,
            assetId,
            grantId: grant?.id || null,
            parentGrantId: parentGrant?.id || null,
            deploymentId,
            actorUserId,
            ownerUserId,
            promptTokens,
            completionTokens,
            totalTokens,
            requests,
            estimatedCostUsd,
            metadata: {
                providerName,
                modelId
            }
        });
        legs.push(...buildSkillOwnerShareLegs({
            usageEventId,
            assetId,
            actorUserId,
            ownerUserId,
            providerName,
            modelId,
            promptTokens,
            completionTokens,
            totalTokens,
            estimatedCostUsd,
            deploymentId,
            explicitSkillIds: metadata.skillIds
        }));
    }

    if (assetType === ASSET_TYPES.SKILL && ownerUserId) {
        legs.push({
            usageEventId,
            legType: USAGE_ATTRIBUTION_LEG_TYPES.SKILL_OWNER_SHARE,
            primarySubjectType: SUBJECT_TYPES.USER,
            primarySubjectId: ownerUserId,
            assetType,
            assetId,
            grantId: grant?.id || null,
            parentGrantId: parentGrant?.id || null,
            deploymentId,
            actorUserId,
            ownerUserId,
            promptTokens,
            completionTokens,
            totalTokens,
            requests,
            estimatedCostUsd,
            metadata: {
                providerName,
                modelId
            }
        });
    }

    if (deploymentId) {
        const deployment = DeploymentRepository.getById(deploymentId);
        const deploymentOwnerId = deployment?.owner_user_id || null;
        if (deploymentOwnerId) {
            legs.push({
                usageEventId,
                legType: USAGE_ATTRIBUTION_LEG_TYPES.DEPLOYMENT_OWNER_HISTORY,
                primarySubjectType: SUBJECT_TYPES.USER,
                primarySubjectId: deploymentOwnerId,
                assetType,
                assetId,
                grantId: grant?.id || null,
                parentGrantId: parentGrant?.id || null,
                deploymentId,
                actorUserId,
                ownerUserId: deploymentOwnerId,
                promptTokens,
                completionTokens,
                totalTokens,
                requests,
                estimatedCostUsd,
                metadata: {
                    providerName,
                    modelId
                }
            });
        }
    }

    return legs;
}

const catalogEntitlementService = {
    resolveAssetEntitlement({
        userId = null,
        subjectType = SUBJECT_TYPES.USER,
        subjectId = null,
        assetType,
        assetId,
        action = null
    } = {}) {
        const normalizedAssetType = String(assetType || '').trim().toLowerCase();
        const normalizedAssetId = String(assetId || '').trim();
        const normalizedSubjectId = String(subjectId || userId || '').trim();
        const { ownerId } = getAssetOwnerInfo(normalizedAssetType, normalizedAssetId);
        const { listing, revision } = getListingAndRevision(normalizedAssetType, normalizedAssetId);

        if (userId && isOwner(userId, ownerId)) {
            return buildResolvedEntitlement({
                allowed: true,
                source: 'owner',
                owner: true,
                assetType: normalizedAssetType,
                assetId: normalizedAssetId,
                listing,
                revision,
                subjectType,
                subjectId: normalizedSubjectId,
                featureGates: normalizeGrantFeatureGates(normalizedAssetType)
            });
        }

        const directGrant = normalizedSubjectId
            ? CatalogEntitlementRepository.findMatchingGrant({
                subjectType,
                subjectId: normalizedSubjectId,
                assetType: normalizedAssetType,
                assetId: normalizedAssetId,
                listingId: listing?.id || null
            })
            : null;
        if (directGrant) {
            const resolved = buildResolvedEntitlement({
                allowed: true,
                source: directGrant.grant_type || 'grant',
                assetType: normalizedAssetType,
                assetId: normalizedAssetId,
                listing,
                revision: getGrantRevision(directGrant, listing),
                grant: directGrant,
                parentGrant: getGrantParent(directGrant),
                featureGates: normalizeGrantFeatureGates(normalizedAssetType, directGrant.feature_gates),
                subjectType,
                subjectId: normalizedSubjectId,
                grantScope: getGrantScope(directGrant),
                billingSubject: resolveBillingSubject(directGrant, { subjectType, subjectId: normalizedSubjectId })
            });
            return withActionGate(resolved, action);
        }

        const bundleMatch = normalizedSubjectId ? getBundleDerivedGrant(subjectType, normalizedSubjectId, normalizedAssetType, normalizedAssetId) : null;
        if (bundleMatch) {
            const resolved = buildResolvedEntitlement({
                allowed: true,
                source: 'bundle_grant',
                assetType: normalizedAssetType,
                assetId: normalizedAssetId,
                listing,
                revision,
                grant: bundleMatch.bundleGrant,
                derivedGrant: bundleMatch.bundleGrant,
                featureGates: normalizeGrantFeatureGates(normalizedAssetType, bundleMatch.bundleGrant.feature_gates),
                subjectType,
                subjectId: normalizedSubjectId,
                grantScope: GRANT_SCOPES.BUNDLE_DERIVED,
                billingSubject: resolveBillingSubject(bundleMatch.bundleGrant, { subjectType, subjectId: normalizedSubjectId })
            });
            return withActionGate(resolved, action);
        }

        const listingIsPublic = listing?.visibility === 'public' && ['approved', 'published'].includes(String(listing?.status || '').toLowerCase());
        if (listingIsPublic) {
            return buildResolvedEntitlement({
                allowed: false,
                reason: 'subscription_required',
                source: 'public_listing',
                assetType: normalizedAssetType,
                assetId: normalizedAssetId,
                listing,
                revision,
                subjectType,
                subjectId: normalizedSubjectId,
                featureGates: normalizeGrantFeatureGates(normalizedAssetType)
            });
        }

        return buildResolvedEntitlement({
            allowed: false,
            reason: userId ? 'no_entitlement' : 'authentication_required',
            source: 'none',
            assetType: normalizedAssetType,
            assetId: normalizedAssetId,
            listing,
            revision,
            subjectType,
            subjectId: normalizedSubjectId
        });
    },

    assertUserCanAccessAsset({ userId, assetType, assetId, action = null } = {}) {
        const resolved = this.resolveAssetEntitlement({
            userId,
            assetType,
            assetId,
            subjectType: SUBJECT_TYPES.USER,
            subjectId: userId,
            action
        });
        if (!resolved.allowed) {
            if (!userId) throw unauthorized('Authentication required');
            if (resolved.reason === 'quota_exhausted') throw forbidden('Quota exceeded');
            throw forbidden('Access denied');
        }
        return resolved;
    },

    resolveDeploymentEntitlement({ deployment, userId = null } = {}) {
        if (!deployment) throw notFound('Deployment not found');
        const policy = this.getEffectiveDeploymentAccessPolicy(deployment);
        const listing = getDeploymentListing(deployment);
        const revision = getPinnedRevisionForDeployment(deployment, policy, listing);

        if (policy.consumer_access_mode === DEPLOYMENT_ACCESS_MODE.PUBLIC_SPONSORED) {
            const grant = policy.sponsor_grant_id ? CatalogEntitlementRepository.getGrantById(policy.sponsor_grant_id) : null;
            const resolved = buildResolvedEntitlement({
                allowed: !!grant,
                reason: grant ? null : 'deployment_not_sponsored',
                source: 'deployment_sponsor',
                assetType: ASSET_TYPES.AGENT,
                assetId: deployment.agent_id,
                listing,
                revision,
                grant,
                parentGrant: getGrantParent(grant),
                featureGates: normalizeGrantFeatureGates(ASSET_TYPES.AGENT, grant?.feature_gates),
                subjectType: SUBJECT_TYPES.DEPLOYMENT,
                subjectId: String(deployment.id),
                grantScope: grant ? getGrantScope(grant) : GRANT_SCOPES.DEPLOYMENT_SPONSOR,
                billingSubject: resolveBillingSubject(grant, {
                    subjectType: SUBJECT_TYPES.DEPLOYMENT,
                    subjectId: String(deployment.id)
                })
            });
            return withActionGate(resolved, 'chat');
        }

        if (policy.consumer_access_mode === DEPLOYMENT_ACCESS_MODE.AUTHENTICATED_ENTITLED) {
            if (!userId) {
                return buildResolvedEntitlement({
                    allowed: false,
                    reason: 'authentication_required',
                    source: 'deployment_policy',
                    assetType: ASSET_TYPES.AGENT,
                    assetId: deployment.agent_id,
                    listing,
                    revision,
                    subjectType: SUBJECT_TYPES.USER,
                    subjectId: null
                });
            }
            const parentResolved = this.resolveAssetEntitlement({
                userId,
                subjectType: SUBJECT_TYPES.USER,
                subjectId: userId,
                assetType: ASSET_TYPES.AGENT,
                assetId: deployment.agent_id,
                action: 'chat'
            });
            if (!parentResolved.allowed) {
                return {
                    ...parentResolved,
                    listing,
                    revision: revision || parentResolved.revision,
                    deploymentPolicy: policy
                };
            }

            const deploymentBudgetGrant = getDeploymentBudgetGrant(parentResolved.grant, deployment);
            const resolved = deploymentBudgetGrant
                ? withActionGate(buildResolvedEntitlement({
                    allowed: true,
                    source: 'deployment_budget',
                    assetType: ASSET_TYPES.AGENT,
                    assetId: deployment.agent_id,
                    listing,
                    revision,
                    grant: deploymentBudgetGrant,
                    parentGrant: parentResolved.grant,
                    featureGates: normalizeGrantFeatureGates(
                        ASSET_TYPES.AGENT,
                        {
                            ...(parentResolved.grant?.feature_gates || {}),
                            ...(deploymentBudgetGrant.feature_gates || {})
                        }
                    ),
                    subjectType: SUBJECT_TYPES.USER,
                    subjectId: userId,
                    grantScope: GRANT_SCOPES.DEPLOYMENT_BUDGET,
                    billingSubject: resolveBillingSubject(deploymentBudgetGrant, {
                        subjectType: parentResolved.subjectType,
                        subjectId: parentResolved.subjectId
                    })
                }), 'chat')
                : parentResolved;

            return {
                ...resolved,
                listing,
                revision: revision || resolved.revision || (listing?.current_approved_revision_id ? CatalogListingRepository.getRevisionById(listing.current_approved_revision_id) : null),
                deploymentPolicy: policy
            };
        }

        return buildResolvedEntitlement({
            allowed: false,
            reason: 'deployment_internal_only',
            source: 'deployment_policy',
            assetType: ASSET_TYPES.AGENT,
            assetId: deployment.agent_id,
            listing,
            revision,
            subjectType: userId ? SUBJECT_TYPES.USER : SUBJECT_TYPES.DEPLOYMENT,
            subjectId: userId || String(deployment.id),
            featureGates: normalizeGrantFeatureGates(ASSET_TYPES.AGENT)
        });
    },

    getDeploymentRuntimeAgent(deployment) {
        if (!deployment) return null;
        const policy = this.getEffectiveDeploymentAccessPolicy(deployment);
        const revision = getPinnedRevisionForDeployment(deployment, policy, getDeploymentListing(deployment));
        if (!revision?.snapshot || Object.keys(revision.snapshot).length === 0) return AIAgentRepository.getById(deployment.agent_id);
        const snapshot = normalizeAgentSnapshot(revision?.snapshot);
        return snapshot || AIAgentRepository.getById(deployment.agent_id);
    },

    getRuntimeAgentForResolvedEntitlement(resolved, fallbackAgentId = null) {
        if (!resolved) return fallbackAgentId ? AIAgentRepository.getById(fallbackAgentId) : null;
        if (resolved.owner) {
            return AIAgentRepository.getById(resolved.assetId || fallbackAgentId);
        }

        const revisionSnapshot = normalizeAgentSnapshot(resolved.revision?.snapshot);
        if (revisionSnapshot && Object.keys(revisionSnapshot).length) {
            return revisionSnapshot;
        }

        const approvedRevisionId = resolved.listing?.current_approved_revision_id || resolved.listing?.current_revision_id || null;
        const approvedRevision = approvedRevisionId ? CatalogListingRepository.getRevisionById(approvedRevisionId) : null;
        const approvedSnapshot = normalizeAgentSnapshot(approvedRevision?.snapshot);
        if (approvedSnapshot && Object.keys(approvedSnapshot).length) {
            return approvedSnapshot;
        }

        return fallbackAgentId ? AIAgentRepository.getById(fallbackAgentId) : null;
    },

    getEffectiveDeploymentAccessPolicy(deployment) {
        if (!deployment) return null;
        return DeploymentAccessPolicyRepository.getByDeploymentId(deployment.id) || getDefaultDeploymentPolicy(deployment);
    },

    getDeploymentAccessPolicySummary(deploymentId) {
        const resolvedDeployment = typeof deploymentId === 'object'
            ? deploymentId
            : DeploymentRepository.getById(deploymentId);
        const policy = resolvedDeployment
            ? this.getEffectiveDeploymentAccessPolicy(resolvedDeployment)
            : DeploymentAccessPolicyRepository.getByDeploymentId(deploymentId);
        if (!policy && !resolvedDeployment) return null;
        const sponsorGrant = policy.sponsor_grant_id ? CatalogEntitlementRepository.getGrantById(policy.sponsor_grant_id) : null;
        const deploymentRow = resolvedDeployment || null;
        const listing = deploymentRow ? getDeploymentListing(deploymentRow) : null;
        const pinnedRevision = deploymentRow ? getPinnedRevisionForDeployment(deploymentRow, policy, listing) : null;
        return {
            ...policy,
            sponsorGrant,
            sponsorQuota: sponsorGrant ? resolveQuotaSnapshot(sponsorGrant) : null,
            pinnedRevision: pinnedRevision ? {
                id: pinnedRevision.id,
                revisionNumber: pinnedRevision.revision_number,
                title: pinnedRevision.title,
                reviewStatus: pinnedRevision.review_status
            } : null
        };
    },

    getDeploymentRuntimeHealth(deployment) {
        if (!deployment) return {
            state: 'error',
            summary: 'Deployment not found',
            issues: ['deployment_missing']
        };

        const policy = this.getEffectiveDeploymentAccessPolicy(deployment);
        const accessPolicy = this.getDeploymentAccessPolicySummary(deployment);
        const runtimeAgent = hydrateAgentModelAvailability(this.getDeploymentRuntimeAgent(deployment), { clone: true });
        const issues = [];
        const warnings = [];

        if (!runtimeAgent) {
            issues.push('deployment_agent_missing');
        }

        if (!runtimeAgent?.text_model && !runtimeAgent?.image_model) {
            warnings.push('no_models_configured');
        }

        if (runtimeAgent?.modelStatus?.state === 'warning') {
            warnings.push('partial_model_availability');
        }
        if (runtimeAgent?.modelStatus?.state === 'error') {
            issues.push('all_models_unavailable');
        }

        if (policy?.consumer_access_mode === DEPLOYMENT_ACCESS_MODE.PUBLIC_SPONSORED) {
            if (!accessPolicy?.sponsorGrant) {
                issues.push('missing_sponsor_grant');
            }
            const exhaustedMetric = Object.values(accessPolicy?.sponsorQuota?.metrics || {}).find((metric) => metric?.exhausted);
            if (exhaustedMetric) {
                issues.push('sponsor_quota_exhausted');
            }
        }

        const state = issues.length
            ? 'error'
            : warnings.length
                ? 'warning'
                : 'ok';

        let summary = 'Deployment ready';
        if (issues.includes('sponsor_quota_exhausted')) {
            summary = 'Sponsor quota exhausted';
        } else if (issues.includes('missing_sponsor_grant')) {
            summary = 'Public deployment is missing a sponsor grant';
        } else if (issues.includes('all_models_unavailable')) {
            summary = 'Assigned models are unavailable';
        } else if (issues.includes('deployment_agent_missing')) {
            summary = 'Runtime agent is unavailable';
        } else if (warnings.includes('partial_model_availability')) {
            summary = 'Some assigned models are unavailable';
        } else if (warnings.includes('no_models_configured')) {
            summary = 'No runtime models configured';
        }

        return {
            state,
            summary,
            issues: [...issues, ...warnings],
            modelStatus: runtimeAgent?.modelStatus || null
        };
    },

    assertUserCanCreateDeployment({ userId, agentId } = {}) {
        return this.assertUserCanAccessAsset({
            userId,
            assetType: ASSET_TYPES.AGENT,
            assetId: agentId,
            action: 'deploy'
        });
    },

    assertUserCanCopyAgent({ userId, agentId } = {}) {
        return this.assertUserCanAccessAsset({
            userId,
            assetType: ASSET_TYPES.AGENT,
            assetId: agentId,
            action: 'copy'
        });
    },

    assertUserCanInstallSkill({ userId, skillId } = {}) {
        return this.assertUserCanAccessAsset({
            userId,
            assetType: ASSET_TYPES.SKILL,
            assetId: skillId,
            action: 'install'
        });
    },

    assertUserCanUseSkill({ userId, skillId } = {}) {
        return this.assertUserCanAccessAsset({
            userId,
            assetType: ASSET_TYPES.SKILL,
            assetId: skillId,
            action: 'use_skill'
        });
    },

    canManageDeployment(deployment, userId) {
        if (!deployment || !userId) return false;
        if (isOwner(userId, deployment.owner_user_id)) return true;
        return !!DeploymentMemberRepository.getByDeploymentAndUser(deployment.id, userId);
    },

    recordUsage({ grantId, metricKey, delta, now = new Date() } = {}) {
        if (!grantId || !metricKey) return null;
        const counter = CatalogEntitlementRepository.incrementUsageCounter(grantId, getCurrentPeriodKey(now), metricKey, delta);
        return counter;
    },

    recordUsageFromUsageEvent(payload = {}) {
        const metadata = payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
        const grantId = metadata.grantId || metadata.grant_id || null;
        const primaryGrant = grantId ? CatalogEntitlementRepository.getGrantById(grantId) : null;
        const parentGrant = metadata.parentGrantId
            ? CatalogEntitlementRepository.getGrantById(metadata.parentGrantId)
            : getGrantParent(primaryGrant);
        const promptTokens = parseInt(payload.promptTokens, 10) || 0;
        const completionTokens = parseInt(payload.completionTokens, 10) || 0;
        const totalTokens = parseInt(payload.totalTokens, 10) || (promptTokens + completionTokens);
        if (primaryGrant?.id) {
            this.recordUsage({ grantId: primaryGrant.id, metricKey: 'monthly_invocations', delta: 1 });
            if (totalTokens > 0) {
                this.recordUsage({ grantId: primaryGrant.id, metricKey: 'monthly_tokens', delta: totalTokens });
            }
        }
        if (parentGrant?.id) {
            this.recordUsage({ grantId: parentGrant.id, metricKey: 'monthly_invocations', delta: 1 });
            if (totalTokens > 0) {
                this.recordUsage({ grantId: parentGrant.id, metricKey: 'monthly_tokens', delta: totalTokens });
            }
        }

        const legs = buildUsageAttributionLegs({
            ...payload,
            metadata: {
                ...metadata,
                parentGrantId: parentGrant?.id || metadata.parentGrantId || null
            }
        });
        if (legs.length) {
            UsageAttributionRepository.createLegs(legs);
        }

        const seenGrantIds = new Set();
        const alertGrants = [primaryGrant, parentGrant].filter((grant) => {
            if (!grant?.id || seenGrantIds.has(grant.id)) return false;
            seenGrantIds.add(grant.id);
            return true;
        });
        let finalQuota = primaryGrant ? resolveQuotaSnapshot(primaryGrant) : { periodKey: getCurrentPeriodKey(), metrics: {} };
        alertGrants.forEach((grant) => {
            const quota = resolveQuotaSnapshot(grant);
            if (grant?.id === primaryGrant?.id) finalQuota = quota;
            Object.entries(quota.metrics).forEach(([metric, snapshot]) => {
                if (!snapshot.limit) return;
                if ([80, 95, 100].includes(snapshot.percentUsed)) {
                    notificationService.createNotification({
                        userId: grant?.owner_id || null,
                        type: 'quota_alert',
                        title: 'Quota threshold reached',
                        body: `${metric} is at ${snapshot.percentUsed}%`,
                        severity: snapshot.percentUsed >= 100 ? 'warning' : 'info',
                        meta: { grantId: grant.id, metric, quota: snapshot }
                    });
                }
            });
        });
        return {
            quota: finalQuota,
            parentQuota: parentGrant ? resolveQuotaSnapshot(parentGrant) : null,
            attributionLegs: legs.length
        };
    },

    buildUsageMetadata(resolved, extra = {}) {
        const { grant, parentGrant } = getResolvedLineage(resolved);
        const billingSubject = resolved?.billingSubject || resolveBillingSubject(grant, {
            subjectType: resolved?.subjectType || null,
            subjectId: resolved?.subjectId || null
        });
        const assetType = resolved?.assetType || extra.assetType || null;
        const assetId = resolved?.assetId || extra.assetId || null;
        const skillIds = assetType === ASSET_TYPES.AGENT && assetId
            ? SkillRepository.getAgentSkillIds(assetId)
            : [];
        return {
            listingId: resolved?.listing?.id || null,
            revisionId: resolved?.revision?.id || null,
            grantId: grant?.id || null,
            parentGrantId: parentGrant?.id || null,
            grantScope: resolved?.grantScope || getGrantScope(grant),
            billingSubjectType: billingSubject.type || null,
            billingSubjectId: billingSubject.id || null,
            subjectType: resolved?.subjectType || null,
            subjectId: resolved?.subjectId || null,
            assetType,
            assetId,
            assetOwnerUserId: resolveAssetOwnerUserId(assetType, assetId),
            skillIds,
            ...extra
        };
    },

    getGrantUsageSummary(grantId, opts = {}) {
        const grant = grantId ? CatalogEntitlementRepository.getGrantById(grantId) : null;
        if (!grant) return null;
        const parentGrant = getGrantParent(grant);
        return {
            grant,
            quota: resolveQuotaSnapshot(grant),
            parentGrant,
            parentQuota: parentGrant ? resolveQuotaSnapshot(parentGrant) : null,
            attributionSummary: UsageAttributionRepository.summarizeByGrant(grantId, opts),
            recentAttribution: UsageAttributionRepository.listByGrant(grantId, { ...opts, limit: opts.limit || 50 })
        };
    },

    getAssetUsageAttribution(assetType, assetId, opts = {}) {
        return {
            assetType,
            assetId,
            attributionSummary: UsageAttributionRepository.summarizeByAsset(assetType, assetId, opts),
            recentAttribution: UsageAttributionRepository.listByAsset(assetType, assetId, { ...opts, limit: opts.limit || 100 })
        };
    }
};

module.exports = catalogEntitlementService;
