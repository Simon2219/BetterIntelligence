#!/usr/bin/env node
/**
 * Run full API test matrix from the plan.
 * Usage: node scripts/run-api-tests.js [baseUrl]
 * Default baseUrl: https://localhost:3001
 */
const http = require('http');
const https = require('https');

const BASE = process.argv[2] || 'https://localhost:3001';
let token = null;
let userId = null;
let agentId = null;
let chatId = null;
let slug = null;
let hookId = null;
let cookies = [];
let adminToken = null;
let consumerToken = null;
let consumerUserId = null;

const results = [];

function recordResult(name, ok, extra = {}) {
    results.push({ name, ok, ...extra });
}

function request(method, path, body = null, useAuth = false, rawBody = false, authToken = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const opts = {
            method,
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            headers: { 'Content-Type': 'application/json' },
            rejectUnauthorized: false
        };
        const resolvedToken = authToken || token;
        if (useAuth && resolvedToken) opts.headers['Authorization'] = `Bearer ${resolvedToken}`;
        if (cookies.length) opts.headers['Cookie'] = cookies.join('; ');
        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request(opts, (res) => {
            let data = '';
            const setCookie = res.headers['set-cookie'];
            if (setCookie) for (const c of setCookie) cookies.push(c.split(';')[0]);
            res.on('data', (c) => data += c);
            res.on('end', () => {
                let parsed;
                try { parsed = rawBody ? data : (data ? JSON.parse(data) : {}); } catch { parsed = data; }
                resolve({ status: res.statusCode, data: parsed, headers: res.headers });
            });
        });
        req.on('error', reject);
        if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
    });
}

function test(name, method, path, body, useAuth, expectStatus, expectKey) {
    return request(method, path, body, useAuth).then(res => {
        const ok = Array.isArray(expectStatus) ? expectStatus.includes(res.status) : res.status === expectStatus;
        recordResult(name, ok, { status: res.status, expect: expectStatus });
        if (expectKey && res.data && res.data.data) {
            if (expectKey === 'accessToken' && res.data.data.accessToken) token = res.data.data.accessToken;
            if (expectKey === 'id' && res.data.data.id) userId = res.data.data.id;
            if (expectKey === 'agentId' && res.data.data.id) agentId = res.data.data.id;
            if (expectKey === 'chatId' && res.data.data.id) chatId = res.data.data.id;
            if (expectKey === 'slug' && res.data.data.slug) slug = res.data.data.slug;
            if (expectKey === 'hookId' && res.data.data.id) hookId = res.data.data.id;
        }
        return res;
    }).catch(err => {
        recordResult(name, false, { error: err.message });
    });
}

