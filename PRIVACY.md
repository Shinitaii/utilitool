# Privacy Notice — Utilitool

Utilitool is a single-tenant, internal utility meter reading and billing system.
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
- **Groq**: per the [Services Agreement](https://console.groq.com/docs/legal/services-agreement),
  Section 4.2 ("Inputs and Outputs") makes two **separate** commitments — one about training,
  one about storage. Training: *"Groq is not permitted to use Inputs or Outputs for training
  or fine-tuning any AI Model Services or other models, unless explicitly granted permission
  or instructed by Customer."* Storage (a distinct sentence in the same section): *"Groq does
  not access, use, store, or retain Inputs or Outputs except as necessary to provide the Cloud
  Services, in accordance with the Customer's permission or instruction, comply with
  applicable law, ensure the reliable operation of the Cloud Services, or confirm Customer's
  compliance with the AUP."* The ["Your Data in GroqCloud"](https://console.groq.com/docs/your-data)
  page elaborates on those storage exceptions: data is retained up to 30 days for
  abuse/reliability monitoring or troubleshooting, and separately for as long as needed for
  features that require it (batch jobs, fine-tuning/LoRAs) — and documents a **Zero Data
  Retention** option any customer can enable in Data Controls settings to disable even that
  30-day retention (at the cost of disabling batch/fine-tuning features). (These commitments
  live in Groq's Services Agreement / Data Processing Addendum governing GroqCloud
  specifically, not their general consumer privacy policy.)
- **Ollama Cloud**: per its [privacy policy](https://ollama.com/privacy), Section 2 ("How
  Ollama Works") also makes both commitments separately. Training: *"We do not use your
  inputs or outputs to train any AI models or request prompt or response content in support
  requests."* Storage, specifically for cloud-hosted models: *"When using cloud-hosted
  models, we process this content transiently to provide the Service and this content is not
  stored beyond the time required to fulfill the request,"* and separately: *"We implement
  technical measures designed to minimize retention of prompt and response content."* (The
  same section separately confirms fully local/on-device Ollama usage involves no data
  collection at all — not the mode used here, since Utilitool calls the hosted Ollama Cloud
  API.)
- Neither provider's policy calls out image data as a distinct category from text
  prompts/outputs — both quoted commitments (training and storage) are stated generically
  over "Inputs and Outputs" / "prompt and response content," which covers the base64 image
  payloads sent for OCR under the same terms as text, but neither page explicitly says so.
- OCR results are **suggestions only** — nothing is auto-saved. The extracted value is
  returned to the client and only persisted if a staff member reviews and resubmits it
  through the normal create endpoints (`POST /readings`, `POST /billing-cycles`), which
  apply the existing anomaly (5×) and consumption-tolerance (3%/5%) checks regardless of
  whether the value came from OCR or manual entry.
- Utility-bill photos may contain more personal/financial detail (account holder name,
  address, account number, amount due) than a bare meter-reading photo, which typically
  shows only the meter face and numeric display.
- Before any image is sent to the vision provider, the server re-encodes it
  (`api/functions/src/lib/image-fetch.util.ts`, via `sharp`) to strip EXIF metadata —
  including GPS location tags a phone camera may embed — while baking in the correct visual
  orientation first, so the stripped image still displays right-side up.
- API keys for Groq/Ollama are supplied by the requesting user, encrypted at rest
  (AES-256-GCM, `src/lib/crypto.lib.ts`), and are never returned in any API response.
- **Recommended**: enable Groq's **Zero Data Retention** option (Data Controls settings,
  see ["Your Data in GroqCloud"](https://console.groq.com/docs/your-data)) on the Groq
  account used for OCR/chat. This is a setting on the requesting user's own Groq account —
  Utilitool cannot enable it on their behalf — but doing so removes even the limited
  (up to 30 days) abuse/reliability-log retention window described above, which is the
  lowest-risk posture available for both the organization and the tenants whose data is
  processed.

## Data Isolation

Utilitool does not implement per-landlord/per-tenant data partitioning — all authenticated
staff accounts (any role) can see the full shared property/reading/billing dataset for the
organization. This is an intentional architectural decision (single organization, multiple
staff users), not a per-customer SaaS boundary. There is no cross-organization data sharing
since there is only one organization's data in a given deployment.

## Insight Chatbot

The chatbot (`POST /chatbot`) is restricted to the `admin` role (`landlord`/`assistant`
accounts receive `403`) — this narrows the data-to-third-party exposure below to only the
admin's own requests, rather than every staff member's. The web `ChatWidget` is hidden
entirely for non-admin users to match; there is no mobile chatbot UI. Chat history is not
persisted server-side — the client resends prior turns on each request.

Within that admin-only scope, the chatbot answers questions using the same shared dataset
any staff member already has read access to via the normal UI — it does not introduce new
data exposure beyond what the requesting admin's role already permits.

- To answer a question, the chatbot calls internal tool functions
  (`api/functions/src/features/chatbot/chatbot.tools.ts`) that read readings, consumption
  totals, and billing costs, then sends those results to the same requesting user's
  configured Groq/Ollama Cloud provider (the same providers and data-handling terms
  described above for OCR) so the model can compose a natural-language answer.
- Property/unit identifiers (`Property.room_name`) are replaced with an opaque per-request
  token (e.g. "Property 1") before any tool result is sent to the provider
  (`chatbot.service.ts`'s `createPropertyNameMasker`), and only mapped back to the real
  name in the final reply shown to the user. The provider never receives the real
  property/unit name. No tenant names or addresses are ever included — the chatbot's tools
  never query the tenant repository.
- Consumption totals and computed peso billing costs are sent as-is, since they are the
  analytical output the chatbot exists to produce; the same Groq/Ollama no-training,
  limited/no-retention terms quoted above apply to this data.

## Retention & Deletion

- Records use soft deletion (`is_deleted` flag) by default via `DELETE /:id`. This is the
  normal, low-friction deletion path for day-to-day use, and is reversible via
  `PATCH /:id/restore`. See `api/CLAUDE.md` → "HTTP Method Semantics".
- **Permanent deletion (purge)**: for right-to-erasure requests — e.g. a tenant asking for
  their data to be permanently removed — every entity also supports a second, irreversible
  step: `DELETE /:id/purge`. This only works on a record already soft-deleted (`409` if it's
  still active) and is restricted to the `admin` role. Meter-group, property, and reading
  purges cascade to their already-archived readings/billings, mirroring the existing
  archive cascade, so a purge cannot leave orphaned records behind. See `api/CLAUDE.md` →
  "Archive-Then-Purge Lifecycle".
- Meter-reading photos are only stored if the photo-settings preference is explicitly
  enabled per user; bill/billing-cycle photos are never stored.
- This document does not set a fixed data-retention period — retention is governed by
  operational need and, if the organization is subject to a specific data protection
  regime (e.g. the Philippine Data Privacy Act), by that regime's requirements. The
  archive-then-purge lifecycle gives staff a concrete mechanism to act on an erasure
  request once one is received, rather than only a soft-delete that leaves data recoverable
  indefinitely.
