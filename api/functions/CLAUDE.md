# API Backend — Claude Code Guide

This document covers the Utilitool backend architecture, API structure, and how to find/modify features.

---

## Quick Links

- **Understand the API**: See "API Endpoints by Feature" section below
- **Adding a new feature**: See "Adding a New Feature" section
- **Confused about a file?**: Jump to "File & Folder Map by Feature"
- **Back to global docs**: See `../CLAUDE.md` (root)

---

## Architecture Overview

### Request Flow
```
Request
  ↓
pino-http logger (request logging)
  ↓
express.json() (body parsing)
  ↓
Feature router (mounted in src/index.ts)
  ↓
Validation middleware (Zod schema)
  ↓
Controller (handles request, delegates to service)
  ↓
Service (business logic, throws AppError)
  ↓
Repository (Firestore CRUD via generic Repository<T> class)
  ↓
Response (controller returns JSON or error handler catches it)
```

### Technology
- **Runtime**: Firebase Cloud Functions (Node 24)
- **Web Framework**: Express
- **Validation**: Zod v4
- **Database**: Firestore (NoSQL)
- **Auth**: Firebase Auth (ID tokens issued by Firebase, verified via `admin.auth().verifyIdToken()`)
- **Logging**: Pino
- **API Docs**: Swagger UI + OpenAPI 3.0

---

## Recent Improvements (Audit — May 2026)

This section documents key improvements made during the comprehensive codebase audit.

### Soft-Delete Pattern (D1)
- All deletion endpoints now use `DELETE /:id` for soft deletion (sets `is_deleted` flag)
- Removed hard delete endpoints entirely — only soft delete is available
- No destructive operations on production data
- `PATCH /:id/restore` to restore deleted resources

### Timestamp Serialization (D2)
- JSON responses now convert Firestore Timestamps to ISO 8601 strings
- Prevents internal Firestore object structure leakage in API responses
- Client-side: strings are automatically converted back to Date objects by timestamp utilities

### Composite Firestore Indices (D3)
- Indices created for efficient soft-delete + filter queries
- Examples: `(is_deleted, created_at)`, `(is_deleted, property_id, created_at)`
- Improves performance on archived/filtered list queries

### Meter Rollback Prevention (D4)
- New utility function: `validateMeterRollback()` in `src/features/reading/reading.util.ts`
- Prevents meter reading regression (current reading ≥ previous reading when versions match)
- Exception: rollback check skipped when reading crosses meter reset boundary
- Applied to: readings and billings services

### Dynamic List Sorting (D5)
- All list endpoints support `sortBy` and `sortOrder` query parameters
- Per-entity field enums:
  - **meter-groups**: `[created_at, meter_name]`
  - **properties**: `[created_at, room_name]`
  - **tenants**: `[created_at, tenant_name]`
  - **readings**: pagination only (no sorting yet)
  - **billings**: `[created_at, payment_status]`
  - **billing-cycles**: `[created_at, billing_start_date]`

### Error Handling & Observability (E1–E3)
- **Request logging**: Structured middleware logs method, path, userId, duration, status
- **Error context**: Service errors logged with request context for debugging
- **Query logging**: Repository operations logged with collection, filters, indices

### Code Quality (C1–C3)
- **Shared utilities**: Extracted `reading.util.ts` with 3 reusable helpers
- **Type safety**: Added `SummaryMeterGroup` type (omits large `versions` field) for list responses
- **Query optimization**: Property duplicate check now filters by `room_name` (indexed) instead of scanning all 1000 docs

### API Design Standards (H1–H4)
- **Pagination**: Cursor-based pagination on all list endpoints (`data[]`, `hasMore`, `nextCursor`)
- **Batch operations**: Consistent `POST /batch` (create) and `PATCH /batch` (update) endpoints
- **204 No Content**: No longer used; soft delete returns 200 with resource
- **Archive/Restore**: Symmetric `DELETE /:id` (soft delete) and `PATCH /:id/restore` (restore)

---

## Feature Layer Pattern

Every API feature lives in `src/features/<name>/` and follows this 9-layer structure:

```
<name>/
├── <name>.model.ts           → TypeScript interface (extends BaseModel)
├── <name>.dto.ts             → Zod validation schemas (request/response shapes)
├── <name>.repository.ts      → Firestore CRUD (usually: new Repository<T>(collectionName))
├── <name>.service.ts         → Business logic & validation (throws AppError here)
├── <name>.controller.ts      → HTTP handlers (thin, no try/catch)
├── <name>.route.ts           → Express routes (validateRequest() + mounted in src/index.ts)
├── <name>.swagger.ts         → OpenAPI documentation (Swagger UI + /docs/swagger.json)
├── <name>.validator.ts       → Zod validator instances (present in most features)
└── <name>.test.ts            → Jest integration tests (pseudo-TDD spec comments)
```

**Optional additional files** (present on some features):
- `<name>.validator.test.ts` — Unit tests for validator logic (billing, billing-cycle, meter-group, reading)
- `<name>.service.test.ts` — Unit tests for service business logic (meter-group, reading)
- `<name>.util.ts` — Feature-level shared helpers (reading: `validateMeterRollback`, `calculateTrueReading`, `computeCumulativeOffset`)

**Reference implementation**: `src/features/meter-group/` — use this as a template for all new features.

---

## API Endpoints by Feature

### Authentication (`/auth` — public, no auth required)

Located: `src/features/auth/`

**Auth model**: Firebase Authentication. The frontend signs in with `signInWithEmailAndPassword()` via the Firebase SDK. The Firebase ID token is then sent as `Authorization: Bearer <token>` on all API requests. The API verifies tokens with `admin.auth().verifyIdToken()`.

There are NO custom login/register/logout endpoints. Those flows happen entirely in the Firebase SDK on the client.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auth/me` | Get current user profile (Firestore `users` document) |
| PATCH | `/auth/me` | Update user profile (display_name, qr_payment_url) |

The `users` collection document is created automatically on first `GET /auth/me` if it doesn't exist.

**Roles**: `admin`, `landlord` (default for new users), `assistant`. The `requireRole` middleware in `src/middlewares/require-role.middleware.ts` enforces roles on sensitive routes.

---

### Meter Groups (`/meter-groups` — protected)

Located: `src/features/meter-group/`

Represents utility type containers (electricity, water).

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/meter-groups` | Create meter group |
| POST | `/meter-groups/batch` | Batch create (1–10 items) |
| GET | `/meter-groups` | List with filters (meterName, utilityType, **minimal=true** for dropdowns) + sorting (sortBy=[created_at,meter_name], sortOrder=[asc,desc]) + pagination |
| GET | `/meter-groups/:id` | Get single meter group |
| PATCH | `/meter-groups/:id` | Update meter group |
| PATCH | `/meter-groups/batch` | Batch update (1–10 items) |
| POST | `/meter-groups/:id/reset` | Record a physical meter reset (bumps version, snapshots last reading) |
| DELETE | `/meter-groups/:id` | Soft delete (set is_deleted flag) |
| PATCH | `/meter-groups/:id/restore` | Restore deleted meter group (clear is_deleted flag) |

**Business rules**:
- Unique meter_name per utility_type
- utility_type must be "electricity" or "water"
- Soft delete sets `deleted_at` timestamp
- `current_version` starts at 1 and increments on each reset; `versions` Record stores `{ reset_at, last_reading }` per version
- Reset requires at least one existing reading; uses the latest non-deleted reading as the closing value
- Requires `admin` or `landlord` role
- **Cascade delete**: `DELETE /:id` soft-deletes the meter group + all readings for this meter group + all billings referencing those readings (atomic transaction)
- **Cascade restore**: `PATCH /:id/restore` restores the meter group + all its soft-deleted readings + billings (atomic transaction)

**Swagger**: http://localhost:5002/docs → look for `/meter-groups` paths

---

### Properties (`/properties` — protected)

Located: `src/features/property/`

