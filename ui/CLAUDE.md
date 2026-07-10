# UI Frontend — Claude Code Guide

This document covers the SvelteKit frontend architecture, component structure, and which API endpoints each page calls.

---

## Quick Links

- **Understand the UI structure**: See "Architecture & File Structure" section
- **Find a component**: See "Component & File Map" section
- **Understand which API endpoints a page calls**: See "Page-to-API Mapping" section
- **Adding a new page**: See "Adding a New Page" section
- **Back to global docs**: See `../CLAUDE.md` (root)
- **Back to API docs**: See `api/functions/CLAUDE.md`

---

## Architecture & Technology Stack

### Framework & Plugins
- **SvelteKit 5** — File-based routing, server-side render (SSR) optional
- **Svelte 5 runes** — Reactive state (`$state`, `$derived`, `$effect`) enforced globally
- **Tailwind CSS v4** — Utility-first CSS (no `tailwind.config.js` — config is CSS-driven via `@theme`)
- **shadcn-svelte** — Copy-paste component library (buttons, inputs, dialogs, etc.)
- **Vite** — Build tool
- **Vitest** — Unit tests (Node + browser modes)
- **Playwright** — E2E tests

### Project Setup
- Language: **TypeScript** (strict mode)
- Package Manager: **npm**
- Deployment: **Vercel** (via adapter)

---

## Architecture Overview

### Request Flow (Client → API → Firestore)
```
User interaction
  ↓
Component (Svelte 5 $state)
  ↓
API module (src/lib/api/<feature>.ts)
  ↓
API client (src/lib/api/client.ts)
  ↓
Backend (Express + Firestore)
  ↓
Response + update local store
```

### Auth Flow
```
Login form
  ↓
Firebase SDK signInWithEmailAndPassword (firebase/auth)
  ↓
onAuthStateChanged updates authStore + fetches profile via getMe()
  ↓
client.ts calls firebaseUser.getIdToken() and attaches it as
  Authorization: Bearer <token> on every request
  ↓
On 401: force-refresh the ID token (getIdToken(true)) and retry once
```

---

## Component & File Map

