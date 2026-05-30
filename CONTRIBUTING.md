# Contributing to Utilitool

This guide covers how to set up the dev environment, add new features, and follow project conventions.

---

## Dev Environment Setup

### Prerequisites
- Node.js 24+
- Git

### Start everything
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
```

- API: http://localhost:5002
- UI: http://localhost:5173
- Swagger: http://localhost:5002/docs

Both run in watch mode — file changes hot-reload automatically.

See `API_SETUP.md` for full environment variable requirements and Firebase credential setup.

### Docker alternative
```bash
docker-compose up
```
Requires `api/functions/secrets/.env.staging`. See `API_SETUP.md`.

---

## Project Structure

```
new-utility-calculator/
├── api/functions/src/    → Express API (TypeScript + Firestore)
├── ui/src/               → SvelteKit 5 web frontend
├── mobile/src/           → Svelte 5 SPA + Capacitor (Android)
├── decisions/            → Architecture decision records
├── docker-compose.yml    → Docker alternative for running the full stack
└── CLAUDE.md             → Navigation guide (start here for context)
```

Read the relevant CLAUDE.md before touching code:
- API changes → `api/functions/CLAUDE.md`
- UI changes → `ui/CLAUDE.md`
- Mobile changes → `mobile/CLAUDE.md`

---

## Adding a New API Feature

Every feature follows the 9-file pattern. Full step-by-step guide in `api/functions/CLAUDE.md` → "Adding a New Feature".

Quick checklist:
1. `<name>.model.ts` — TypeScript interface extending `BaseModel`
2. `<name>.dto.ts` — Zod schemas for request/response shapes
3. `<name>.repository.ts` — `new Repository<T>(COLLECTIONS.<NAME>)`
4. `<name>.service.ts` — business logic; throw `new AppError(status, message)` for errors
5. `<name>.controller.ts` — thin HTTP handlers; no try/catch
6. `<name>.route.ts` — Express routes with `validateRequest()` middleware
7. `<name>.validator.ts` — Zod validator instances used by the route
8. `<name>.swagger.ts` — OpenAPI path definitions
9. `<name>.test.ts` — Jest tests
10. Mount in `src/index.ts` and add paths to `src/config/swagger.config.ts`

Use `src/features/meter-group/` as the reference implementation.

---

## Adding a New UI Page

Full guide in `ui/CLAUDE.md` → "Adding a New Page".

Quick checklist:
1. Create `ui/src/routes/(app)/<name>/+page.svelte`
2. Create `ui/src/lib/api/<name>.ts` — wraps backend endpoints
3. Create `ui/src/lib/types/<name>.types.ts` — mirrors the backend model
4. Add navigation link in `ui/src/lib/components/layout/Sidebar.svelte`

If the page needs soft-delete + edit modal support, use `createCrudStore<T>()` from `ui/src/lib/stores/crud.svelte.ts`.

If you add an archive/restore page, use `ArchivePageTemplate.svelte` from `ui/src/lib/components/shared/`.

---

## Adding a New Mobile Screen

Full guide in `mobile/CLAUDE.md` → "Adding a New Screen".

Quick checklist:
1. Create `mobile/src/screens/<Name>.svelte`
2. Add a hash case in `mobile/src/App.svelte`
3. Add the hash to the `handleHashChange` allow-list
4. If it's a tab-level screen, add to `BottomNav.svelte`

For API calls, use helpers from `mobile/src/lib/api/client.ts`. For data that should persist across screen navigations, use `mobile/src/lib/stores/session.ts`.

---

## Branch Conventions

| Branch prefix | When to use |
|---------------|-------------|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `chore/` | Tooling, deps, config changes |
| `docs/` | Documentation only |
| `refactor/` | Refactoring without behavior change |

Example: `feat/reading-export`, `fix/billing-cycle-validation`

---

## Commit Messages

Use imperative, lowercase, no period. Keep the subject line under 72 characters.

```
feat(readings): add seed reading endpoint for initial meter values
fix(billing-cycle): correct 3% tolerance check for cross-version pairs
chore(deps): bump firebase-admin to 12.x
docs(api): update image-extraction swagger paths
```

Scopes match feature folder names: `meter-group`, `property`, `tenant`, `reading`, `billing`, `billing-cycle`, `image-extraction`, `reports`, `ui`, `mobile`.

---

## Code Style

### TypeScript (API + UI + Mobile)
- Strict mode enabled everywhere
- No `any` — use `unknown` if the type is genuinely dynamic
- Prefer `const` over `let`; never `var`
- Export types separately from implementation with `export type`

### API (Express)
- Business logic belongs in the service layer — controllers stay thin
- Throw `new AppError(statusCode, message)` for expected errors
- All DELETE endpoints must soft-delete; return the updated resource with 200
- Validate with Zod DTOs via `validateRequest()` middleware — never validate in controllers
- No raw Firestore calls in controllers or services — go through the repository

### UI (Svelte 5)
- Use `$state`, `$derived`, `$effect` — no legacy writable stores outside of `lib/stores/`
- API calls live in `src/lib/api/<feature>.ts`, never inline in components
- Use `formatCurrency()`, `formatDate()`, etc. from `src/lib/utils/format.ts` — no ad-hoc formatting
- Design tokens only — no hardcoded hex values except in `layout.css` theme block

### Comments
Write no comments unless the **why** is non-obvious: a hidden constraint, a workaround for a specific bug, or a subtle invariant. Don't comment what the code already says.

---

## Testing

### API
```bash
cd api/functions
npm test              # All Jest tests
npm run test:watch    # Watch mode
```

Tests live alongside the feature: `<name>.test.ts` for integration specs, `<name>.service.test.ts` for unit-level service logic, `<name>.validator.test.ts` for validator edge cases.

### UI
```bash
cd ui
npm run test:unit     # Vitest (component + store tests)
npm run test:e2e      # Playwright (full browser flows)
npm run check         # TypeScript — run before every PR
```

### Before opening a PR
```bash
# API
cd api/functions && npm run lint && npm test

# UI
cd ui && npm run lint && npm run check && npm run test:unit
```

---

## Pull Request Guidelines

- Target `main` for all PRs
- Keep PRs focused — one feature or fix per PR
- Add Swagger documentation for every new API endpoint
- Update the relevant CLAUDE.md if your change affects architecture, new files, or new patterns
- UI changes: test the happy path in a browser before marking as ready for review
- API changes: verify with Swagger UI before marking as ready for review

---

## Architecture Decisions

Non-obvious decisions are recorded in `decisions/`. If you make a choice that future contributors might question — a trade-off, a deliberate constraint, a pattern that looks wrong but isn't — add a short `.md` file there.

File name format: `YYYYMMDD_short-description.md`

---

## Questions

- **"Where is X?"** → Check the relevant CLAUDE.md file map
- **"How does Y work?"** → Check `CLAUDE.md` Business Overview or the feature's swagger
- **"Why was Z done this way?"** → Check `decisions/` folder
- **Bugs / issues** → Open a GitHub issue