Represents buildings/units that consume utilities.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/properties` | Create property |
| POST | `/properties/batch` | Batch create |
| GET | `/properties` | List with filters (roomName, meterGroupId) + sorting (sortBy=[created_at,room_name], sortOrder=[asc,desc]) + pagination |
| GET | `/properties/:id` | Get single property |
| PATCH | `/properties/:id` | Update property |
| PATCH | `/properties/batch` | Batch update |
| DELETE | `/properties/:id` | Soft delete (set is_deleted flag) |
| PATCH | `/properties/:id/restore` | Restore property (clear is_deleted flag) |

**Business rules**:
- Must reference valid meter_group_id(s) via the `meter_groups` map
- tenant_amount must be ≥ 1
- Enforces max-tenant-count per property
- **Cascade delete**: `DELETE /:id` soft-deletes the property + all readings for this property + all billings for this property (atomic transaction)
- **Cascade restore**: `PATCH /:id/restore` restores the property + all its soft-deleted readings + billings (atomic transaction)

---

### Tenants (`/tenants` — protected)

Located: `src/features/tenant/`

Represents individual renters/occupants.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/tenants` | Create tenant |
| POST | `/tenants/batch` | Batch create |
| GET | `/tenants` | List with filters (tenantName, propertyId) + sorting (sortBy=[created_at,tenant_name], sortOrder=[asc,desc]) + pagination |
| GET | `/tenants/:id` | Get single tenant |
| PATCH | `/tenants/:id` | Update tenant |
| PATCH | `/tenants/batch` | Batch update |
| DELETE | `/tenants/:id` | Soft delete (set is_deleted flag) |
| PATCH | `/tenants/:id/restore` | Restore tenant (clear is_deleted flag) |

**Business rules**:
- Unique tenant_name per property
- Must reference valid property_id
- tenant_start_date and tenant_end_date track occupancy

---

### Readings (`/readings` — protected)

Located: `src/features/reading/`

Represents snapshots of meter consumption. **Single create has a critical side effect: it auto-creates billings atomically.**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/readings` | Create reading + auto-create billings (see below) |
| POST | `/readings/batch` | Batch create (no auto-billing) |
| GET | `/readings` | List with filters (meterGroupId) + pagination |
| GET | `/readings/:id` | Get single reading |
| PATCH | `/readings/:id` | Update reading |
| PATCH | `/readings/batch` | Batch update |
| DELETE | `/readings/:id` | Soft delete (set is_deleted flag) |
| PATCH | `/readings/:id/restore` | Restore reading (clear is_deleted flag) |

**Business rules**:
- Must reference valid meter_group_id
- reading_amount must be non-negative
- reading_date cannot be in the future
- No duplicate readings per meter group per month (enforced at write time)
- `image_url` is optional
- `meter_version` is server-set from the meter group's `current_version` at creation time (not provided by client)
- Anomaly guard: if the reading delta exceeds 5× the rolling average for that meter group, returns 422 with a descriptive message — record a meter group reset first if the meter was physically replaced
- **Cascade delete**: `DELETE /:id` soft-deletes the reading + all billings that reference it (as previous or current reading) (atomic transaction)
- **Cascade restore**: `PATCH /:id/restore` restores the reading + all its soft-deleted billings (atomic transaction)

**Auto-Billing Behavior** (`POST /readings` only — batch skips this):
1. System looks for the most recent reading for the same `meter_group_id` in the previous calendar month (Asia/Manila timezone)
2. If none found → saves reading only (first-time scenario, no billing created)
3. If found → queries all non-deleted properties whose `meter_groups` map contains this `meter_group_id`
4. Opens a Firestore transaction: writes the new reading + one `Billing` per property (property_id, prev_reading_id, curr_reading_id, payment_status=pending)
5. All-or-nothing: if any write fails, the entire transaction rolls back

**See also**: `decisions/20260520_reading-auto-creates-billing.md` for design rationale and all edge cases.

**Timestamp handling**: reading_date is a Firestore Timestamp. UI sends ISO strings; validator accepts both.

---

### Billings (`/billings` — protected)

Located: `src/features/billing/`

Represents individual bill records linking a property to a reading pair. **Billings are normally auto-created by `POST /readings`. Manual creation is an escape hatch for corrections.**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/billings` | Create billing (manual — use for corrections only) |
| POST | `/billings/batch` | Batch create (manual) |
| GET | `/billings` | List with filters (propertyId) + sorting (sortBy=[created_at,payment_status], sortOrder=[asc,desc]) + pagination |
| GET | `/billings/:id` | Get single billing |
| PATCH | `/billings/:id` | Update billing |
| PATCH | `/billings/batch` | Batch update |
| DELETE | `/billings/:id` | Soft delete (set is_deleted flag) |
| PATCH | `/billings/:id/restore` | Restore billing (clear is_deleted flag) |

