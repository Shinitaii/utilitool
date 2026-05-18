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
- **Auth**: Custom JWT (not Firebase Auth)
- **Logging**: Pino
- **API Docs**: Swagger UI + OpenAPI 3.0

---

## Feature Layer Pattern

Every API feature lives in `src/features/<name>/` and follows this 8-layer structure:

```
<name>/
├── <name>.model.ts        → TypeScript interface (extends BaseModel)
├── <name>.dto.ts          → Zod validation schemas (request/response shapes)
├── <name>.repository.ts   → Firestore CRUD (usually: new Repository<T>(collectionName))
├── <name>.service.ts      → Business logic & validation (throws AppError here)
├── <name>.controller.ts   → HTTP handlers (thin, no try/catch)
├── <name>.route.ts        → Express routes (validateRequest() + mounted in src/index.ts)
├── <name>.swagger.ts      → OpenAPI documentation (Swagger UI + /docs/swagger.json)
└── <name>.test.ts         → Jest tests (pseudo-TDD spec comments)
```

**Reference implementation**: `src/features/meter-group/` — use this as a template for all new features.

---

## API Endpoints by Feature

### Authentication (`/auth` — public, no JWT required)

Located: `src/features/auth/`

| Method | Path | Purpose | Swagger |
|--------|------|---------|---------|
| POST | `/auth/register` | Create account with email + password | Returns access_token + refresh_token |
| POST | `/auth/login` | Login with email + password | Returns access_token + refresh_token |
| POST | `/auth/refresh` | Refresh expired access token | Requires refresh_token in body |
| POST | `/auth/logout` | Logout (invalidate token) | Requires refreshTokenId |

**Access token TTL**: 30 minutes  
**Refresh token TTL**: 60 days

---

### Meter Groups (`/meter-groups` — protected)

Located: `src/features/meter-group/`

Represents utility type containers (electricity, water).

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/meter-groups` | Create meter group |
| POST | `/meter-groups/batch` | Batch create (1–10 items) |
| GET | `/meter-groups` | List with filters (meterName, utilityType, **minimal=true** for dropdowns) + pagination |
| GET | `/meter-groups/:id` | Get single meter group |
| PATCH | `/meter-groups/:id` | Update meter group |
| PATCH | `/meter-groups/batch` | Batch update (1–10 items) |
| DELETE | `/meter-groups/:id` | Hard delete |
| PATCH | `/meter-groups/:id/delete` | Soft delete (set deleted_at) |
| PATCH | `/meter-groups/:id/restore` | Restore deleted meter group (clear deleted_at) |

**Business rules**:
- Unique meter_name per utility_type
- utility_type must be "electricity" or "water"
- Soft delete sets `deleted_at` timestamp

**Swagger**: http://localhost:5002/docs → look for `/meter-groups` paths

---

### Properties (`/properties` — protected)

Located: `src/features/property/`

Represents buildings/units that consume utilities.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/properties` | Create property |
| POST | `/properties/batch` | Batch create |
| GET | `/properties` | List with filters (roomName, meterGroupId) |
| GET | `/properties/:id` | Get single property |
| PATCH | `/properties/:id` | Update property |
| PATCH | `/properties/batch` | Batch update |
| DELETE | `/properties/:id` | Hard delete |
| PATCH | `/properties/:id/delete` | Soft delete |
| PATCH | `/properties/:id/restore` | Restore property |

**Business rules**:
- Must reference valid meter_group_id
- tenant_amount must be ≥ 1
- Enforces max-tenant-count per property

---

### Tenants (`/tenants` — protected)

Located: `src/features/tenant/`

Represents individual renters/occupants.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/tenants` | Create tenant |
| POST | `/tenants/batch` | Batch create |
| GET | `/tenants` | List with filters (tenantName, propertyId) |
| GET | `/tenants/:id` | Get single tenant |
| PATCH | `/tenants/:id` | Update tenant |
| PATCH | `/tenants/batch` | Batch update |
| DELETE | `/tenants/:id` | Hard delete |
| PATCH | `/tenants/:id/delete` | Soft delete |
| PATCH | `/tenants/:id/restore` | Restore tenant |

**Business rules**:
- Unique tenant_name per property
- Must reference valid property_id
- tenant_start_date and tenant_end_date track occupancy

---

### Readings (`/readings` — protected)

Located: `src/features/reading/`

Represents snapshots of meter consumption.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/readings` | Create reading |
| POST | `/readings/batch` | Batch create |
| GET | `/readings` | List with filters (meterGroupId) |
| GET | `/readings/:id` | Get single reading |
| PATCH | `/readings/:id` | Update reading |
| PATCH | `/readings/batch` | Batch update |
| DELETE | `/readings/:id` | Hard delete |
| PATCH | `/readings/:id/delete` | Soft delete |
| PATCH | `/readings/:id/restore` | Restore reading |