### Directory Structure
```
ui/src/
├── routes/                          (SvelteKit file-based routing)
│   ├── +layout.svelte              (Root layout — loads global CSS)
│   ├── +page.svelte                (Root page — redirect to /dashboard)
│   ├── (auth)/                     (Auth layout group — centered card)
│   │   ├── +layout.svelte
│   │   └── login/+page.svelte
│   └── (app)/                      (Protected app layout group — sidebar + main + right panel)
│       ├── +layout.ts              (Auth guard — redirects to /login if no token)
│       ├── +layout.svelte          (3-column shell: Sidebar | Main | RightPanel)
│       ├── dashboard/+page.svelte  (Stat cards + properties table)
│       ├── meter-groups/
│       │   ├── +page.svelte
│       │   └── archive/+page.svelte   (Archived meter groups recovery)
│       ├── properties/
│       │   ├── +page.svelte
│       │   └── archive/+page.svelte   (Archived properties recovery)
│       ├── tenants/
│       │   ├── +page.svelte
│       │   └── archive/+page.svelte   (Archived tenants recovery)
│       ├── readings/
│       │   ├── +page.svelte
│       │   └── archive/+page.svelte   (Archived readings recovery)
│       ├── billings/
│       │   ├── +page.svelte
│       │   └── archive/+page.svelte   (Archived billings recovery)
│       ├── bills/+page.svelte      (OCR bill upload — functional)
│       ├── reports/+page.svelte    (Analytics dashboard — stub)
│       └── settings/
│           ├── +page.svelte        (Account settings root)
│           ├── payment/+page.svelte (Payment settings)
│           ├── users/+page.svelte  (User management — create users, assign roles)
│           └── llm-provider/+page.svelte (LLM provider/model/API key config for the insight chatbot)
│
├── lib/
│   ├── api/                         (API client modules — one per feature)
│   │   ├── client.ts               (Fetch wrapper + JWT refresh interceptor)
│   │   ├── auth.ts                 (login, register, refresh, logout)
│   │   ├── meter-groups.ts         (CRUD + list wrappers)
│   │   ├── properties.ts
│   │   ├── tenants.ts
│   │   ├── readings.ts
│   │   ├── billings.ts
│   │   ├── billing-cycles.ts
│   │   ├── bills.ts                (ocrBill — POST /bills/ocr)
│   │   ├── users.ts                (createUser — POST /users)
│   │   ├── reports.ts              (getSummaryReport, getConsumptionReport, getBillingTrendsReport, getCollectionStatusReport)
│   │   ├── llm-config.ts           (getLlmConfig, upsertLlmConfig — GET/PATCH /llm-config)
│   │   ├── chat.ts                 (sendChatMessage — POST /chatbot)
│   │   └── cache.ts                (clearAllCaches — clears all feature caches in parallel)
│   │
│   ├── types/                       (TypeScript types — mirror API models)
│   │   ├── api.types.ts            (Shared: PaginatedResult, BaseModel, FirestoreTimestamp)
│   │   ├── auth.types.ts
│   │   ├── bill.types.ts           (OcrBillResponse)
│   │   ├── meter-group.types.ts
│   │   ├── property.types.ts
│   │   ├── tenant.types.ts
│   │   ├── reading.types.ts
│   │   ├── billing.types.ts
│   │   ├── billing-cycle.types.ts
│   │   ├── reports.types.ts        (ReportSummary, ConsumptionReport, BillingTrendsReport, CollectionStatusReport, ReportQueryParams)
│   │   └── llm-config.types.ts     (LlmConfigResponse, UpsertLlmConfigRequest)
│   │
│   ├── stores/                      (Svelte 5 runes-based stores)
│   │   ├── auth.svelte.ts          (isAuthenticated, user, isLoading, error)
│   │   ├── crud.svelte.ts          (Generic CRUD store factory: selection, soft-delete, batch-delete, edit modal)
│   │   ├── meter-groups.svelte.ts  (Meter group list state)
│   │   ├── properties.svelte.ts    (Property list state)
│   │   └── tenants.svelte.ts       (Tenant list state)
│   │
│   ├── utils/                       (Formatting + conversion utilities)
│   │   ├── format.ts               (formatCurrency, formatDate, formatKwh, relativeTime, getInitials)
│   │   └── timestamp.ts            (toDate, toTimestamp, Firestore ↔ JS Date conversion)
│   │
│   └── components/
│       ├── layout/                  (App shell components)
│       │   ├── Sidebar.svelte      (200px nav with badges + user card)
│       │   ├── TopBar.svelte       (Breadcrumbs + page actions)
│       │   └── RightPanel.svelte   (280px selection-driven detail panel)
│       │
│       └── shared/                  (Reusable UI components)
│           ├── ActionButtons.svelte     (Standardized row action buttons: edit, archive, restore)
│           ├── ArchivePageTemplate.svelte (Reusable layout for all archive/restore pages)
│           ├── EditModal.svelte         (Generic edit modal — wraps form with save/cancel)
│           ├── EmptyState.svelte        (No data placeholder)
│           ├── ImagePreview.svelte      (Inline image preview widget)
│           ├── SelectionToolbar.svelte  (Multi-select batch action toolbar)
│           ├── ChatWidget.svelte        (Floating insight chatbot — mounted globally in (app)/+layout.svelte)
│           ├── StatCard.svelte          (Metric card with value + sub)
│           ├── StatusPill.svelte        (Colored status badges)
│           └── ToBeFinished.svelte      (Stub placeholder with build hammer icon)
│
└── routes/layout.css               (Global CSS: @import 'tailwindcss' + theme colors)
```

---

## Page-to-API Mapping

### Authentication Pages

#### Login (`/login`)
- **Component**: `src/routes/(auth)/login/+page.svelte`
- **Flow**:
  - Firebase SDK `signInWithEmailAndPassword(auth, email, password)`
  - `onAuthStateChanged` fires → `getMe()` from `src/lib/api/auth.ts` fetches the user profile and
    populates `authStore`
- **On success**: Redirect to `/dashboard`
- **On error**: Display error message, enable retry

