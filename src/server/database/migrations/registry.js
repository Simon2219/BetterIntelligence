const migrationModules = [
    require('./m001_initial'),
    require('./m002_skills_deploy'),
    require('./m003_agent_image'),
    require('./m004_users_last_seen'),
    require('./m005_advanced_model_params'),
    require('./m006_knowledge_base'),
    require('./m007_agent_analytics'),
    require('./m008_indexes_and_fixes'),
    require('./m009_skills_proper'),
    require('./m010_drop_skills_order'),
    require('./m011_roles_permissions'),
    require('./m012_agent_subscriptions'),
    require('./m013_tags'),
    require('./m014_conversation_reads'),
    require('./m015_skill_categories'),
    require('./m016_agent_categories'),
    require('./m017_user_private_tags'),
    require('./m018_chats_realchat'),
    require('./m019_chat_messages_unread_index'),
    require('./m020_chat_summaries_and_model_registry'),
    require('./m021_ai_model_catalog_usage'),
    require('./m022_chat_summary_message_count'),
    require('./m023_deployment_ownership_and_embed_acl')
];

function listMigrations() {
    return migrationModules.slice();
}

module.exports = {
    migrationModules,
    listMigrations
};