**Business rules**:
- Must reference valid property_id, previous_reading_id, current_reading_id
- current_reading_amount must be > previous_reading_amount (meter rollback not allowed)
- Exception: rollback check is skipped when `curr_reading.meter_version > prev_reading.meter_version` (cross-version pair from a meter reset)
- All readings must belong to the same meter group
- **No cascade delete**: `DELETE /:id` soft-deletes only the billing (leaf entity, no child entities). Related readings and cycles remain intact

**Internal method** (not an HTTP endpoint):
- `billingService.createFromReadings(txn, propertyId, prevReadingId, currReadingId, prevReading, currReading)` — called by the reading service inside its Firestore transaction to write billings without redundant validation

---

### Billing Cycles (`/billing-cycles` — protected)

Located: `src/features/billing-cycle/`

Represents billing periods with validation and rate calculation.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/billing-cycles` | Create billing cycle + validate |
| POST | `/billing-cycles/batch` | Batch create |
| POST | `/billing-cycles/ocr` | Extract billing data from utility bill photo (Gemini vision) |
| GET | `/billing-cycles` | List with filters (billingStartDate, billingEndDate) + sorting (sortBy=[created_at,billing_start_date], sortOrder=[asc,desc]) + pagination |
| GET | `/billing-cycles/:id` | Get single cycle |
| PATCH | `/billing-cycles/:id` | Update cycle |
| PATCH | `/billing-cycles/batch` | Batch update |
| DELETE | `/billing-cycles/:id` | Soft delete (set is_deleted flag) |
| PATCH | `/billing-cycles/:id/restore` | Restore cycle (clear is_deleted flag) |

**Business rules**:
- billing_ids: Record<billingId, consumptionAmount> — all IDs must exist + be valid
- billing_start_date < billing_end_date
- billing_rate must be non-negative
- billing_consumption must be non-negative

**Validation flow**:
1. Validate all billing IDs exist
2. For each billing, fetch its readings and calculate expected consumption using version-aware true readings:
   - `true_reading = cumulative_offset(meter_version) + reading_amount`
   - `cumulative_offset(v)` = sum of `last_reading` from versions 1..(v-1) on the meter group
   - `expectedConsumption = true_reading(curr) − true_reading(prev)` — handles N meter resets correctly
3. Reject if any billing's provided consumption deviates >5% from expected (per-billing tolerance)
4. Sum all provided consumptions and compare to `billing_consumption` (3% cycle-level tolerance)
5. Reject if cycle-level total is outside ±3% of `billing_consumption`

**OCR endpoint** (`POST /billing-cycles/ocr`):
- Accepts `{ image_url: string }` (data URL or HTTPS URL of a utility bill photo)
- Returns `{ billing_start_date, billing_end_date, billing_consumption, billing_rate, raw_amount }`
- Returns 422 if Gemini cannot extract the data or any numeric field is invalid
- Requires `admin` or `landlord` role

---

### Image Extraction (`/image-extraction` — protected)

Located: `src/features/image-extraction/`

Provides Gemini Vision OCR extraction for two use cases: reading meter photos and utility bill photos.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/image-extraction/readings` | OCR meter photo → `{ reading_amount, reading_date, image_url }` |
| POST | `/image-extraction/billings` | OCR utility bill photo → `{ billing_start_date, billing_end_date, billing_consumption, billing_rate, raw_amount }` |

**Business rules**:
- Accepts `{ image_url: string }` — data URL or HTTPS URL
- Returns 400 if extraction fails or image URL is invalid
- Backed by `src/lib/gemini.lib.ts` (Google Gemini Vision API)
- Requires authentication (BearerAuth)

---

### Reports (`/reports` — protected)

Located: `src/features/reports/`