---

### Protected Routes (all under `(app)/`)

#### Dashboard (`/dashboard`)
- **Component**: `src/routes/(app)/dashboard/+page.svelte`
- **API calls**:
  - `GET /properties?limit=100` ← `getProperties()` — for stat card counts
  - `GET /tenants?limit=100` ← `getTenants()` — for stat card counts
  - `GET /billing-cycles?limit=50` ← `getBillingCycles()` — for recent cycles
- **Displays**:
  - 4 stat cards: "This Month Billed", "Collected", "Outstanding", "Due in 7 Days"
  - Properties summary table (name, paid ratio, amount, status)
- **Status**: Partial — stat data is mocked; needs real aggregation logic

#### Meter Groups (`/meter-groups`)
- **Component**: `src/routes/(app)/meter-groups/+page.svelte`
- **API calls**:
  - `GET /meter-groups?limit=20` ← `getMeterGroups()`
  - `POST /meter-groups` ← `createMeterGroup()` (inline form)
  - `DELETE /meter-groups/:id` ← `deleteMeterGroup()`
- **Displays**:
  - Table: meter_name, utility_type, created_at, actions
  - Inline form for creating new meter group
- **Note**: The Version column and "Reset Meter" button were removed — meter-group-level version tracking (`current_version`/`versions`, `POST /:id/reset`) is **@deprecated**; resets and version history now live per-property on `Property.meter_groups[entry]` (handles submeters + main meters)
- **Status**: ✅ Complete

#### Properties (`/properties`)
- **Component**: `src/routes/(app)/properties/+page.svelte`
- **API calls**:
  - `GET /properties?limit=100` ← `getProperties()` — left panel list
  - `GET /tenants?propertyId=X` ← `getTenants()` — breakdown table (when property selected)
  - `GET /readings?meterGroupId=X` ← `getReadings()` — readings tab (future)
  - `GET /billings?propertyId=X` ← `getBillings()` — billings tab (future)
- **Layout**: 4-column (Sidebar | Property List | Main Detail | Right Panel)
- **Displays**:
  - Left: List of properties with search
  - Main: Selected property detail with tabs (Tenants | Readings | Billings | History)
  - Right: Split calculator + flags
- **Status**: Partial — list + tenants tab only; other tabs need build-out

#### Tenants (`/tenants`)
- **Component**: `src/routes/(app)/tenants/+page.svelte`
- **API calls**:
  - `GET /tenants?limit=50` ← `getTenants()`
  - Client-side search by tenant_name or property_id
- **Displays**:
  - Search input
  - Table: tenant_name, property_id, start_date, status (current/moving-out)
  - Right panel: selected tenant summary (balance, recent payments, actions)
- **Status**: Partial — list + search working; right panel needs build-out

#### Readings (`/readings`)
- **Component**: `src/routes/(app)/readings/+page.svelte`
- **API calls**:
  - `GET /meter-groups?limit=100` ← `getMeterGroups()` — for filter dropdown + version data
  - `GET /readings?meterGroupId=X&limit=100` ← `getReadings()` — paginated list
  - `POST /readings/batch` ← `createReadingsBatch()` — batch create (no auto-billing)
  - `POST /readings/ocr` ← `ocrReadingImage()` — triggered by "Suggest" button per row
- **Displays**:
  - Meter group filter + paginated table: reading_amount, **True Total** (version-aware cumulative), photo, date, created_at
  - Batch create form: per-property rows with reading_amount input + "True total: X" hint; combined "Photo / Suggest" column (upload image → click Suggest to run OCR separately)
- **Note**: `meter_version` is server-set from the property entry's `current_version` (per-property version tracking — see the Meter Groups note above on the deprecated MeterGroup-level fields). `image_url` is optional; silently falls back to local data URL when Firebase Storage is not configured.
- **Status**: ✅ Complete

