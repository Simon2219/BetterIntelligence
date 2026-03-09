# BetterIntelligence - Canonical System Map

## 1) Runtime Architecture

- Backend: Node.js + Express + Socket.io
- Database: SQLite via `better-sqlite3`
- Frontend: Vanilla JS SPA with modular view and CSS architecture
- AI execution: provider registry plus unified runtime pipeline

### Primary runtime owners

- Server entry: `server.js`
- HTTPS launcher: `start-https.js`
- Frontend composition root: `src/client/js/core/bootstrap.js`
- Client routing: `src/client/js/core/router.js`
- SPA assets: `src/client`
- Embed entrypoint: `src/client/embed.html`

### Static and socket serving

- `/media` serves persisted media
- `/lib/cropperjs` serves Cropper assets
- `/embed/:slug` serves embed HTML
- Socket namespaces:
  - `/`
  - `/deploy/<slug>`
  - `/notifications`
  - `/admin`
  - `/analytics`

---

## 2) Backend Boundaries

### Route families and ownership

- `/api/agents/*`
  - agent CRUD
  - categories, tags, private tags
  - ACC aggregate via `/api/agents/dashboard`
  - agent analytics support
- `/api/catalog/*`
  - creator publishing
  - listings
  - revisions
  - reviews
  - grants
  - access requests
  - entitlement resolution
  - grant and asset attribution reporting
- `/api/hub/*`
  - public discovery
  - public agent detail
  - public skill detail
  - public subscribe/install entrypoints
- `/api/skills/*`
  - skill workspace CRUD
  - installed skill inventory
  - skill categories
- `/api/deploy/*`
  - deployment CRUD
  - deployment members
  - deployment access policy
  - deployment stats
  - embed/runtime chat entrypoints
- Additional route families:
  - `/api/auth/*`
  - `/api/users/*`
  - `/api/chats/*`
  - `/api/analytics/*`
  - `/api/admin/*`
  - `/api/appearance/*`
  - `/api/roles/*`
  - `/api/knowledge/*`
  - `/api/media/*`
  - `/api/ai/*`

### Current service owners

- `src/server/services/catalogService.js`
  - listing/revision/review orchestration
- `src/server/services/catalogEntitlementService.js`
  - runtime entitlement resolution
  - grants
  - quota enforcement
  - usage attribution
  - deployment runtime entitlement resolution
- `src/server/services/accDashboardService.js`
  - `/api/agents/dashboard` aggregate payload builder
- `src/server/services/deploymentAclService.js`
  - deployment operator/member authorization
- `src/server/services/deploymentStatsService.js`
  - deployment usage, cost, and operational summaries
- `src/server/services/SkillMaterializationService.js`
  - DB-to-filesystem skill materialization
- `src/server/services/notificationService.js`
  - realtime notification fanout
- `src/server/ai/services/agentAvailabilityService.js`
  - agent model/provider health hydration

### Key public/backend interfaces

- `/api/agents/dashboard`
  - ACC aggregate payload
- `/api/catalog/grants`
  - grant reads and writes
- `/api/catalog/entitlements/resolve`
  - runtime entitlement resolution
- `/api/hub/agents`
  - public agent discovery
- `/api/hub/skills`
  - public skill discovery

### Database and repository owners

- `CatalogListingRepository`
  - catalog listings
  - revisions
  - plan tiers
  - bundle items
  - reviews
  - audit log
- `CatalogEntitlementRepository`
  - `catalog_grants`
  - access requests
  - usage counters
- `SkillInstallationRepository`
  - `skill_installations`
- `UsageAttributionRepository`
  - `usage_attribution_legs`
- `DeploymentAccessPolicyRepository`
  - deployment runtime access policy persistence
- Still active deployment member persistence:
  - `DeploymentMemberRepository`

### Migrations currently shaping this architecture

- `m026_marketplace_foundation`
- `m027_catalog_db_first_cleanup`
- `m028_strict_catalog_cutover`
- `m029_unified_grants_usage_attribution`

These migrations define the current catalog/grants system. `m026` still uses legacy `marketplace` naming because it is migration history, not current product vocabulary.

---

## 3) Persistence and Source of Truth

### Agent source of truth

- Editable agent source lives in `ai_agents`
- Public/shared state comes from approved Catalog revisions
- Hub public agents are sourced from approved, sanitized catalog-backed snapshots
- Agent Builder is the editable route, not the public listing source

### Skill source of truth

- Skills are DB-canonical
- Installed skills are persisted in `skill_installations`
- Filesystem `SKILL.md` is materialized output only
- Public Hub skill reads come from approved Catalog listings plus canonical skill rows

### Deployment source of truth