**Business rules**:
- Must reference valid meter_group_id
- reading_amount must be non-negative
- reading_date cannot be in the future
- No duplicate readings per meter group per month (enforced at write time)

**Timestamp handling**: reading_date is a Firestore Timestamp. UI sends ISO strings; validator should accept both.

---

### Billings (`/billings` — protected)

Located: `src/features/billing/`

Represents individual bill records.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/billings` | Create billing |
| POST | `/billings/batch` | Batch create |
| GET | `/billings` | List with filters (propertyId) |
| GET | `/billings/:id` | Get single billing |
| PATCH | `/billings/:id` | Update billing |
| PATCH | `/billings/batch` | Batch update |
| DELETE | `/billings/:id` | Hard delete |
| PATCH | `/billings/:id/delete` | Soft delete |
| PATCH | `/billings/:id/restore` | Restore billing |

**Business rules**:
- Must reference valid property_id, previous_reading_id, current_reading_id
- current_reading_amount must be > previous_reading_amount (no rollback)
- All readings must belong to same meter group

---

### Billing Cycles (`/billing-cycles` — protected)

Located: `src/features/billing-cycle/`

Represents billing periods with validation and rate calculation.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/billing-cycles` | Create billing cycle + validate |
| POST | `/billing-cycles/batch` | Batch create |
| GET | `/billing-cycles` | List with filters (billingStartDate, billingEndDate) |
| GET | `/billing-cycles/:id` | Get single cycle |
| PATCH | `/billing-cycles/:id` | Update cycle |
| PATCH | `/billing-cycles/batch` | Batch update |
| DELETE | `/billing-cycles/:id` | Hard delete |
| PATCH | `/billing-cycles/:id/delete` | Soft delete |
| PATCH | `/billing-cycles/:id/restore` | Restore cycle |

**Business rules**:
- billing_ids: Record<billingId, consumptionAmount> — all IDs must exist + be valid
- billing_start_date < billing_end_date
- **3% tolerance rule**: Calculated consumption vs. provided consumption must match within ±3%
- No meter rollback: each billing must have current > previous readings
- Rate must be reasonable (configurable threshold)

**Validation flow**:
1. Collect all readings for the billings
2. Calculate total consumption
3. Compare to billing_consumption (must be within 3%)
4. Calculate per-tenant charges: (tenant_consumption × rate)
5. Store billing_ids with their calculated consumption

---

## HTTP Method Semantics

**Why we use PATCH instead of PUT**:

| Operation | Method | Path | Why |
|-----------|--------|------|-----|
| Update | PATCH | `/:id` | Partial modification of a resource |
| Batch update | PATCH | `/batch` | Multiple partial modifications |
| Soft delete | PATCH | `/:id/delete` | State change (marking as deleted) |
| Restore | PATCH | `/:id/restore` | State change (unmarking as deleted) |
| Hard delete | DELETE | `/:id` | Removal of the entire resource |

**Rationale**: 
- **PATCH** is for partial, idempotent modifications (updates, state changes)
- **DELETE** is only for hard removal of documents
- This keeps soft delete and restore symmetric (both PATCH state operations)
- Soft delete is not a destructive operation — it's a state change, not a removal

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

### 8. Create Swagger Documentation
**File**: `src/features/<name>/<name>.swagger.ts`

(Reference `meter-group.swagger.ts` for the template)

### 9. Add to Swagger Config
**File**: `src/config/swagger.config.ts`

```ts
import { paths as myFeaturePaths } from '../features/my-feature/<name>.swagger';

let paths: OpenAPI.Paths = {
  ...existingPaths,
  ...myFeaturePaths
};
```

### 10. Write Tests
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
GOOGLE_APPLICATION_CREDENTIALS=/app/secrets/utilitool-staging-firebase-adminsdk-fbsvc-6a77170d3f.json
JWT_SECRET=<from .env.dev>
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
