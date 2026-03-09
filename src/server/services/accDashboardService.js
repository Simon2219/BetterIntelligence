const {
    all,
    get,
    AIAgentRepository,
    DeploymentRepository,
    SkillRepository,
    CatalogEntitlementRepository
} = require('../database');
const catalogService = require('./catalogService');
const catalogEntitlementService = require('./catalogEntitlementService');
const { hydrateAgentModelAvailability } = require('../ai/services/agentAvailabilityService');

const AVAILABLE_SECTIONS = ['overview', 'library', 'access', 'listings', 'reviews', 'usage'];
const DEFAULT_PREFERENCES = {
    defaultTab: 'overview',
    preferredDateRange: 30,
    preferredUsageMetric: 'requests',
    libraryView: 'cards',
    collapsedWidgets: [],
    collapsedLibraryGroups: [],
    pinnedWidgets: [],
    widgetOrder: [],
    favoriteSmartCollections: [],
    pinnedAgentIds: [],
    savedViews: [],
    lastVisitedAt: null
};

function parseJson(value, fallback) {
    if (value && typeof value === 'object') return value;
    try {
        return JSON.parse(value || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

function toInt(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function clampDays(value, fallback = 30) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, 365);
}

function normalizeArray(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))];
}

function normalizeSavedViews(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => ({
            id: String(item?.id || item?.name || '').trim(),
            name: String(item?.name || '').trim(),
            tab: AVAILABLE_SECTIONS.includes(String(item?.tab || '').trim().toLowerCase())
                ? String(item.tab).trim().toLowerCase()
                : 'overview',
            query: item?.query && typeof item.query === 'object' ? item.query : {}
        }))
        .filter((item) => item.id && item.name);
}

function normalizePreferences(value) {
    const source = parseJson(value, {});
    const preferredUsageMetric = ['requests', 'tokens', 'cost'].includes(String(source.preferredUsageMetric || '').trim().toLowerCase())
        ? String(source.preferredUsageMetric).trim().toLowerCase()
        : DEFAULT_PREFERENCES.preferredUsageMetric;
    const defaultTab = AVAILABLE_SECTIONS.includes(String(source.defaultTab || '').trim().toLowerCase())
        ? String(source.defaultTab).trim().toLowerCase()
        : DEFAULT_PREFERENCES.defaultTab;

    return {
        ...DEFAULT_PREFERENCES,
        ...source,
        defaultTab,
        preferredDateRange: clampDays(source.preferredDateRange, DEFAULT_PREFERENCES.preferredDateRange),
        preferredUsageMetric,
        libraryView: ['cards', 'list'].includes(String(source.libraryView || '').trim().toLowerCase())
            ? String(source.libraryView).trim().toLowerCase()
            : DEFAULT_PREFERENCES.libraryView,
        collapsedWidgets: normalizeArray(source.collapsedWidgets),
        collapsedLibraryGroups: normalizeArray(source.collapsedLibraryGroups),
        pinnedWidgets: normalizeArray(source.pinnedWidgets),
        widgetOrder: normalizeArray(source.widgetOrder),
        favoriteSmartCollections: normalizeArray(source.favoriteSmartCollections),
        pinnedAgentIds: normalizeArray(source.pinnedAgentIds),
        savedViews: normalizeSavedViews(source.savedViews),
        lastVisitedAt: source.lastVisitedAt || null
    };
}

function estimateCost(row) {
    const metadata = parseJson(row.metadata, {});
    const promptRate = toNumber(metadata.promptTokenCostUsd);
    const completionRate = toNumber(metadata.completionTokenCostUsd);
    const imageRate = toNumber(metadata.imageRequestCostUsd);
    const promptTokens = toInt(row.prompt_tokens);
    const completionTokens = toInt(row.completion_tokens);
    const requests = toInt(row.requests);
    return (promptTokens * promptRate) + (completionTokens * completionRate) + (requests * imageRate);
}

function formatRoute(path, search = {}) {
    const params = new URLSearchParams();
    Object.entries(search || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        params.set(key, String(value));
    });
    const query = params.toString();
    return query ? `${path}?${query}` : path;
}

