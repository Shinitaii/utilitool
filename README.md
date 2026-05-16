# Utilitool

A utility meter reading and billing management system. Automate the workflow from capturing readings to generating accurate per-tenant bills.

## 🚀 Quick Start

### Prerequisites
- Node.js 24+
- Docker & Docker Compose (recommended) or Firebase CLI

### 1. Clone & Install (< 2 min)
```bash
git clone <repo>
cd new-utility-calculator

# Option A: Docker (one command, everything works)
docker-compose up

# Option B: Manual setup
# Terminal 1: Start API + emulator
cd api/functions && npm ci && npm run serve

# Terminal 2: Start UI
cd ui && npm ci && npm run dev
```

### 2. Open & Login (< 1 min)
- **UI**: http://localhost:5173
- **Swagger Docs**: http://localhost:5002/docs
- **Firebase Emulator**: http://localhost:4400

Sign up with any email/password → You're in the dashboard.

### 3. Try an Endpoint (< 2 min)
Go to Swagger at http://localhost:5002/docs and:
- POST `/meter-group` → Create a meter group
- POST `/property` → Create a property
- POST `/reading` → Log a meter reading

See live request/response shapes and error codes right there.

---

## 📚 What is This?

**Utilitool** manages the meter-to-bill workflow:

1. **Capture readings** from your utility meters (electricity, water, etc.)
2. **Create a billing cycle** — validate all readings match consumption (3% tolerance)
3. **Generate bills** — One bill per tenant, per property, per cycle
4. **Track payments** — See which bills are paid

### Core Concepts
- **Meter Groups** — Utility types (electricity, water)
- **Properties** — Buildings/units consuming utilities
- **Tenants** — Occupants billed for consumption
- **Readings** — Snapshots of meter values
- **Billings** — Individual bills (property + previous/current readings)
- **Billing Cycles** — Validation periods that enforce business rules

---

## 🛠 Tech Stack

| Layer | Stack |
|-------|-------|
| **Backend** | Express + Firebase Cloud Functions (TypeScript, Firestore) |
| **Frontend** | SvelteKit 5 + Svelte 5 (TypeScript, Tailwind, Playwright E2E) |
| **Database** | Firestore (emulated locally, production: Firebase) |
| **Deployment** | Firebase (API) + Vercel (UI) |

---

## 📖 Documentation

- **CLAUDE.md** — Full architecture, file layout, deployment, and deep-dive guides
- **API_SETUP.md** — Environment variables and production config
- **EMULATOR_SETUP.md** — Firebase emulator details
- **Swagger UI** (http://localhost:5002/docs when running) — Interactive endpoint docs
- **api/CLAUDE.md** — Backend architecture & per-feature file map
- **ui/CLAUDE.md** — Frontend architecture & component structure

Start with **CLAUDE.md** for the big picture. New to the API? Hit Swagger for quick reference.

---

## 🔧 Development

### API (`api/functions/`)
```bash
npm run serve          # Dev + emulator
npm run lint           # Check style
npm test              # Run Jest
npm run build         # TypeScript → JavaScript
```

### UI (`ui/`)
```bash
npm run dev           # Dev server
npm run check         # Type check
npm run lint          # Format & lint
npm run test:unit    # Vitest
npm run test:e2e     # Playwright
```

---

## 🚢 Deployment

### Staging (Automatic)
- **API**: Pushes to `main` in `api/functions/**` auto-deploy to staging
- **UI**: PRs get preview deploys on Vercel

### Production (Manual)
- No auto-deploy — deploy via Firebase Console or CLI
- See `CLAUDE.md` → CI/CD & Deployment for details

---

## 🤔 Common Tasks

| Task | Answer |
|------|--------|
| "Where is [feature]?" | CLAUDE.md → file maps |
| "How do I add a new API endpoint?" | api/CLAUDE.md → "Adding a New Feature" |
| "How do I add a new UI page?" | ui/CLAUDE.md → "Adding a New Page" |
| "What does this endpoint do?" | Swagger UI at http://localhost:5002/docs |
| "How do I debug a failed test?" | engineering:debug skill in Cowork |

---

## 📝 Feature Status

**API** ✅ Complete
- Auth (JWT login/register)
- Meter Groups, Properties, Tenants
- Readings, Billings, Billing Cycles
- Full CRUD + batch operations

**UI** ✅ Mostly Complete
- Login/Register, Dashboard
- Meter Groups (full CRUD)
- Tenants, Readings, Billings, Billing Cycles (read/create)
- 🚧 Bills OCR upload, Reports, Property detail (in progress)

---

## 🎯 Questions?

- **Technical deep-dive?** → Read `CLAUDE.md`
- **Stuck on something?** → Check relevant `api/CLAUDE.md` or `ui/CLAUDE.md`
- **Need to understand a business rule?** → `CLAUDE.md` → Business Overview
- **API reference?** → http://localhost:5002/docs (when running)

---

**Happy building!** 🚀