- Deployments live in deploy-owned tables and routes
- Deployment runtime access policy is deploy-owned
- Deployment sponsor grants support runtime sponsorship only

### Catalog source of truth

- Creator publishing, review, grants, and access requests live under Catalog
- Public discovery does not come from ad hoc publish flags
- Approved revision state is the public/shared contract

---

## 4) Frontend Boundaries

### Route entry files

- `src/client/js/views/agents/accMainView.js`
- `src/client/js/views/agentBuilder/agentBuilderMainView.js`
- `src/client/js/views/skills/skillsView.js`
- `src/client/js/views/hub/hubView.js`
- `src/client/js/views/deploy/deployMainView.js`
- `src/client/js/views/admin/adminPanelView.js`
- `src/client/js/views/chat/chatMainView.js`
- `src/client/js/views/analytics/analyticsView.js`

### Route ownership

- `/agents`
  - Agent Control Center only
- `/agents/:id/analytics`
  - agent analytics only
- `/agentBuilder`
  - create/edit builder only
- `/skills`
  - workspace and installed inventory
- `/hub`
  - public discovery
- `/deploy`
  - deployment hub

### ACC internal file family

- `accMainView.js`
- `accRender.js`
- `accInteractions.js`
- `accOverlays.js`
- `accCharts.js`
- `accCategoryManager.js`

These files are the ACC route internals. They are not separate route owners.

---

## 5) Entitlements and Authorization

### Grants

Grants are entitlement contracts only.

Current grant subjects:

- `user`
- `deployment`
- `org`

Grants govern:

- runtime access
- feature gates
- quota limits
- listing/plan lineage
- billing subject linkage
- runtime attribution lineage

Current grant model supports:

- direct grants
- bundle-derived grants
- deployment sponsor grants
- deployment budget child grants
- parent/child grant lineage
- auto-roll to latest approved revision

Current actor model:

- owner
- grant subject
- billing subject
- deployment runtime subject
- collaborator/operator via ACL

### Usage attribution

`usage_attribution_legs` models one authoritative usage total plus mirrored attribution views.

Key rule:

- one runtime event has exactly one authoritative billable total
- additional attribution legs exist for quota, reporting, owner-share, deployment-history, or skill-share views
- totals must not double count

### ACL

ACL is separate from grants.

ACL governs:

- deployment member/admin/manager access
- other collaborator/operator management permissions where implemented

Grants do not grant human admin/operator rights.

### Deployment sponsor grants

Deployment sponsor grants are runtime sponsorship only.

They do:

- allow sponsored deployment runtime
- carry quota/budget context
- support deployment usage attribution

They do not:

- grant deployment member access
- grant config access
- grant chat moderation access
- grant admin/operator rights

Current deployment access policy modes:

- `public_sponsored`
- `authenticated_entitled`
- `internal_only`

---

## 6) Cross-System Contracts

### Public discovery

- Hub owns public discovery
- Hub uses approved, sanitized Catalog-backed data only
- Hub must not depend on private Agents or Skills workspace endpoints for public discovery behavior

### Creator publishing

- Catalog owns creator publishing and review
- ACC consumes Catalog-backed state
- Hub does not own creator publishing workflows

### ACC

- ACC is summary/control only
- ACC may link into Hub, Skills, Deploy, and Agent Builder
- ACC must not duplicate full workflows from those systems

### Agent Builder

- Agent Builder is the editable source for agents
- It is not the public listing source
- It is separate from ACC route ownership

### Skills

- Skills workspace owns skill authoring and installed inventory
- Catalog owns public listing/review/grant state for skills

### Deployments

- Deployments are managed in `/deploy`
- Deployment runtime access policy is deploy-owned
- ACC may summarize deployment state but does not own deployment workflows

---

## 7) Validation and Invariants

### Stable validation commands

- `npm start`
- `npm test`
- `node scripts/run-api-tests.js https://localhost:3001`
- `node --check <file>`

### Architectural invariants

- no `/api/market/*`
- no `/api/agents/hub`
- `/hub` owns public discovery
- `/catalog` owns creator publishing and entitlement management
- `/agents` is ACC only
- `/agentBuilder` is the builder route family
- skills are DB-canonical
- grants and ACL remain separate systems

### Compatibility identifiers intentionally retained

These names still exist as compatibility/history artifacts and should not be treated as current product naming:

- `can_manage_marketplace`
- `can_moderate_marketplace`
- `m026_marketplace_foundation`

---

## 8) Canonical Answer Rules

Use this file as the answer to:

- what exists right now
- which route or subsystem owns which responsibility
- what the current data and entitlement model is
- which invariants must remain true

Do not use this file for:

- recent work narrative
- handoff instructions for future agents
- volatile validation pass-count history

Those belong in `HANDOFF.md`.
