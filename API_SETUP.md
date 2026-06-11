# API Setup — Environment Variables

The API loads `api/functions/secrets/.env.<APP_ENV>` on startup (via `src/config/env.config.ts`).
`dotenv` does NOT override variables already present in `process.env`, so values exported in your
shell take precedence over the file.

## Required

- **`APP_ENV`** — selects which Firebase project + secrets file to use (`development` |
  `staging` | `production` | `test`). Defaults to `staging`. Must match the
  `secrets/.env.<APP_ENV>` filename exactly.
- **`GOOGLE_APPLICATION_CREDENTIALS`** — absolute path to the Firebase service-account JSON
  (e.g. `secrets/utilitool-staging-firebase-adminsdk-fbsvc-50221e4bd0.json`). Used by
  `src/config/firebase.config.ts` to initialize the Admin SDK.

## Optional

- **`GEMINI_API_KEY`** — Gemini Vision API key for OCR (image-extraction, billing-cycle/bills
  OCR). If unset, `gemini.lib.ts` logs a warning and returns mock OCR responses — useful for
  local dev without a real key.
- **`REDIS_URL`** — connection string for the rate-limiter / cache backend. If unset, falls back
  to an in-memory store (single-instance only).
- **`ALLOWED_ORIGINS`** — comma-separated list of allowed CORS origins (e.g. your Vercel UI
  domain). Required in non-development environments — `cors.config.ts` warns if unset outside
  `development`. Localhost dev origins are always allowed regardless of this setting.

## Notes

- `secrets/*.json` and `secrets/.env.*` are gitignored — never commit them. See root
  `CLAUDE.md` → CI/CD for which secrets are injected via GitHub Actions instead.
- `APP_ENV=production` also hides the Swagger docs (`/docs`) — see `swagger.config.ts`.
