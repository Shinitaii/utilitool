# Utilitool Mobile — Claude Code Guide

Mobile companion app for Utilitool. Field-worker facing: capture meter readings, review history, track billings.

---

## Quick Navigation

- **Adding a new screen** → See [Adding a New Screen](#adding-a-new-screen)
- **Adding an API call** → See [API Modules](#api-modules)
- **Understanding navigation** → See [Navigation & Routing](#navigation--routing)
- **Building the APK** → See [BUILD.md](./BUILD.md)

---

## Technology Stack

| Layer | Stack |
|-------|-------|
| Framework | Svelte 5 (runes) + Vite — **not SvelteKit**, plain Svelte SPA |
| Platform | Capacitor 6 (Android target) |
| Styling | Tailwind v4 + CSS variables for theming |
| Auth | Firebase Auth v10 (same Firebase project as API) |
| Icons | @lucide/svelte |
| API | REST calls to the Utilitool API via custom fetch client |

---

## Project Layout

```
mobile/
├── src/
│   ├── App.svelte              → Root: auth guard + screen router
│   ├── firebase.ts             → Firebase app + auth init
│   ├── main.ts                 → Svelte mount entry point
│   ├── components/
│   │   └── BottomNav.svelte    → Fixed bottom tab bar (Home / History / Billings / Settings)
│   ├── screens/
│   │   ├── Login.svelte        → Firebase sign-in
│   │   ├── Home.svelte         → Dashboard + "New Reading Session" CTA
│   │   ├── CaptureReadings.svelte  → 3-step reading wizard
│   │   ├── ReadingHistory.svelte   → Filterable reading list
│   │   ├── Billings.svelte     → Grouped billings + mark-as-paid
│   │   └── Settings.svelte     → Account info + sign out
│   └── lib/
│       ├── api/
│       │   ├── client.ts           → Base fetch: Bearer token + 401 retry
│       │   ├── meter-groups.ts     → listMeterGroups
│       │   ├── readings.ts         → listReadings, getReading, createReadingsBatch, ocrReadingImage
│       │   ├── properties.ts       → listProperties
│       │   ├── billings.ts         → listBillings, updateBillingStatus
│       │   └── billing-cycles.ts   → listBillingCycles
│       ├── utils/
│       │   ├── auth-errors.ts      → getReadableAuthError
│       │   ├── billing-cycle.util.ts → getStatusSummary, getCyclePaidAmount, getCycleOutstandingAmount
│       │   ├── format.ts           → getReadingUnit, formatReading
│       │   ├── timestamp.ts        → toDate, formatTimestampDate (Firestore timestamp handling)
│       │   └── utility-colors.ts   → getUtilityTypeBadgeClasses
│       └── stores/
│           └── session.ts          → sessionCache: module-level cache for meterGroups + properties (survives screen nav, cleared on sign-out)
├── capacitor.config.ts         → App ID, webDir, Camera plugin config
├── vite.config.ts
├── package.json
└── BUILD.md                    → Android APK build steps
```

---

## Navigation & Routing

Navigation is **hash-based** — no SvelteKit router. `App.svelte` reads `window.location.hash` and renders the matching screen.

| Hash | Screen |
|------|--------|
| `#/home` | Home |
| `#/capture` | CaptureReadings |
| `#/history` | ReadingHistory |
| `#/billings` | Billings |
| `#/settings` | Settings |

Navigate programmatically: `window.location.hash = '#/capture'`

`BottomNav` covers `home`, `history`, `billings`, `settings`. The `capture` screen is accessed via the CTA button on Home, not the nav bar.

---

## API Modules

All API calls go through `src/lib/api/client.ts`:
- Reads `VITE_API_BASE_URL` (defaults to `http://localhost:5002`)
- Attaches `Authorization: Bearer <firebase-id-token>` to every request
- On 401: force-refreshes the token and retries once

**Module → Endpoint mapping:**

| Module | Functions | API Endpoints |
|--------|-----------|---------------|
| `meter-groups.ts` | `listMeterGroups` | `GET /meter-groups?summary=true` |
| `readings.ts` | `listReadings`, `getReading`, `createReadingsBatch` | `GET /readings`, `GET /readings/:id`, `POST /readings/batch` |
| `properties.ts` | `listProperties` | `GET /properties` |
| `billings.ts` | `listBillings`, `updateBillingStatus` | `GET /billings`, `PATCH /billings/:id` |
| `billing-cycles.ts` | `listBillingCycles` | `GET /billing-cycles` |

---

## Screens Reference

### CaptureReadings — 3-Step Wizard
`src/screens/CaptureReadings.svelte`

1. **Step 1 — Session setup**: Select meter group + reading date
2. **Step 2 — Property cards**: For each property that has the selected meter group, enter reading amount + optional Capacitor Camera photo. Capturing a photo automatically calls `POST /readings/ocr` (`ocrReadingImage()`) to suggest the amount — no separate Suggest button.
3. **Step 3 — Confirmation**: Review all entries, submit via `POST /readings/batch` (or `POST /readings/seed` for main-meter baselines)

Properties are filtered client-side: only properties whose `meter_groups` values include the selected meter group ID.

**Photo handling**: a captured photo is only ever used in-memory for the OCR suggest call (`POST /readings/ocr`) — it is never included in the create/batch payload and is never persisted anywhere. Photos are sent to the API as base64 `data:` URIs, not fetchable URLs.

### ReadingHistory — Filterable List
`src/screens/ReadingHistory.svelte`

Two cascading filters:
1. Utility type tabs (All / Electricity / Water) — filters against `meterGroupMap`
2. Property dropdown — restricted to properties that appear in the utility-filtered set

### Billings — Cycle-Centric
`src/screens/Billings.svelte`

Groups billing cycles by meter group; expanding a cycle card reveals its nested billings (mirrors the desktop UI's expanded cycle view) — each shows the property name, its per-property consumption/amount breakdown (`{consumption} {unit} · {currency amount}`, derived from the cycle's `billing_ids` map and `billing_rate`), payment status, and a "Mark as Paid" action that calls `PATCH /billings/:id`.

**Note**: Always render `billing_start_date`/`billing_end_date`/`overdue_date` via `formatTimestampDate()`/`toDate()` from `lib/utils/timestamp.ts` — the API may return these as Firestore `{_seconds, _nanoseconds}` objects despite the `BillingCycle` type's `string` annotation, and `new Date(timestampObject)` silently produces "Invalid Date".

---

## Session Cache

`src/lib/stores/session.ts` provides `sessionCache` — a module-level cache that survives screen navigation (unlike component-local state) and is cleared on sign-out.

```ts
sessionCache.getMeterGroups()         // → MeterGroup[] | null
sessionCache.setMeterGroups(data)     // store after API fetch
sessionCache.getProperties()          // → Property[] | null
sessionCache.setProperties(data)
sessionCache.clear()                  // called on logout in App.svelte
```

**Why**: Avoids re-fetching meter groups and properties on every screen mount during a session. Use this cache in screens that need these lists (e.g., CaptureReadings selects a meter group; ReadingHistory filters by property).

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | API base URL (default: `http://localhost:5002`) |
| `VITE_FIREBASE_API_KEY` | Firebase project API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

---

## Commands

| Task | Command |
|------|---------|
| Dev server (port 5174) | `npm run dev` |
| Production build | `npm run build` |
| Sync to Android | `npx cap sync` |
| Open Android Studio | `npx cap open android` |

---

## Adding a New Screen

1. Create `src/screens/MyScreen.svelte` — include `<BottomNav active="..." />` if it's a tab-level screen
2. Import and add a hash case in `App.svelte`:
   ```svelte
   {:else if currentScreen === 'myscreen'}
     <MyScreen />
   ```
3. Add the hash to the `handleHashChange` allow-list in `App.svelte`
4. If it needs a bottom nav tab, add an entry to the `items` array in `BottomNav.svelte` and extend the `active` prop type

## Adding a New API Module

1. Create `src/lib/api/<feature>.ts`
2. Import `apiGet` / `apiPost` / `apiPatch` / `apiDelete` from `./client`
3. Export typed interfaces matching the backend model
4. Export async functions — return the raw JSON response (callers access `.data`)

---

## Theming

All colors use CSS variables — never hardcode hex values except for one-off status fills. Key variables:

| Variable | Usage |
|----------|-------|
| `--color-accent` | Primary brand color, active states |
| `--color-bg-primary` | Page background |
| `--color-bg-secondary` | Header / nav bar background |
| `--color-border` | Dividers and card borders |
| `--color-text-primary` | Main body text |
| `--color-text-secondary` | Labels and subtitles |
| `--color-text-tertiary` | Timestamps, metadata |
| `--color-status-good` | Paid / success states |
| `--color-status-alert` | Overdue / error states |