Read-only analytics endpoints for billing summaries and trends. Accepts optional date range + meter group / property filters.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/reports/summary` | Key billing metrics: total revenue, collection rate, payment status breakdown |
| GET | `/reports/consumption` | Consumption breakdown by month and by property |
| GET | `/reports/billing-trends` | Billing amounts (billed, collected, pending, overdue) grouped by month |
| GET | `/reports/collection-status` | Billing counts and amounts grouped by payment status |

**Query params** (all optional, all endpoints):
- `startDate` / `endDate` — ISO 8601 filter on billing cycle dates
- `meterGroupId` — filter by specific meter group
- `propertyId` — filter by specific property

---

### Stub & Incomplete Features

The following feature folders exist but are **not fully implemented**:

| Folder | Status | Notes |
|--------|--------|-------|
| `bills/` | ⚠️ Partial | `POST /bills/ocr` — OCR via Gemini; no model/service/repository. Functionally overlaps with `image-extraction/billings` |
| `user/` | ⚠️ Partial | `POST /users` — create user record; no model/service/repository. Auth covered by `auth/` |
| `audit/` | ❌ Stub | `audit.model.ts` only — not mounted |
| `model/` | ❌ Empty | Placeholder folder — unused |
| `ocr/` | ❌ Empty | Placeholder folder — functionality moved to `image-extraction/` |
| `payment/` | ❌ Empty | Placeholder folder — not yet implemented |

---

## HTTP Method Semantics

**DELETE = Soft Delete with Cascading (not hard removal)**

| Operation | Method | Path | Why |
|-----------|--------|------|-----|
| Update | PATCH | `/:id` | Partial modification of a resource |
| Batch update | PATCH | `/batch` | Multiple partial modifications |
| Soft delete | DELETE | `/:id` | Semantic: "delete from user view" (mark as deleted) |
| Restore | PATCH | `/:id/restore` | Restore from deletion (state change) |

**Cascade Deletion Strategy**:
- **Meter Group DELETE** → soft-deletes the meter group + all readings for that meter group + all billings referencing those readings
- **Property DELETE** → soft-deletes the property + all readings for that property (all meter groups) + all billings for that property
- **Reading DELETE** → soft-deletes the reading + all billings that reference it (as previous or current reading)
- **Billing DELETE** → soft-deletes only the billing (no cascade — billings are the leaf entity)
- **Billing Cycle DELETE** → soft-deletes only the cycle (does not cascade — cycles contain billings from multiple properties)

**Cascade Restoration Strategy**:
- **Restore endpoints mirror deletion**: restoring a meter group, property, or reading restores all soft-deleted child entities that belong to it
- All cascade operations use Firestore transactions for atomicity

**Rationale**: 
- **DELETE** is semantically correct for soft deletion — from the user's perspective, the resource is gone (hidden)
- No hard delete endpoints — soft delete is the only deletion option, ensuring data safety
- **Cascade** prevents orphaned data (e.g., billings referencing deleted readings) and maintains referential integrity
- **PATCH** is used for all state modifications (updates, restore)
- Timestamps are serialized to ISO strings in responses (D2 fix) for proper JSON handling

---

## Swagger / OpenAPI Documentation

### Access Swagger UI
When the API is running (`npm run serve`):
- **Interactive docs**: http://localhost:5002/docs
- **Raw OpenAPI spec**: http://localhost:5002/docs/swagger.json

### How Swagger is Generated
1. Each feature folder has a `<feature>.swagger.ts` file exporting a `paths` object
2. `src/config/swagger.config.ts` aggregates all feature paths
3. `setupSwagger(app)` mounts Swagger UI at `/docs`

### Example: Adding Swagger to a New Feature
```ts
// src/features/my-feature/my-feature.swagger.ts
export const paths = {
  '/my-features': {
    post: {
      summary: 'Create my feature',
      requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateMyFeatureRequest' } } } },
      responses: { 201: { content: { 'application/json': { schema: { $ref: '#/components/schemas/MyFeature' } } } } },
      security: [{ BearerAuth: [] }]
    },
    // ... other methods
  }
};
```

Then import in `src/config/swagger.config.ts`:
```ts
import { paths as myFeaturePaths } from '../features/my-feature/my-feature.swagger';
paths = { ...paths, ...myFeaturePaths };
```

---

## File & Folder Map by Feature

### Meter Groups
```
api/functions/src/features/meter-group/
├── meter-group.model.ts         → MeterGroup interface
├── meter-group.dto.ts           → CreateMeterGroupRequest, UpdateMeterGroupRequest (Zod)
├── meter-group.repository.ts    → new Repository<MeterGroup>(COLLECTIONS.METER_GROUPS)
├── meter-group.service.ts       → validateUniqueName(), create(), update(), etc.
├── meter-group.controller.ts    → getAll(), getById(), create(), update(), delete()
├── meter-group.route.ts         → Express router; validateRequest() middleware
├── meter-group.swagger.ts       → OpenAPI paths for all 8 routes
└── meter-group.test.ts          → Pseudo-TDD specs (no executable code)
```

**Entry point** (`src/index.ts`):
```ts
import { meterGroupRoutes } from './features/meter-group/meter-group.route';
app.use('/meter-groups', meterGroupRoutes);
```

### Properties
```
api/functions/src/features/property/
├── property.model.ts
├── property.dto.ts
├── property.repository.ts
├── property.service.ts
├── property.controller.ts
├── property.route.ts
├── property.swagger.ts
└── property.test.ts
```

(Same pattern for tenant, reading, billing, billing-cycle)

### Image Extraction
```
api/functions/src/features/image-extraction/
├── image-extraction.model.ts
├── image-extraction.dto.ts
├── image-extraction.service.ts    → Calls gemini.lib.ts for OCR
├── image-extraction.controller.ts
├── image-extraction.route.ts
├── image-extraction.swagger.ts
└── image-extraction.validator.ts
```

### Reports
```
api/functions/src/features/reports/
├── reports.model.ts
├── reports.dto.ts
├── reports.service.ts             → Aggregates billing + reading data
├── reports.controller.ts
├── reports.route.ts
└── reports.swagger.ts
```

### Authentication (special case — public routes)
```
api/functions/src/features/auth/
├── auth.model.ts                → User (email, password_hash, etc.)
├── auth.dto.ts                  → LoginRequest, RegisterRequest, RefreshRequest
├── auth.service.ts              → validateCredentials(), generateTokens(), refreshToken()
├── auth.controller.ts           → login(), register(), refresh(), logout()
├── auth.route.ts                → No validateRequest() — allows unauthenticated requests
├── auth.swagger.ts              → 4 public endpoints (no security: [...])
└── auth.test.ts
```

### Core Utilities & Abstraction
```
api/functions/src/
├── config/
│   ├── env.config.ts            → Load .env files via dotenv
│   ├── swagger.config.ts        → Aggregate all feature .swagger.ts files
│   ├── error.config.ts          → Global error handler middleware
│   └── ... (Firebase init, logging, rate limiting)
├── constants/
│   ├── collection.constants.ts  → COLLECTIONS = { METER_GROUPS: 'meter_groups', ... }
│   └── utility.constants.ts     → UTILITY_TYPES, UtilityType union
├── lib/
│   ├── repository.lib.ts        → Generic Repository<T> class (all CRUD)
│   ├── firestore.lib.ts         → Low-level Firestore ops (timestamps, batch)
│   ├── auth.lib.ts              → JWT generation (jsonwebtoken)
│   └── ... (Realtime DB, storage stubs)
└── utils/
    ├── model.util.ts            → BaseModel, WithoutBaseModel<T>
    ├── pagination.util.ts       → PaginatedResult<T>, cursor-based pagination
    ├── error.util.ts            → AppError, handleValidationError()
    ├── logger.util.ts           → Pino logger instance
    └── ... (sanitize, firestore conversion)
