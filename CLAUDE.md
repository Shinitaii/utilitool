# Utilitool — Claude Code Navigation Guide

Welcome to the Utilitool project. This document guides you through the repo structure and points you to the right documentation based on what you're working on.

---

## Quick Navigation

### 📚 What are you doing?

- **Understanding the business**: Start with [Business Overview](#business-overview) below
- **Working on the API**: Read `api/CLAUDE.md` → covers backend architecture, API specs (Swagger), and feature-by-feature file locations
- **Working on the UI**: Read `ui/CLAUDE.md` → covers frontend architecture, component structure, and which API endpoints each page calls
- **Working on the Mobile app**: Read `mobile/CLAUDE.md` → covers Capacitor + Svelte SPA, screens, API modules, and navigation
- **Setting up locally**: See [Local Development](#local-development) below
- **Deploying**: See [CI/CD & Deployment](#cicd--deployment) below
- **Understanding past decisions**: Check `decisions/` folder → read the **title first** to decide relevance before diving into full file

### Read Once Per Session

When Claude Code starts work on a task:

- **API task?** Read `api/CLAUDE.md` only
- **UI task?** Read `ui/CLAUDE.md` only
- **Mobile task?** Read `mobile/CLAUDE.md` only
- **Cross-module bug?** Read the relevant CLAUDEs, but start with the breaking side first

Don't read this file (CLAUDE.md) again during the session unless you need context about deployment or setup.

### Before Planning or Brainstorming

Run RAG retrieval on the topic before writing any plan or spec, using the standalone `rag-tool` (not the old in-repo `api/functions/rag.ts`, which has been removed):

```bash
# From the rag-tool venv
python -m rag.cli query "YOUR TOPIC HERE" 5
```

Replace `YOUR TOPIC HERE` with the feature or question being planned (e.g. `"billing cycle validation"`, `"tenant CRUD"`, `"auth middleware"`). See `coding-projects/rag-tool` for indexing/setup.

---

## Project Layout

```
utilitool/
├── api/functions/          → Backend (Express + Firebase Cloud Functions)
│   └── CLAUDE.md           → Read for API architecture & feature file map
│   └── src/features        → API Features
│       └── *.swagger.ts    → Swagger API documentation
├── ui/                     → Frontend (SvelteKit + Svelte 5)
│   └── CLAUDE.md           → Read for UI architecture & component map
├── mobile/                 → Mobile app (Svelte 5 SPA + Capacitor, Android)
│   └── CLAUDE.md           → Read for screens, API modules, navigation
├── docker-compose.yml      → Local dev orchestration
├── CLAUDE.md               → This file (navigation orchestrator)
├── API_SETUP.md            → API setup guide
└── EMULATOR_SETUP.md       → Firebase emulator configuration
```

---

## Business Overview

**Utilitool** is a utility meter reading and billing management system. It automates the workflow from capturing readings to generating accurate per-tenant bills.

### Core Entities

1. **Meter Groups** — Containers for utility types (electricity, water)
2. **Properties** — Buildings/units that consume utilities
3. **Tenants** — Individual renters/occupants
4. **Readings** — Snapshots of consumption at a point in time
5. **Billings** — Individual bill records (property + previous/current readings)
6. **Billing Cycles** — Periods that validate and rate all readings (enforces 3% tolerance, no meter rollback)

### The Happy Path

1. Capture readings from meters
2. Create a billing cycle (date range + total consumption + total charges)
3. System validates readings + consumption (3% tolerance)
4. System generates per-tenant bills
5. Track payment status

---

## Technology Stack

| Layer          | Stack                              | Details                                                |
| -------------- | ---------------------------------- | ------------------------------------------------------ |
| **Backend**    | Express + Firebase Cloud Functions | TypeScript, Firestore, Zod validation, custom JWT auth |
| **Frontend**   | SvelteKit 5 + Svelte 5 runes       | TypeScript, Tailwind v4, Playwright E2E                |
| **Mobile**     | Svelte 5 SPA + Capacitor 6         | TypeScript, Tailwind v4, Android target, Firebase Auth |
| **Database**   | Firestore (emulated locally)       | No-SQL, real-time capabilities                         |
| **Deployment** | Firebase (API) + Vercel (UI)       | Staging & production aliases configured                |

---

## Local Development

### Quick Start

```bash
# Terminal 1 — API (port 5002, watch mode, connected to utilitool-staging)
cd api/functions
npm ci
export APP_ENV=staging
export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/secrets/utilitool-staging-firebase-adminsdk-fbsvc-50221e4bd0.json
npm run dev:watch

# Terminal 2 — UI (port 5173)
cd ui
npm ci
npm run dev

# Terminal 3 — Mobile web preview (port 5174, optional)
cd mobile
npm ci
npm run dev
```

### Docker alternative

```bash
docker-compose up
```

Starts API (port 5002), UI (port 5173), and the mobile web preview (port 5174) in watch mode, each in its own container with the source bind-mounted from your host. File watching runs in polling mode (`CHOKIDAR_USEPOLLING=true` / `ts-node-dev --poll`) so edits made on a Windows host are picked up reliably through the WSL2/VirtioFS bind mount — without it, native `fs.watch` can silently miss host-side changes and hot reload stalls. Trade-off vs. the manual 3-terminal setup: no local Node install needed and one `docker-compose up` instead of juggling terminals, at the cost of higher memory usage (`vmmem`) and slightly less snappy reload due to polling. Requires `api/functions/secrets/.env.staging` to exist — see `API_SETUP.md`. The mobile container only serves the Vite web preview; the Capacitor/Android native build is not containerized and still requires the manual `mobile/CLAUDE.md` workflow.

---

## Commands Quick Reference

### API (`api/functions/`)

| Task             | Command             |
| ---------------- | ------------------- |
| Dev (watch mode) | `npm run dev:watch` |
| Type check       | `npx tsc --noEmit`  |
| Lint             | `npm run lint`      |
| Test             | `npm test`          |
| Build            | `npm run build`     |

### UI (`ui/`)

| Task        | Command             |
| ----------- | ------------------- |
| Dev server  | `npm run dev`       |
| Type check  | `npm run check`     |
| Lint        | `npm run lint`      |
| Test (unit) | `npm run test:unit` |
| Test (E2E)  | `npm run test:e2e`  |
| Build       | `npm run build`     |

---

## Swagger / API Documentation

**When API is running** (`npm run serve`):

- **Swagger UI**: http://localhost:5002/docs
- **OpenAPI spec**: http://localhost:5002/docs/swagger.json

Each feature has a `.swagger.ts` file defining its endpoints. Reference Swagger for:

- Request/response shapes
- Error codes & meanings
- Business rule constraints (e.g., 3% tolerance)

**All documented in `api/CLAUDE.md`** — see "API Endpoints by Feature" section.

---

## CI/CD & Deployment

### Staging

- **API**: Automatically deploys on push to `main` in `api/functions/**`
  - Project alias: `staging` (utilitool-staging)
  - Requires: `FIREBASE_TOKEN_STAGING` in GitHub secrets

- **UI**: Vercel Preview deploy — triggered for pull requests and also on push to `main` (this is what's actually configured as staging; there's no separate custom Vercel Environment)
  - Project: Vercel
  - Requires: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

### Production

- **Firestore**: utilitool-3fe70
- **Manual deployment only** — not in CI/CD

See `.github/workflows/` for full pipeline definitions.

---

## File Maps

### Per-Feature File Map

Each API feature is self-contained in `api/functions/src/features/<feature>/` following this pattern:

```
<feature>/
├── <feature>.model.ts        → TypeScript type definition
├── <feature>.dto.ts          → Input/output shape validation (Zod)
├── <feature>.repository.ts   → Firestore CRUD operations
├── <feature>.service.ts      → Business logic & validation
├── <feature>.controller.ts   → HTTP request handling
├── <feature>.route.ts        → Express route definitions
├── <feature>.validator.ts    → Zod schema validators
├── <feature>.swagger.ts      → OpenAPI documentation
└── <feature>.test.ts         → Jest tests
```

**Full details**: See `api/CLAUDE.md` → "File & Folder Reference by Feature"

### Per-Component File Map (UI)

Each page/component is organized by:

- **Pages**: `ui/src/routes/(app)/<feature>/+page.svelte`
- **API modules**: `ui/src/lib/api/<feature>.ts` (calls backend)
- **Components**: `ui/src/lib/components/<shared|feature>/`
- **Types**: `ui/src/lib/types/<feature>.types.ts` (matches backend models)

**Full details**: See `ui/CLAUDE.md` → "Component & API Mapping"

---

## Feature Status

### API Features (Complete + Audited May 2026)

- ✅ Meter Groups (CRUD, batch; dynamic sorting; `POST /:id/reset` and its `current_version`/`versions` fields are **@deprecated** — version tracking now lives per-property on `Property.meter_groups[entry]`, see `decisions/`)
- ✅ Properties (CRUD, batch; dynamic sorting; optimized duplicate detection)
- ✅ Tenants (CRUD, batch; dynamic sorting)
- ✅ Readings (CRUD, batch; auto-billing on single create; anomaly guard; meter rollback prevention; utility extraction)
- ✅ Billings (CRUD, batch; normally auto-created; meter rollback prevention)
- ✅ Billing Cycles (CRUD, batch, validation; editable via `PATCH /:id` for rate/consumption/date corrections; version-aware consumption (handles N meter resets cumulatively via `calculateTrueReading`/`resolveVersionsSource` in `reading.util.ts`); `POST /ocr` bill photo extraction; dynamic sorting)
- ✅ Auth (Firebase Auth: sign up, login, logout)
- ✅ Image Extraction (`POST /image-extraction/readings` + `POST /image-extraction/billings` — vision OCR via the user's configured `llm-config` vision provider, Groq or Ollama Cloud only; no Gemini)
- ✅ Reports (`GET /reports/summary`, `/consumption`, `/billing-trends`, `/collection-status`)
- ✅ Bills (`POST /bills/ocr` — functional 3-step UI wizard; overlaps with image-extraction)
- ✅ Users (`POST /users` — creates both the Firebase Auth account and Firestore profile server-side via the Admin SDK in one call; the client never touches Firebase Auth for this flow, so the acting admin's own session is never hijacked by the newly created account)
- ✅ LLM Config (`GET`/`PATCH /llm-config` for the chatbot provider/model/API key + `PATCH /llm-config/vision` for an **independent** vision provider/model/API key used by OCR — separate because not every provider has a usable free vision model; reuses the chatbot's API key when both configs use the same provider; API keys AES-256-GCM encrypted at rest via `lib/crypto.lib.ts`)
- ✅ Chatbot (`POST /chatbot` — insight assistant scoped to the authenticated user's data, tool-calling via `lib/llm.lib.ts` against Groq/Ollama Cloud; regex jailbreak guard in `chatbot.guard.ts`)

**Audit Highlights (25 fixes)**:

- **D1**: Soft-delete pattern — all DELETE endpoints soft-delete (set `is_deleted` flag), no hard delete
- **D2**: Timestamp serialization — JSON responses use ISO 8601 strings
- **D3**: Firestore indices — composite indices for soft-delete + filter queries
- **D4**: Meter rollback prevention — utility validates no meter regression
- **D5**: Dynamic sorting — `sortBy`, `sortOrder` on all list endpoints
- **E1–E3**: Structured logging (requests, errors, queries)
- **C1–C3**: Code deduplication, type safety, query optimization
- **H1–H4**: Consistent pagination, batch ops, archive/restore semantics

### UI Pages (Complete + Audited May 2026)

- ✅ Login
- ✅ Dashboard (stat cards + properties table)
- ✅ Meter Groups (full CRUD table; archive page — Version column and Reset Meter button removed, version tracking moved to per-property)
- ✅ Properties (list + detail with tabs: Tenants | Readings | Billings | History; archive page)
- ✅ Tenants (searchable list; archive page)
- ✅ Readings (filterable list; True Total column; batch form with decoupled OCR suggest; archive page)
- ✅ Billings (cycle-centric: expandable cycles with nested billings; bill photo OCR autofill; cycle edit modal for rate/consumption/date corrections; archive page)
- ✅ Bills / OCR upload (3-step wizard: upload → review/map → submit, creates a billing cycle)
- 🚧 Reports (stub — API module ready, UI not built)
- 🚧 Settings (partial — payment + user management tabs scaffolded; LLM Provider tab added)
- ✅ Insight Chatbot (`ChatWidget` floating widget, mounted globally on all protected routes)

### Mobile Screens (May 2026)

- ✅ Login (Firebase Auth)
- ✅ Home (dashboard + "New Reading Session" CTA)
- ✅ CaptureReadings (3-step wizard: meter group select → per-property readings + camera with auto OCR suggest → review & batch submit)
- ✅ ReadingHistory (filterable by utility type + property)
- ✅ Billings (grouped by status: overdue/pending/paid; mark-as-paid action)
- ✅ Settings (account info + sign out)

---

## Getting Started

### 1. First Time Setup

```bash
# Clone repo
git clone <repo>
cd new-utility-calculator

# Terminal 1 — API
cd api/functions
npm ci
export APP_ENV=staging
export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/secrets/utilitool-staging-firebase-adminsdk-fbsvc-50221e4bd0.json
npm run dev:watch

# Terminal 2 — UI
cd ui && npm ci && npm run dev

# Open in browser
# UI: http://localhost:5173
# API Docs: http://localhost:5002/docs
```

### 2. Register a User

- Go to http://localhost:5173
- Click "Sign up"
- Create test account (e.g., `test@example.com` / `password123`)
- Login → Dashboard

### 3. Explore the API

- Visit http://localhost:5002/docs
- Try endpoints: POST meter-group, POST property, POST tenant, POST reading, etc.
- See real request/response shapes in Swagger UI

### 4. Understand Features

- Need to add a **new API feature**? → See `api/CLAUDE.md` → "Adding a New Feature"
- Need to add a **new UI page**? → See `ui/CLAUDE.md` → "Adding a New Page"
- Need to understand a **specific business rule**? → See section in this doc or the Business Overview

---

## Key Files

| File                                         | Why It Matters                                                        |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `docker-compose.yml`                         | Docker alternative for running the full stack (see Local Development) |
| `api/functions/src/index.ts`                 | API entry point — all routes mounted here                             |
| `api/functions/src/config/swagger.config.ts` | OpenAPI spec generator — aggregates all `.swagger.ts` files           |
| `ui/src/routes/(app)/+layout.ts`             | Auth guard for all protected routes                                   |
| `ui/src/lib/api/client.ts`                   | JWT token refresh interceptor — handles 401 + retry                   |
| `ui/src/lib/stores/auth.svelte.ts`           | Authentication state (Svelte writable store)                          |
| `mobile/src/App.svelte`                      | Mobile root: auth guard + hash-based screen router                    |
| `mobile/src/lib/api/client.ts`               | Mobile fetch client: Bearer token + 401 retry                         |
| `mobile/capacitor.config.ts`                 | Capacitor app ID, webDir, Camera plugin settings                      |

---

## Further Reading

- **Deep dive on API**: `api/CLAUDE.md`
- **Deep dive on UI**: `ui/CLAUDE.md`
- **Deep dive on Mobile**: `mobile/CLAUDE.md`
- **Mobile build guide**: `mobile/BUILD.md`
- **API setup & environments**: `API_SETUP.md`
- **Emulator configuration** (advanced/manual use): `EMULATOR_SETUP.md`
- **Dev workflow decision**: `decisions/20260517_no-emulators-in-dev.md`
- **Reading auto-billing design**: `decisions/20260520_reading-auto-creates-billing.md`

---

## Questions?

- **"Where is [feature]?"** → Check the file map in the relevant CLAUDE.md (`api/` or `ui/`)
- **"How do I [add a feature]?"** → Check "Adding a New Feature" in the relevant CLAUDE.md
- **"What does [API endpoint] do?"** → Check Swagger UI at http://localhost:5002/docs
- **"Which API endpoints does [page] call?"** → Check `ui/CLAUDE.md` → "Page-to-API Mapping"
