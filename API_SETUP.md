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

- **`REDIS_URL`** — connection string for the rate-limiter / cache backend. If unset, falls back
  to an in-memory store (single-instance only).
- **`ALLOWED_ORIGINS`** — comma-separated list of allowed CORS origins (e.g. your Vercel UI
  domain). Required in non-development environments — `cors.config.ts` warns if unset outside
  `development`. Localhost dev origins are always allowed regardless of this setting.

## OCR (image extraction)

OCR (meter reading photos, utility bill photos) is driven entirely by the user's **vision**
`llm-config` — no env var, no Gemini fallback. Set via `PATCH /llm-config/vision`
(Groq or Ollama Cloud), independent from the chat config set via `PATCH /llm-config` — some
providers (e.g. Ollama Cloud) have no usable free vision model, so chat and vision commonly use
different providers. If the vision provider matches the chat provider, the vision config reuses
the chat API key (no need to enter it twice); otherwise its own API key is required. OCR
endpoints return 404 ("Vision model not configured...") until the vision config exists.

## Notes

- `secrets/*.json` and `secrets/.env.*` are gitignored — never commit them. See root
  `CLAUDE.md` → CI/CD for which secrets are injected via GitHub Actions instead.
- `APP_ENV=production` also hides the Swagger docs (`/docs`) — see `swagger.config.ts`.