```

---

## Adding a New Feature

### 1. Create the Model
**File**: `src/features/<name>/<name>.model.ts`

```ts
import { BaseModel } from '../../utils/model.util';

export interface MyFeature extends BaseModel {
  name: string;
  description?: string;
  status: 'active' | 'inactive';
}
```

### 2. Create the DTO (Zod Schemas)
**File**: `src/features/<name>/<name>.dto.ts`

```ts
import { z } from 'zod';

export const CreateMyFeatureSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active')
});

export type CreateMyFeatureRequest = z.infer<typeof CreateMyFeatureSchema>;
export type UpdateMyFeatureRequest = CreateMyFeatureSchema.partial();
```

### 3. Create the Repository
**File**: `src/features/<name>/<name>.repository.ts`

```ts
import { Repository } from '../../lib/repository.lib';
import { COLLECTIONS } from '../../constants/collection.constants';
import type { MyFeature } from './<name>.model';

export const myFeatureRepository = new Repository<MyFeature>(COLLECTIONS.MY_FEATURES);
```

### 4. Create the Service
**File**: `src/features/<name>/<name>.service.ts`

```ts
import { AppError } from '../../utils/error.util';
import { myFeatureRepository } from './<name>.repository';
import type { MyFeature, CreateMyFeatureRequest, UpdateMyFeatureRequest } from './<name>.model';

