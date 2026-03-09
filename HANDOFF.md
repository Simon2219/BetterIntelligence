# HANDOFF_AI_CONTEXT

## 0) MACHINE-READABLE METADATA

```yaml
project:
  name: BetterIntelligence
  repo_root: "S:/Projects/BetterIntelligence"
  primary_branch: "main"
  stack:
    backend: ["Node.js", "Express", "Socket.io", "better-sqlite3"]
    frontend: ["Vanilla JS SPA", "modular CSS architecture"]
    ai: ["Ollama", "ComfyUI", "OpenAI-compatible providers"]
runtime:
  start:
    default: "npm start"
    https_entry: "start-https.js"
  env_file: ".env"
  default_env_port: 3001
frontend_entrypoints:
  app_js: "src/client/js/app.js"
  app_bootstrap: "src/client/js/core/bootstrap.js"
  app_stylesheet: "src/client/styles/StyleManifest.css"
  embed_stylesheet: "src/client/styles/views/embed/EmbedView.css"
validation_snapshot_2026_03_09:
  npm_test_with_running_server: "pass (64 passed, 0 failed)"
  api_matrix_with_running_server: "pass (71 passed, 0 failed)"
  notes:
    - "Counts are volatile and belong only in HANDOFF.md."
    - "Manual browser smoke is still required after major UI work."
status:
  acc_route_owner: "/agents"
  agent_builder_route_owner: "/agentBuilder"
  catalog_cutover: "active"
  grants_usage_attribution: "implemented"
  requires_manual_ui_smoke: true
```

---

## 1) WHAT THIS APP IS

BetterIntelligence is a multi-view SPA for:

1. Building AI agents.
2. Managing reusable skills and knowledge.
3. Running personal and deployment-scoped chat.
4. Publishing agents and skills through a creator-facing Catalog system.
5. Discovering public assets through Hub.
6. Operating deployments and admin controls.

Core product framing used in the app:

- "Build AI agents. Share skills. Deploy bots."

---

## 2) HOW THIS REPO SHOULD BE EXTENDED

### Read order for the next agent

1. Read `SYSTEMS.md` first for current architecture truth.
2. Read this file second for working preferences, recent changes, and handoff context.
3. Verify referenced paths in the repo before relying on older assumptions.

### File and folder placement rules

1. Route-owned client systems live in their own view folder under `src/client/js/views/<route>/`.
2. Route entry files live at the route folder root:
   - `views/agents/accMainView.js`
   - `views/agentBuilder/agentBuilderMainView.js`
   - `views/hub/hubView.js`
   - `views/skills/skillsView.js`
   - `views/deploy/deployMainView.js`
3. Route internals stay inside that same route folder unless there is a real shared-component reason to lift them.
4. Do not create duplicate route owners for the same route. One route gets one route-level main view.
5. Keep server routes flat in `src/server/routes/`.
6. Keep server services flat in `src/server/services/` unless there is a clear subsystem folder already established, such as `services/billing/`.
7. Keep repositories in `src/server/database/repositories/*Repository.js`.

### Naming preferences

1. ACC internals use the `acc*` prefix:
   - `accMainView`
   - `accRender`
   - `accInteractions`
   - `accOverlays`
   - `accCharts`
   - `accCategoryManager`
2. Agent Builder files use the `agentBuilder*` prefix inside `views/agentBuilder/`.
3. Use descriptive concern names over generic names like `helpers`, `system`, or `manager` unless the file is truly the owning manager/controller for that subsystem.
4. Do not reintroduce `market` / `marketplace` as live product naming in new files. Use `catalog`, `hub`, `grants`, `ACL`, `ACC`, or `Agent Builder` as appropriate.

### Architecture guardrails

1. `/agents` is the Agent Control Center, not the Agent Builder.
2. `/agentBuilder` is the editable agent builder route family.
3. `/deploy` owns deployment workflows.
4. `/skills` owns workspace and installed-skill workflows.
5. `/hub` owns public discovery.
6. `/catalog` owns authenticated creator publishing, review, grants, and entitlement APIs.
7. Do not duplicate Deploy, Skills, or Hub workflows inside ACC.

---

## 3) CURRENT ROUTE AND OWNERSHIP EXPECTATIONS

### Client routes

1. `/agents`
   - ACC only
   - cross-system summary, control, and deep links
2. `/agents/:id/analytics`
   - agent analytics only
3. `/agentBuilder`
   - create flow
4. `/agentBuilder/:id`
   - edit flow
5. `/skills`
   - workspace, installed inventory, skill authoring
6. `/hub`
   - public discovery for agents and skills
7. `/deploy`
   - deployment hub, access policy, runtime controls

### Server route families

1. `/api/agents/*`
   - agent CRUD
   - agent tags/categories/private tags
   - `/api/agents/dashboard`
   - agent analytics support
2. `/api/catalog/*`
   - listings
   - revisions
   - reviews
   - grants
   - access requests
   - entitlement resolution
3. `/api/hub/*`
   - public agents
   - public skills
   - public subscribe/install entrypoints
4. `/api/skills/*`
   - workspace and installed skill inventory
5. `/api/deploy/*`
   - deployment management
   - deployment member management
   - deployment access policy
   - embed/runtime entrypoints

### What must not be duplicated