#### Billings (`/billings`) — Cycle-Centric
- **Component**: `src/routes/(app)/billings/+page.svelte`
- **API calls**:
  - `GET /billing-cycles?limit=100` ← `getBillingCycles()` — fetches all cycles
  - `GET /billings?limit=100` ← `getBillings()` — fetches all billings for cycle grouping
  - `GET /meter-groups?limit=100` ← `getMeterGroups()` — for cycle creation form dropdown
  - `POST /billing-cycles` ← `createBillingCycle()` — create cycle from discovered billings
  - `POST /billing-cycles/ocr` ← `ocrBillingCycle()` — extract billing data from a utility bill photo
  - `PATCH /billing-cycles/:id` ← `updateBillingCycle()` — edit cycle fields (rate, consumption, date range, due date)
- **Displays**:
  - Expandable cycle rows (period, consumption, rate, total amount, billing count)
  - On expand: nested billing table (property, reading pair, consumption, amount, status, actions)
  - "New Billing Cycle" form: optional bill photo upload (autofills rate + dates + consumption via OCR) → select meter group + date range → discover billings → create
  - "Manual Billing (Advanced)" collapsed section for corrections
  - Pencil "Edit" button on each cycle row → opens an `EditModal` for correcting `billing_consumption`, `billing_rate`, `billing_start_date`, `billing_end_date`, `overdue_date` (covers company errors in rate/consumption without needing to delete and recreate the cycle)
- **Note**: Billings are auto-created when readings are posted — the cycle form just groups them. OCR autofill is optional; all autofilled fields remain editable. Per-reading consumption previews (discovery, override, gap-fill) use the shared version-aware `readingConsumption()`/`trueReading()` helpers so they stay correct across meter resets.
- **Status**: ✅ Complete (cycle-centric design; auto-billing integration; bill photo OCR)

#### Archive Pages (`/<feature>/archive`)
Each core feature has an archive page for restoring soft-deleted items. All use `ArchivePageTemplate.svelte`.

| Route | Component | Restore API call |
|-------|-----------|-----------------|
| `/meter-groups/archive` | `src/routes/(app)/meter-groups/archive/+page.svelte` | `PATCH /meter-groups/:id/restore` |
| `/properties/archive` | `src/routes/(app)/properties/archive/+page.svelte` | `PATCH /properties/:id/restore` |
| `/tenants/archive` | `src/routes/(app)/tenants/archive/+page.svelte` | `PATCH /tenants/:id/restore` |
| `/readings/archive` | `src/routes/(app)/readings/archive/+page.svelte` | `PATCH /readings/:id/restore` |
| `/billings/archive` | `src/routes/(app)/billings/archive/+page.svelte` | `PATCH /billings/:id/restore` |

All archive pages: `GET /<feature>?archived=true` to list soft-deleted items, then restore via the respective `restore*` API function.

#### Settings (`/settings`)
- **Component**: `src/routes/(app)/settings/+page.svelte` — account info root
- **Sub-routes**:
  - `/settings/payment` — payment config
  - `/settings/users` — user management: `POST /users` ← `createUser()` to create accounts with role (`admin`, `landlord`, `assistant`)
  - `/settings/llm-provider` — configure the insight chatbot's LLM provider (`groq` | `ollama_cloud`), model, and API key
    - **API calls**: `GET /llm-config` ← `getLlmConfig()`, `PATCH /llm-config` ← `upsertLlmConfig()` from `src/lib/api/llm-config.ts`
- **Status**: Create-only — full create-user flow (role select, password validation, Firebase error-code mapping, partial-failure handling); no listing/edit of existing users

#### Bills / OCR Upload (`/bills`)
- **Component**: `src/routes/(app)/bills/+page.svelte`
- **API calls**:
  - `POST /bills/ocr` ← `ocrBill()` from `src/lib/api/bills.ts`
  - `GET /meter-groups?limit=100` ← `getMeterGroups()`
  - `GET /billings?limit=100` ← `getBillings()`
  - `POST /billing-cycles` ← `createBillingCycle()`
- **Displays**: 3-step wizard — (1) upload bill image, (2) review OCR results & map to billings,
  (3) review & submit, creating a billing cycle from the extracted data
- **Status**: ✅ Functional — overlaps with the billings-page "New Billing Cycle from photo" flow