export async function createMyFeature(data: CreateMyFeatureRequest): Promise<MyFeature> {
  // Validate business rules
  if (data.name.length < 1) {
    throw new AppError(400, 'Name is required');
  }

  // Delegate to repository
  return myFeatureRepository.create({ ...data, created_at: new Date() } as MyFeature);
}

export async function getMyFeature(id: string): Promise<MyFeature> {
  const feature = await myFeatureRepository.getById(id);
  if (!feature) {
    throw new AppError(404, 'My Feature not found');
  }
  return feature;
}

// ... update, delete, list methods
```

### 5. Create the Controller
**File**: `src/features/<name>/<name>.controller.ts`

```ts
import { Request, Response } from 'express';
import * as myFeatureService from './<name>.service';
import type { CreateMyFeatureRequest, UpdateMyFeatureRequest } from './<name>.dto';

export async function createMyFeature(req: Request<{}, {}, CreateMyFeatureRequest>, res: Response) {
  const feature = await myFeatureService.createMyFeature(req.body);
  res.status(201).json(feature);
}

export async function getMyFeature(req: Request<{ id: string }>, res: Response) {
  const feature = await myFeatureService.getMyFeature(req.params.id);
  res.json(feature);
}

// ... other handlers
```

### 6. Create the Route
**File**: `src/features/<name>/<name>.route.ts`

```ts
import { Router } from 'express';
import { validateRequest } from '../../middlewares/validate-request.middleware';
import { CreateMyFeatureSchema, UpdateMyFeatureSchema } from './<name>.dto';
import * as myFeatureController from './<name>.controller';

export const myFeatureRouter = Router();

myFeatureRouter.post('/', validateRequest(CreateMyFeatureSchema), myFeatureController.createMyFeature);
myFeatureRouter.get('/:id', myFeatureController.getMyFeature);
myFeatureRouter.put('/:id', validateRequest(UpdateMyFeatureSchema), myFeatureController.updateMyFeature);
// ... other routes
```

### 7. Mount in src/index.ts
```ts
import { myFeatureRouter } from './features/my-feature/<name>.route';

app.use('/my-features', myFeatureRouter);
```

### 8. Create the Validator
**File**: `src/features/<name>/<name>.validator.ts`

Create Zod validator instances used by `validateRequest()` middleware in the route file.

```ts
import { CreateMyFeatureSchema, UpdateMyFeatureSchema } from './<name>.dto';

export const createMyFeatureValidator = CreateMyFeatureSchema;
export const updateMyFeatureValidator = UpdateMyFeatureSchema.partial();
```

### 9. Create Swagger Documentation
**File**: `src/features/<name>/<name>.swagger.ts`

(Reference `meter-group.swagger.ts` for the template)

### 10. Add to Swagger Config
**File**: `src/config/swagger.config.ts`

```ts
import { paths as myFeaturePaths } from '../features/my-feature/<name>.swagger';

let paths: OpenAPI.Paths = {
  ...existingPaths,
  ...myFeaturePaths
};
```

### 11. Write Tests
**File**: `src/features/<name>/<name>.test.ts`

(Pseudo-TDD specs only — see `meter-group.test.ts` for example)

---

## Constants & Configuration

### Collection Names
**File**: `src/constants/collection.constants.ts`

```ts
export const COLLECTIONS = {
  METER_GROUPS: 'meter_groups',
  PROPERTIES: 'properties',
  TENANTS: 'tenants',
  READINGS: 'readings',
  BILLINGS: 'billings',
  BILLING_CYCLES: 'billing_cycles',
  USERS: 'users'
} as const;
```

### Utility Types
**File**: `src/constants/utility.constants.ts`

```ts
export const UTILITY_TYPES = {
  ELECTRICITY: 'electricity',
  WATER: 'water'
} as const;

