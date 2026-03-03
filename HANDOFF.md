# HANDOFF_AI_CONTEXT

## 0) MACHINE-READABLE METADATA

```yaml
project:
  name: BetterIntelligence
  repo_root: "S:/Projects/BetterIntelligence"
  source_reference_repo: "S:/Projects/RealChat/RealChat"
  primary_branch: main
  stack:
    backend: ["Node.js", "Express", "Socket.io", "better-sqlite3"]
    frontend: ["Vanilla JS SPA", "CSS"]
    ai: ["Ollama", "ComfyUI", "OpenAI-compatible providers"]
  runtime:
    start_script: "npm start"
    https_entry: "start-https.js"
    env_file: ".env"
  important_local_docs:
    - "SYSTEMS.md"
    - "TEST_RESULTS.md"
    - "HANDOFF.md"
plans:
  implementation_master:
    - "C:/Users/Simon/.cursor/plans/betterintelligence_implementation_4e0041ad.plan.md"
    - "C:/Users/Simon/.cursor/plans/betterintelligence_—_plan_update_(architecture,_skills,_mvp_detail,_ui)_6ac55b47.plan.md"
  chat_media_layout_plan:
    - "C:/Users/Simon/.cursor/plans/chat_view_media_and_layout_fixes_0596efe6.plan.md"
state:
  overall_mvp: implemented
  chat_media_layout_work: implemented_with_recent_regression_fixes
  requires_manual_validation: true
```

---

## 1) SYSTEM GOALS (CURRENT PRIORITIES)

1. Keep BetterIntelligence parity with planned architecture (agents + skills + chat + deployment + AI providers).
2. Ensure chat UX is production-stable:
   - only message pane scrolls in chat view
   - sidebar has no horizontal overflow
   - media upload/crop/view flow works end-to-end
3. Preserve RealChat-inspired media behavior while adapting to BetterIntelligence architecture.
4. Keep AI context behavior consistent: media in history should be represented as placeholders (`[image]`, `[video]`) for text models.

---

## 2) REFERENCE BASELINE: REALCHAT (DO NOT EDIT)

Use RealChat as implementation reference for media UX/components:

- `S:/Projects/RealChat/RealChat/src/client/js/components/MediaViewer.js`
- `S:/Projects/RealChat/RealChat/src/client/js/components/MediaUploadPreview.js`
- `S:/Projects/RealChat/RealChat/src/client/js/components/ImageCropView.js`
- `S:/Projects/RealChat/RealChat/src/client/styles/views.css` (media-related sections)
- `S:/Projects/RealChat/RealChat/server.js` (`/lib/cropperjs` static serving pattern)

Constraint: RealChat is source reference only; do not modify it.

---

## 3) ARCHITECTURE SNAPSHOT (PARSE-ORIENTED)

### Backend

- Entry: `server.js`
- Static:
  - `src/client` served as SPA assets
  - `/media` served from configured media storage path
  - `/lib/cropperjs` served from `node_modules/cropperjs/dist`
- API namespaces:
  - `/api/auth`, `/api/users`, `/api/agents`, `/api/skills`, `/api/chats`, `/api/deploy`, `/api/hub`, `/api/ai`, `/api/knowledge`, `/api/analytics`, `/api/admin`, `/api/appearance`, `/api/roles`, `/api/user/private-tags`, `/api/media`
- Sockets:
  - `src/server/socket/gatewaySocket.js` (authenticated chat/agent events)
  - `src/server/socket/deploySocket.js` (embed/deploy channel)
  - `src/server/socket/notificationsSocket.js` (user notifications)
  - `src/server/socket/adminSocket.js` (admin model/provider realtime)
  - `src/server/socket/analyticsSocket.js` (live analytics updates)

### Frontend

- SPA root: `src/client/js/app.js`
- Style layers:
  - `styles/variables.css`
  - `styles/base.css`
  - `styles/layout.css`
  - `styles/components.css`
  - `styles/views.css`
- Media components:
  - `src/client/js/components/MediaViewer.js`
  - `src/client/js/components/MediaUploadPreview.js`
  - `src/client/js/components/ImageCropView.js`

### AI Pipeline