#### Reports (`/reports`)
- **Component**: `src/routes/(app)/reports/+page.svelte`
- **API calls** (available, not yet wired in UI):
  - `GET /reports/summary` ← `getSummaryReport()`
  - `GET /reports/consumption` ← `getConsumptionReport()`
  - `GET /reports/billing-trends` ← `getBillingTrendsReport()`
  - `GET /reports/collection-status` ← `getCollectionStatusReport()`
- **Displays**: "Coming Soon" placeholder
- **Status**: 🚧 Stub — API module ready, UI needs build-out

---

## API Client Modules

Each module in `src/lib/api/` wraps backend endpoints and handles pagination.

### auth.ts
```ts
export async function login(email: string, password: string): Promise<AuthResponse>
export async function register(email: string, password: string): Promise<AuthResponse>
export async function refreshToken(refreshToken: string): Promise<AuthResponse>
export async function logout(refreshTokenId: string): Promise<void>
```

### meter-groups.ts
```ts
export async function getMeterGroups(params?: { meterName?, utilityType?, sortBy?, sortOrder?, limit?, cursor? }): Promise<PaginatedResult<MeterGroup>>
export async function getMeterGroupById(id: string): Promise<MeterGroup>
export async function createMeterGroup(data: CreateMeterGroupRequest): Promise<MeterGroup>
export async function updateMeterGroup(id: string, data: UpdateMeterGroupRequest): Promise<MeterGroup>
export async function softDeleteMeterGroup(id: string): Promise<MeterGroup>  // Uses DELETE /:id
export async function restoreMeterGroup(id: string): Promise<MeterGroup>    // Uses PATCH /:id/restore
// + batch methods
```

**Note**: `softDeleteMeterGroup()` now uses `apiDelete()` (DELETE method) instead of `apiPatch()`. Hard delete endpoints removed.

(Same pattern for properties, tenants, readings, billings, billing-cycles)

### bills.ts
```ts
export async function ocrBill(imageUrl: string): Promise<OcrBillResponse>
// OcrBillResponse: { billing_start_date, billing_end_date, billing_consumption, billing_rate, raw_amount }
```

### users.ts
```ts
export async function createUser(data: { uid: string; role: 'admin' | 'landlord' | 'assistant' }): Promise<void>
```

### reports.ts
```ts
export async function getSummaryReport(params?: ReportQueryParams): Promise<ReportSummary>
export async function getConsumptionReport(params?: ReportQueryParams): Promise<ConsumptionReport>
export async function getBillingTrendsReport(params?: ReportQueryParams): Promise<BillingTrendsReport>
export async function getCollectionStatusReport(params?: ReportQueryParams): Promise<CollectionStatusReport>
// ReportQueryParams: { startDate?, endDate?, meterGroupId?, propertyId? }
```

### llm-config.ts
```ts
export async function getLlmConfig(): Promise<LlmConfigResponse>
export async function upsertLlmConfig(data: UpsertLlmConfigRequest): Promise<LlmConfigResponse>
// Types in src/lib/types/llm-config.types.ts
```

### chat.ts
```ts
export async function sendChatMessage(message: string, history?: ChatHistoryMessage[]): Promise<ChatResponse>
// POST /chatbot — used by ChatWidget.svelte
```

### cache.ts
```ts
export async function clearAllCaches(): Promise<void>
// Clears all 6 feature caches in parallel: properties, meter-groups, tenants, readings, billings, billing-cycles
```

---

## API Client & Token Management

### client.ts (Core HTTP Client)
Located: `src/lib/api/client.ts`

**Features**:
- **Base URL**: http://localhost:5002 (configurable)
- **Token management**: gets the Firebase ID token via `firebaseUser.getIdToken()`
- **Refresh interceptor**: On 401, force-refreshes the ID token (`getIdToken(true)`) and retries
  the request once
- **Headers**: Automatically adds `Authorization: Bearer <token>` to all requests
- **Error handling**: Custom ApiError thrown with status + message + details

**Usage**:
```ts
import { apiGet, apiPost, apiDelete } from '$lib/api/client';

// In any API module:
const data = await apiGet<MyType>('/my-endpoint');
const created = await apiPost<MyType>('/my-endpoint', { foo: 'bar' });
```