export type UtilityType = typeof UTILITY_TYPES[keyof typeof UTILITY_TYPES];
```

---

## Key Abstractions

### Repository<T>
Generic class that handles all CRUD for any model. Located in `src/lib/repository.lib.ts`.

Methods:
- `create(item: T)` → T
- `createBatch(items: T[])` → T[]
- `getAll(options?: PaginationOptions)` → PaginatedResult<T>
- `getById(id: string)` → T | null
- `search(filters: Partial<T>, options?: PaginationOptions)` → PaginatedResult<T>
- `update(id: string, data: Partial<T>)` → T
- `updateBatch(items: { id: string; data: Partial<T> }[])` → T[]
- `softDelete(id: string)` → T (sets deleted_at)
- `delete(id: string)` → void (hard delete)

### AppError
Custom error class with HTTP status. Located in `src/utils/error.util.ts`.

```ts
throw new AppError(400, 'Invalid input');  // 400 Bad Request
throw new AppError(404, 'Not found');      // 404 Not Found
throw new AppError(409, 'Conflict');       // 409 Conflict
```

The global error handler maps AppError → HTTP response.

### PaginatedResult<T>
```ts
interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;    // For next page; null if no more
  hasMore: boolean;
}
```

All list endpoints return this. UI uses cursor-based pagination.

---

## Environment & Secrets

### Loading Config
**File**: `src/config/env.config.ts`

Loads from `secrets/.env.{APP_ENV}` based on the `APP_ENV` environment variable.

Dev environment (`APP_ENV=dev`) connects directly to `utilitool-staging` Firebase project for Firestore/Auth data.

### Required Env Vars (Development)
```
APP_ENV=dev
GCLOUD_PROJECT=utilitool-staging
GOOGLE_APPLICATION_CREDENTIALS=/app/secrets/utilitool-staging-firebase-adminsdk-fbsvc-1fe128504a.json
GEMINI_API_KEY=<optional — OCR returns mock data if absent>
REDIS_URL=<optional — rate limiting falls back to in-memory store if absent>
```

See `secrets/.env.dev` for all dev variables. Production deployments use `APP_ENV=prod` and `secrets/.env.prod`.

---

## Commands

Run from `api/functions/`:

```bash
npm run dev:watch        # Watch mode (standard dev, used via docker-compose)
npm run serve            # Start emulator + API (manual use only, for integration tests)
npm run build            # Compile TypeScript
npm run build:watch      # Watch mode
npm run lint             # ESLint
npm test                 # Jest (all tests)
npm run test:watch       # Jest watch mode
```

**Standard dev flow**: Use `docker-compose up` from the repo root. This starts the API with `APP_ENV=dev` connected to `utilitool-staging`.

**Manual emulator use**: `npm run serve` still works if you need to run integration tests against a local emulator.

---

## Common Questions

**Q: Where do I validate business logic?**  
A: In the service layer. Use `throw new AppError(statusCode, message)`.

**Q: How do I add a new endpoint?**  
A: Add the handler to the controller, the route to the route file, and update `.swagger.ts`.

**Q: Can I use `getAll()` without filters?**  
A: Avoid it for large collections — use `search()` with filters to avoid full-collection scans. Use `getAll()` only if you're sure the collection is small.

**Q: How do I handle pagination in the UI?**  
A: Pass `cursor` from the previous response to the next request. UI should increment a page number internally while managing cursor state.

**Q: What if timestamp validation fails from the UI?**  
A: The API expects Firestore Timestamps (`{ _seconds, _nanoseconds }`), but may receive ISO strings. Update the Zod validator to accept both and convert to Timestamp server-side.

---

## Back to Root Docs
See `../CLAUDE.md` for project-level navigation and cross-cutting concerns.
