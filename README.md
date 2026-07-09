# Utilitool

A utility meter reading and billing management system. Automates the workflow from capturing readings to generating accurate per-tenant bills — with a web dashboard and an Android companion app.

## Quick Start

### Prerequisites
- Node.js 24+

### 1. Clone & Start
```bash
git clone <repo>
cd new-utility-calculator

# Terminal 1 — API (port 5002)
cd api/functions
npm ci
export APP_ENV=staging
export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/secrets/utilitool-staging-firebase-adminsdk-fbsvc-50221e4bd0.json
npm run dev:watch

# Terminal 2 — UI (port 5173)
cd ui && npm ci && npm run dev

# Terminal 3 — Mobile web preview (port 5174, optional)
cd mobile && npm ci && npm run dev
```

### 2. Open in browser
- **UI**: http://localhost:5173
- **Swagger Docs**: http://localhost:5002/docs

Sign up with any email/password → You're in the dashboard.

### Docker alternative
```bash
docker-compose up
```
Starts API, UI, and the mobile web preview in watch mode, each in its own container with source bind-mounted from your host (no local Node install needed). File watching uses polling so edits made on Windows are picked up reliably — costs more memory (`vmmem`) than the manual setup but skips the 3-terminal juggling. Requires `api/functions/secrets/.env.staging` — see `API_SETUP.md`. Note: the mobile container is web-preview only; Capacitor/Android builds still require the manual workflow in `mobile/CLAUDE.md`.

---

## What is This?

**Utilitool** manages the meter-to-bill workflow:

1. **Capture readings** from utility meters (electricity, water)
2. **Create a billing cycle** — validate all readings match consumption (3% tolerance)
3. **Generate bills** — one bill per tenant, per property, per cycle
4. **Track payments** — see which bills are paid, pending, or overdue

### Core Concepts
| Entity | Description |
|--------|-------------|
| **Meter Groups** | Utility type containers (electricity, water) |
| **Properties** | Buildings/units consuming utilities |
| **Tenants** | Occupants billed for consumption |
| **Readings** | Snapshots of meter values |
| **Billings** | Individual bills (property + previous/current reading pair) |
| **Billing Cycles** | Validation periods that enforce the 3% tolerance rule |

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Backend** | Express + Firebase Cloud Functions — TypeScript, Firestore, Zod, custom JWT auth |
| **Frontend** | SvelteKit 5 + Svelte 5 runes — TypeScript, Tailwind v4, Playwright E2E |
| **Mobile** | Svelte 5 SPA + Capacitor 6 — TypeScript, Tailwind v4, Android target |
| **Database** | Firestore (dev: utilitool-staging; production: utilitool-3fe70) |
| **Deployment** | Firebase (API) + Vercel (UI) |

---

## Feature Status

### API
| Feature | Status |
|---------|--------|
| Auth (Firebase Auth) | ✅ Complete |
| Meter Groups | ✅ Complete — CRUD, batch, dynamic sorting (`current_version`/`versions`/`POST /:id/reset` are @deprecated — version tracking moved per-property) |
| Properties | ✅ Complete — CRUD, batch, cascade delete/restore |
| Tenants | ✅ Complete — CRUD, batch |
| Readings | ✅ Complete — auto-billing on create, anomaly guard, meter rollback prevention |
| Billings | ✅ Complete — normally auto-created; manual escape hatch available |
| Billing Cycles | ✅ Complete — validation (version-aware, handles N meter resets), OCR autofill via Gemini, editable for rate/consumption/date corrections |
| Image Extraction | ✅ Complete — `POST /image-extraction/readings` + `/billings` (Gemini Vision) |
| Reports | ✅ Complete — summary, consumption, billing trends, collection status |
| Bills | ⚠️ Partial stub — `POST /bills/ocr` exists; no full service layer |
| Users | ⚠️ Partial stub — `POST /users` for role management |

All DELETE endpoints use soft-delete (no hard removal). `PATCH /:id/restore` reverses it.

### UI (Web)
| Page | Status |
|------|--------|
| Login | ✅ |
| Dashboard | ✅ Stat cards + properties summary |
| Meter Groups | ✅ Full CRUD, archive/restore (Reset Meter button removed — superseded by per-property version tracking) |
| Properties | ✅ List + detail tabs, archive/restore |
| Tenants | ✅ Searchable list, archive/restore |
| Readings | ✅ Batch form + OCR suggest, archive/restore |
| Billings | ✅ Cycle-centric, OCR autofill, cycle edit modal (rate/consumption/dates), archive/restore |
| Reports | 🚧 Stub — API ready, UI not built |
| Bills / OCR | 🚧 Stub — API ready, UI not built |
| Settings | 🚧 Partial — payment + user management tabs scaffolded |

### Mobile (Android)
| Screen | Status |
|--------|--------|
| Login | ✅ Firebase Auth |
| Home | ✅ Dashboard + "New Reading Session" CTA |
| CaptureReadings | ✅ 3-step wizard (select meter group → enter readings + camera → review + submit) |
| ReadingHistory | ✅ Filterable by utility type + property |
| Billings | ✅ Cycle-centric: expandable cycles with per-property consumption/amount breakdown; mark-as-paid action |
| Settings | ✅ Account info + sign out |

---

## Documentation

| File | What it covers |
|------|----------------|
| `CLAUDE.md` | Project overview, business rules, deployment, CI/CD |
| `api/functions/CLAUDE.md` | Backend architecture, all API endpoints, feature file map |
| `ui/CLAUDE.md` | Frontend architecture, component map, page-to-API mapping |
| `mobile/CLAUDE.md` | Mobile screens, navigation, API modules, session cache |
| `API_SETUP.md` | Environment variables and Firebase project config |
| `EMULATOR_SETUP.md` | Firebase emulator manual setup (rarely needed) |
| `CONTRIBUTING.md` | How to add features, branch conventions, code style |
| `decisions/` | Architecture decision records |
| Swagger UI | http://localhost:5002/docs — interactive API reference |

---

## Development Commands

### API (`api/functions/`)
```bash
npm run dev:watch      # Watch mode — standard local dev
npm run build          # Compile TypeScript
npm run lint           # ESLint
npm test               # Jest (all tests)
```

### UI (`ui/`)
```bash
npm run dev            # Dev server (port 5173)
npm run check          # TypeScript check
npm run lint           # ESLint + Prettier
npm run test:unit      # Vitest
npm run test:e2e       # Playwright E2E
npm run build          # Production build
```

### Mobile (`mobile/`)
```bash
npm run dev            # Dev server (port 5174)
npm run build          # Build SPA
npx cap sync           # Sync to Android
npx cap open android   # Open in Android Studio
```

---

## Deployment

### Staging (Automatic on push to `main`)
- **API**: Deploys to `utilitool-staging` Firebase project
- **UI**: Preview deploys on Vercel for pull requests

### Production (Manual)
- Firebase project: `utilitool-3fe70`
- Deploy via Firebase CLI or console
- See `CLAUDE.md` → CI/CD & Deployment for the full workflow

---

## Common Tasks

| Task | Where to look |
|------|--------------|
| Add a new API endpoint | `api/functions/CLAUDE.md` → "Adding a New Feature" |
| Add a new UI page | `ui/CLAUDE.md` → "Adding a New Page" |
| Add a mobile screen | `mobile/CLAUDE.md` → "Adding a New Screen" |
| Understand a business rule | `CLAUDE.md` → Business Overview |
| Interactive API reference | http://localhost:5002/docs |
| Contribute to this project | `CONTRIBUTING.md` |

---

## License

MIT — see [`LICENSE`](./LICENSE).