### auth.svelte.ts (Auth State)
Located: `src/lib/stores/auth.svelte.ts`

**State**: `{ isAuthenticated, user: AuthUser | null, isLoading, error }`  
**Methods**: `setLoading()`, `setError()`, `setUser()`, `login(AuthUser)`, `logout()`, `clearError()`

### crud.svelte.ts (Generic CRUD Store Factory)
Located: `src/lib/stores/crud.svelte.ts`

Provides a reusable store returned by `createCrudStore<T>()`. Used by pages that need selection, delete, and edit modal state.

```ts
interface CrudStore<T> {
  // Selection
  selectedIds: Set<string>;
  toggleSelection(id: string): void;
  toggleSelectAll(allIds: string[], visibleIds: string[]): void;
  clearSelection(): void;
  // Soft-delete
  isDeleting: boolean;
  deletingId: string | null;
  handleSoftDelete(id, deleteFn, reload, confirmFn?): Promise<void>;
  // Batch delete
  isBatchDeleting: boolean;
  handleBatchDelete(deleteFn, reload, confirmFn?): Promise<void>;
  // Edit modal
  editModalOpen: boolean;
  editingItem: T | null;
  editFormData: Partial<T>;
  openEditModal(item: T, formData: Partial<T>): void;
  closeEditModal(): void;
  // Error
  error: string;
  clearError(): void;
}
```

**Usage**: `const crud = createCrudStore<MeterGroup>()`

### meter-groups.svelte.ts / properties.svelte.ts / tenants.svelte.ts
Feature-specific list stores that wrap data fetching and compose `createCrudStore<T>()` for their entity type.

---

## Shared Components

### StatusPill
Colored status badge component.

**Props**: `status: 'paid' | 'unpaid' | 'overdue' | 'pending' | 'current' | 'moving-out'`