1. Do not put builder editing flows back under `/agents`.
2. Do not put deployment management back into ACC.
3. Do not make Hub depend on private Agents or Skills workspace endpoints for public discovery behavior.
4. Do not create a second grants or entitlement system for agents, skills, and deployments.

---

## 4) RECENT COMPLETED ARCHITECTURE CHANGES

These are the major recent shifts that matter for future work:

1. Agent Builder was extracted from `/agents` into its own `/agentBuilder` route family and folder.
2. `/agents` was stabilized as the Agent Control Center route owner.
3. Internal creator publishing/access management moved to `/api/catalog/*`.
4. The old Market surface was removed from live route ownership.
5. Hub public reads were sanitized and decoupled from old private/workspace dependencies.
6. Skills became DB-first:
   - canonical skill definitions live in the database
   - `skill_installations` owns installed-skill persistence
   - `SKILL.md` is materialized output, not canonical state
7. Strict catalog cutover was implemented:
   - public/shared runtime access now comes from Catalog-backed entitlements
   - old `hub_published` style runtime fallback is no longer the active model
8. Unified grants and usage attribution were introduced:
   - grants govern runtime access, feature gates, quotas, and lineage
   - `usage_attribution_legs` supports one authoritative total plus mirrored attribution views

---

## 5) CURRENT IMPORTANT IMPLEMENTATION CONTEXT

### Grants vs ACL

1. Grants are entitlements only.
2. Grants currently support `user`, `deployment`, and `org` subjects.
3. Grants govern:
   - runtime access
   - feature gates
   - quota limits
   - listing/plan lineage
   - billing subject linkage
   - usage attribution lineage
4. ACL governs management/operator authorization.
5. Do not merge grants and ACL into one system.

### Actor model

Current terms used by the backend:

1. owner
   - owns the resource or listing
2. grant subject
   - the subject receiving an entitlement
   - currently `user`, `deployment`, or `org`
3. billing subject
   - the subject responsible for the authoritative billable leg
4. deployment runtime subject
   - a deployment acting as the runtime consumer under a sponsor or budget grant
5. collaborator/operator
   - a human manager/admin authorized by ACL, not by grants

### Deployment sponsorship vs deployment membership

1. A deployment sponsor grant is runtime sponsorship only.
2. Deployment sponsor grants do not grant human operator rights.
3. Deployment member/admin/manager rights still come from deployment ACL, not grants.

### Deployment access policy modes

Current deployment runtime policy modes are:

1. `public_sponsored`
2. `authenticated_entitled`
3. `internal_only`

Treat these as deploy-owned runtime policy, not as ACC policy.

### Compatibility names intentionally retained

These still exist and are expected for compatibility/history reasons:

1. `can_manage_marketplace`
2. `can_moderate_marketplace`
3. `m026_marketplace_foundation`

Treat them as retained compatibility identifiers, not current product naming.

---

## 6) VALIDATION WORKFLOW

### Commands

1. Start server:
   - `npm start`
2. Programmatic test suite:
   - `npm test`
3. API matrix:
   - `node scripts/run-api-tests.js https://localhost:3001`
4. Targeted syntax checks when editing JS:
   - `node --check <file>`

### Latest validated snapshot

Verified on 2026-03-09:

1. `npm test`
   - `64 passed, 0 failed`
2. `node scripts/run-api-tests.js https://localhost:3001`
   - `71 passed, 0 failed`

### What still commonly needs manual verification

1. Browser/UI smoke for ACC interactions and layout.
2. Complex Agent Builder step flows.
3. Deployment operator flows in `/deploy`.
4. Embed/deployment runtime flows when deployment access policy changes.
5. Visual polish work across Hub, ACC, and Deploy.

---

## 7) CURRENT KNOWN RISKS OR FOLLOW-UP ZONES

1. Large orchestrator files still exist in some route owners, especially Agent Builder and parts of ACC.
2. ACC changes need manual browser smoke because interaction density is high.
3. Deployment access policy and deployment ACL are sensitive integration areas; keep runtime entitlements and operator authorization separate.
4. Doc drift can happen quickly after architectural changes; update both `SYSTEMS.md` and this file when ownership boundaries move.
5. Keep route boundaries clean:
   - ACC summarizes and links
   - Hub discovers
   - Skills edits and installs
   - Deploy manages deployments
   - Catalog manages creator publishing and entitlements

---

## 8) DO-NOT-BREAK CONTRACTS

1. Keep `/agents` as ACC only.
2. Keep `/agentBuilder` as the only Agent Builder route family.
3. Keep `/hub` as the public discovery surface.
4. Keep `/api/catalog/*` as the creator publishing/access management surface.
5. Keep skills DB-canonical and `skill_installations` authoritative for installs.
6. Keep grants as entitlements and ACL as management authorization.
7. Do not reintroduce `/api/market/*` or `/api/agents/hub`.

---

## 9) NEXT-AGENT EXECUTION PROTOCOL

1. Read `SYSTEMS.md`.
2. Read this file fully.
3. Verify route/file ownership before moving files or introducing new folders.
4. Prefer the smallest structural change that preserves the established route boundaries.
5. Re-run relevant validation after edits.
6. Update both docs whenever:
   - route ownership changes
   - core system owners change
   - validation workflow changes
   - recent architecture changes should be handed to the next agent
