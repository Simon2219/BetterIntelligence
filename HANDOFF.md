# Agent Handoff — BetterIntelligence

**For the next agent:** Read this file first. It summarizes the project state, where to find the plan, and what remains.

---

## Plan Files (Read These First)

The implementation plan lives in **Cursor's plan storage**. Look at:

1. **Primary plan (phases, schema, architecture):**
   - `C:\Users\Simon\.cursor\plans\betterintelligence_implementation_4e0041ad.plan.md`
   - Contains: OpenClaw analysis, repo setup, implementation phases (1–8), architecture diagram, file structure, WebSocket vs REST decision, skills filesystem layout, MVP functionality (Part 6d), UI/UX guidelines (Part 6e)

2. **Plan update (clarifications, additions):**
   - `C:\Users\Simon\.cursor\plans\betterintelligence_—_plan_update_(architecture,_skills,_mvp_detail,_ui)_6ac55b47.plan.md`
   - Contains: WebSocket decision rationale, filesystem-first skills, missing functionality (conversation history, chat view, skill edit, deploy API), enriched MVP descriptions, UI guidelines, execution order

---

## Project Location

- **Repo:** `S:\Projects\BetterIntelligence`
- **RealChat (source):** `S:\Projects\RealChat\RealChat` — foundation was copied from here; do not edit RealChat.

---

## What Is Implemented (MVP Status)

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Core schema, auth, filesystem | Done | DB migrations, roles, users, ai_agents, conversations, messages, skill_registry, agent_deployments, hook_configs |
| Phase 2: WebSocket layer, Hooks | Done | gatewaySocket.js, HooksService.js; agent:invoke → agent:stream → agent:done |
| Phase 3: Agent Builder | Done | Agent list (cards), create/edit form; not full stepper UI |
| Phase 4: Skills system | Done | SkillLoader, filesystem (bundled/workspace/installed), precedence |
| Phase 5: Skill Author | Done | Create/edit skills via UI, writes SKILL.md |
| Phase 6: Skills Hub | Done | Browse bundled, install to installed/{userId}/ |
| Phase 7: Bot deployment | Done | Create deployment, embed page at /embed/:slug |
| Phase 8: Chat, history, onboarding | Done | Chat view, conversation selector, 3-step onboarding wizard |

**AI runtime:** The `agent:invoke` handler returns a placeholder response. The AI provider (Ollama/OpenAI) is not wired yet — see plan for AIMiddleware/ContextBuilder integration.

---

## Architecture Summary

- **REST:** Auth, users, agents, skills, conversations, deploy, hub
- **Socket.io (WebSocket):** agent:invoke, agent:stream, agent:done, chat:typing, hooks:event
- **Skills:** Filesystem-first; `data/skills/bundled/`, `workspace/{userId}/`, `installed/{userId}/`; DB (`skill_registry`) is index only
- **Hooks:** HooksService.fire(event, payload) → POST to webhooks + emit over Socket.io

---

## Key Files to Know

| Path | Purpose |
|------|---------|
| `server.js` | Express + Socket.io, routes, skills init |
| `src/server/database/Database.js` | Schema, migrations, Systems |
| `src/server/socket/gatewaySocket.js` | Socket.io auth, agent:invoke handler |
| `src/server/services/SkillLoader.js` | Load skills from filesystem |
| `src/server/services/HooksService.js` | Fire webhooks + emit hooks:event |
| `src/server/routes/` | auth, users, agents, skills, conversations, deploy, hub |
| `src/client/js/app.js` | SPA router, all views (landing, auth, agents, skills, hub, deploy, chat) |
| `config/default.json` | Default config |

---

## What's Not Done (Per Plan)

1. **AI integration** — Wire AIMiddleware/ContextBuilder from RealChat or equivalent; connect agent:invoke to real model calls (Ollama/OpenAI)
2. **Deploy namespace** — `/deploy/:slug` Socket.io namespace for anonymous embed chat
3. **Agent Builder stepper** — Full step progression: Identity → Personality → Tools → Model → Test (current form is single-page)
4. **Tool/skill selector** — Multi-select skills per agent with drag-to-reorder
5. **Hub publish** — Publish workspace skills to `skill_registry`; marketplace listing
6. **Deploy API** — `POST /api/deploy/:slug/chat` for programmatic access; API key, rate limiting
7. **GitHub repo** — Create `Simon2219/BetterIntelligence` on GitHub and push; user must create manually or use `gh auth login` + `gh repo create`

---

## Run Locally

```bash
cd S:\Projects\BetterIntelligence
npm install
cp .env.example .env
npm start
```

Default admin: `admin@betterintelligence.com` / `AdminPass123!`

---

## Plan Sections Reference

From the main plan file:

- **Part 1:** OpenClaw analysis
- **Part 2:** Repo setup (already done)
- **Part 3:** Implementation phases (1–8)
- **Part 4:** Architecture diagram (mermaid)
- **Part 5:** File structure
- **Part 6b:** WebSocket vs REST decision
- **Part 6c:** Skills storage (filesystem)
- **Part 6d:** Complete MVP functionality
- **Part 6e:** UI/UX guidelines
- **Part 7:** Execution order
- **Part 8:** Out of scope