- Context assembly: `src/server/ai/context/ContextBuilder.js`
- Execution boundary: `src/server/ai/execution/AIExecution.js`
- Providers: `src/server/ai/providers/*`

---

## 4) CHAT/MEDIA/LAYOUT PLAN STATUS (DETAILED)

Source plan: `chat_view_media_and_layout_fixes_0596efe6.plan.md`

### 4.1 Sidebar overflow + sizing

Implemented:
- `src/client/styles/views.css`
  - `.chat-hub__sidebar` uses `overflow-x: hidden`
  - additional overflow guards on chat hub/list/item row
  - truncation present for name/preview/group-name
- `src/client/js/app.js`
  - chat sidebar resize max width constrained against available hub width

### 4.2 Chat scroll containment (messages-only scroll)

Implemented with iterative fixes:
- `src/client/styles/layout.css`
  - `.main.main--chat` enforces hidden overflow
  - chat hub constrained in flex chain
  - app layout/body overflow constrained
- `src/client/styles/views.css`
  - chat main/agent-chat/messages configured for `min-height: 0` + proper flex behavior
- `src/client/styles/base.css`
  - viewport/root overflow behavior adjusted to avoid full-page scroll leakage
- `src/client/js/app.js`
  - route render sets/removes `main--chat` class based on path

### 4.3 Backend media support

Implemented:
- `src/server/routes/media.js`
  - `POST /api/media/upload` (image + video, `chatId`, 25MB limit)
  - `POST /api/media/capture` (base64 capture payload)
- `src/server/services/mediaService.js`
  - `saveBase64()`, `getFilePath()`, `exists()`
  - media filename pattern with user/chat context
  - returns `/media/...` URLs
- `src/server/socket/gatewaySocket.js`
  - `chat:send` accepts `mediaUrl` and `media[]`
  - media messages persisted/emitted with type awareness
  - AI pipeline invocation for media-aware messaging

### 4.4 Client media components

Implemented:
- `MediaViewer` fullscreen carousel + keyboard/nav behavior
- `MediaUploadPreview` modal + single-image crop path + multi-item carousel
- `ImageCropView` using Cropper.js v2
- Cropper served from `/lib/cropperjs`
- Media-related CSS sections added in `views.css`
- Added missing icons in `src/client/js/utils/dom.js` (`chevronLeft`, `chevronRight`, plus existing `paperclip`)

### 4.5 Chat integration

Implemented:
- Attachment input/button in `renderChatView`
- Upload flow:
  - single image + crop -> `/api/media/capture`
  - file upload -> `/api/media/upload`
  - emit `chat:send` with media payload
- `renderChatMessage` supports media rendering
- click handlers open `MediaViewer`
- `chat:message` media handling and dedupe logic present
- `agent:media` rendering updated to clickable media message structure

### 4.6 AI context placeholders

Implemented:
- `src/server/ai/context/ContextBuilder.js`
  - history mapping includes media message types
  - placeholders injected (`[image]`, `[video]`, or per-item)

---

## 5) RECENTLY ADDRESSED REGRESSION TOPICS

These items were explicitly reported and then patched:

1. Chat page still scrolling globally instead of message area only.
2. Agent-generated images not opening preview on click.
3. Crop->Send flow not reliably surfacing upload failures/sends.
4. Crop behavior direction changed: image fixed, crop rectangle movable/resizable, free ratio (non-circle).
5. Crop initial view tuning:
   - `cropper-image initial-center-size="contain"`
   - center fit call after init (`$center('contain')`) for large-image downscale and small-image non-upscale behavior.

Important: treat these as "patched but must be manually verified in running UI".

---

## 6) CURRENT MEDIA CROP DESIGN CONTRACT

`src/client/js/components/ImageCropView.js` intended behavior:

- Rectangle mode:
  - free aspect ratio crop selection
  - selection movable + resizable
  - image intended to initialize centered with contain-fit semantics
- Circle mode:
  - 1:1 selection enforced
  - output masked to circular JPEG
- Export:
  - via `selection.$toCanvas()`
  - JPEG output quality 0.92

---

## 7) SYSTEMS INVENTORY (CANONICAL)

Use `SYSTEMS.md` as canonical inventory of:

- Auth + users
- Agent CRUD
- AI provider registry/status
- ContextBuilder/AIExecution flow
- Gateway/deploy/notifications/admin/analytics sockets
- Chats/messages
- Skills FS + hub
- Knowledge ingestion/chunking
- Analytics event logging
- Deployment/embed pipeline
- Hooks/event dispatch
- Logging subsystem

If uncertain about endpoint ownership, resolve via `SYSTEMS.md` first.

Availability source-of-truth:
- `src/server/services/agentAvailabilityService.js` is canonical for `modelStatuses[]` + `modelStatus`.
- Agents and Chats payloads should reuse this service (no duplicated route-local inference logic).

---

## 8) VALIDATION STATUS

From `TEST_RESULTS.md`:
- historical programmatic checks reported passing
- multiple manual verification items still listed

Additional required manual validation after chat/media/layout patches:

```yaml
manual_validation_required:
  - chat_scroll_isolated_to_messages: true
  - chat_sidebar_no_horizontal_scroll: true
  - click_agent_generated_image_opens_media_viewer: true
  - single_image_crop_send_emits_chat_media_message: true
  - cropper_initial_center_contain_behavior:
      no_upscale_small_images: true
      downscale_large_images_preserving_ratio: true
      selection_move_resize_works: true
```

---

## 9) CRITICAL FILE MAP FOR NEXT AGENT

### Frontend high-priority

- `src/client/js/app.js`
  - route handling + `main--chat` class application
  - `renderChatHub`
  - `renderChatView`
  - media upload flow
  - media click handling
  - `renderChatMessage`
- `src/client/js/components/ImageCropView.js`
- `src/client/js/components/MediaUploadPreview.js`
- `src/client/js/components/MediaViewer.js`
- `src/client/js/utils/dom.js`
- `src/client/styles/base.css`
- `src/client/styles/layout.css`
- `src/client/styles/views.css`

### Backend high-priority

- `server.js`
- `src/server/routes/media.js`
- `src/server/services/mediaService.js`
- `src/server/services/agentAvailabilityService.js`
- `src/server/services/realtimeBus.js`
- `src/server/socket/gatewaySocket.js`
- `src/server/socket/notificationsSocket.js`
- `src/server/socket/adminSocket.js`
- `src/server/socket/analyticsSocket.js`
- `src/server/ai/context/ContextBuilder.js`

---

## 10) KNOWN IMPLEMENTATION RISKS

1. **Scroll containment is CSS-chain sensitive**  
   Any change to `height/min-height/overflow/flex` in `base.css`, `layout.css`, or `views.css` can reintroduce page-level scroll.

2. **Media click path depends on markup shape**  
   Event delegation expects `.chat-msg__media-thumb` / `.chat-msg__image` and parent `.chat-msg` dataset payloads.

3. **Cropper API is web-component based (v2)**  
   Minor template attribute changes can alter interaction semantics dramatically.

4. **Large base64 capture payloads**  
   Works within configured JSON limit; failures should surface via toast/error paths.

---

## 11) OPERATIONAL RUNBOOK

```bash
cd S:\Projects\BetterIntelligence
npm install
npm start
```

Default local assumptions:

- HTTPS dev entry active through `start-https.js`
- `/lib/cropperjs/*` available from server static config
- `/media/*` available and writable from configured media path

---

## 12) NEXT-AGENT EXECUTION PROTOCOL

1. Read this file.
2. Read `SYSTEMS.md`.
3. Read `C:/Users/Simon/.cursor/plans/chat_view_media_and_layout_fixes_0596efe6.plan.md`.
4. Reproduce chat/media UI in running app before changing code.
5. Validate reported behavior in this order:
   - scroll containment
   - sidebar overflow
   - media click preview
   - crop send flow
   - crop contain centering semantics
6. Make minimal targeted edits; avoid broad CSS refactors.
7. Re-run manual checks.
8. Update this handoff with exact residual failures (if any).

---

## 13) SUCCESS CRITERIA FOR THIS HANDOFF THREAD

```yaml
done_when:
  - chat_window_containerized_and_page_not_scrolling_in_chat: true
  - sidebar_no_horizontal_scroll: true
  - image_and_video_preview_click_path_works: true
  - single_image_crop_send_path_works: true
  - cropper_initial_view_is_centered_contain:
      no_upscale_small_images: true
      downscale_large_images: true
```