async function run() {
    console.log('BetterIntelligence API Test Matrix');
    console.log('Base URL:', BASE);
    console.log('');

    // 4.1 Auth
    const ts = Date.now();
    const signupEmail = 'test-' + ts + '@example.com';
    const signupUsername = 'testuser' + ts;
    await test('Auth: Signup', 'POST', '/api/auth/signup', { email: signupEmail, password: 'Test123!', displayName: 'Tester', username: signupUsername }, false, 201, 'accessToken');
    await test('Auth: Signup duplicate', 'POST', '/api/auth/signup', { email: signupEmail, password: 'Test123!', displayName: 'Tester', username: signupUsername + 'x' }, false, [400, 409]);
    const loginTs = Date.now();
    const loginUser = 'login' + loginTs;
    await request('POST', '/api/auth/signup', { email: loginUser + '@example.com', password: 'Test123!', displayName: 'LoginTest', username: loginUser }, false);
    await test('Auth: Login', 'POST', '/api/auth/login', { login: loginUser + '@example.com', password: 'Test123!' }, false, 200, 'accessToken');
    await test('Auth: Login bad creds', 'POST', '/api/auth/login', { login: loginUser + '@example.com', password: 'Wrong' }, false, 401);
    const loginRes = await request('POST', '/api/auth/login', { login: loginUser + '@example.com', password: 'Test123!' }, false);
    token = loginRes.data?.data?.accessToken;
    await test('Auth: Refresh', 'POST', '/api/auth/refresh', {}, false, 200);
    await test('Auth: Logout', 'POST', '/api/auth/logout', {}, true, 200);
    token = loginRes.data?.data?.accessToken; // restore after logout
    await test('Auth: Session', 'GET', '/api/auth/session', null, true, 200, 'id');
    await test('Auth: Session no token', 'GET', '/api/auth/session', null, false, 401);

    // 4.2 Users
    await test('Users: Get me', 'GET', '/api/users/me', null, true, 200);
    await test('Users: Update me', 'PUT', '/api/users/me', { displayName: 'Updated' }, true, 200);

    // 4.3 Agents
    await test('Agents: List', 'GET', '/api/agents', null, true, 200);
    await test('Agents: Create', 'POST', '/api/agents', { name: 'Test Agent', systemPrompt: 'Hello from the private prompt', temperature: 0.7 }, true, 201, 'agentId');
    if (!agentId) agentId = (await request('GET', '/api/agents', null, true)).data?.data?.[0]?.id;
    await test('Agents: Create invalid', 'POST', '/api/agents', { name: '', temperature: 5 }, true, 400);
    await test('Agents: Get', 'GET', '/api/agents/' + (agentId || 'x'), null, true, 200);
    await test('Agents: Get 404', 'GET', '/api/agents/BADID123', null, true, 404);
    await test('Agents: Update', 'PUT', '/api/agents/' + (agentId || 'x'), { name: 'Updated Agent' }, true, 200);
    // Skip delete to keep agent for later tests

    // 4.4 Skills
    await test('Skills: List', 'GET', '/api/skills', null, true, 200);
    const skillSlug = 'test-skill-' + Date.now();
    const skillRes = await request('POST', '/api/skills', { slug: skillSlug, name: 'Test', description: 'Test skill' }, true);
    const skillId = skillRes.data?.data?.id;
    await test('Skills: Create', 'POST', '/api/skills', { slug: 'test-skill-b-' + Date.now(), name: 'TestB', description: 'Test' }, true, 201);
    await test('Skills: Get', 'GET', '/api/skills/' + (skillId || skillSlug), null, true, 200);
    await test('Skills: Update', 'PUT', '/api/skills/' + (skillId || skillSlug), { description: 'Updated' }, true, 200);

    // 4.5 Chats
    await test('Chats: List', 'GET', '/api/chats', null, true, 200);
    await test('Chats: Create', 'POST', '/api/chats', { agentId: agentId || 'x' }, true, 200, 'chatId');
    let chatId = (await request('GET', '/api/chats', null, true)).data?.data?.[0]?.id;
    if (!chatId) {
        const createRes = await request('POST', '/api/chats', { agentId: agentId || 'x' }, true);
        chatId = createRes.data?.data?.id;
    }
    await test('Chats: Get', 'GET', '/api/chats/' + (chatId || 'x'), null, true, 200);
    await test('Chats: Get messages', 'GET', '/api/chats/' + (chatId || 'x') + '/messages', null, true, 200);
    await test('Chats: Delete', 'DELETE', '/api/chats/' + (chatId || 'x'), null, true, 200);

    // 4.6 Deploy
    await test('Deploy: Create', 'POST', '/api/deploy', { agentId: agentId || 'x', slug: 'test-' + Date.now() }, true, 201, 'slug');
    if (!slug) slug = 'test-' + Date.now();
    await test('Deploy: Create slug taken', 'POST', '/api/deploy', { agentId: agentId || 'x', slug }, true, 409);
    await test('Deploy: Create invalid slug', 'POST', '/api/deploy', { agentId: agentId || 'x', slug: 'ab' }, true, 400);
    await test('Deploy: Get', 'GET', '/api/deploy/' + slug, null, false, 200);
    await test('Deploy: Check available', 'GET', '/api/deploy/nonexistent-slug-12345/check', null, false, 200);
    await test('Deploy: Check taken', 'GET', '/api/deploy/' + slug + '/check', null, false, 200);
    await test('Deploy: API key', 'POST', '/api/deploy/' + slug + '/api-key', {}, true, 200);
    const hooksPath = '/api/deploy/' + (slug || 'test-slug') + '/hooks';
    await test('Deploy: Hooks list', 'GET', hooksPath, null, true, 200);
    const hookRes = await request('POST', '/api/deploy/' + slug + '/hooks', { event: 'deploy_request', url: 'https://example.com/webhook' }, true);
    if (hookRes.data?.data?.id) hookId = hookRes.data.data.id;
    await test('Deploy: Hooks add', 'POST', '/api/deploy/' + slug + '/hooks', { event: 'agent_response', url: 'https://example.com/hook2' }, true, 201);
    if (hookId) await test('Deploy: Hooks delete', 'DELETE', '/api/deploy/' + slug + '/hooks/' + hookId, null, true, 200);
    await test('Deploy: Chat', 'POST', '/api/deploy/' + slug + '/chat', { message: 'Hi' }, false, 200);
    await test('Deploy: Chat no message', 'POST', '/api/deploy/' + slug + '/chat', {}, false, 400);

    const adminLoginRes = await request('POST', '/api/auth/login', { login: 'admin@betterintelligence.com', password: 'AdminPass123!' }, false);
    adminToken = adminLoginRes.data?.data?.accessToken || null;
    recordResult('Auth: Admin login', adminLoginRes.status === 200 && !!adminToken, { status: adminLoginRes.status, expect: 200 });
    const consumerTs = Date.now();
    const consumerEmail = `consumer-${consumerTs}@example.com`;
    const consumerUsername = `consumer${consumerTs}`;
    const consumerSignupRes = await request('POST', '/api/auth/signup', {
        email: consumerEmail,
        password: 'Test123!',
        displayName: 'Consumer',
        username: consumerUsername
    }, false);
    consumerToken = consumerSignupRes.data?.data?.accessToken || null;
    consumerUserId = consumerSignupRes.data?.data?.user?.id || null;
    recordResult('Auth: Consumer signup', consumerSignupRes.status === 201 && !!consumerToken, { status: consumerSignupRes.status, expect: 201 });

    // 4.7 Catalog + Hub
    await test('Hub: List skills', 'GET', '/api/hub/skills', null, false, 200);
    await test('Hub: List agents', 'GET', '/api/hub/agents', null, false, 200);
    await test('Agents legacy hub route removed', 'GET', '/api/agents/hub', null, false, 404);
    let skillListingId = null;
    let skillRevisionId = null;
    let agentListingId = null;
    let agentRevisionId = null;
    if (skillId) {
        const listingRes = await request('POST', '/api/catalog/skills', {
            assetId: skillId,
            title: 'Catalog Test Skill',
            summary: 'Catalog test summary',
            description: 'Catalog test description',
            visibility: 'public'
        }, true);
        recordResult('Catalog: Create skill listing', listingRes.status === 201, { status: listingRes.status, expect: 201 });
        skillListingId = listingRes.data?.data?.id || null;
        skillRevisionId = listingRes.data?.data?.currentRevision?.id || null;
    } else {
        recordResult('Catalog: Create skill listing', false, { error: 'No skillId available' });
    }
    if (skillListingId) {
        const submitRes = await request('POST', `/api/catalog/skills/${skillListingId}/submit`, { revisionId: skillRevisionId }, true);
        recordResult('Catalog: Submit skill listing', submitRes.status === 200, { status: submitRes.status, expect: 200 });
        const reviewId = submitRes.data?.data?.reviews?.[0]?.id || null;
        const moderateRes = reviewId
            ? await request('PATCH', `/api/catalog/reviews/${reviewId}`, { decision: 'approved', publish: true }, true, false, adminToken)
            : { status: 0 };
        recordResult('Catalog: Approve skill listing', moderateRes.status === 200, { status: moderateRes.status, expect: 200 });
    } else {
        recordResult('Catalog: Submit skill listing', false, { error: 'No skill listing available' });
    }

    if (agentId) {
        const listingRes = await request('POST', '/api/catalog/agents', {
            assetId: agentId,
            title: 'Catalog Test Agent',
            summary: 'Catalog agent summary',
            description: 'Catalog agent description',
            visibility: 'public'
        }, true);
        recordResult('Catalog: Create agent listing', listingRes.status === 201, { status: listingRes.status, expect: 201 });
        agentListingId = listingRes.data?.data?.id || null;
        agentRevisionId = listingRes.data?.data?.currentRevision?.id || null;
    } else {
        recordResult('Catalog: Create agent listing', false, { error: 'No agentId available' });
    }
    if (agentListingId) {
        const submitRes = await request('POST', `/api/catalog/agents/${agentListingId}/submit`, { revisionId: agentRevisionId }, true);
        recordResult('Catalog: Submit agent listing', submitRes.status === 200, { status: submitRes.status, expect: 200 });
        const reviewId = submitRes.data?.data?.reviews?.[0]?.id || null;
        const moderateRes = reviewId
            ? await request('PATCH', `/api/catalog/reviews/${reviewId}`, { decision: 'approved', publish: true }, true, false, adminToken)
            : { status: 0 };
        recordResult('Catalog: Approve agent listing', moderateRes.status === 200, { status: moderateRes.status, expect: 200 });
    } else {
        recordResult('Catalog: Submit agent listing', false, { error: 'No agent listing available' });
    }

    if (agentId) {
        const publicAgentRes = await request('GET', `/api/hub/agents/${agentId}`, null, false);
        const publicAgent = publicAgentRes.data?.data || {};
        recordResult('Hub: Public agent detail sanitized', publicAgentRes.status === 200
            && publicAgent.personalityProfile
            && publicAgent.system_prompt === undefined
            && publicAgent.behavior_rules === undefined
            && publicAgent.sample_dialogues === undefined, {
            status: publicAgentRes.status,
            expect: 200
        });
        const resolveBeforeSubscribe = await request(
            'GET',
            `/api/catalog/entitlements/resolve?assetType=agent&assetId=${encodeURIComponent(agentId)}&action=chat`,
            null,
            true,
            false,
            consumerToken
        );
        recordResult('Catalog: Public agent requires grant for chat', resolveBeforeSubscribe.status === 200
            && resolveBeforeSubscribe.data?.data?.allowed === false
            && resolveBeforeSubscribe.data?.data?.reason === 'subscription_required', {
            status: resolveBeforeSubscribe.status,
            expect: 200
        });
        const subscribeRes = await request('POST', `/api/hub/agents/${agentId}/subscribe`, {}, true, false, consumerToken);
        recordResult('Hub: Subscribe agent grant created', subscribeRes.status === 200, { status: subscribeRes.status, expect: 200 });
        const resolveAfterSubscribe = await request(
            'GET',
            `/api/catalog/entitlements/resolve?assetType=agent&assetId=${encodeURIComponent(agentId)}&action=chat`,
            null,
            true,
            false,
            consumerToken
        );
        recordResult('Catalog: Agent entitlement resolves after subscribe', resolveAfterSubscribe.status === 200
            && resolveAfterSubscribe.data?.data?.allowed === true
            && !!resolveAfterSubscribe.data?.data?.grant
            && (resolveAfterSubscribe.data?.data?.billingSubject?.type === 'user'), {
            status: resolveAfterSubscribe.status,
            expect: 200
        });
        const grantsRes = await request('GET', '/api/catalog/grants?scope=owned', null, true);
        const ownedGrants = grantsRes.data?.data?.ownedGrants || [];
        const agentGrant = ownedGrants.find((grant) => String(grant.asset_id) === String(agentId) && String(grant.subject_id) === String(consumerUserId));
        recordResult('Catalog: Grant lineage exposed', grantsRes.status === 200
            && !!agentGrant
            && !!agentGrant.lineage
            && !!agentGrant.billingSubject, {
            status: grantsRes.status,
            expect: 200
        });
        if (agentGrant?.id) {
            const grantUsageRes = await request('GET', `/api/catalog/grants/${agentGrant.id}/usage`, null, true);
            recordResult('Catalog: Grant usage endpoint', grantUsageRes.status === 200, { status: grantUsageRes.status, expect: 200 });
        } else {
            recordResult('Catalog: Grant usage endpoint', false, { error: 'No agent grant available' });
        }
        const assetUsageRes = await request('GET', `/api/catalog/assets/agent/${agentId}/usage-attribution`, null, true);
        recordResult('Catalog: Asset usage attribution endpoint', assetUsageRes.status === 200, { status: assetUsageRes.status, expect: 200 });
    }
    if (skillId) {
        const publicSkillRes = await request('GET', `/api/hub/skills/${skillSlug}`, null, false);
        const publicSkill = publicSkillRes.data?.data || {};
        recordResult('Hub: Public skill detail sanitized', publicSkillRes.status === 200
            && publicSkill.instructions === undefined
            && publicSkill.definition === undefined, {
            status: publicSkillRes.status,
            expect: 200
        });
        const resolveSkillBeforeInstall = await request(
            'GET',
            `/api/catalog/entitlements/resolve?assetType=skill&assetId=${encodeURIComponent(skillId)}&action=install`,
            null,
            true,
            false,
            consumerToken
        );
        recordResult('Catalog: Public skill requires grant for install', resolveSkillBeforeInstall.status === 200
            && resolveSkillBeforeInstall.data?.data?.allowed === false
            && resolveSkillBeforeInstall.data?.data?.reason === 'subscription_required', {
            status: resolveSkillBeforeInstall.status,
            expect: 200
        });
        const installRes = await request('POST', `/api/hub/skills/${skillSlug}/install`, {}, true, false, consumerToken);
        recordResult('Hub: Install approved skill', installRes.status === 200, { status: installRes.status, expect: 200 });
        const resolveSkillAfterInstall = await request(
            'GET',
            `/api/catalog/entitlements/resolve?assetType=skill&assetId=${encodeURIComponent(skillId)}&action=install`,
            null,
            true,
            false,
            consumerToken
        );
        recordResult('Catalog: Skill entitlement resolves after install grant', resolveSkillAfterInstall.status === 200
            && resolveSkillAfterInstall.data?.data?.allowed === true
            && !!resolveSkillAfterInstall.data?.data?.grant, {
            status: resolveSkillAfterInstall.status,
            expect: 200
        });
    }

    // 4.8 AI
    await test('AI: Status', 'GET', '/api/ai/status', null, true, 200);
    await test('AI: Providers', 'GET', '/api/ai/providers', null, true, 200);
    await test('AI: Models', 'GET', '/api/ai/providers/ollama/models', null, true, 200);

    // 4.9 Analytics
    await test('Analytics: Get', 'GET', '/api/analytics/' + (agentId || 'x'), null, true, 200);
    await test('Analytics: Get with days', 'GET', '/api/analytics/' + (agentId || 'x') + '?days=7', null, true, 200);

    // 4.10 Knowledge
    await test('Knowledge: List', 'GET', '/api/knowledge/' + (agentId || 'x') + '/documents', null, true, 200);
    await test('Knowledge: Add', 'POST', '/api/knowledge/' + (agentId || 'x') + '/documents', { title: 'Test Doc', content: 'Some content' }, true, 201);
    const docId = (await request('GET', '/api/knowledge/' + (agentId || 'x') + '/documents', null, true)).data?.data?.[0]?.id;
    if (docId) await test('Knowledge: Chunks', 'GET', '/api/knowledge/' + (agentId || 'x') + '/documents/' + docId + '/chunks', null, true, 200);
    if (docId) await test('Knowledge: Delete', 'DELETE', '/api/knowledge/' + (agentId || 'x') + '/documents/' + docId, null, true, 200);

    // 4.12 Static
    await test('Favicon', 'GET', '/favicon.ico', null, false, 204);
    await test('Embed page', 'GET', '/embed/' + slug, null, false, 200);
    await test('SPA', 'GET', '/agents', null, false, 200);

    // Output
    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    console.log('\n--- Results ---');
    console.log(`Passed: ${passed}, Failed: ${failed}, Total: ${results.length}`);
    results.forEach(r => console.log(r.ok ? '  ✓' : '  ✗', r.name, r.ok ? '' : (r.error || 'status ' + r.status)));
    return { results, passed, failed };
}

run().then(out => {
    const fs = require('fs');
    const path = require('path');
    const md = path.join(__dirname, '..', 'TEST_RESULTS.md');
    let body = '# BetterIntelligence API Test Results\n\n';
    body += `Run: ${new Date().toISOString()}\n\n`;
    body += `Base URL: ${BASE}\n\n`;
    body += `**Summary:** ${out.passed} passed, ${out.failed} failed, ${out.results.length} total\n\n`;
    body += '| Test | Status |\n|------|--------|\n';
    out.results.forEach(r => {
        body += `| ${r.name} | ${r.ok ? '✓ PASS' : '✗ FAIL' + (r.error ? ' ' + r.error : r.status ? ' status=' + r.status : '')} |\n`;
    });
    fs.writeFileSync(md, body);
    console.log('\nResults written to', md);
    process.exit(out.failed > 0 ? 1 : 0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
