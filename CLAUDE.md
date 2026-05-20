# Utilitool — Claude Code Navigation Guide

Welcome to the Utilitool project. This document guides you through the repo structure and points you to the right documentation based on what you're working on.

---

## Quick Navigation

### 📚 What are you doing?

- **Understanding the business**: Start with [Business Overview](#business-overview) below
- **Working on the API**: Read `api/CLAUDE.md` → covers backend architecture, API specs (Swagger), and feature-by-feature file locations
- **Working on the UI**: Read `ui/CLAUDE.md` → covers frontend architecture, component structure, and which API endpoints each page calls
- **Setting up locally**: See [Docker & Local Development](#docker--local-development) below
- **Deploying**: See [CI/CD & Deployment](#cicd--deployment) below
- **Understanding past decisions**: Check `decisions/` folder → read the **title first** to decide relevance before diving into full file

### Read Once Per Session

When Claude Code starts work on a task:
- **API task?** Read `api/CLAUDE.md` only
- **UI task?** Read `ui/CLAUDE.md` only  
- **Cross-module bug?** Read both, but start with the breaking side first

Don't read this file (CLAUDE.md) again during the session unless you need context about deployment or setup.

---

## Project Layout

```
utilitool/
├── api/functions/          → Backend (Express + Firebase Cloud Functions)
│   └── CLAUDE.md           → Read for API architecture & feature file map
├── ui/                     → Frontend (SvelteKit + Svelte 5)
│   └── CLAUDE.md           → Read for UI architecture & component map
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

| Layer | Stack | Details |
|-------|-------|---------|
| **Backend** | Express + Firebase Cloud Functions | TypeScript, Firestore, Zod validation, custom JWT auth |
| **Frontend** | SvelteKit 5 + Svelte 5 runes | TypeScript, Tailwind v4, Playwright E2E |
| **Database** | Firestore (emulated locally) | No-SQL, real-time capabilities |
| **Deployment** | Firebase (API) + Vercel (UI) | Staging & production aliases configured |

---

## Docker & Local Development

### Quick Start
```bash
docker-compose up
```

Starts:
- **API** (port 5002) — Express server connected to utilitool-staging Firebase, watch mode
- **UI** (port 5173) — SvelteKit dev server

See `docker-compose.yml` for full config.

### Manual Setup
```bash
# Terminal 1: Start API connected to utilitool-staging
cd api/functions
npm ci
export APP_ENV=dev
export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/secrets/utilitool-staging-firebase-adminsdk-fbsvc-6a77170d3f.json
npm run dev:watch

# Terminal 2: Start UI
cd ui
npm ci
npm run dev
```

---

## Commands Quick Reference

### API (`api/functions/`)
| Task | Command |
|------|---------|
| Dev (watch mode) | `npm run dev:watch` |
| Type check | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Test | `npm test` |
| Build | `npm run build` |

### UI (`ui/`)
| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Type check | `npm run check` |
| Lint | `npm run lint` |
| Test (unit) | `npm run test:unit` |
| Test (E2E) | `npm run test:e2e` |
| Build | `npm run build` |

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

- **UI**: Preview deploys on pull requests
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

### API Features (Complete)
- ✅ Meter Groups (CRUD, batch)
- ✅ Properties (CRUD, batch)
- ✅ Tenants (CRUD, batch)
- ✅ Readings (CRUD, batch; single create auto-creates billings per property on meter group)
- ✅ Billings (CRUD, batch; normally auto-created by reading service)
- ✅ Billing Cycles (CRUD, batch, validation; supports meter_reset consumption formula)
- ✅ Auth (JWT: login, register, refresh, logout)

### UI Pages (Complete)
- ✅ Login / Register
- ✅ Dashboard (stat cards + properties table)
- ✅ Meter Groups (full CRUD table)
- ✅ Properties (list + detail with tabs: Tenants | Readings | Billings | History)
- ✅ Tenants (searchable list)
- ✅ Readings (filterable list)
- ✅ Billings (cycle-centric: expandable cycles with nested billings)
- 🚧 Bills / OCR upload (stub — "to be finished")
- 🚧 Reports (stub — "to be finished")

---

## Getting Started

### 1. First Time Setup
```bash
# Clone repo
git clone <repo>
cd new-utility-calculator

# Start dev environment
docker-compose up

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

| File | Why It Matters |
|------|---|
| `docker-compose.yml` | Start the whole stack with one command |
| `api/functions/src/index.ts` | API entry point — all routes mounted here |
| `api/functions/src/config/swagger.config.ts` | OpenAPI spec generator — aggregates all `.swagger.ts` files |
| `ui/src/routes/(app)/+layout.ts` | Auth guard for all protected routes |
| `ui/src/lib/api/client.ts` | JWT token refresh interceptor — handles 401 + retry |
| `ui/src/lib/stores/auth.svelte.ts` | Authentication state (Svelte writable store) |

---

## Further Reading

- **Deep dive on API**: `api/CLAUDE.md`
- **Deep dive on UI**: `ui/CLAUDE.md`
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
