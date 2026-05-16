# Firebase Emulator Setup & Testing Guide

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Start Firebase emulator + API in watch mode
docker-compose up

# In another terminal
curl http://localhost:5002/health

# Access Emulator UI
# Browser: http://localhost:4400
```

Everything is pre-configured. The API auto-connects to the emulator.

---

### Option 2: Manual (without Docker)

#### Prerequisites
- Node.js 24+
- Firebase CLI: `npm install -g firebase-tools`

#### Setup

```bash
cd api/functions

# Install dependencies
npm ci

# Terminal 1: Start Firebase emulator
npm run serve

# Wait for "All emulators ready" message
# Emulator UI: http://localhost:4400
```

```bash
# Terminal 2: Run API tests or shell
npm test                    # Run tests against emulator
npm run shell              # Interactive testing shell
npm run build:watch        # Watch TypeScript compilation
```

---

## Understanding the Emulator

### What It Emulates

- **Firestore** (port 8080) — Document database with real Firestore behavior
- **Realtime Database** (port 5000) — Real-time JSON database
- **Authentication** (port 9099) — Auth tokens, custom claims, etc.
- **Cloud Functions** (port 5001) — Local function execution
- **Emulator Suite UI** (port 4400) — Dashboard, data browser, logs

### Key Differences from Production

| Feature | Emulator | Production |
|---------|----------|-----------|
| Speed | Instant | Network latency |
| Cost | Free | Billable |
| Persistence | In-memory (lost on restart) | Persistent |
| Scaling | Single machine | Global |
| Security Rules | Ignored (always allow) | Enforced |

---

## Data & Collections

### Creating Test Data

#### Via Emulator UI (http://localhost:4400)

1. Open Firestore tab
2. Click "Start collection"
3. Create collection name: `meter-groups`
4. Add documents with test data

#### Via API (after starting server)

```bash
# Create meter group
curl -X POST http://localhost:5002/meter-groups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Electricity",
    "utilityType": "electricity",
    "description": "Test meter group"
  }'
```

#### Via Tests

Tests automatically set up fixtures. See `src/features/meter-group/meter-group.test.ts` for examples.

---

## Testing Against the Emulator

### Unit & Integration Tests

```bash
# Run all tests
npm test

# Run specific feature
npx jest src/features/meter-group/meter-group.test.ts

# Watch mode (reruns on file changes)
npm run test:watch

# With coverage report
npm test -- --coverage
```

**Tests automatically:**
- Start the emulator if needed
- Clear data between test runs
- Use `.env.test` for configuration

### Manual Testing

```bash
# Interactive shell (runs compiled code)
npm run shell

# In the shell, test functions directly:
# > const api = require('./lib/index.js')
# > api.someFunction(...)
```

### HTTP Testing (curl/Postman)

1. Start the API: `npm run build:watch` (Terminal 1)
2. Make HTTP requests: `curl http://localhost:5002/meter-groups`

---

## Environment Variables

### `.env.test` Configuration

Located in `api/functions/secrets/.env.test`

```
GCLOUD_PROJECT=utilitool-test
APP_ENV=test
FIRESTORE_EMULATOR_HOST=localhost:8080
```

**When running via docker-compose**, use service names instead:
```
FIRESTORE_EMULATOR_HOST=firebase-emulator:8080
```

### Automatic Detection

- **Emulator detected** via `FIRESTORE_EMULATOR_HOST` env var
- **Firebase Admin SDK** automatically redirects to emulator
- **No credentials needed** — emulator runs unauthenticated

---

## Debugging

### View Emulator Data

1. Open Emulator UI: http://localhost:4400
2. Select "Firestore" tab
3. Browse collections and documents in real-time

### View Logs

**Emulator logs:**
```bash
# Terminal running Firebase emulator shows:
# ✔  functions emulator ready at http://localhost:5001
# ✔  firestore emulator ready at http://localhost:8080
```

**API logs** (from Pino logger):
```bash
# Terminal running API shows:
# [INFO] POST /meter-groups 200 (5ms)
# [ERROR] Validation failed: ...
```

### Inspect Requests/Responses

```bash
# With curl verbose mode
curl -v http://localhost:5002/meter-groups

# Or use Postman/Insomnia to inspect headers and payloads
```

---

## Reset & Clean Up

### Clear Emulator Data

```bash
# Stop emulator (Ctrl+C in terminal)
# Data is lost on restart (in-memory)

# Or manually clear via Emulator UI:
# 1. Click "Delete all data" (warning icon)
```

### Reset Docker

```bash
# Remove container and volume
docker-compose down -v

# Restart
docker-compose up
```

---

## Troubleshooting

### Emulator won't start

```bash
# Check if ports are in use
lsof -i :8080   # Firestore
lsof -i :9099   # Auth
lsof -i :5001   # Functions

# Kill process if needed
kill -9 <PID>
```

### API can't connect to emulator

```bash
# Verify emulator is running (check logs)
# Verify env vars are set:
echo $FIRESTORE_EMULATOR_HOST

# If using docker-compose, use service name:
# FIRESTORE_EMULATOR_HOST=firebase-emulator:8080 (not localhost)
```

### Tests fail with "permission denied"

```bash
# Firestore security rules are IGNORED in emulator
# If tests fail, check:
# 1. Collection/document names match
# 2. Firestore schema matches (fields, types)
# 3. Test fixtures are created before assertions
```

### "EADDRINUSE" error

```bash
# Port already in use
# Change port in firebase.json emulators section
# Or stop other services using those ports
```

---

## Next Steps

1. **Start emulator**: `docker-compose up` or `npm run serve`
2. **Run tests**: `npm test`
3. **Create sample data** via Emulator UI
4. **Test API endpoints** via curl or Postman
5. **Inspect data** in Emulator UI (http://localhost:4400)
6. **Read more**: See `API_SETUP.md` for deployment info

---

For issues or questions, check:
- [Firebase Emulator Docs](https://firebase.google.com/docs/emulator-suite)
- `CLAUDE.md` for project structure
- `api/functions/CLAUDE.md` for code patterns
