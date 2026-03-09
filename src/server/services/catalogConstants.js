const LISTING_STATUS = {
    DRAFT: 'draft',
    PENDING_REVIEW: 'pending_review',
    APPROVED: 'approved',
    PUBLISHED: 'published',
    REJECTED: 'rejected',
    SUSPENDED: 'suspended'
};

const REVIEW_STATUS = {
    DRAFT: 'draft',
    PENDING: 'pending_review',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    SUSPENDED: 'suspended'
};

const VISIBILITY = {
    PRIVATE: 'private',
    UNLISTED: 'unlisted',
    PUBLIC: 'public'
};

const ASSET_TYPES = {
    AGENT: 'agent',
    SKILL: 'skill',
    BUNDLE: 'bundle'
};

const SUBJECT_TYPES = {
    USER: 'user',
    DEPLOYMENT: 'deployment',
    ORG: 'org'
};

const GRANT_TYPES = {
    MANUAL: 'manual',
    LEGACY_SUBSCRIPTION: 'legacy_subscription',
    ACCESS_REQUEST: 'access_request',
    DEPLOYMENT_SPONSOR: 'deployment_sponsor'
};

const GRANT_SCOPES = {
    DIRECT: 'direct',
    BUNDLE_DERIVED: 'bundle_derived',
    DEPLOYMENT_BUDGET: 'deployment_budget',
    DEPLOYMENT_SPONSOR: 'deployment_sponsor'
};

const GRANT_STATUS = {
    ACTIVE: 'active',
    REVOKED: 'revoked',
    EXPIRED: 'expired',
    SUSPENDED: 'suspended'
};

const DEPLOYMENT_ACCESS_MODE = {
    PUBLIC_SPONSORED: 'public_sponsored',
    AUTHENTICATED_ENTITLED: 'authenticated_entitled',
    INTERNAL_ONLY: 'internal_only'
};

const BILLING_PROVIDER = {
    NONE: 'none',
    STRIPE: 'stripe'
};

const FEATURE_GATES = {
    can_chat: false,
    can_copy: false,
    can_deploy: false,
    can_api: false,
    can_install: false,
    can_use_skill: false,
    can_commercial_use: false
};

const DEFAULT_FEATURE_GATES_BY_ASSET = {
    [ASSET_TYPES.AGENT]: {
        ...FEATURE_GATES,
        can_chat: true,
        can_copy: true,
        can_deploy: true
    },
    [ASSET_TYPES.SKILL]: {
        ...FEATURE_GATES,
        can_install: true,
        can_use_skill: true
    },
    [ASSET_TYPES.BUNDLE]: {
        ...FEATURE_GATES,
        can_chat: true,
        can_copy: true,
        can_deploy: true,
        can_install: true,
        can_use_skill: true
    }
};

const ACTION_TO_GATE = {
    chat: 'can_chat',
    copy: 'can_copy',
    deploy: 'can_deploy',
    api: 'can_api',
    install: 'can_install',
    use_skill: 'can_use_skill',
    commercial_use: 'can_commercial_use'
};

const USAGE_ATTRIBUTION_LEG_TYPES = {
    BILLABLE_PRIMARY: 'billable_primary',
    GRANT_QUOTA: 'grant_quota',
    DEPLOYMENT_BUDGET: 'deployment_budget',
    END_USER_HISTORY: 'end_user_history',
    ASSET_OWNER_SHARE: 'asset_owner_share',
    SKILL_OWNER_SHARE: 'skill_owner_share',
    DEPLOYMENT_OWNER_HISTORY: 'deployment_owner_history'
};

module.exports = {
    LISTING_STATUS,
    REVIEW_STATUS,
    VISIBILITY,
    ASSET_TYPES,
    SUBJECT_TYPES,
    GRANT_TYPES,
    GRANT_SCOPES,
    GRANT_STATUS,
    DEPLOYMENT_ACCESS_MODE,
    BILLING_PROVIDER,
    FEATURE_GATES,
    DEFAULT_FEATURE_GATES_BY_ASSET,
    ACTION_TO_GATE,
    USAGE_ATTRIBUTION_LEG_TYPES
};
