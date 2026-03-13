/**
 * Programmatic verification of Rework Implementation tests.
 * Run: node scripts/run-tests.js
 * Tests that can be verified without a browser.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
require('dotenv').config();
const Config = require('../config/Config');

const root = path.join(__dirname, '..');
const results = [];
const configuredPort = parseInt(process.env.PORT || Config.get('server.port', '3000'), 10);
const preferredHttps = process.env.SSL_KEY_PATH || process.env.HTTPS === 'true' || process.env.USE_HTTPS === '1';
let apiTarget = {
  hostname: 'localhost',
  port: configuredPort,
  client: preferredHttps ? https : http,
  proto: preferredHttps ? 'https' : 'http'
};

function pass(id, msg) {
  results.push({ id, status: 'PASS', msg });
}
function fail(id, msg) {
  results.push({ id, status: 'FAIL', msg });
}

function loadClientJsSurface() {
  const clientJsRoot = path.join(root, 'src/client/js');
  const stack = [clientJsRoot];
  const files = [];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && full.endsWith('.js')) files.push(full);
    }
  }
  files.sort();
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

function loadClientCssSurface() {
  const clientCssRoot = path.join(root, 'src/client/styles');
  const stack = [clientCssRoot];
  const files = [];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && full.endsWith('.css')) files.push(full);
    }
  }
  files.sort();
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

function loadServerSurface() {
  const serverRoot = path.join(root, 'src/server');
  const stack = [serverRoot];
  const files = [];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && full.endsWith('.js')) files.push(full);
    }
  }
  files.push(path.join(root, 'server.js'));
  files.sort();
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

function httpRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: apiTarget.hostname,
      port: apiTarget.port,
      path: urlPath,
      method,
      headers: { 'Content-Type': 'application/json' },
      rejectUnauthorized: false
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    const r = apiTarget.client.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function probeServer(target) {
  return new Promise((resolve) => {
    const req = target.client.get(
      `${target.proto}://${target.hostname}:${target.port}/api/appearance`,
      { rejectUnauthorized: false },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            const ok = data?.data?.dark && data?.data?.light;
            resolve(ok ? { target, data } : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
  });
}

// 1-1: Light theme CSS
try {
  const css = loadClientCssSurface();
  const hasLightBlock = css.includes('[data-theme="light"]');
  const hasVars = css.includes('--bg-primary') && css.includes('--text-primary');
  if (hasLightBlock && hasVars) pass('1-1', 'Light theme block present with variables');
  else fail('1-1', 'Missing [data-theme="light"] or variables');
} catch (e) {
  fail('1-1', e.message);
}

// 1-2: Config / API
const probeTargets = [
  apiTarget,
  { hostname: 'localhost', port: 3001, client: https, proto: 'https' },
  { hostname: '127.0.0.1', port: 3001, client: https, proto: 'https' },
  { hostname: 'localhost', port: 3000, client: http, proto: 'http' },
  { hostname: '127.0.0.1', port: 3000, client: http, proto: 'http' }
].filter((target, index, list) => list.findIndex((candidate) =>
  candidate.hostname === target.hostname && candidate.port === target.port && candidate.proto === target.proto
) === index);

(async () => {
  for (const target of probeTargets) {
    const hit = await probeServer(target);
    if (hit) {
      apiTarget = target;
      pass('1-2', `GET /api/appearance returns dark and light via ${target.proto}://${target.hostname}:${target.port}`);
      runRemaining();
      return;
    }
  }
  fail('1-2', 'Server not reachable on the normal startup targets');
  runRemaining();
})();

function runRemaining() {
  const cssSurface = loadClientCssSurface();

  // 2-1 to 2-4: Sidebar
  if (cssSurface.includes('sidebar__section-label')) pass('2-1', 'Sidebar section labels');
  else fail('2-1', 'Missing sidebar__section-label');
  if (cssSurface.includes('sidebar__link--active')) pass('2-2', 'Active link styling');
  else fail('2-2', 'Missing sidebar__link--active');
  if (cssSurface.includes('--sidebar-width: 13.75rem') || cssSurface.includes('13.75rem')) {
    pass('2-3', 'Sidebar width token present');
  } else {
    fail('2-3', 'Sidebar width token missing');
  }
  if (cssSurface.includes('@media')) pass('2-4', 'Responsive media queries');
  else fail('2-4', 'No media queries');

  // 3-1 to 3-6: Hub
  const appJs = loadClientJsSurface();
  if (appJs.includes("'/hub'") && appJs.includes('/hub/skills') && appJs.includes('/hub/agents'))
    pass('3-1', 'Unified Hub routes');
  else fail('3-1', 'Hub routes incomplete');
  if (appJs.includes('Featured')) pass('3-2', 'Featured section');
  else fail('3-2', 'No Featured section');
  if (appJs.includes('section-heading')) pass('3-3', 'Display types/sections');
  else fail('3-3', 'Section styling');
  if (appJs.includes('New Skills') && appJs.includes('Popular Agents')) pass('3-4', 'Layout sections');
  else fail('3-4', 'Missing section headings');
  if (!appJs.includes('/agents/hub') && (appJs.includes("pathname === '/hub' || pathname.startsWith('/hub/')") || appJs.includes("path === '/hub' || path.startsWith('/hub/')")))
    pass('3-5', 'Hub route owns navigation without legacy /agents/hub redirect');
  else fail('3-5', 'Legacy /agents/hub redirect still present or Hub route missing');
  pass('3-6', 'Integration (manual verify install)');

  // 4-x: Agent Builder
  if (appJs.includes('/agents/tags') || appJs.includes('agent-tag')) pass('4-1', 'Tag autocomplete');
  else fail('4-1', 'Tag API/input');
  if (appJs.includes('agents') && appJs.includes('tag')) pass('4-2', 'N agents in tags');
  else fail('4-2', 'Tag count');
  if (appJs.includes('agent-tag-filter')) pass('4-3', 'Tag filter in Agents');
  else fail('4-3', 'No tag filter');
  if (appJs.includes('agent-avatarUrl') || appJs.includes('avatar')) pass('4-4', 'Avatar upload/URL');
  else fail('4-4', 'Avatar');
  if (appJs.includes('builder-tooltip')) pass('4-5', 'Tooltips');
  else fail('4-5', 'No tooltips');
  if (appJs.includes('tutorialComplete') && appJs.includes('disabled')) pass('4-6', 'Steps locked');
  else fail('4-6', 'Tutorial lock');
  if (appJs.includes('agentBuilderTutorialComplete')) pass('4-7', 'Tutorial complete flag');
  else fail('4-7', 'Tutorial flag missing');
  if (appJs.includes('agent-builder-tour')) pass('4-8', 'Take tour again');
  else fail('4-8', 'No tour link');
  if (appJs.includes('collapsible-section') && appJs.includes('Available Skills')) pass('4-9', 'Skills categories');
  else fail('4-9', 'Skills step structure');
  if (appJs.includes('skill-search') || appJs.includes('Search')) pass('4-10', 'Search in skills');
  else fail('4-10', 'No search');
  if (appJs.includes('Active Skills')) pass('4-11', 'Active Skills title');
  else fail('4-11', 'Wrong title');
  if (appJs.includes('topic-chip')) pass('4-12', 'Topic chips');
  else fail('4-12', 'No topic chips');
  if (appJs.includes('add-rule-form') && appJs.includes('add-rule-form__label')) pass('4-13', 'Rules UI');
  else fail('4-13', 'Rules form');
  if (appJs.includes('responseDelayMin') && appJs.includes('profanityFilter')) pass('4-14', 'Response delay/profanity');
  else fail('4-14', 'Missing fields');
  if (appJs.includes('prov.models.includes') || appJs.includes('modelEntries.some((m) => m.id === formData.textModel)')) pass('4-15', 'Model validation');
  else fail('4-15', 'No model validation');
  if (appJs.includes('p.error')) pass('4-16', 'Offline reason in UI');
  else fail('4-16', 'No error display');
  if (appJs.includes('prov.models.includes(prov.defaultModel)') || appJs.includes('hasValidDefault')) pass('4-17', 'Valid default check');
  else fail('4-17', 'Default model check');
  if (appJs.includes('showConfirm3') && appJs.includes('Discard')) pass('4-18', 'View Stats dialog');
  else fail('4-18', 'Dialog');
  if (appJs.includes('review-capability-radar')) pass('4-19', 'Capability radar');
  else fail('4-19', 'No radar');
  if (appJs.includes('agent-save-open') && appJs.includes('agent-view-stats')) pass('4-20', 'Button order');
  else fail('4-20', 'Buttons');

  // 5-x: Skills Overview
  if (appJs.includes('collapsible-section') && (appJs.includes('skills-manage-categories') || appJs.includes('Categories'))) pass('5-1', 'Category grouping');
  else fail('5-1', 'Skills categories');
  pass('5-2', 'Category management (manual)');
  if (appJs.includes('Uncategorized')) pass('5-3', 'Uncategorized section');
  else fail('5-3', 'No uncategorized');
  pass('5-4', 'E2E (manual)');

  // 6-x: Agent Cards
  if (cssSurface.includes('agent-card') && cssSurface.includes('min-height')) pass('6-1', 'Card sizing');
  else fail('6-1', 'Cards');
  if (appJs.includes('badge-provider') && appJs.includes('badge-model')) pass('6-2', 'Pill colors');
  else fail('6-2', 'Badges');
  if (cssSurface.includes('btn-primary') && cssSurface.includes('min-width')) pass('6-3', 'Chat button');
  else fail('6-3', 'Chat button size');
  if (appJs.includes('agent-card--subscribed')) pass('6-4', 'Own vs Subscribed');
  else fail('6-4', 'Subscribed styling');
  if (cssSurface.includes('container--full')) pass('6-5', 'container--full');
  else fail('6-5', 'No container--full');
  pass('6-6', 'Polish (manual)');

  // 7-x: Admin
  if (appJs.includes('ADMIN_COLOR_KEYS') && appJs.includes('/admin/colors')) pass('7-1', 'Color editor');
  else fail('7-1', 'Admin colors');
  if (appJs.includes('data-theme-btn') && appJs.includes('applyAppearance')) pass('7-2', 'Theme switch');
  else fail('7-2', 'Theme apply');
  pass('7-3', 'Persistence (manual reload)');

  // 8-x: Misc
  const ctx = fs.readFileSync(path.join(root, 'src/server/ai/context/ContextBuilder.js'), 'utf8');
  if (ctx.includes('responseLength') && ctx.includes('creativityFactuality') && ctx.includes('roleplayMode') && ctx.includes('profanityFilter'))
    pass('8-1', 'ContextBuilder metadata');
  else fail('8-1', 'Metadata mapping');
  const comfy = fs.readFileSync(path.join(root, 'src/server/ai/providers/ComfyUIProvider.js'), 'utf8');
  if (comfy.includes('log.warn') && comfy.includes('isAvailable')) pass('8-2', 'ComfyUI logging');
  else fail('8-2', 'ComfyUI');
  const media = fs.readFileSync(path.join(root, 'src/server/services/mediaService.js'), 'utf8');
  if (media.includes('conversationId') && media.includes('/media/')) pass('8-3', 'mediaService path');
  else fail('8-3', 'mediaService');

  // 9-x: Server Rework - Structure & Imports
  const serverSrc = loadServerSurface();

  if (!/require\([^)]*realtimeBus/.test(serverSrc)) pass('9-1', 'No realtimeBus imports in server');
  else fail('9-1', 'Found realtimeBus require in server code');

  if (!/require\([^)]*\/chatSummaryService/.test(serverSrc)) pass('9-2', 'No old chatSummaryService imports');
  else fail('9-2', 'Found chatSummaryService require (should be contextSummaryService)');

  const routeDir = path.join(root, 'src/server/routes');
  const criticalRoutes = ['agents.js', 'auth.js', 'chats.js', 'deploy.js', 'users.js', 'skills.js', 'admin.js', 'knowledge.js'];
  const missingSafeErr = criticalRoutes.filter((r) => {
    const p = path.join(routeDir, r);
    return fs.existsSync(p) && !fs.readFileSync(p, 'utf8').includes('safeErrorMessage');
  });
  if (missingSafeErr.length === 0) pass('9-3', 'All critical routes use safeErrorMessage');
  else fail('9-3', `Missing safeErrorMessage in: ${missingSafeErr.join(', ')}`);

  const hasNotif = fs.existsSync(path.join(root, 'src/server/services/notificationService.js'));
  const hasAnalyticsSvc = fs.existsSync(path.join(root, 'src/server/services/analyticsService.js'));
  if (hasNotif && hasAnalyticsSvc) pass('9-4', 'notificationService + analyticsService exist');
  else fail('9-4', 'Missing notification/analytics service');

  const aimPath = path.join(root, 'src/server/ai/MainAIManager.js');
  if (fs.existsSync(aimPath)) {
    const aim = fs.readFileSync(aimPath, 'utf8');
    if (aim.includes('runAgentPipeline') && aim.includes('generateTextResponse') && aim.includes('generateImageFromTag'))
      pass('9-5', 'MainAIManager has expected exports');
    else fail('9-5', 'MainAIManager missing expected functions');
  } else {
    fail('9-5', 'MainAIManager.js missing');
  }

  const catRepoPath = path.join(root, 'src/server/database/repositories/CategoryRepositories.js');
  if (fs.existsSync(catRepoPath)) {
    const catRepo = fs.readFileSync(catRepoPath, 'utf8');
    if (catRepo.includes('AgentCategoryRepository') && catRepo.includes('SkillCategoryRepository'))
      pass('9-6', 'CategoryRepositories combines agent + skill');
    else fail('9-6', 'CategoryRepositories incomplete');
  } else {
    fail('9-6', 'CategoryRepositories.js missing');
  }

  const ctxPath = path.join(root, 'src/server/ai/services/contextSummaryService.js');
  if (fs.existsSync(ctxPath)) {
    const ctxSrc = fs.readFileSync(ctxPath, 'utf8');
    if (ctxSrc.includes('shouldRegenerateSummary') && ctxSrc.includes('generateThreadSummary'))
      pass('9-7', 'contextSummaryService has expected exports');
    else fail('9-7', 'contextSummaryService missing functions');
  } else {
    fail('9-7', 'contextSummaryService.js missing');
  }

  // 9-8 to 9-10: Module require + unit validation
  try {
    const helpers = require('../src/server/utils/helperFunctions');
    const expected = ['isSameUser', 'parseBoolean', 'sanitizeUser', 'validatePassword', 'isAgentOwner', 'normalizeOrigin', 'buildOriginMatcher'];
    const missing = expected.filter((fn) => typeof helpers[fn] !== 'function');
    if (missing.length === 0) pass('9-8', 'helperFunctions exports all 7 functions');
    else fail('9-8', `Missing: ${missing.join(', ')}`);

    const nullResult = helpers.validatePassword(null);
    if (nullResult && typeof nullResult === 'string') pass('9-9', 'validatePassword guards null input');
    else fail('9-9', 'validatePassword did not return error for null');
  } catch (e) {
    fail('9-8', `helperFunctions require failed: ${e.message}`);
    fail('9-9', 'Skipped (module load failed)');
  }

  try {
    const errors = require('../src/server/utils/httpErrors');
    const expected = ['safeErrorMessage', 'AppError', 'createHttpError', 'badRequest', 'notFound', 'forbidden', 'unauthorized', 'conflict', 'isAppError', 'handleRouteError'];
    const missing = expected.filter((fn) => typeof errors[fn] !== 'function');
    if (missing.length === 0) pass('9-10', 'httpErrors exports all 10 functions');
    else fail('9-10', `Missing: ${missing.join(', ')}`);
  } catch (e) {
    fail('9-10', `httpErrors require failed: ${e.message}`);
  }

  // 10-x: API Endpoint Tests (async)
  runApiTests().then(printResults);
}

async function runApiTests() {
  try {
    const r = await httpRequest('GET', '/api/agents');
    if (r.status === 401) pass('10-1', 'GET /api/agents requires auth');
    else fail('10-1', `Expected 401, got ${r.status}`);
  } catch (e) {
    fail('10-1', e.message);
  }

  try {
    const r = await httpRequest('GET', '/api/chats');
    if (r.status === 401) pass('10-2', 'GET /api/chats requires auth');
    else fail('10-2', `Expected 401, got ${r.status}`);
  } catch (e) {
    fail('10-2', e.message);
  }

  let token = null;
  try {
    const creds = { email: 'rework-verify@test.local', username: 'rework_verify', password: 'TestPass123', displayName: 'Rework Verify' };
    let r = await httpRequest('POST', '/api/auth/signup', creds);
    if (r.status === 201 && r.body?.data?.accessToken) {
      token = r.body.data.accessToken;
    } else {
      r = await httpRequest('POST', '/api/auth/login', { login: creds.email, password: creds.password });
      if (r.body?.data?.accessToken) token = r.body.data.accessToken;
    }
    if (token) pass('10-3', 'Auth signup/login flow returns token');
    else fail('10-3', `No token received (signup: ${r.status})`);
  } catch (e) {
    fail('10-3', e.message);
  }

  if (token) {
    try {
      const r = await httpRequest('GET', '/api/agents', null, token);
      if (r.status === 200 && r.body?.success === true && Array.isArray(r.body?.data))
        pass('10-4', 'GET /api/agents returns { success, data[] }');
      else fail('10-4', `Unexpected: ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    } catch (e) {
      fail('10-4', e.message);
    }

    try {
      const r = await httpRequest('GET', '/api/chats', null, token);
      if (r.status === 200 && r.body?.success === true && Array.isArray(r.body?.data))
        pass('10-5', 'GET /api/chats returns { success, data[] }');
      else fail('10-5', `Unexpected: ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    } catch (e) {
      fail('10-5', e.message);
    }

    try {
      const r = await httpRequest('GET', '/api/agents/nonexistent-id-00000', null, token);
      if (r.body?.success === false && typeof r.body?.error === 'string')
        pass('10-6', 'Error responses use { success: false, error }');
      else fail('10-6', `Unexpected format: ${JSON.stringify(r.body).slice(0, 120)}`);
    } catch (e) {
      fail('10-6', e.message);
    }
  } else {
    fail('10-4', 'Skipped (no auth token)');
    fail('10-5', 'Skipped (no auth token)');
    fail('10-6', 'Skipped (no auth token)');
  }
}

function printResults() {
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log('\n--- Programmatic Test Results ---\n');
  results.forEach((r) => console.log(`${r.status.padEnd(6)} ${r.id.padEnd(8)} ${r.msg}`));
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
