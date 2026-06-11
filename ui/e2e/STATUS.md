# Phase 2A E2E — status (2026-06-11)

`npm run test:e2e` boots the Firestore+Auth emulators, the API in `dev:emulator` mode, and a
`--mode test` build/preview of the UI (see `decisions/20260611_emulator-for-e2e-testing.md`).

## Working
- All three webServers (emulators on 8080/9099, API on 5002, UI preview on 4173) start cleanly
  with no orphaned processes.
- `global-setup.ts` seeds the Firebase Auth emulator user and clears Firestore between runs.
- Login, meter group creation, property creation, and both reading creations (prev-month +
  current-month, triggering auto-billing) all pass.
- Fixed along the way:
  - `playwright.config.ts`: build+preview webServer now always runs its own instance
    (`reuseExistingServer: false`) — a stale preview server on 4173 was serving an old build.
  - `svelte.config.js`: now loads `.env.test` via `loadEnv()` so the CSP `connect-src` allows
    `127.0.0.1:9099`/`9199` (auth/storage emulators) when `VITE_USE_FIREBASE_EMULATOR=true`.
  - `api/.../cors.config.ts`: dev localhost CORS pattern now also matches `127.0.0.1` (Vite
    preview's `--host 127.0.0.1`), not just `localhost`.
  - `e2e/billing-happy-path.e2e.ts`: `selectOption({ label })` needs a plain string (not
    RegExp) and must match the rendered option text exactly, including the `(electricity)`
    suffix used on the readings/billings pages. Reading dates moved to day 1 of the month
    (day 15 could land in the future depending on "today").

## Remaining issue (not yet root-caused)
- On the Billings page, "New Billing Cycle" discovery (`discoverBillings()` in
  `ui/src/routes/(app)/billings/+page.svelte`) reports "No billings found yet for this meter
  group and end month" even though the auto-created billing exists (sidebar badge shows
  "Billings 2"/etc.).
- Suspect: a timezone mismatch between how `reading_date` is stored (UTC, from
  `ymd()`/`toISOString().slice(0,10)` in the spec) vs. how `cycleFormEndDate`'s month is
  compared (`readingDate.getUTCMonth()` vs `new Date(cycleFormEndDate).getUTCMonth()`) —
  worth confirming with the actual `GET /readings` / `GET /billings` payloads (a
  `page.on('response', ...)` logger for these endpoints is stubbed in the spec but wasn't
  exercised to completion before the session ended).
- Once this is root-caused, the spec needs the correct `End Date` value (or a different way
  to drive discovery) so `getByText(ROOM_NAME)` and `Total Bill Amount === '625'` pass, then
  the rest of the flow (Create Cycle → expand → Mark as paid → assert `₱625.00`) is untested.

## Next steps
1. Resolve the discovery date-matching issue above.
2. Run the full spec green locally, then in CI.
3. Proceed to Phase 2B (convert pseudo-TDD `*.test.ts` specs to real Jest tests) and 2C
   (coverage gate ratchet) per the hardening roadmap.
