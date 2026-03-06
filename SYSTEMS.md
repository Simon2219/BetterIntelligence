# BetterIntelligence - Canonical System Map

## 1) Runtime Architecture
- Backend: Node.js + Express + Socket.io
- Database: SQLite (`better-sqlite3`) through repository modules
- Frontend: Vanilla JS SPA + modular views/components
- AI: Provider registry (Ollama, ComfyUI, OpenAI-compatible), unified execution boundary

## 2) Backend Boundaries
### Entry + Wiring
- `server.js`
- Route registration under `/api/*`
- Socket namespace initialization: `/`, `/deploy`, `/notifications`, `/admin`, `/analytics`

### Database Layer (Canonical)
- `src/server/database/index.js` exports repositories
- Repositories live in `src/server/database/repositories/*Repository.js`
- Core DB runtime helpers in `src/server/database/core/*`
- Migrations in `src/server/database/migrations/*`

Canonical naming rule:
- Use `*Repository` exports (`UserRepository`, `ChatRepository`, `AIModelRepository`, etc.)
- No new `*System` modules as primary ownership

### AI Pipeline
- Context: `src/server/ai/context/ContextBuilder.js`
- Execution boundary: `src/server/ai/execution/AIExecution.js`
- Usage tracking: `src/server/ai/usage/AIUsageTracker.js`
- Provider runtime: `src/server/ai/providers/*`

### Shared Services
- Agent availability source-of-truth: `src/server/services/agentAvailabilityService.js`
- Realtime fanout + in-memory notifications: `src/server/services/realtimeBus.js`
- Model catalog orchestration: `src/server/services/aiModelCatalogService.js`
- Appearance orchestration: `src/server/services/appearanceService.js`
- Chat summarization: `src/server/services/chatSummaryService.js`

## 3) API Surface (Primary)
### Auth + Users
- `/api/auth/*`
- `/api/users/me`
- `/api/users/me/password`
- `/api/users/me/notifications` (REST bootstrap for topbar notifications)
- `/api/users/me/notifications/:id/ack`

### Agents + Hub
- `/api/agents/*`
- `/api/hub/*`

Availability contract (additive):
- `modelStatuses[]`
- `modelStatus` aggregate
- provider/model display-name fields

### Chats
- `/api/chats`
- `/api/chats/deployments`
- `/api/chats/unread-count`
- `/api/chats/:chatId`
- `/api/chats/:chatId/messages`
- `/api/chats/:chatId/read`
- `/api/chats/:chatId/summary`

Chat payloads include canonical agent availability metadata via `agentAvailabilityService`.

### Admin / Models / Appearance
- `/api/admin/*`
- `/api/appearance`
- `/api/roles/*`

### Skills / Knowledge / Analytics / Media / Deploy
- `/api/skills/*`
- `/api/knowledge/*`
- `/api/analytics/*`
- `/api/media/*`
- `/api/deploy/*`

## 4) Socket Namespaces (Realtime Overlay)
### `/` (gateway)
- Chat/agent streaming lifecycle (`chat:*`, `agent:*`)

### `/deploy`
- Embed + deployment channel

### `/notifications`
- `notifications:subscribe`
- `notifications:new`
- `notifications:badge`
- `notifications:ack`

### `/admin`
- `admin:model_status:subscribe|unsubscribe`
- `admin:model_status:update`
- `admin:model_usage:update`
- `admin:provider_status:update`

### `/analytics`
- `analytics:subscribe|unsubscribe`
- `analytics:snapshot`
- `analytics:update`

Rule:
- REST is source of truth.
- Sockets are realtime overlays.

## 5) Frontend Architecture
### App Shell
- `src/client/js/app.js` (thin app entrypoint)
- `src/client/js/core/bootstrap.js` (composition root: wiring, routing, lifecycle)
- `src/client/js/core/socketClients.js` (shared namespace socket manager)
- `src/client/js/core/clientAppearance.js`

### Views
- `src/client/js/views/chat/chatMainView.js`
- `src/client/js/views/agents/agentsMainView.js`
- `src/client/js/views/admin/adminPanelView.js`
- `src/client/js/views/deploy/deployMainView.js`
- `src/client/js/views/analyticsView.js`
- `src/client/js/views/*` (skills, hub, auth, settings, onboarding, app shell parts)

### Shared UI + Utilities
- `src/client/js/components/*`
- `src/client/js/utils/modelHealth.js`
- `src/client/js/utils/dom.js`
- `src/client/js/utils/dragdrop.js`

### Styles
- `src/client/styles/StyleManifest.css` (single app stylesheet entrypoint)
- `src/client/styles/tokens/theme.css` (canonical token layer)
- `src/client/styles/views/ChatView.css`

## 6) Cross-System Contracts
1. Agent availability must be server-derived (`agentAvailabilityService`) and reused in Agents/Chat/Hub payloads.
2. Chat parent-group severity:
- `warning` when at least one model unavailable
- `error` when all models unavailable
- `ok` when all available
3. Chat composer behavior:
- `error` => input/send/attach disabled
- `warning` => send stays enabled
4. Display names are UI labels only; technical identifiers remain provider/model keys.