**Colors**:
- `paid`: green (#e8f4ea bg, #2c6b3a text)
- `unpaid`: brown (#fff3e8 bg, #8b5a3c text)
- `overdue`: red (#fde5e0 bg, #a23b21 text)
- `pending`: gray (#f0eee9 bg, #5b524a text)

**Usage**:
```svelte
<StatusPill status="paid" />
<StatusPill status="overdue" />
```

### StatCard
Metric card for dashboard.

**Props**: 
- `label: string` — e.g., "This Month Billed"
- `value: string | number` — e.g., "₱48,210"
- `sub?: string` — e.g., "MERALCO + MWSS"
- `accent?: boolean` — highlight with accent color

**Usage**:
```svelte
<StatCard label="Outstanding" value="₱16,810" sub="5 tenants" accent />
```

### EmptyState
Placeholder when no data.

**Props**:
- `title?: string` — default "Nothing here"
- `message?: string` — default "No data to display"

**Usage**:
```svelte
{#if data.length === 0}
  <EmptyState title="No readings" message="Create readings to get started" />
{/if}
```

### ToBeFinished
Stub placeholder for incomplete features.

**Props**:
- `title?: string` — default "Coming Soon"
- `message?: string` — default "This feature is still being built"

**Usage**:
```svelte
<ToBeFinished title="OCR Upload" message="Automatically extract meter readings from photos" />
```

### ActionButtons
Standardized row action buttons: edit (pencil), archive/soft-delete (trash), restore. Accepts handlers as props to decouple display from logic.

### ArchivePageTemplate
Reusable page layout for all `/<feature>/archive` routes. Handles the list + restore + empty state in a consistent pattern.

### EditModal
Generic modal wrapper. Accepts an `open` binding, `title`, and a default slot for form content. Provides Save/Cancel buttons.

**Props**: `open: boolean`, `title: string`, `onSave: () => void`, `onClose: () => void`

### ImagePreview
Inline image preview widget used in readings and billings forms. Shows a thumbnail with a clickable zoom overlay.

**Props**: `src: string`, `alt?: string`

### SelectionToolbar
Multi-select batch action toolbar. Slides in when `selectedIds.size > 0`. Shows count + "Archive selected" button.

**Props**: `count: number`, `onBatchDelete: () => void`, `isDeleting: boolean`

### ChatWidget
Floating insight-chatbot widget mounted globally in `(app)/+layout.svelte` (available on every protected route, not a route-scoped component). Sends messages + rolling history via `sendChatMessage()` from `src/lib/api/chat.ts` to `POST /chatbot`.

---

## Layout Components

### Sidebar
Persistent left navigation (200px wide).

**Features**:
- Logo "utilitool"
- Nav links (Home, Properties, Tenants, Billings, Readings, Billing Cycles, Reports)
- Badge counts (e.g., "Properties 4")
- User card (avatar + name + email)

**Active state**: Dark background, white text

### TopBar
Fixed top bar (52px tall).

**Features**:
- Breadcrumbs (dynamic from route)
- Page actions slot (right-aligned buttons)

**Layout**: Fixed at top, margin-left: 200px (offset sidebar)

### RightPanel
Fixed right detail panel (280px wide).

**Features**:
- Selection-driven (shows when something is selected)
- Slides in/out via margin-right animation
- Content via slot

**Layout**: Fixed on right, top: 52px (below top bar)

---

## Utilities & Helpers

### format.ts
```ts
formatCurrency(amount: number): string          // ₱ formatting
getReadingUnit(utilityType: string): string     // unit label by utility type
formatReading(amount: number, utilityType: string): string  // reading value + unit
formatKwh(kwh: number): string                  // kWh with comma separator
formatDate(date: Date): string                  // "May 16, 2026"
formatLongDate(date: Date): string              // long-form date string
formatDateTime(date: Date): string              // "May 16, 2026 · 2:30 PM"
formatMonthYear(date: Date): string             // "May 2026"
parseDate(dateString: string): Date             // string → Date
formatPercentage(value: number): string         // "65%"
relativeTime(date: Date): string                // "2h ago", "yesterday", etc.
getInitials(name: string): string               // "RC" from "Rico Campos"
```

### timestamp.ts
```ts
toDate(timestamp: FirestoreTimestamp | string): Date
toTimestamp(date: Date): FirestoreTimestamp
toISOString(timestamp): string
fromISOString(iso: string): FirestoreTimestamp
```

**Why**: Firestore stores timestamps as `{ _seconds, _nanoseconds }`. These helpers convert to/from JS Date for UI display.

---

## Route Guards & Auth

### (app)/+layout.ts
Located: `src/routes/(app)/+layout.ts`

```ts
export function load() {
  const token = getAccessToken();
  if (!token) {
    redirect(307, '/login');
  }
}
```

Protects all routes under `(app)/` — redirects to login if not authenticated.

### (auth)/+layout.svelte
Centered card layout for login/register.

### (app)/+layout.svelte
3-column shell: Sidebar | Main | RightPanel

---

## Adding a New Page

### 1. Create the Route File
**File**: `src/routes/(app)/<name>/+page.svelte`

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { getMyFeatures } from '$lib/api/my-feature';
  import type { MyFeature } from '$lib/types/my-feature.types';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import { formatDate } from '$lib/utils/format';
  import { toDate } from '$lib/utils/timestamp';

  let data = $state<MyFeature[]>([]);
  let isLoading = $state(false);
  let error = $state('');

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    isLoading = true;
    error = '';
    try {
      const result = await getMyFeatures({ limit: 50 });
      data = result.data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load';
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="space-y-6">
  <h1 class="text-3xl font-bold">My Features</h1>
  
  {#if error}
    <div class="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>
  {/if}

  {#if data.length === 0}
    <EmptyState title="No features" message="Create your first feature" />
  {:else}
    <table class="w-full text-sm">
      <!-- Render data here -->
    </table>
  {/if}
</div>
```

### 2. Create the API Module
**File**: `src/lib/api/my-feature.ts`

```ts
import { apiGet, apiPost } from './client';
import type { MyFeature, CreateMyFeatureRequest } from '$lib/types/my-feature.types';
import type { PaginatedResult } from '$lib/types/api.types';

export async function getMyFeatures(params?: { limit?: number; cursor?: string }): Promise<PaginatedResult<MyFeature>> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.cursor) query.set('cursor', params.cursor);
  
  const path = query.toString() ? `/my-features?${query}` : '/my-features';
  return apiGet<PaginatedResult<MyFeature>>(path);
}

export async function getMyFeatureById(id: string): Promise<MyFeature> {
  return apiGet<MyFeature>(`/my-features/${id}`);
}

export async function createMyFeature(data: CreateMyFeatureRequest): Promise<MyFeature> {
  return apiPost<MyFeature>('/my-features', data);
}

// ... other CRUD methods
```

### 3. Create Type Definitions
**File**: `src/lib/types/my-feature.types.ts`

```ts
import type { BaseModel } from './api.types';

export interface MyFeature extends BaseModel {
  name: string;
  description?: string;
  status: 'active' | 'inactive';
}

export interface CreateMyFeatureRequest {
  name: string;
  description?: string;
  status?: 'active' | 'inactive';
}

export interface UpdateMyFeatureRequest {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive';
}
```

### 4. Add to Navigation
Edit `src/lib/components/layout/Sidebar.svelte` and add the link:

```svelte
{ label: 'My Feature', href: '/my-feature' }
```

---

## Svelte 5 Runes Reference

### $state
Reactive variable.

```ts
let count = $state(0);
// count is now reactive; change it and UI updates
```

### $derived
Computed value — updates when dependencies change.

```ts
const doubled = $derived(count * 2);
```

### $effect
Side effect — runs when dependencies change.

```ts
$effect(() => {
  console.log('Count changed:', count);
});
```

### $props
Component props using runes.

```ts
interface Props {
  title: string;
  count?: number;
}

const { title, count = 0 } = $props();
```

---

## Commands

Run from `ui/`:

```bash
npm run dev              # Start dev server (port 5173)
npm run check           # TypeScript check
npm run lint            # ESLint + Prettier check
npm run format          # Format code
npm run test:unit       # Vitest (Node mode)
npm run test:e2e        # Playwright E2E
npm run build           # Build for production
```

---

## Design Tokens & Colors

Defined in `src/routes/layout.css`:

```css
--color-ink: #2a251f;           (Primary text)
--color-accent: #8b5a3c;        (Brand brown — buttons, links)
--color-status-paid-bg: #e8f4ea;    (Green background for paid)
--color-status-paid-fg: #2c6b3a;    (Green text for paid)
--color-status-unpaid-bg: #fff3e8;  (Brown background for unpaid)
--color-status-unpaid-fg: #8b5a3c;  (Brown text for unpaid)
--color-status-overdue-bg: #fde5e0; (Red background for overdue)
--color-status-overdue-fg: #a23b21; (Red text for overdue)
--color-status-pending-bg: #f0eee9; (Gray background for pending)
--color-status-pending-fg: #5b524a; (Gray text for pending)
```

---

## Common Patterns

### Paginated List with Cursor
```ts
let data = $state<PaginatedResult<T>>({ data: [], nextCursor: null, hasMore: false });
let cursor = $state<string | null>(null);

async function loadMore() {
  const result = await getItems({ cursor, limit: 50 });
  data.data = [...data.data, ...result.data];
  data.nextCursor = result.nextCursor;
  data.hasMore = result.hasMore;
  cursor = result.nextCursor;
}
```

### Form with Error Handling
```svelte
<script>
  let formData = $state({ name: '', email: '' });
  let isLoading = $state(false);
  let error = $state('');

  async function handleSubmit(e) {
    e.preventDefault();
    isLoading = true;
    error = '';
    try {
      await createItem(formData);
      formData = { name: '', email: '' };
      // Success message or redirect
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed';
    } finally {
      isLoading = false;
    }
  }
</script>

<form onsubmit={handleSubmit}>
  <!-- inputs -->
  <button disabled={isLoading}>
    {isLoading ? 'Saving...' : 'Save'}
  </button>
</form>

{#if error}
  <div class="error">{error}</div>
{/if}
```

---

## Back to Root Docs
See `../CLAUDE.md` for project-level navigation.
See `api/functions/CLAUDE.md` for backend architecture and API specs.
