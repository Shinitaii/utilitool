# API Setup & Deployment Guide

## Local Development with Docker & Emulators

### Quick Start

```bash
# Start Firebase emulator + API in watch mode
docker-compose up

# In another terminal, test the API
curl http://localhost:5002/health
```

The emulator automatically redirects all Firebase Admin SDK calls to the local emulator instance. You can access the Emulator UI at http://localhost:4400.

### Manual Setup (without Docker)

```bash
cd api/functions

# Install dependencies
npm ci

# Copy environment file for emulator
cp secrets/.env.example secrets/.env.test

# Start Firebase emulator in one terminal
npm run serve

# Or use the shell for interactive testing
npm run shell
```

## Environment Configuration

### Files Required

Create these files in `api/functions/secrets/`:

- **`.env.test`** — Local development with Firebase emulator (docker-compose or npm run serve)
- **`.env.staging`** — Staging Firebase project (utilitool-staging)
- **`.env.prod`** — Production Firebase project (utilitool-3fe70)

### Environment Variables

Each file needs:

```
# Firebase project identifiers (required)
GCLOUD_PROJECT=<firebase-project-id>
GOOGLE_CLOUD_PROJECT=<firebase-project-id>
PROJECT_ID=<firebase-project-id>

# Environment name
NODE_ENV=staging|production
APP_ENV=test|staging|prod

# Optional: Realtime Database URL (staging/prod only)
FIREBASE_DATABASE_URL=https://<project>.firebaseio.com
```

**Example `.env.test` (emulator):**
```
GCLOUD_PROJECT=utilitool-test
GOOGLE_CLOUD_PROJECT=utilitool-test
PROJECT_ID=utilitool-test
NODE_ENV=development
APP_ENV=test
```

**Example `.env.staging`:**
```
GCLOUD_PROJECT=utilitool-staging
GOOGLE_CLOUD_PROJECT=utilitool-staging
PROJECT_ID=utilitool-staging
FIREBASE_DATABASE_URL=https://utilitool-staging.firebaseio.com
NODE_ENV=staging
APP_ENV=staging
```

### Environment Detection

- **Local dev (emulator)** → Docker sets `FIRESTORE_EMULATOR_HOST` + `APP_ENV=test` → loads `.env.test`
- **Staging** → CI/deployment sets `NODE_ENV=staging` → loads `.env.staging`
- **Production** → Manual deployment with `NODE_ENV=production` → loads `.env.prod`

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

⚠️ **Production requires Firebase service account credentials in `.env.prod`**

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
