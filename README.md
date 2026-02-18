# BetterIntelligence

Build AI agents. Share skills. Deploy bots.

A no-code platform for creating AI agents, installing skills from a marketplace, and deploying chatbots. Built on a simplified foundation inspired by OpenClaw.

## Getting Started

```bash
npm install
cp .env.example .env   # Edit if needed
npm start
```

Open http://localhost:3000

## Default Admin

- Email: admin@betterintelligence.com
- Password: AdminPass123!

(Change via ADMIN_EMAIL, ADMIN_PASSWORD in .env)

## Stack

- Node.js, Express, Socket.io
- SQLite (better-sqlite3)
- JWT auth
- Vanilla JS client (no framework)

## Roadmap

- Phase 1: Core schema, auth, filesystem (DONE)
- Phase 2: WebSocket layer, Hooks
- Phase 3: Agent Builder UI (stepper, test chat)
- Phase 4: Skills system (filesystem-based)
- Phase 5: Skill Author
- Phase 6: Skills Hub (marketplace)
- Phase 7: Bot deployment (embed + API)
- Phase 8: Conversation history, onboarding
