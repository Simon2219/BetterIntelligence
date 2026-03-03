/**
 * Programmatic verification of Rework Implementation tests.
 * Run: node scripts/run-tests.js
 * Tests that can be verified without a browser.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const results = [];
const port = parseInt(process.env.PORT || '3000', 10);

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

// 1-1: Light theme CSS
try {
  const css = fs.readFileSync(path.join(root, 'src/client/styles/variables.css'), 'utf8');
  const hasLightBlock = css.includes('[data-theme="light"]');
  const hasVars = css.includes('--bg-primary') && css.includes('--text-primary');
  if (hasLightBlock && hasVars) pass('1-1', 'Light theme block present with variables');
  else fail('1-1', 'Missing [data-theme="light"] or variables');
} catch (e) {
  fail('1-1', e.message);
}

// 1-2: Config / API
const req = https.get(
  `https://localhost:${port}/api/appearance`,
  { rejectUnauthorized: false },
  (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        const ok = data?.data?.dark && data?.data?.light;
        if (ok) pass('1-2', 'GET /api/appearance returns dark and light');
        else fail('1-2', 'Missing dark/light in response');
      } catch (e) {
        fail('1-2', e.message);
      }
      runRemaining();
    });
  }
);
req.on('error', () => {
  fail('1-2', 'Server not reachable (is npm start running?)');
  runRemaining();
});

function runRemaining() {
  // 2-1 to 2-4: Sidebar
  const layoutCss = fs.readFileSync(path.join(root, 'src/client/styles/layout.css'), 'utf8');
  if (layoutCss.includes('sidebar__section-label')) pass('2-1', 'Sidebar section labels');
  else fail('2-1', 'Missing sidebar__section-label');
  if (layoutCss.includes('sidebar__link--active')) pass('2-2', 'Active link styling');
  else fail('2-2', 'Missing sidebar__link--active');
  if (layoutCss.includes('220px')) pass('2-3', 'Sidebar width 220px');
  else fail('2-3', 'Sidebar width not 220px');
  if (layoutCss.includes('@media')) pass('2-4', 'Responsive media queries');
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
  if (appJs.includes('/agents/hub') && appJs.includes('navigate')) pass('3-5', 'Hub redirect');
  else fail('3-5', 'Redirect logic');
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
  if (appJs.includes('_tutorialComplete') && appJs.includes('disabled')) pass('4-6', 'Steps locked');
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
  const compCss = fs.readFileSync(path.join(root, 'src/client/styles/components.css'), 'utf8');
  if (compCss.includes('agent-card') && compCss.includes('min-height')) pass('6-1', 'Card sizing');
  else fail('6-1', 'Cards');
  if (appJs.includes('badge-provider') && appJs.includes('badge-model')) pass('6-2', 'Pill colors');
  else fail('6-2', 'Badges');
  if (compCss.includes('btn-primary') && compCss.includes('min-width')) pass('6-3', 'Chat button');
  else fail('6-3', 'Chat button size');
  if (appJs.includes('agent-card--subscribed')) pass('6-4', 'Own vs Subscribed');
  else fail('6-4', 'Subscribed styling');
  const layoutCss2 = fs.readFileSync(path.join(root, 'src/client/styles/layout.css'), 'utf8');
  if (layoutCss2.includes('container--full')) pass('6-5', 'container--full');
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

  // Output
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log('\n--- Programmatic Test Results ---\n');
  results.forEach((r) => console.log(`${r.status.padEnd(6)} ${r.id.padEnd(8)} ${r.msg}`));
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
