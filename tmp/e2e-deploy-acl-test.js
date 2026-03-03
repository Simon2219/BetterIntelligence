process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const https = require('https');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const Config = require('../config/Config');

const API_PORT = process.env.PORT || String(Config.get('server.port', 3001));
const BASE = `https://localhost:${API_PORT}/api`;
const agent = new https.Agent({ rejectUnauthorized: false });

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function api(pathname, opts = {}) {
    const url = `${BASE}${pathname}`;
    const headers = { ...(opts.headers || {}) };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, {
        method: opts.method || 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        agent
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {
        data = { raw: text };
    }

    return { status: res.status, data };
}

async function signup({ email, username, displayName, password }) {
    const res = await api('/auth/signup', {
        method: 'POST',
        body: { email, username, displayName, password }
    });
    assert(res.status === 201, `Signup failed for ${username}: HTTP ${res.status} ${JSON.stringify(res.data)}`);
    const payload = res.data?.data || {};
    assert(typeof payload.userId === 'string' && payload.userId.length > 0, `signup userId contract broken for ${username}`);
    assert(payload.user && typeof payload.user.id === 'string', `signup user object missing for ${username}`);
    assert(payload.user.id.toUpperCase() === payload.userId.toUpperCase(), `signup userId mismatch for ${username}`);
    assert(typeof payload.accessToken === 'string' && payload.accessToken.length > 0, `signup accessToken missing for ${username}`);
    return {
        userId: payload.userId,
        token: payload.accessToken,
        username,
        email
    };
}

async function createAgent(token, name) {
    const res = await api('/agents', {
        method: 'POST',
        token,
        body: { name }
    });
    assert(res.status === 201, `Create agent failed: HTTP ${res.status} ${JSON.stringify(res.data)}`);
    const id = res.data?.data?.id;
    assert(typeof id === 'string' && id.length > 0, 'Create agent response missing id');
    return res.data.data;
}

async function createDeployment(token, agentId, slug) {
    const res = await api('/deploy', {
        method: 'POST',
        token,
        body: { agentId, slug }
    });
    assert(res.status === 201, `Create deployment failed ${slug}: HTTP ${res.status} ${JSON.stringify(res.data)}`);
    return res.data.data;
}

async function run() {
    const runId = Date.now();
    const password = 'StrongPass_123';

    const users = {};
    users.a = await signup({
        email: `e2e_a_${runId}@example.com`,
        username: `e2e_a_${runId}`,
        displayName: `E2E A ${runId}`,
        password
    });
    users.b = await signup({
        email: `e2e_b_${runId}@example.com`,
        username: `e2e_b_${runId}`,
        displayName: `E2E B ${runId}`,
        password
    });
    users.c = await signup({
        email: `e2e_c_${runId}@example.com`,
        username: `e2e_c_${runId}`,
        displayName: `E2E C ${runId}`,
        password
    });
    users.d = await signup({
        email: `e2e_d_${runId}@example.com`,
        username: `e2e_d_${runId}`,
        displayName: `E2E D ${runId}`,
        password
    });
    users.e = await signup({
        email: `e2e_e_${runId}@example.com`,
        username: `e2e_e_${runId}`,
        displayName: `E2E E ${runId}`,
        password
    });

    const agentA = await createAgent(users.a.token, `E2E Agent ${runId}`);

    const slug1 = `e2e-${runId}-main`;
    const slug2 = `e2e-${runId}-alt`;
    const dep1 = await createDeployment(users.b.token, agentA.id, slug1);
    const dep2 = await createDeployment(users.b.token, agentA.id, slug2);

    assert(typeof dep1.owner_user_id === 'string' && dep1.owner_user_id.toUpperCase() === users.b.userId.toUpperCase(), 'owner_user_id not set to deployment creator');

    const embedChatRes1 = await api(`/deploy/${encodeURIComponent(slug1)}/chat`, {
        method: 'POST',
        body: { message: 'hello from e2e main deployment' }
    });
    assert(embedChatRes1.status === 200, `Embed chat creation failed slug1: ${embedChatRes1.status}`);
    const chatId1 = embedChatRes1.data?.data?.conversationId;
    assert(typeof chatId1 === 'string' && chatId1.length > 0, 'Missing embed conversationId for slug1');

    const embedChatRes2 = await api(`/deploy/${encodeURIComponent(slug2)}/chat`, {
        method: 'POST',
        body: { message: 'hello from e2e alt deployment' }
    });
    assert(embedChatRes2.status === 200, `Embed chat creation failed slug2: ${embedChatRes2.status}`);
    const chatId2 = embedChatRes2.data?.data?.conversationId;
    assert(typeof chatId2 === 'string' && chatId2.length > 0, 'Missing embed conversationId for slug2');

    const ownerChats = await api(`/deploy/${encodeURIComponent(slug1)}/chats`, { token: users.b.token });
    assert(ownerChats.status === 200, `Owner chats list failed: ${ownerChats.status}`);
    const ownerChatIds = (ownerChats.data?.data?.chats || []).map((c) => String(c.id));
    assert(ownerChatIds.includes(chatId1), 'Deployment chat list missing own embed chat');
    assert(!ownerChatIds.includes(chatId2), 'Deployment chat list leaked chat from other deployment');

    const ownerMessages = await api(`/deploy/${encodeURIComponent(slug1)}/chats/${encodeURIComponent(chatId1)}/messages`, { token: users.b.token });
    assert(ownerMessages.status === 200, `Owner deployment chat messages failed: ${ownerMessages.status}`);
    const msgList = ownerMessages.data?.data?.messages || [];
    assert(Array.isArray(msgList) && msgList.length >= 1, 'Deployment chat messages missing');

    const nonMemberChats = await api(`/deploy/${encodeURIComponent(slug1)}/chats`, { token: users.e.token });
    assert(nonMemberChats.status === 403, `Non-member deploy chats should be 403, got ${nonMemberChats.status}`);

    const nonMemberChatByGlobal = await api(`/chats/${encodeURIComponent(chatId1)}`, { token: users.e.token });
    assert(nonMemberChatByGlobal.status === 403, `Global chat read bypass still open, got ${nonMemberChatByGlobal.status}`);

    const nonMemberChatMessagesByGlobal = await api(`/chats/${encodeURIComponent(chatId1)}/messages`, { token: users.e.token });
    assert(nonMemberChatMessagesByGlobal.status === 403, `Global chat messages bypass still open, got ${nonMemberChatMessagesByGlobal.status}`);

    const addAdmin = await api(`/deploy/${encodeURIComponent(slug1)}/members`, {
        method: 'POST',
        token: users.b.token,
        body: { userId: users.c.userId, role: 'admin' }
    });
    assert(addAdmin.status === 201, `Add admin member failed: ${addAdmin.status} ${JSON.stringify(addAdmin.data)}`);

    const adminApiKey = await api(`/deploy/${encodeURIComponent(slug1)}/api-key`, {
        method: 'POST',
        token: users.c.token
    });
    assert(adminApiKey.status === 200, `Admin should manage config/api-key, got ${adminApiKey.status}`);

    const addManager = await api(`/deploy/${encodeURIComponent(slug1)}/members`, {
        method: 'POST',
        token: users.b.token,
        body: { userId: users.d.userId, role: 'manager' }
    });
    assert(addManager.status === 201, `Add manager member failed: ${addManager.status}`);

    const managerChats = await api(`/deploy/${encodeURIComponent(slug1)}/chats`, {
        token: users.d.token
    });
    assert(managerChats.status === 200, `Manager default view_chats should allow chats list, got ${managerChats.status}`);

    const managerApiKeyDenied = await api(`/deploy/${encodeURIComponent(slug1)}/api-key`, {
        method: 'POST',
        token: users.d.token
    });
    assert(managerApiKeyDenied.status === 403, `Manager without manage_config should be denied api-key, got ${managerApiKeyDenied.status}`);

    const managerMembersDenied = await api(`/deploy/${encodeURIComponent(slug1)}/members`, {
        token: users.d.token
    });
    assert(managerMembersDenied.status === 403, `Manager without manage_members should be denied members list, got ${managerMembersDenied.status}`);

    const promoteManagerConfig = await api(`/deploy/${encodeURIComponent(slug1)}/members/${encodeURIComponent(users.d.userId)}`, {
        method: 'PATCH',
        token: users.b.token,
        body: {
            role: 'manager',
            permissions: {
                view_chats: true,
                manage_chats: false,
                manage_config: true,
                manage_members: false
            }
        }
    });
    assert(promoteManagerConfig.status === 200, `Manager permission patch failed: ${promoteManagerConfig.status}`);

    const managerApiKeyAllowed = await api(`/deploy/${encodeURIComponent(slug1)}/api-key`, {
        method: 'POST',
        token: users.d.token
    });
    assert(managerApiKeyAllowed.status === 200, `Manager with manage_config should access api-key, got ${managerApiKeyAllowed.status}`);

    const ownerRemovalBlocked = await api(`/deploy/${encodeURIComponent(slug1)}/members/${encodeURIComponent(users.b.userId)}`, {
        method: 'DELETE',
        token: users.b.token
    });
    assert(ownerRemovalBlocked.status === 400, `Owner removal should be blocked, got ${ownerRemovalBlocked.status}`);

    const memberSearch = await api(`/deploy/${encodeURIComponent(slug1)}/member-search?q=${encodeURIComponent(users.e.username)}`, {
        token: users.b.token
    });
    assert(memberSearch.status === 200, `Member search failed: ${memberSearch.status}`);
    const searchUsers = memberSearch.data?.data?.users || [];
    assert(searchUsers.some((u) => String(u.userId || '').toUpperCase() === users.e.userId.toUpperCase()), 'Member search did not return expected user');

    // Appearance read stability checks
    const dbPathRaw = Config.get('db.path', './data/db/betterintelligence.db');
    const dbPath = path.isAbsolute(dbPathRaw) ? dbPathRaw : path.resolve(process.cwd(), dbPathRaw);
    const db = new Database(dbPath, { readonly: false });
    const settingKeys = ['appearance.palettes', 'appearance.assignments', 'colors.dark', 'colors.light'];
    const warmAppearance = await api('/appearance');
    assert(warmAppearance.status === 200, `Appearance warmup failed: ${warmAppearance.status}`);
    const beforeRows = db.prepare(`SELECT key, value, updated_at FROM app_settings WHERE key IN (${settingKeys.map(() => '?').join(',')})`).all(...settingKeys);

    const appRead1 = await api('/appearance');
    const appRead2 = await api('/appearance');
    assert(appRead1.status === 200 && appRead2.status === 200, 'Appearance endpoint failed during churn check');

    const afterRows = db.prepare(`SELECT key, value, updated_at FROM app_settings WHERE key IN (${settingKeys.map(() => '?').join(',')})`).all(...settingKeys);
    db.close();

    const beforeMap = new Map(beforeRows.map((r) => [r.key, r]));
    const afterMap = new Map(afterRows.map((r) => [r.key, r]));
    for (const key of settingKeys) {
        const b = beforeMap.get(key);
        const a = afterMap.get(key);
        assert(!!b && !!a, `Missing setting row for ${key}`);
        assert(String(b.value) === String(a.value), `Appearance read changed value for ${key}`);
        assert(String(b.updated_at || '') === String(a.updated_at || ''), `Appearance read changed updated_at for ${key}`);
    }

    // Runtime model hard-block checks (text inactive, image hidden)
    const { initDb, shutdown, AIModelRepository } = require(path.resolve(process.cwd(), 'src/server/database'));
    const AIExecution = require(path.resolve(process.cwd(), 'src/server/ai/execution/AIExecution'));

    await initDb();
    const blockedTextModel = `e2e-blocked-text-${runId}`;
    const blockedImageModel = `e2e-blocked-image-${runId}`;

    AIModelRepository.upsertModel('e2e_provider', blockedTextModel, {
        modelType: 'text',
        isActive: false,
        isUserVisible: true,
        displayName: blockedTextModel
    });
    AIModelRepository.upsertModel('e2e_provider', blockedImageModel, {
        modelType: 'image',
        isActive: true,
        isUserVisible: false,
        displayName: blockedImageModel
    });

    let textBlocked = false;
    try {
        await AIExecution.executeText({
            agent: { text_provider: 'e2e_provider', text_model: blockedTextModel },
            systemPrompt: 'test',
            messages: [{ role: 'user', content: 'test' }]
        });
    } catch (err) {
        textBlocked = String(err.message || '').toLowerCase().includes('inactive');
    }
    assert(textBlocked, 'executeText did not hard-block inactive model');

    let imageBlocked = false;
    try {
        await AIExecution.executeImage({
            agent: { image_provider: 'e2e_provider', image_model: blockedImageModel },
            conversationId: `e2e-${runId}`,
            prompt: 'test'
        });
    } catch (err) {
        imageBlocked = String(err.message || '').toLowerCase().includes('hidden');
    }
    assert(imageBlocked, 'executeImage did not hard-block hidden model');

    shutdown();

    console.log('E2E_RESULT: PASS');
    console.log(JSON.stringify({
        createdUsers: Object.values(users).map((u) => ({ userId: u.userId, username: u.username })),
        deploymentSlug: slug1,
        chatId: chatId1,
        checks: [
            'signup contract',
            'deployment creation by any auth user',
            'owner/admin manager ACL toggles',
            'non-member denial',
            'embed chat deployment boundary',
            'global /api/chats embed bypass closed',
            'appearance read stability',
            'AIExecution hard block inactive/hidden'
        ]
    }, null, 2));
}

run().catch((err) => {
    console.error('E2E_RESULT: FAIL');
    console.error(err.stack || err.message || String(err));
    process.exit(1);
});
