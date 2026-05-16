# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

A single Firebase Cloud Function (`api`) exports an Express app from `src/index.ts`. Every HTTP request flows through:

```
pino-http logger → express.json() → feature router → global errorHandler
```

New feature routers must be mounted in `src/index.ts` under a path (e.g. `app.use('/meter-groups', meterGroupRoutes)`).

## Feature Pattern

Every domain feature lives under `src/features/<name>/` and follows this exact layer order:

```
model.ts       TypeScript interface extending BaseModel
dto.ts         Zod schemas for all request shapes; types via z.infer<>
repository.ts  One line: new Repository<Model>(COLLECTIONS.NAME)
service.ts     Business logic; only layer that throws AppError
controller.ts  Thin Express handlers; no try/catch
route.ts       Express Router; validateRequest(Schema) before each handler
test.ts        Pseudo-TDD spec comments only — do not add executable code
```

`meter-group` is the sole complete reference implementation. All future features must match its structure.

## lib vs utils

**`src/lib/`** — Firebase-coupled abstractions:
- `repository.lib.ts` — `Repository<T>` generic class; the only Firestore interface features should use
- `firestore.lib.ts` — raw Firestore primitives (timestamps, batch writes); used by `repository.lib` only
- `realtime.lib.ts` — Firebase Realtime Database helpers
- `auth.lib.ts`, `storage.lib.ts`, `notification.lib.ts` — stubs

**`src/utils/`** — Pure TypeScript helpers, no Firebase dependency:
- `model.util.ts` — `BaseModel` interface and `WithoutBaseModel<T>` (strips `id`/timestamps for write inputs)
- `pagination.util.ts` — `PaginatedResult<T>` and `PaginationOptions`
- `error.util.ts` — `handleValidationError` (Zod) and `AppError` (custom error with HTTP status)
- `logger.util.ts` — pino instance; import `logger` here instead of using `console`
- `firestore.util.ts` — `snapshotToModel` (used internally by `firestore.lib`)
- `sanitize.util.ts` — `stripHtml`; use in DTOs instead of inline `.replace(/<[^>]*>/g, '')`

## Repository\<T\>

`new Repository<T>(collectionName)` inherits: `create`, `createBatch`, `update`, `updateBatch`, `getAll`, `getById`, `search(SearchOptions<T>)`, `softDelete`, `softDeleteBatch`, `delete`, `deleteBatch`.

`search()` applies Firestore `where` equality filters via `filters: Partial<WithoutBaseModel<T>>`. Always prefer `search()` with filters over `getAll()` to avoid full-collection scans.

## Error Handling

- **Validation errors** — `validateRequest(Schema)` middleware in the route file; never validate in controllers.
- **Domain errors** — throw `new AppError(statusCode, message)` from the service layer only.
- **Global handler** — `errorHandler` middleware maps `AppError` → correct HTTP status; everything else → 500.
- **No try/catch in controllers** — `express-async-errors` forwards all unhandled rejections to Express automatically.

## Environment

Config loads from `secrets/.env.{APP_ENV}`. When the Firebase emulator is running (`FUNCTIONS_EMULATOR=true`), `APP_ENV` defaults to `test`. Firebase project ID is read from `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, or `PROJECT_ID`.

Env files: `secrets/.env.dev`, `.env.test`, `.env.staging`, `.env.prod`.

## Constants

- `src/constants/collection.constants.ts` — `COLLECTIONS` object for all Firestore collection names
- `src/constants/utility.constants.ts` — `UTILITY_TYPES` enum and `UtilityType` union type
