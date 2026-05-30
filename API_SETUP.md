# API Setup & Deployment Guide

## Local Development with Docker

### Quick Start

```bash
# Start API + UI in watch mode, connected to utilitool-staging Firebase
docker-compose up

# In another terminal, test the API
curl http://localhost:5002/health
```

The API connects directly to the `utilitool-staging` Firebase project via service account credentials. No local emulator.

### Manual Setup (without Docker)

```bash
cd api/functions

# Install dependencies
npm ci

# Start API in watch mode
npm run dev:watch

# Or for testing against real Firestore
npm test
```

## Environment Configuration

### Files Required

Create these files in `api/functions/secrets/`:

- **`.env.staging`** — Local development (docker-compose or manual npm run dev:watch) — connects to utilitool-staging
- **`.env.staging`** — Staging Firebase project (utilitool-staging) — for manual testing
- **`.env.production`** — Production Firebase project (utilitool-3fe70)

### Environment Variables

Each file needs:

```
# Firebase project identifiers (required)
GCLOUD_PROJECT=<firebase-project-id>
GOOGLE_CLOUD_PROJECT=<firebase-project-id>
PROJECT_ID=<firebase-project-id>

# Environment name
NODE_ENV=development|staging|production
APP_ENV=staging|staging|prod

# API keys and secrets
JWT_SECRET=<your-jwt-secret>
GEMINI_API_KEY=<your-gemini-key>

# Optional: Realtime Database URL (staging/prod only)
FIREBASE_DATABASE_URL=https://<project>.firebaseio.com
```

**Example `.env.staging` (local development):**
```
GCLOUD_PROJECT=utilitool-staging
GOOGLE_CLOUD_PROJECT=utilitool-staging
PROJECT_ID=utilitool-staging
NODE_ENV=development
APP_ENV=staging
JWT_SECRET=staging-secret-key-change-in-production-minimum-32-chars-required123456
GEMINI_API_KEY=AIzaSyCW9wqarj2sKwFNgIpjDu_XS3wDWnJbStE
```

**Example `.env.staging`:**
```
GCLOUD_PROJECT=utilitool-staging
GOOGLE_CLOUD_PROJECT=utilitool-staging
PROJECT_ID=utilitool-staging
NODE_ENV=staging
APP_ENV=staging
JWT_SECRET=staging-secret-key-change-in-production-minimum-32-chars-required123456
GEMINI_API_KEY=AIzaSyCW9wqarj2sKwFNgIpjDu_XS3wDWnJbStE
```

### Environment Detection

- **Local dev** → Docker sets `APP_ENV=staging` + `GOOGLE_APPLICATION_CREDENTIALS` pointing to staging service account → loads `.env.staging` → connects to utilitool-staging
- **Tests** → `npm test` runs fully-mocked unit tests; no Firebase connection needed
- **Production** → Manual deployment with `APP_ENV=production` → loads `.env.production` → connects to utilitool-3fe70

See `src/config/env.config.ts` for the full logic.

## Firebase Projects

### Project Aliases (`.firebaserc`)

```json
{
  "projects": {
    "staging": "utilitool-staging",
    "production": "utilitool-3fe70"
  }
}
```

### Setting Up New Projects

1. Create Firebase project in Google Cloud Console
2. Get service account credentials (JSON key file)
3. Store credentials securely (never commit to git)
4. Add project alias to `.firebaserc`
5. Create corresponding `.env.{env}` file

## Deployment

### Staging (Automatic on main branch)

GitHub Actions automatically deploys when you push to `main`:

```bash
# Triggered by: git push origin main
# Runs: lint → test → build → firebase deploy --project staging
```

### Production (Manual)

To deploy to production:

```bash
# From api/functions/
firebase deploy --project production --only functions

# Or with local env vars:
NODE_ENV=production npm run deploy
```

⚠️ **Production requires Firebase service account credentials in `.env.production`**

## Testing

```bash
# Run all tests
npm test

# Run single file
npx jest src/features/meter-group/meter-group.test.ts

# Watch mode
npm run test:watch

# With coverage
npm test -- --coverage
```

### Docker Test Run

```bash
# Build test image
docker build -f Dockerfile.test -t api-tests .

# Run tests
docker run --rm api-tests

# Output includes coverage summary + JSON report
```

## GitHub Actions Secrets

For CI/CD to work, add these GitHub repository secrets:

- **`FIREBASE_TOKEN_STAGING`** — Firebase CLI token for staging project
  - Generate: `firebase login:ci`
  - Use with: `firebase deploy --token $FIREBASE_TOKEN_STAGING`

---

For more details, see `CLAUDE.md` in the root directory.