function getTimestamp(item) {
    if (!item) return 0;
    const value = item.timestamp || item.updated_at || item.created_at || item.submitted_at || item.reviewed_at || item.resolved_at || item.last_message_at || item.lastUsedAt || null;
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

function byMostRecent(left, right) {
    return getTimestamp(right) - getTimestamp(left);
}

function buildInClause(ids = []) {
    return ids.map(() => '?').join(', ');
}

function listUsageRowsByOwnerAgents(agentIds, { sinceDays, untilDays = null } = {}) {
    if (!Array.isArray(agentIds) || !agentIds.length) return [];
    const clause = buildInClause(agentIds);
    const params = [...agentIds, `-${clampDays(sinceDays, 30)} days`];
    let untilSql = '';
    if (untilDays !== null && untilDays !== undefined) {
        untilSql = ' AND datetime(e.created_at) < datetime(\'now\', ?)';
        params.push(`-${clampDays(untilDays, 30)} days`);
    }

    return all(`SELECT
            e.agent_id,
            a.name AS agent_name,
            e.provider_name,
            e.model_id,
            COUNT(*) AS requests,
            SUM(CASE WHEN COALESCE(e.success, 1) = 0 THEN 1 ELSE 0 END) AS errors,
            SUM(COALESCE(e.prompt_tokens, 0)) AS prompt_tokens,
            SUM(COALESCE(e.completion_tokens, 0)) AS completion_tokens,
            SUM(COALESCE(e.total_tokens, 0)) AS total_tokens,
            MAX(e.created_at) AS last_used_at,
            m.metadata AS metadata
        FROM ai_model_usage_events e
        LEFT JOIN ai_agents a ON a.id = e.agent_id
        LEFT JOIN ai_provider_models m
          ON LOWER(m.provider_name) = LOWER(e.provider_name)
         AND m.model_id = e.model_id
        WHERE e.agent_id IN (${clause})
          AND datetime(e.created_at) >= datetime('now', ?)
          ${untilSql}
        GROUP BY e.agent_id, a.name, e.provider_name, e.model_id, m.metadata
        ORDER BY requests DESC, total_tokens DESC`, params);
}

function listUsageTimelineByOwnerAgents(agentIds, { sinceDays } = {}) {
    if (!Array.isArray(agentIds) || !agentIds.length) return [];
    const clause = buildInClause(agentIds);
    return all(`SELECT
            DATE(e.created_at) AS day,
            COUNT(*) AS requests,
            SUM(CASE WHEN COALESCE(e.success, 1) = 0 THEN 1 ELSE 0 END) AS errors,
            SUM(COALESCE(e.prompt_tokens, 0)) AS prompt_tokens,
            SUM(COALESCE(e.completion_tokens, 0)) AS completion_tokens,
            SUM(COALESCE(e.total_tokens, 0)) AS total_tokens,
            AVG(COALESCE(e.duration_ms, 0)) AS avg_duration_ms
        FROM ai_model_usage_events e
        WHERE e.agent_id IN (${clause})
          AND datetime(e.created_at) >= datetime('now', ?)
        GROUP BY DATE(e.created_at)
        ORDER BY day ASC`, [...agentIds, `-${clampDays(sinceDays, 30)} days`]);
}

function listUsageMiniSeriesByOwnerAgents(agentIds, { sinceDays = 14 } = {}) {
    if (!Array.isArray(agentIds) || !agentIds.length) return [];
    const clause = buildInClause(agentIds);
    return all(`SELECT
            e.agent_id,
            DATE(e.created_at) AS day,
            COUNT(*) AS requests,
            SUM(COALESCE(e.total_tokens, 0)) AS total_tokens,
            SUM(CASE WHEN COALESCE(e.success, 1) = 0 THEN 1 ELSE 0 END) AS errors,
            MAX(m.metadata) AS metadata
        FROM ai_model_usage_events e
        LEFT JOIN ai_provider_models m
          ON LOWER(m.provider_name) = LOWER(e.provider_name)
         AND m.model_id = e.model_id
        WHERE e.agent_id IN (${clause})
          AND datetime(e.created_at) >= datetime('now', ?)
        GROUP BY e.agent_id, DATE(e.created_at)
        ORDER BY e.agent_id ASC, day ASC`, [...agentIds, `-${clampDays(sinceDays, 14)} days`]);
}

function summarizeUsageRows(rows = []) {
    return rows.reduce((acc, row) => {
        acc.requests += toInt(row.requests);
        acc.errors += toInt(row.errors);
        acc.promptTokens += toInt(row.prompt_tokens);
        acc.completionTokens += toInt(row.completion_tokens);
        acc.totalTokens += toInt(row.total_tokens);
        acc.estimatedCostUsd += estimateCost(row);
        return acc;
    }, {
        requests: 0,
        errors: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0
    });
}

function withUsageRates(summary) {
    const requests = toInt(summary.requests);
    const errors = toInt(summary.errors);
    return {
        ...summary,
        estimatedCostUsd: Number(toNumber(summary.estimatedCostUsd).toFixed(6)),
        errorRate: requests > 0 ? Number(((errors / requests) * 100).toFixed(2)) : 0,
        averageCostPerRequestUsd: requests > 0 ? Number((toNumber(summary.estimatedCostUsd) / requests).toFixed(6)) : 0
    };
}

function aggregateBreakdown(rows, keyFn, decorate = null) {
    const map = new Map();
    rows.forEach((row) => {
        const key = keyFn(row);
        if (!key) return;
        if (!map.has(key)) {
            map.set(key, {
                key,
                requests: 0,
                errors: 0,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                estimatedCostUsd: 0,
                lastUsedAt: null
            });
        }
        const target = map.get(key);
        target.requests += toInt(row.requests);
        target.errors += toInt(row.errors);
        target.promptTokens += toInt(row.prompt_tokens);
        target.completionTokens += toInt(row.completion_tokens);
        target.totalTokens += toInt(row.total_tokens);
        target.estimatedCostUsd += estimateCost(row);
        const lastUsedAt = row.last_used_at || null;
        if (getTimestamp({ timestamp: lastUsedAt }) > getTimestamp({ timestamp: target.lastUsedAt })) {
            target.lastUsedAt = lastUsedAt;
        }
        if (typeof decorate === 'function') {
            decorate(target, row);
        }
    });

    return [...map.values()]
        .map((row) => ({
            ...row,
            estimatedCostUsd: Number(row.estimatedCostUsd.toFixed(6)),
            errorRate: row.requests > 0 ? Number(((row.errors / row.requests) * 100).toFixed(2)) : 0
        }))
        .sort((left, right) => {
            if (right.estimatedCostUsd !== left.estimatedCostUsd) return right.estimatedCostUsd - left.estimatedCostUsd;
            if (right.requests !== left.requests) return right.requests - left.requests;
            return String(left.key).localeCompare(String(right.key));
        });
}

function buildTrendPoints(timelineRows = []) {
    return timelineRows.map((row) => {
        const point = {
            day: row.day,
            requests: toInt(row.requests),
            errors: toInt(row.errors),
            promptTokens: toInt(row.prompt_tokens),
            completionTokens: toInt(row.completion_tokens),
            totalTokens: toInt(row.total_tokens),
            averageLatencyMs: Math.round(toNumber(row.avg_duration_ms)),
            estimatedCostUsd: Number(estimateCost(row).toFixed(6))
        };
        point.errorRate = point.requests > 0 ? Number(((point.errors / point.requests) * 100).toFixed(2)) : 0;
        return point;
    });
}

function buildDelta(currentValue, previousValue) {
    const current = toNumber(currentValue);
    const previous = toNumber(previousValue);
    const delta = current - previous;
    return {
        value: current,
        previousValue: previous,
        delta,
        direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
        percentDelta: previous === 0 ? (current > 0 ? 100 : 0) : Number(((delta / previous) * 100).toFixed(1))
    };
}

function getCreatedInWindow(items, days) {
    const threshold = Date.now() - (clampDays(days, 30) * 86400000);
    return (items || []).filter((item) => {
        const createdAt = new Date(item.created_at || item.createdAt || item.timestamp || 0).getTime();
        return Number.isFinite(createdAt) && createdAt >= threshold;
    }).length;
}

function classifyHealth(agent) {
    const hydrated = hydrateAgentModelAvailability(agent, { clone: true });
    const state = hydrated?.modelStatus?.state || 'unknown';
    return {
        state,
        summary: hydrated?.modelStatus?.summaryText || 'No model configured'
    };
}

function buildAlert({ type, severity = 'info', title, description = '', route = '/agents', key = null, meta = {} } = {}) {
    return {
        id: key || `${type}:${title}`,
        type,
        severity,
        title,
        description,
        route,
        meta
    };
}

function buildRecentItem({ type, title, description = '', timestamp, route = '/agents', tone = 'default', meta = {} } = {}) {
    return {
        id: `${type}:${title}:${timestamp || ''}`,
        type,
        title,
        description,
        timestamp,
        route,
        tone,
        meta
    };
}

function aggregateQuotaMetrics(grants = []) {
    const totals = {};
    grants.forEach((grant) => {
        const quota = grant.usage || { metrics: {} };
        Object.entries(quota.metrics || {}).forEach(([metricKey, snapshot]) => {
            if (!totals[metricKey]) {
                totals[metricKey] = {
                    limit: 0,
                    used: 0,
                    remaining: 0
                };
            }
            totals[metricKey].limit += toInt(snapshot.limit);
            totals[metricKey].used += toInt(snapshot.used);
            totals[metricKey].remaining += toInt(snapshot.remaining);
        });
    });

    return Object.entries(totals).map(([metricKey, snapshot]) => ({
        metricKey,
        ...snapshot,
        percentUsed: snapshot.limit > 0 ? Math.min(100, Math.round((snapshot.used / snapshot.limit) * 100)) : 0
    })).sort((left, right) => right.percentUsed - left.percentUsed);
}

function summarizeRequestAging(requests = []) {
    const buckets = {
        recent: 0,
        aging: 0,
        stale: 0
    };
    const now = Date.now();
    requests.forEach((request) => {
        const createdAt = new Date(request.created_at || 0).getTime();
        if (!Number.isFinite(createdAt)) return;
        const ageDays = Math.floor((now - createdAt) / 86400000);
        if (ageDays <= 2) buckets.recent += 1;
        else if (ageDays <= 7) buckets.aging += 1;
        else buckets.stale += 1;
    });
    return buckets;
}

function getRequestAgeDays(request) {
    const createdAt = new Date(request?.created_at || 0).getTime();
    if (!Number.isFinite(createdAt)) return null;
    return Math.max(0, Math.floor((Date.now() - createdAt) / 86400000));
}

function buildTopListings(listings = [], listingMetrics = new Map(), accessRequests = []) {
    const pendingRequestsByListing = accessRequests.reduce((acc, request) => {
        const listingId = request.listing_id;
        acc[listingId] = (acc[listingId] || 0) + 1;
        return acc;
    }, {});

    return [...listings]
        .map((listing) => {
            const metrics = listingMetrics.get(listing.asset_id) || {};
            return {
                listingId: listing.id,
                title: listing.title,
                assetType: listing.asset_type,
                status: listing.status,
                visibility: listing.visibility,
                requests: toInt(metrics.requests),
                totalTokens: toInt(metrics.totalTokens),
                estimatedCostUsd: Number(toNumber(metrics.estimatedCostUsd).toFixed(6)),
                pendingAccessRequests: pendingRequestsByListing[listing.id] || 0,
                route: formatRoute('/agents', { tab: 'listings', q: listing.title })
            };
        })
        .sort((left, right) => {
            const rightScore = (right.estimatedCostUsd * 1000) + right.requests + (right.pendingAccessRequests * 10);
            const leftScore = (left.estimatedCostUsd * 1000) + left.requests + (left.pendingAccessRequests * 10);
            return rightScore - leftScore;
        })
        .slice(0, 6);
}

function buildReviewTimeline(listings = []) {
    const items = [];
    listings.forEach((listing) => {
        const reviews = Array.isArray(listing.reviews) ? listing.reviews : [];
        if (!reviews.length && String(listing.status || '').toLowerCase() === 'pending_review') {
            const activeRevision = listing.activeRevision || listing.currentRevision || null;
            items.push({
                id: `pending:${listing.id}`,
                listingId: listing.id,
                title: listing.title,
                status: listing.status,
                decision: 'pending_review',
                reason: activeRevision?.submit_notes || '',
                policyVersion: activeRevision?.policy_version || '',
                timestamp: activeRevision?.submitted_at || listing.updated_at,
                route: formatRoute('/agents', { tab: 'reviews', q: listing.title }),
                isBlocked: true
            });
        }
        reviews.forEach((review) => {
            items.push({
                id: review.id,
                listingId: listing.id,
                title: listing.title,
                status: listing.status,
                decision: review.decision || review.action || 'review',
                reason: review.reason || '',
                findings: review.findings || [],
                policyVersion: review.policy_version || '',
                timestamp: review.created_at,
                route: formatRoute('/agents', { tab: 'reviews', q: listing.title }),
                isBlocked: ['rejected', 'suspended'].includes(String(listing.status || '').toLowerCase())
            });
        });
    });
    return items.sort(byMostRecent);
}

function buildUsageAnomalies({ trendPoints = [], modelBreakdown = [], assetBreakdown = [], agentsById = new Map() } = {}) {
    const items = [];
    if (trendPoints.length >= 3) {
        const latest = trendPoints[trendPoints.length - 1];
        const prior = trendPoints.slice(0, -1);
        const averageCost = prior.reduce((sum, point) => sum + toNumber(point.estimatedCostUsd), 0) / Math.max(1, prior.length);
        if (latest.estimatedCostUsd > 0 && averageCost > 0 && latest.estimatedCostUsd >= averageCost * 1.5) {
            items.push({
                id: 'cost_spike',
                type: 'cost_spike',
                severity: 'warning',
                title: 'Hosted cost spike detected',
                description: `${latest.day} is running above the recent cost baseline.`,
                route: formatRoute('/agents', { tab: 'usage', metric: 'cost' })
            });
        }

        const priorRequestsAverage = prior.reduce((sum, point) => sum + toInt(point.requests), 0) / Math.max(1, prior.length);
        if (priorRequestsAverage >= 3 && toInt(latest.requests) <= Math.max(0, Math.floor(priorRequestsAverage * 0.35))) {
            items.push({
                id: 'usage_drop',
                type: 'usage_drop',
                severity: 'info',
                title: 'Recent usage dipped sharply',
                description: `${latest.day} is below the recent request baseline.`,
                route: formatRoute('/agents', { tab: 'usage', metric: 'requests' })
            });
        }
    }

    modelBreakdown
        .filter((row) => row.requests >= 5 && row.errorRate >= 10)
        .slice(0, 3)
        .forEach((row) => {
            items.push({
                id: `model:${row.key}`,
                type: 'model_errors',
                severity: 'warning',
                title: `${row.providerName} / ${row.modelId} is error-prone`,
                description: `${row.errorRate}% of requests failed in the current window.`,
                route: formatRoute('/agents', { tab: 'usage', metric: 'requests' })
            });
        });

    assetBreakdown
        .filter((row) => {
            const agent = agentsById.get(row.agentId);
            return agent?.health?.state === 'warning' || agent?.health?.state === 'error';
        })
        .slice(0, 3)
        .forEach((row) => {
            items.push({
                id: `asset:${row.agentId}`,
                type: 'asset_health',
                severity: agentsById.get(row.agentId)?.health?.state === 'error' ? 'warning' : 'info',
                title: `${row.agentName} needs model attention`,
                description: agentsById.get(row.agentId)?.health?.summary || 'Model availability issues detected.',
                route: `/agentBuilder/${row.agentId}`
            });
        });

    return items.slice(0, 8);
}

function getAssetRoute(assetType, assetId, title = '') {
    if (assetType === 'agent') return `/agentBuilder/${assetId}`;
    if (assetType === 'skill') return '/skills';
    return formatRoute('/agents', { tab: 'listings', q: title });
}

function buildListingPreview(listing) {
    if (!listing) return null;
    const latestReview = Array.isArray(listing.reviews) && listing.reviews.length ? listing.reviews[0] : null;
    return {
        listingId: listing.id,
        title: listing.title,
        assetType: listing.asset_type,
        assetId: listing.asset_id,
        status: listing.status,
        visibility: listing.visibility,
        sourceRoute: getAssetRoute(listing.asset_type, listing.asset_id, listing.title),
        planSummary: (listing.plans || []).map((plan) => ({
            id: plan.id,
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
        } : null
    };
}

function buildUsageCompareSummary(currentSummary, previousSummary) {
    return {
        requests: buildDelta(currentSummary?.requests || 0, previousSummary?.requests || 0),
        tokens: buildDelta(currentSummary?.totalTokens || 0, previousSummary?.totalTokens || 0),
        cost: buildDelta(currentSummary?.estimatedCostUsd || 0, previousSummary?.estimatedCostUsd || 0),
        errorRate: buildDelta(currentSummary?.errorRate || 0, previousSummary?.errorRate || 0)
    };
}

const accDashboardService = {
    getDashboard(currentUser, { days = 30, compareDays = null, sections = null } = {}) {
        const userId = typeof currentUser === 'string' ? currentUser : currentUser?.id;
        const preferences = normalizePreferences(typeof currentUser === 'string' ? {} : currentUser?.settings);
        const rangeDays = clampDays(Number(days) || days, preferences.preferredDateRange);
        const compareWindowDays = clampDays(compareDays != null ? (Number(compareDays) || compareDays) : null, rangeDays);
        const requestedSections = Array.isArray(sections) && sections.length
            ? AVAILABLE_SECTIONS.filter((section) => sections.includes(String(section).trim().toLowerCase()))
            : AVAILABLE_SECTIONS.slice();
        const requested = new Set(requestedSections);
        const needsOverview = requested.has('overview');
        const needsLibrary = requested.has('library');
        const needsAccess = requested.has('access');
        const needsListings = requested.has('listings');
        const needsReviews = requested.has('reviews');
        const needsUsage = requested.has('usage');

        const needsOwnAgents = needsOverview || needsLibrary || needsUsage;
        const needsListingsData = needsOverview || needsLibrary || needsAccess || needsListings || needsReviews;
        const needsAccessData = needsOverview || needsAccess;
        const needsUsageData = needsOverview || needsLibrary || needsListings || needsUsage;
        const needsDeployments = needsOverview;
        const needsSkills = needsOverview;

        const ownAgentsRaw = needsOwnAgents ? AIAgentRepository.list({ userId, limit: 250 }) : [];
        const ownAgents = ownAgentsRaw.map((agent) => ({
            ...agent,
            health: classifyHealth(agent)
        }));
        const ownAgentIds = ownAgents.map((agent) => agent.id);
        const agentsById = new Map(ownAgents.map((agent) => [String(agent.id), agent]));
        const allSkillsForUser = needsSkills ? SkillRepository.listForUser(userId) : [];
        const ownSkills = allSkillsForUser.filter((skill) => String(skill.creator_id || '').toUpperCase() === String(userId || '').toUpperCase());
        const ownListings = needsListingsData ? catalogService.listOwnerListings(userId) : [];
        const inboundRequests = needsAccessData ? CatalogEntitlementRepository.listAccessRequestsForOwner(userId, { status: 'pending' }) : [];
        const outboundRequests = needsAccessData ? CatalogEntitlementRepository.listAccessRequestsForRequester(userId) : [];
        const ownedGrants = needsAccessData ? CatalogEntitlementRepository.listGrantsByOwner('user', userId) : [];
        const activeEntitlements = needsAccessData ? CatalogEntitlementRepository.listGrantsForSubject('user', userId, { status: 'active' }) : [];
        const deployments = needsDeployments ? DeploymentRepository.listAccessibleByUser(userId, { role: 'owner', limit: 250 }) : [];

        const currentUsageRows = needsUsageData && ownAgentIds.length
            ? listUsageRowsByOwnerAgents(ownAgentIds, { sinceDays: rangeDays })
            : [];
        const compareUsageRows = needsUsageData && ownAgentIds.length
            ? listUsageRowsByOwnerAgents(ownAgentIds, {
                sinceDays: rangeDays + compareWindowDays,
                untilDays: rangeDays
            })
            : [];
        const trendRows = needsUsageData && ownAgentIds.length
            ? listUsageTimelineByOwnerAgents(ownAgentIds, { sinceDays: rangeDays })
            : [];
        const miniSeriesRows = (needsLibrary && ownAgentIds.length)
            ? listUsageMiniSeriesByOwnerAgents(ownAgentIds, { sinceDays: Math.min(rangeDays, 14) })
            : [];
        const usageSummary = withUsageRates(summarizeUsageRows(currentUsageRows));
        const previousUsageSummary = withUsageRates(summarizeUsageRows(compareUsageRows));
        const trendPoints = buildTrendPoints(trendRows);
        const providerBreakdown = aggregateBreakdown(currentUsageRows, (row) => String(row.provider_name || '').toLowerCase(), (target, row) => {
            target.providerName = row.provider_name;
        });
        const modelBreakdown = aggregateBreakdown(currentUsageRows, (row) => `${row.provider_name || ''}:${row.model_id || ''}`, (target, row) => {
            target.providerName = row.provider_name || '';
            target.modelId = row.model_id || '';
        });
        const assetBreakdown = aggregateBreakdown(currentUsageRows, (row) => String(row.agent_id || ''), (target, row) => {
            target.agentId = row.agent_id || '';
            target.agentName = row.agent_name || row.agent_id || 'Agent';
            target.route = row.agent_id ? `/agentBuilder/${row.agent_id}` : '/agents';
        });
        const assetMetricsMap = new Map(assetBreakdown.map((row) => [String(row.agentId), row]));
        const agentMiniSeries = miniSeriesRows.reduce((acc, row) => {
            const key = String(row.agent_id || '');
            if (!key) return acc;
            if (!acc[key]) acc[key] = [];
            acc[key].push({
                day: row.day,
                requests: toInt(row.requests),
                totalTokens: toInt(row.total_tokens),
                errors: toInt(row.errors)
            });
            return acc;
        }, {});
        const listingsById = new Map(ownListings.map((listing) => [String(listing.id), listing]));
        const reviewCounts = ownListings.reduce((acc, listing) => {
            const key = String((listing.activeRevision || listing.currentRevision || listing.approvedRevision)?.review_status || listing.status || 'draft').toLowerCase();
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        const entitlementSnapshots = activeEntitlements.map((grant) => {
            const resolved = catalogEntitlementService.resolveAssetEntitlement({
                userId,
                subjectType: 'user',
                subjectId: userId,
                assetType: grant.asset_type,
                assetId: grant.asset_id
            });
            const listing = resolved.listing || (grant.listing_id ? ownListings.find((item) => item.id === grant.listing_id) : null);
            return {
                ...grant,
                usage: resolved.quota,
                title: listing?.title || `${grant.asset_type} ${grant.asset_id}`,
                route: getAssetRoute(grant.asset_type, grant.asset_id, listing?.title),
                listingId: listing?.id || grant.listing_id || null
            };
        });
        const nearExhaustion = entitlementSnapshots
            .flatMap((grant) => Object.entries(grant.usage?.metrics || {}).map(([metricKey, snapshot]) => ({
                id: grant.id,
                grantId: grant.id,
                asset_type: grant.asset_type,
                asset_id: grant.asset_id,
                title: grant.title,
                route: grant.route,
                metricKey,
                ...snapshot
            })))
            .filter((row) => row.percentUsed >= 80 || row.exhausted)
            .sort((left, right) => right.percentUsed - left.percentUsed);
        const quotaSummary = aggregateQuotaMetrics(entitlementSnapshots);
        const deploymentPolicies = deployments.map((deployment) => {
            const accessPolicy = catalogEntitlementService.getDeploymentAccessPolicySummary(deployment.id);
            const runtimeHealth = catalogEntitlementService.getDeploymentRuntimeHealth(deployment);
            const sponsorRisk = Object.values(accessPolicy?.sponsorQuota?.metrics || {}).some((metric) => toInt(metric.percentUsed) >= 80);
            return {
                deploymentId: deployment.id,
                slug: deployment.slug,
                accessPolicy,
                runtimeHealth,
                sponsorRisk
            };
        });
        const listingMetricsMap = new Map();
        ownListings.forEach((listing) => {
            if (!listing.asset_id || listing.asset_type !== 'agent') return;
            const metrics = assetMetricsMap.get(String(listing.asset_id));
            if (!metrics) return;
            listingMetricsMap.set(listing.asset_id, metrics);
        });

        const base = {
            userId,
            preferences,
            rangeDays,
            compareWindowDays,
            ownAgents,
            ownSkills,
            ownListings,
            inboundRequests,
            outboundRequests,
            ownedGrants,
            entitlementSnapshots,
            nearExhaustion,
            quotaSummary,
            deployments,
            deploymentPolicies,
            usageSummary,
            previousUsageSummary,
            usageCompareSummary: buildUsageCompareSummary(usageSummary, previousUsageSummary),
            trendPoints,
            providerBreakdown,
            modelBreakdown,
            assetBreakdown,
            assetMetricsMap,
            agentMiniSeries,
            listingMetricsMap,
            listingsById,
            reviewCounts,
            allSkillsForUser,
            agentsById
        };

        const output = {
            meta: {
                lastUpdatedAt: new Date().toISOString(),
                availableSections: AVAILABLE_SECTIONS.slice(),
                requestedSections,
                days: rangeDays,
                compareDays: compareWindowDays,
                preferences
            }
        };

        const enrich = (typeof this._buildSections === 'function') ? this._buildSections(base) : {};
        requestedSections.forEach((section) => {
            if (enrich[section] !== undefined) {
                output[section] = enrich[section];
            }
        });

        return output;
    },

    _buildSections(base) {
        const {
            userId,
            preferences,
            rangeDays,
            compareWindowDays,
            ownAgents,
            ownSkills,
            ownListings,
            inboundRequests,
            outboundRequests,
            ownedGrants,
            entitlementSnapshots,
            nearExhaustion,
            quotaSummary,
            deployments,
            deploymentPolicies,
            usageSummary,
            previousUsageSummary,
            usageCompareSummary,
            trendPoints,
            providerBreakdown,
            modelBreakdown,
            assetBreakdown,
            assetMetricsMap,
            agentMiniSeries,
            listingMetricsMap,
            listingsById,
            reviewCounts,
            allSkillsForUser,
            agentsById
        } = base;

        const alerts = [];
        nearExhaustion.slice(0, 5).forEach((item) => {
            alerts.push(buildAlert({
                type: 'quota',
                severity: item.exhausted ? 'warning' : 'info',
                title: `${item.title} is at ${item.percentUsed}%`,
                description: `${item.metricKey.replace(/^monthly_/, '').replace(/_/g, ' ')} remaining: ${toInt(item.remaining).toLocaleString()}`,
                route: formatRoute('/agents', { tab: 'access' }),
                key: `quota:${item.grantId}:${item.metricKey}`
            }));
        });
        inboundRequests.slice(0, 4).forEach((request) => {
            alerts.push(buildAlert({
                type: 'access_request',
                severity: getRequestAgeDays(request) > 7 ? 'warning' : 'info',
                title: 'Pending access request',
                description: request.note || 'A creator response is still pending.',
                route: formatRoute('/agents', { tab: 'access' }),
                key: `access:${request.id}`
            }));
        });
        ownListings
            .filter((listing) => ['pending_review', 'rejected', 'suspended'].includes(String(listing.status || '').toLowerCase()))
            .slice(0, 4)
            .forEach((listing) => {
                alerts.push(buildAlert({
                    type: 'listing',
                    severity: listing.status === 'suspended' ? 'warning' : 'info',
                    title: `${listing.title} is ${String(listing.status || '').replace(/_/g, ' ')}`,
                    description: listing.summary || 'Listing visibility requires attention.',
                    route: formatRoute('/agents', { tab: 'listings', q: listing.title }),
                    key: `listing:${listing.id}`
                }));
            });
        ownAgents
            .filter((agent) => ['warning', 'error'].includes(agent.health?.state))
            .slice(0, 4)
            .forEach((agent) => {
                alerts.push(buildAlert({
                    type: 'agent_health',
                    severity: agent.health.state === 'error' ? 'warning' : 'info',
                    title: `${agent.name} needs model attention`,
                    description: agent.health.summary,
                    route: `/agentBuilder/${agent.id}`,
                    key: `agent:${agent.id}`
                }));
            });
        deploymentPolicies
            .filter((deployment) => deployment.runtimeHealth?.state !== 'ok' || deployment.sponsorRisk)
            .slice(0, 4)
            .forEach((deployment) => {
                alerts.push(buildAlert({
                    type: 'deployment',
                    severity: deployment.runtimeHealth?.state === 'error' ? 'warning' : 'info',
                    title: `${deployment.slug} needs deployment attention`,
                    description: deployment.runtimeHealth?.summary || 'Deployment health warning',
                    route: '/deploy',
                    key: `deployment:${deployment.deploymentId}`
                }));
            });

        const reviewTimeline = buildReviewTimeline(ownListings);
        const recentActivity = [
            ...ownAgents.slice(0, 20).map((agent) => buildRecentItem({
                type: 'agent',
                title: agent.name,
                description: 'Agent updated',
                timestamp: agent.updated_at,
                route: `/agentBuilder/${agent.id}`,
                tone: agent.health?.state === 'error' ? 'warning' : agent.health?.state === 'warning' ? 'info' : 'default',
                meta: { agentId: agent.id }
            })),
            ...ownListings.slice(0, 20).map((listing) => buildRecentItem({
                type: 'listing',
                title: listing.title,
                description: `${listing.asset_type} listing updated`,
                timestamp: listing.updated_at,
                route: formatRoute('/agents', { tab: 'listings', q: listing.title }),
                tone: ['rejected', 'suspended'].includes(String(listing.status || '').toLowerCase()) ? 'warning' : 'default',
                meta: { listingId: listing.id }
            })),
            ...reviewTimeline.slice(0, 20).map((item) => buildRecentItem({
                type: 'review',
                title: item.title,
                description: `Review ${String(item.decision || 'updated').replace(/_/g, ' ')}`,
                timestamp: item.timestamp,
                route: item.route,
                tone: item.isBlocked ? 'warning' : 'default',
                meta: { listingId: item.listingId, reviewId: item.id }
            })),
            ...inboundRequests.slice(0, 12).map((request) => buildRecentItem({
                type: 'access_request',
                title: 'Access request received',
                description: request.note || 'A user requested access.',
                timestamp: request.created_at,
                route: formatRoute('/agents', { tab: 'access' }),
                tone: getRequestAgeDays(request) > 7 ? 'warning' : 'default',
                meta: { requestId: request.id }
            })),
            ...deploymentPolicies.slice(0, 12).map((deployment) => buildRecentItem({
                type: 'deployment',
                title: deployment.slug,
                description: deployment.runtimeHealth?.summary || 'Deployment status updated',
                timestamp: deployments.find((row) => row.id === deployment.deploymentId)?.updated_at,
                route: '/deploy',
                tone: deployment.runtimeHealth?.state === 'error' ? 'warning' : deployment.runtimeHealth?.state === 'warning' ? 'info' : 'default',
                meta: { deploymentId: deployment.deploymentId }
            }))
        ]
            .sort(byMostRecent)
            .slice(0, 10);

        const topUsedAssets = assetBreakdown.slice(0, 5).map((asset) => ({
            agentId: asset.agentId,
            title: asset.agentName,
            requests: asset.requests,
            totalTokens: asset.totalTokens,
            estimatedCostUsd: asset.estimatedCostUsd,
            route: asset.route
        }));
        const topPublicListings = ownListings
            .filter((listing) => listing.visibility === 'public' && ['approved', 'published'].includes(String(listing.status || '').toLowerCase()))
            .slice(0, 3)
            .map((listing) => ({
                listingId: listing.id,
                title: listing.title,
                route: formatRoute('/agents', { tab: 'listings', q: listing.title })
            }));
        const topListings = buildTopListings(ownListings, listingMetricsMap, inboundRequests);
        const staleListings = ownListings
            .filter((listing) => {
                const daysSinceUpdate = Math.floor((Date.now() - getTimestamp({ timestamp: listing.updated_at })) / 86400000);
                const missingApprovedRevision = !listing.approvedRevision && listing.visibility === 'public';
                const missingMetadata = !String(listing.summary || '').trim() || !(listing.plans || []).length;
                return daysSinceUpdate >= 14 || missingApprovedRevision || missingMetadata;
            })
            .map((listing) => ({
                listingId: listing.id,
                title: listing.title,
                status: listing.status,
                visibility: listing.visibility,
                route: formatRoute('/agents', { tab: 'listings', q: listing.title }),
                reasons: [
                    !String(listing.summary || '').trim() ? 'Missing summary' : null,
                    !(listing.plans || []).length ? 'Missing plan' : null,
                    !listing.approvedRevision && listing.visibility === 'public' ? 'No approved revision' : null,
                    Math.floor((Date.now() - getTimestamp({ timestamp: listing.updated_at })) / 86400000) >= 14 ? 'Stale update' : null
                ].filter(Boolean)
            }))
            .slice(0, 6);
        const linkedListings = ownListings.reduce((acc, listing) => {
            acc[String(listing.id)] = buildListingPreview(listing);
            return acc;
        }, {});
        const linkedAssets = ownListings.reduce((acc, listing) => {
            acc[`${listing.asset_type}:${listing.asset_id}`] = {
                assetType: listing.asset_type,
                assetId: listing.asset_id,
                title: listing.title,
                route: getAssetRoute(listing.asset_type, listing.asset_id, listing.title)
            };
            return acc;
        }, {});
        const groupHints = {
            category: ownAgents.reduce((acc, agent) => {
                const key = String((agent.categoryIds || [])[0] || 'uncategorized');
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {}),
            listing: ownAgents.reduce((acc, agent) => {
                const listing = ownListings.find((item) => String(item.asset_id) === String(agent.id));
                const key = String(listing?.status || 'unlisted').toLowerCase();
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {}),
            health: ownAgents.reduce((acc, agent) => {
                const key = String(agent.health?.state || 'unknown').toLowerCase();
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {}),
            provider: ownAgents.reduce((acc, agent) => {
                const key = String(agent.text_provider_display || agent.text_provider || 'none');
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {})
        };

        const healthCounts = ownAgents.reduce((acc, agent) => {
            const key = ['ok', 'warning', 'error'].includes(agent.health?.state) ? agent.health.state : 'unknown';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {
            ok: 0,
            warning: 0,
            error: 0,
            unknown: 0
        });

        const smartCollections = [
            {
                key: 'recent',
                label: 'Recent',
                count: ownAgents.filter((agent) => getTimestamp({ timestamp: agent.updated_at }) >= Date.now() - (14 * 86400000)).length,
                route: formatRoute('/agents', { tab: 'library', collection: 'recent' })
            },
            {
                key: 'pinned',
                label: 'Pinned',
                count: ownAgents.filter((agent) => preferences.pinnedAgentIds.includes(String(agent.id))).length,
                route: formatRoute('/agents', { tab: 'library', collection: 'pinned' })
            },
            {
                key: 'drafts',
                label: 'Drafts',
                count: ownAgents.filter((agent) => {
                    const listing = ownListings.find((item) => String(item.asset_id) === String(agent.id));
                    return !listing || ['draft', 'pending_review'].includes(String(listing.status || '').toLowerCase());
                }).length,
                route: formatRoute('/agents', { tab: 'library', collection: 'drafts' })
            },
            {
                key: 'needs_attention',
                label: 'Needs Attention',
                count: ownAgents.filter((agent) => {
                    const listing = ownListings.find((item) => String(item.asset_id) === String(agent.id));
                    return ['warning', 'error'].includes(agent.health?.state)
                        || ['rejected', 'suspended', 'pending_review'].includes(String(listing?.status || '').toLowerCase());
                }).length,
                route: formatRoute('/agents', { tab: 'library', collection: 'needs_attention' })
            },
            {
                key: 'top_used',
                label: 'Top Used',
                count: topUsedAssets.length,
                route: formatRoute('/agents', { tab: 'library', collection: 'top_used' })
            },
            {
                key: 'ready_to_publish',
                label: 'Ready to Publish',
                count: ownAgents.filter((agent) => {
                    const listing = ownListings.find((item) => String(item.asset_id) === String(agent.id));
                    return agent.health?.state === 'ok'
                        && (!listing || ['draft', 'pending_review'].includes(String(listing.status || '').toLowerCase()));
                }).length,
                route: formatRoute('/agents', { tab: 'library', collection: 'ready_to_publish' })
            }
        ];

        const anomalies = buildUsageAnomalies({
            trendPoints,
            modelBreakdown,
            assetBreakdown,
            agentsById
        });

        const deploymentUnhealthyCount = deploymentPolicies.filter((item) => item.runtimeHealth?.state !== 'ok').length;
        const deploymentSponsorRiskCount = deploymentPolicies.filter((item) => item.sponsorRisk).length;
        const crossSurface = {
            deployments: {
                count: deployments.length,
                unhealthyCount: deploymentUnhealthyCount,
                sponsorRiskCount: deploymentSponsorRiskCount,
                route: '/deploy'
            },
            skills: {
                workspaceCount: ownSkills.filter((skill) => String(skill.path || '').startsWith('workspace/')).length,
                installedCount: allSkillsForUser.filter((skill) => String(skill.path || '').startsWith(`installed/${userId || ''}/`)).length,
                publishedCount: ownListings.filter((listing) => listing.asset_type === 'skill' && listing.visibility === 'public' && ['approved', 'published'].includes(String(listing.status || '').toLowerCase())).length,
                route: '/skills'
            },
            hub: {
                publicExposureCount: ownListings.filter((listing) => listing.visibility === 'public').length,
                approvedExposureCount: ownListings.filter((listing) => listing.visibility === 'public' && ['approved', 'published'].includes(String(listing.status || '').toLowerCase())).length,
                topAssets: topPublicListings,
                route: '/hub'
            }
        };

        const kpis = {
            agents: {
                label: 'Agents',
                route: formatRoute('/agents', { tab: 'library' }),
                ...buildDelta(ownAgents.length, Math.max(0, ownAgents.length - getCreatedInWindow(ownAgents, rangeDays))),
                deltaLabel: `${getCreatedInWindow(ownAgents, rangeDays)} updated this window`
            },
            listings: {
                label: 'Listings',
                route: formatRoute('/agents', { tab: 'listings' }),
                ...buildDelta(ownListings.length, Math.max(0, ownListings.length - getCreatedInWindow(ownListings, rangeDays))),
                deltaLabel: `${getCreatedInWindow(ownListings, rangeDays)} new or updated`
            },
            deployments: {
                label: 'Deployments',
                route: '/deploy',
                ...buildDelta(deployments.length, Math.max(0, deployments.length - getCreatedInWindow(deployments, rangeDays))),
                deltaLabel: `${getCreatedInWindow(deployments, rangeDays)} created this window`
            },
            pendingReviews: {
                label: 'Pending Reviews',
                route: formatRoute('/agents', { tab: 'reviews' }),
                value: toInt(reviewCounts.pending_review),
                previousValue: Math.max(0, toInt(reviewCounts.pending_review) - getCreatedInWindow(reviewTimeline.filter((item) => item.decision === 'pending_review'), rangeDays)),
                delta: getCreatedInWindow(reviewTimeline.filter((item) => item.decision === 'pending_review'), rangeDays),
                direction: getCreatedInWindow(reviewTimeline.filter((item) => item.decision === 'pending_review'), rangeDays) > 0 ? 'up' : 'flat',
                percentDelta: 0,
                deltaLabel: `${getCreatedInWindow(reviewTimeline, rangeDays)} review updates`
            },
            activeAccess: {
                label: 'Active Access',
                route: formatRoute('/agents', { tab: 'access' }),
                value: entitlementSnapshots.length,
                previousValue: Math.max(0, entitlementSnapshots.length - getCreatedInWindow(entitlementSnapshots, rangeDays)),
                delta: getCreatedInWindow(entitlementSnapshots, rangeDays),
                direction: getCreatedInWindow(entitlementSnapshots, rangeDays) > 0 ? 'up' : 'flat',
                percentDelta: 0,
                deltaLabel: `${getCreatedInWindow(entitlementSnapshots, rangeDays)} new grants`
            }
        };

        return {
            overview: {
                counts: {
                    agents: ownAgents.length,
                    skills: ownSkills.length,
                    listings: ownListings.length,
                    publishedListings: ownListings.filter((listing) => listing.status === 'published').length,
                    activeEntitlements: entitlementSnapshots.length,
                    ownedGrants: ownedGrants.filter((grant) => grant.status === 'active').length,
                    deployments: deployments.length,
                    pendingReviews: reviewCounts.pending_review || 0,
                    inboundAccessRequests: inboundRequests.length
                },
                usage: usageSummary,
                reviews: reviewCounts,
                kpis,
                trend: {
                    points: trendPoints,
                    compare: previousUsageSummary,
                    metrics: ['requests', 'tokens', 'cost']
                },
                panelRoutes: {
                    kpis: formatRoute('/agents', { tab: 'overview' }),
                    trend: formatRoute('/agents', { tab: 'usage' }),
                    alerts: formatRoute('/agents', { tab: 'overview' }),
                    recent: formatRoute('/agents', { tab: 'overview' }),
                    highlights: formatRoute('/agents', { tab: 'overview' }),
                    federation: formatRoute('/agents', { tab: 'overview' })
                },
                alerts,
                recentActivity,
                spotlights: {
                    topUsedAssets,
                    fastestGrowingListing: topListings[0] || null,
                    highestCostModel: modelBreakdown[0] || null,
                    leastHealthyAssets: ownAgents
                        .filter((agent) => ['warning', 'error'].includes(agent.health?.state))
                        .slice(0, 4)
                        .map((agent) => ({
                            agentId: agent.id,
                            title: agent.name,
                            health: agent.health,
                            route: `/agentBuilder/${agent.id}`
                        }))
                },
                crossSurface
            },
            library: {
                summary: {
                    ownAgents: ownAgents.length,
                    subscribedAgents: 0,
                    drafts: smartCollections.find((item) => item.key === 'drafts')?.count || 0,
                    needsAttention: smartCollections.find((item) => item.key === 'needs_attention')?.count || 0,
                    readyToPublish: smartCollections.find((item) => item.key === 'ready_to_publish')?.count || 0
                },
                smartCollections,
                healthCounts,
                groupHints,
                recent: ownAgents
                    .sort(byMostRecent)
                    .slice(0, 6)
                    .map((agent) => ({
                        agentId: agent.id,
                        title: agent.name,
                        timestamp: agent.updated_at,
                        route: `/agentBuilder/${agent.id}`,
                        health: agent.health,
                        metrics: assetMetricsMap.get(String(agent.id)) || null
                    })),
                topUsedAssets,
                agentMetrics: assetBreakdown,
                agentMiniSeries,
                pinnedAgentIds: preferences.pinnedAgentIds
            },
            access: {
                activeEntitlements: entitlementSnapshots,
                inboundRequests,
                outboundRequests,
                ownedGrants,
                linkedListings,
                linkedAssets,
                groups: [
                    { key: 'my_access', label: 'My Access', count: entitlementSnapshots.length, items: entitlementSnapshots },
                    {
                        key: 'incoming_requests',
                        label: 'Incoming Requests',
                        count: inboundRequests.length,
                        items: inboundRequests.map((request) => ({
                            id: request.id,
                            title: 'Incoming access request',
                            requesterUserId: request.requester_user_id,
                            note: request.note || '',
                            status: request.status,
                            ageDays: getRequestAgeDays(request),
                            timestamp: request.created_at,
                            route: formatRoute('/agents', { tab: 'access' }),
                            listingId: request.listing_id
                        }))
                    },
                    {
                        key: 'outgoing_requests',
                        label: 'Outgoing Requests',
                        count: outboundRequests.length,
                        items: outboundRequests.map((request) => ({
                            id: request.id,
                            title: 'Outgoing access request',
                            requesterUserId: request.requester_user_id,
                            note: request.note || '',
                            status: request.status,
                            ageDays: getRequestAgeDays(request),
                            timestamp: request.created_at,
                            route: formatRoute('/agents', { tab: 'access' }),
                            listingId: request.listing_id
                        }))
                    },
                    {
                        key: 'granted_by_me',
                        label: 'Granted By Me',
                        count: ownedGrants.filter((grant) => grant.status === 'active').length,
                        items: ownedGrants
                            .filter((grant) => grant.status === 'active')
                            .map((grant) => ({
                                id: grant.id,
                                title: `${grant.asset_type} ${grant.asset_id}`,
                                status: grant.status,
                                subjectType: grant.subject_type,
                                subjectId: grant.subject_id,
                                timestamp: grant.created_at,
                                route: getAssetRoute(grant.asset_type, grant.asset_id),
                                featureGates: grant.feature_gates,
                                quota: catalogEntitlementService.resolveAssetEntitlement({
                                    subjectType: grant.subject_type,
                                    subjectId: grant.subject_id,
                                    assetType: grant.asset_type,
                                    assetId: grant.asset_id
                                }).quota
                            }))
                    },
                    { key: 'near_exhaustion', label: 'Near Exhaustion', count: nearExhaustion.length, items: nearExhaustion }
                ],
                quotaSummary,
                nearExhaustion,
                requestSummary: {
                    incomingPending: inboundRequests.length,
                    outgoingPending: outboundRequests.filter((item) => item.status === 'pending').length,
                    grantedByMe: ownedGrants.filter((grant) => grant.status === 'active').length,
                    aging: summarizeRequestAging([...inboundRequests, ...outboundRequests])
                }
            },
            listings: {
                items: ownListings.map((listing) => ({
                    ...listing,
                    ...buildListingPreview(listing)
                })),
                pipeline: {
                    draft: ownListings.filter((listing) => listing.status === 'draft').length,
                    pending_review: ownListings.filter((listing) => listing.status === 'pending_review').length,
                    approved: ownListings.filter((listing) => listing.status === 'approved').length,
                    published: ownListings.filter((listing) => listing.status === 'published').length,
                    rejected: ownListings.filter((listing) => listing.status === 'rejected').length,
                    suspended: ownListings.filter((listing) => listing.status === 'suspended').length
                },
                highlights: [
                    topListings[0] ? {
                        type: 'top_listing',
                        title: topListings[0].title,
                        description: `${topListings[0].requests.toLocaleString()} requests, $${topListings[0].estimatedCostUsd.toFixed(2)} hosted cost`,
                        route: topListings[0].route,
                        listingId: topListings[0].listingId
                    } : null,
                    staleListings[0] ? {
                        type: 'stale_listing',
                        title: staleListings[0].title,
                        description: staleListings[0].reasons.join(' | '),
                        route: staleListings[0].route,
                        listingId: staleListings[0].listingId
                    } : null
                ].filter(Boolean),
                stale: staleListings,
                topListings: topListings.map((listing) => ({
                    ...listing,
                    ...(linkedListings[String(listing.listingId)] || {})
                }))
            },
            reviews: {
                items: ownListings.map((listing) => ({
                    listingId: listing.id,
                    title: listing.title,
                    status: listing.status,
                    reviews: listing.reviews,
                    detailPreview: buildListingPreview(listing)
                })),
                timeline: reviewTimeline.map((item) => ({
                    ...item,
                    detailPreview: linkedListings[String(item.listingId)] || null
                })),
                aging: {
                    queue: summarizeRequestAging(reviewTimeline.filter((item) => item.decision === 'pending_review').map((item) => ({ created_at: item.timestamp }))),
                    oldestPendingDays: reviewTimeline
                        .filter((item) => item.decision === 'pending_review')
                        .reduce((max, item) => Math.max(max, getRequestAgeDays({ created_at: item.timestamp }) || 0), 0)
                },
                counts: {
                    pending: reviewTimeline.filter((item) => String(item.decision || '').toLowerCase() === 'pending_review').length,
                    approved: reviewTimeline.filter((item) => String(item.decision || '').toLowerCase() === 'approved').length,
                    rejected: reviewTimeline.filter((item) => String(item.decision || '').toLowerCase() === 'rejected').length,
                    blocked: reviewTimeline.filter((item) => item.isBlocked).length
                },
                detailPreview: linkedListings
            },
            usage: {
                days: rangeDays,
                models: modelBreakdown.map((row) => ({
                    providerName: row.providerName,
                    modelId: row.modelId,
                    requests: row.requests,
                    errors: row.errors,
                    promptTokens: row.promptTokens,
                    completionTokens: row.completionTokens,
                    totalTokens: row.totalTokens,
                    estimatedCostUsd: row.estimatedCostUsd,
                    errorRate: row.errorRate
                })),
                summary: usageSummary,
                previousSummary: previousUsageSummary,
                compareSummary: usageCompareSummary,
                timeseries: trendPoints,
                providerBreakdown,
                modelBreakdown,
                assetBreakdown,
                anomalies
            }
        };
    },

    getAdminOverview() {
        const pendingReviews = catalogService.listModerationQueue();
        const reviewStats = get(`SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN review_status = 'pending_review' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) AS approved,
                SUM(CASE WHEN review_status = 'rejected' THEN 1 ELSE 0 END) AS rejected
            FROM catalog_listing_revisions`) || {};
        return {
            queue: pendingReviews,
            stats: reviewStats
        };
    }
};

module.exports = accDashboardService;

