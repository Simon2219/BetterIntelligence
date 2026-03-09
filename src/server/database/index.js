const connection = require('./core/connection');
const query = require('./core/query');
const tx = require('./core/transaction');
const ids = require('./core/ids');

const UserRepository = require('./repositories/UserRepository');
const RoleRepository = require('./repositories/RoleRepository');
const TokenRepository = require('./repositories/TokenRepository');
const SettingsRepository = require('./repositories/SettingsRepository');
const AIModelRepository = require('./repositories/AIModelRepository');
const AIAgentRepository = require('./repositories/AIAgentRepository');
const ChatRepository = require('./repositories/ChatRepository');
const DeploymentRepository = require('./repositories/DeploymentRepository');
const DeploymentMemberRepository = require('./repositories/DeploymentMemberRepository');
const { AgentCategoryRepository, SkillCategoryRepository } = require('./repositories/CategoryRepositories');
const UserPrivateTagRepository = require('./repositories/UserPrivateTagRepository');
const HookConfigRepository = require('./repositories/HookConfigRepository');
const SkillRepository = require('./repositories/SkillRepository');
const SkillInstallationRepository = require('./repositories/SkillInstallationRepository');
const KnowledgeRepository = require('./repositories/KnowledgeRepository');
const AnalyticsRepository = require('./repositories/AnalyticsRepository');
const TagRepository = require('./repositories/TagRepository');
const CatalogListingRepository = require('./repositories/CatalogListingRepository');
const CatalogEntitlementRepository = require('./repositories/CatalogEntitlementRepository');
const DeploymentAccessPolicyRepository = require('./repositories/DeploymentAccessPolicyRepository');
const UsageAttributionRepository = require('./repositories/UsageAttributionRepository');

module.exports = {
    initializeDatabase: connection.initDb,
    shutdown: connection.shutdown,
    initDb: connection.initDb,
    run: query.run,
    all: query.all,
    get: query.get,
    transaction: tx.transaction,
    generateId: ids.generateId,
    generateUserId: ids.generateUserId,

    UserRepository,
    RoleRepository,
    TokenRepository,
    SettingsRepository,
    AIModelRepository,
    AIAgentRepository,
    ChatRepository,
    DeploymentRepository,
    DeploymentMemberRepository,
    SkillCategoryRepository,
    AgentCategoryRepository,
    UserPrivateTagRepository,
    HookConfigRepository,
    SkillRepository,
    SkillInstallationRepository,
    KnowledgeRepository,
    AnalyticsRepository,
    TagRepository,
    CatalogListingRepository,
    CatalogEntitlementRepository,
    DeploymentAccessPolicyRepository,
    UsageAttributionRepository
};
