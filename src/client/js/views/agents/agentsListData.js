export async function loadAgentsListData({
    api,
    locationSearch = ''
} = {}) {
    const [{ data: agents }, { data: allTags }, { data: agentCategories }, { data: chats }, { data: hubAgents }] = await Promise.all([
        api('/agents'),
        api('/agents/tags').catch(() => ({ data: [] })),
        api('/agents/categories').catch(() => ({ data: [] })),
        api('/chats').catch(() => ({ data: [] })),
        api('/agents/hub').catch(() => ({ data: [] }))
    ]);

    const params = new URLSearchParams(locationSearch || '');
    const tagFilter = params.get('tag') || '';
    const categoryFilter = params.get('category') || '';

    const own = (agents || []).filter((agent) => agent.isOwner);
    const subscribed = (agents || []).filter((agent) => agent.isSubscribed);
    const applyTagFilter = (list) => !tagFilter ? list : list.filter((agent) => (agent.tags || []).some((tag) => (tag.name || tag) === tagFilter));
    const ownFiltered = applyTagFilter(own);
    const subscribedFiltered = applyTagFilter(subscribed);

    const categories = agentCategories || [];
    const ownByCategory = {};
    const ownUncategorized = [];
    for (const agent of ownFiltered) {
        const categoryId = (agent.categoryIds || [])[0];
        if (!categoryId) {
            ownUncategorized.push(agent);
        } else {
            (ownByCategory[categoryId] = ownByCategory[categoryId] || []).push(agent);
        }
    }

    const agentMap = new Map((agents || []).map((agent) => [agent.id, agent]));
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const chatsThisWeek = (chats || []).filter((chat) => {
        const ts = chat.last_message_at || chat.updated_at || chat.created_at;
        return ts && new Date(ts) >= weekAgo;
    }).length;

    const suggested = (hubAgents || []).filter((hubAgent) => !agents?.some((agent) => agent.id === hubAgent.id)).slice(0, 3);

    return {
        agents: agents || [],
        allTags: allTags || [],
        categories,
        chats: chats || [],
        hubAgents: hubAgents || [],
        tagFilter,
        categoryFilter,
        ownFiltered,
        subscribedFiltered,
        ownByCategory,
        ownUncategorized,
        chatsThisWeek,
        suggested,
        agentMap
    };
}
