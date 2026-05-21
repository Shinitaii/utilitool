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
POST /auth/login via client.ts
  ↓
Receive access_token + refresh_token
  ↓
Store in localStorage + authStore
  ↓
Attach access_token to all subsequent requests
  ↓
On 401: auto-refresh token (interceptor in client.ts)
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
│   │   ├── login/+page.svelte
│   │   └── register/+page.svelte
│   └── (app)/                      (Protected app layout group — sidebar + main + right panel)
│       ├── +layout.ts              (Auth guard — redirects to /login if no token)
│       ├── +layout.svelte          (3-column shell: Sidebar | Main | RightPanel)
│       ├── dashboard/+page.svelte  (Stat cards + properties table)
│       ├── meter-groups/+page.svelte
│       ├── properties/+page.svelte
│       ├── tenants/+page.svelte
│       ├── readings/+page.svelte
│       ├── billings/+page.svelte
│       ├── billing-cycles/+page.svelte
│       ├── bills/+page.svelte      (OCR upload stub)
│       └── reports/+page.svelte    (Reports stub)
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
│   │   └── billing-cycles.ts
│   │
│   ├── types/                       (TypeScript types — mirror API models)
│   │   ├── api.types.ts            (Shared: PaginatedResult, BaseModel, FirestoreTimestamp)
│   │   ├── auth.types.ts
│   │   ├── meter-group.types.ts
│   │   ├── property.types.ts
│   │   ├── tenant.types.ts
│   │   ├── reading.types.ts
│   │   ├── billing.types.ts
│   │   └── billing-cycle.types.ts
│   │
│   ├── stores/                      (Svelte writable stores)
│   │   └── auth.svelte.ts          (isAuthenticated, user, isLoading, error)
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
│           ├── StatusPill.svelte   (Colored status badges)
│           ├── StatCard.svelte     (Metric card with value + sub)
│           ├── EmptyState.svelte   (No data placeholder)
│           └── ToBeFinished.svelte (Stub placeholder with build hammer icon)
│
└── routes/layout.css               (Global CSS: @import 'tailwindcss' + theme colors)
```

---

## Page-to-API Mapping

### Authentication Pages

#### Login (`/login`)
- **Component**: `src/routes/(auth)/login/+page.svelte`
- **API calls**:
  - `POST /auth/login` ← `login()` from `src/lib/api/auth.ts`
  - Stores tokens in localStorage + authStore
- **On success**: Redirect to `/dashboard`
- **On error**: Display error message, enable retry

#### Register (`/register`)
- **Component**: `src/routes/(auth)/register/+page.svelte`
- **API calls**:
  - `POST /auth/register` ← `register()` from `src/lib/api/auth.ts`
  - Same token handling as login
- **Validation**: Password confirmation + min 8 chars (client-side)

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
  - `POST /meter-groups/:id/reset` ← `recordMeterGroupReset()` (Reset Meter button)
  - `DELETE /meter-groups/:id` ← `deleteMeterGroup()`
- **Displays**:
  - Table: meter_name, utility_type, version (`v{current_version}`), created_at, actions
  - "Reset Meter" button (orange): confirmation dialog → records reset, bumps version
  - Inline form for creating new meter group
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
- **Note**: `meter_version` is server-set from the meter group's `current_version`. To handle a physical meter replacement, record a reset on the Meter Groups page first. `image_url` is optional; silently falls back to local data URL when Firebase Storage is not configured.
- **Status**: ✅ Complete

#### Billings (`/billings`) — Cycle-Centric
- **Component**: `src/routes/(app)/billings/+page.svelte`
- **API calls**:
  - `GET /billing-cycles?limit=100` ← `getBillingCycles()` — fetches all cycles
  - `GET /billings?limit=100` ← `getBillings()` — fetches all billings for cycle grouping
  - `GET /meter-groups?limit=100` ← `getMeterGroups()` — for cycle creation form dropdown
  - `POST /billing-cycles` ← `createBillingCycle()` — create cycle from discovered billings
  - `POST /billing-cycles/ocr` ← `ocrBillingCycle()` — extract billing data from a utility bill photo
- **Displays**:
  - Expandable cycle rows (period, consumption, rate, total amount, billing count)
  - On expand: nested billing table (property, reading pair, consumption, amount, status, actions)
  - "New Billing Cycle" form: optional bill photo upload (autofills rate + dates + consumption via OCR) → select meter group + date range → discover billings → create
  - "Manual Billing (Advanced)" collapsed section for corrections
- **Note**: Billings are auto-created when readings are posted — the cycle form just groups them. OCR autofill is optional; all autofilled fields remain editable.
- **Status**: ✅ Complete (cycle-centric design; auto-billing integration; bill photo OCR)

#### Bills / OCR Upload (`/bills`)
- **Component**: `src/routes/(app)/bills/+page.svelte`
- **API calls**: None (stub)
- **Displays**: "Coming Soon" placeholder with build hammer icon
- **Status**: 🚧 Stub — waiting for OCR endpoint in API

#### Reports (`/reports`)
- **Component**: `src/routes/(app)/reports/+page.svelte`
- **API calls**: None (stub)
- **Displays**: "Coming Soon" placeholder
- **Status**: 🚧 Stub — waiting for analytics design

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

---

## API Client & Token Management

### client.ts (Core HTTP Client)
Located: `src/lib/api/client.ts`

**Features**:
- **Base URL**: http://localhost:5002 (configurable)
- **Token management**: getAccessToken(), setTokens(), clearTokens()
- **Refresh interceptor**: On 401, auto-call `POST /auth/refresh` and retry request once
- **Headers**: Automatically adds `Authorization: Bearer <token>` to all requests
- **Error handling**: Custom ApiError thrown with status + message + details

**Usage**:
```ts
import { apiGet, apiPost, apiDelete } from '$lib/api/client';

// In any API module:
const data = await apiGet<MyType>('/my-endpoint');
const created = await apiPost<MyType>('/my-endpoint', { foo: 'bar' });
```

### authStore.svelte.ts (State Management)
Located: `src/lib/stores/auth.svelte.ts`

**Type**: Svelte writable store

**State**:
```ts
interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;        // { userId, email }
  isLoading: boolean;
  error: string | null;
}
```

**Methods**:
- `setLoading(boolean)`
- `setError(string | null)`
- `setUser(AuthUser | null)`
- `login(AuthUser)` — set isAuthenticated to true
- `logout()` — clear state
- `clearError()`

**Usage in components**:
```svelte
<script>
  import { authStore } from '$lib/stores/auth.svelte';
  
  const auth = $state(authStore);  // Subscribe to store
</script>

{#if auth.state.isAuthenticated}
  <p>Welcome, {auth.state.user?.email}</p>
{/if}
```

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
formatKwh(kwh: number): string                  // kWh with comma separator
formatDate(date: Date): string                  // "May 16, 2026"
formatDateTime(date: Date): string              // "May 16, 2026 · 2:30 PM"
formatMonthYear(date: Date): string             // "May 2026"
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
