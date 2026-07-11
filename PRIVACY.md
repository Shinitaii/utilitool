# Privacy Notice — Utilitool

Utilitool is a single-tenant, internal utility meter reading and billing system (see
[`decisions/20260517_single-tenant-architecture.md`](decisions/20260517_single-tenant-architecture.md)).
It is used by one organization's staff (`admin`, `landlord`, `assistant` roles) to manage
their own properties, tenants, meter readings, and billing records — it is not a public
multi-tenant product with external end-user signups. This notice covers what data the
system collects and where it goes, for internal reference and for informing tenants whose
consumption data is processed.

## Data Collected

- **Property/tenant records**: room/unit names, tenant names, occupancy dates — entered by
  staff, stored in Firestore.
- **Meter readings**: numeric consumption values, timestamps, and (optionally) a photo of
  the meter face, if the per-user photo-settings preference (`GET/PATCH /photo-settings`,
  default **off**) is enabled. See `api/CLAUDE.md` → "Photo Settings".
- **Billing records and billing cycles**: consumption, rates, and computed charges derived
  from readings — no bill/cycle photos are ever persisted (no `image_url` field exists on
  the billing-cycle model).
- **Account data**: email and role, via Firebase Authentication.

## Third-Party AI Processors (OCR / Vision)

Utilitool offers an optional OCR "suggest" feature for meter readings and utility bill
photos (`POST /image-extraction/*`, `POST /readings/ocr`, `POST /billing-cycles/ocr`,
`POST /bills/ocr`). When used:

- The photographed image is sent, server-side, to **the requesting user's own configured
  vision provider** — either **Groq** or **Ollama Cloud** — via `api/functions/src/lib/llm.lib.ts`.
  No other provider (no Gemini) is used. See `api/CLAUDE.md` → "LLM Config".
- **Groq**: does not use inputs/outputs for model training by default, and does not retain
  data beyond transient processing except for up to 30 days of abuse/reliability logs
  (governed by Groq's [Services Agreement / Data Processing Addendum](https://console.groq.com/docs/legal/customer-data-processing-addendum),
  not their general consumer privacy policy). Eligible accounts can enable zero data
  retention.
- **Ollama Cloud**: states that prompts/responses are processed transiently to serve the
  request and are not retained or used for training; only basic account metadata is kept.
- OCR results are **suggestions only** — nothing is auto-saved. The extracted value is
  returned to the client and only persisted if a staff member reviews and resubmits it
  through the normal create endpoints (`POST /readings`, `POST /billing-cycles`), which
  apply the existing anomaly (5×) and consumption-tolerance (3%/5%) checks regardless of
  whether the value came from OCR or manual entry.
- Utility-bill photos may contain more personal/financial detail (account holder name,
  address, account number, amount due) than a bare meter-reading photo, which typically
  shows only the meter face and numeric display.
- API keys for Groq/Ollama are supplied by the requesting user, encrypted at rest
  (AES-256-GCM, `src/lib/crypto.lib.ts`), and are never returned in any API response.

## Data Isolation

Utilitool does not implement per-landlord/per-tenant data partitioning — all authenticated
staff accounts (any role) can see the full shared property/reading/billing dataset for the
organization. This is an intentional architectural decision (single organization, multiple
staff users), not a per-customer SaaS boundary. There is no cross-organization data sharing
since there is only one organization's data in a given deployment.

## Insight Chatbot

The chatbot (`POST /chatbot`) answers questions using the same shared dataset any
authenticated staff member already has read access to via the normal UI. It does not
introduce new data exposure beyond what the requesting user's role already permits. Chat
history is not persisted server-side — the client resends prior turns on each request.

## Retention & Deletion

- Records use soft deletion (`is_deleted` flag) by default; no hard-delete endpoints are
  exposed. See `api/CLAUDE.md` → "HTTP Method Semantics".
- Meter-reading photos are only stored if the photo-settings preference is explicitly
  enabled per user; bill/billing-cycle photos are never stored.
- This document does not set a fixed data-retention period — retention is governed by
  operational need and, if the organization is subject to a specific data protection
  regime (e.g. the Philippine Data Privacy Act), by that regime's requirements.
