# Warrantly

Private bills, purchase documents and warranty dates. TanStack Start + React, Clerk Google sign-in, Neon Postgres, S3-compatible object storage, NVIDIA Nemotron OCR and structured LLM extraction, with local Tesseract fallback.

## Current workflow

1. Sign in, then capture a photo or choose a JPEG, PNG, WebP or PDF (15 MB, up to 10 pages).
2. Upload the original directly to private storage using a short-lived signed URL. The server validates the stored size, media type and signature, then copies it to a separate private original key.
3. After the original upload is validated, a database outbox dispatches an Inngest background job. The browser opens review immediately and polls progress; it can close without stopping OCR. Each page is a durable step. The server preserves digital PDF text and renders scans/images with PDF.js and native canvas. NVIDIA failures recover with bounded English Tesseract OCR on the server. If hosted jobs are not configured, the upload screen automatically reads pages in the browser and calls server-side field extraction; keep that screen open until review appears. A manual device-local reading option remains available for failed jobs. The recovery scheduler retries missing dispatches and stale runs; completed pages are reused.
4. The server sends page-preserved OCR text to `nvidia/nemotron-3.5-lightning-30b-a3b` for JSON field extraction. Suggestions need matching source quotes and pass schema validation. Separate detected invoices require a selected page scope containing one invoice ID; quotes from other invoices are rejected. Product names may join up to six ordered literal fragments from one complete source block, retaining the raw description separately. Other fields keep their existing validation. Numeric dates are parsed day-first from the quote; serial/barcode identifiers retain leading zeroes. Neither NVIDIA key reaches the browser.
5. Review the original, raw text, field source quotes and page numbers. Calculated dates and user corrections are identified separately. Corrections autosave as patches in separate columns, with optimistic revisions and serialized writes; OCR completion/retries cannot replace them. Navigation flushes pending writes and blocked saves retain edits. Confirm the details, then save to the vault.
6. Saved bills populate Today, Vault, search/filter results and item details. You can edit, download the original, or delete a bill. No sample records are inserted or displayed.
7. Assistant chat uses NVIDIA with the signed-in user's saved bill fields, and links back to supporting bills. Select one bill or ask across the latest 50. Chat is ephemeral; it does not send requests to sellers or change records. The separate support-draft tab remains available.
8. Reminders provides upcoming/snoozed/all views, snooze/dismiss controls, timezone and local-hour settings. Email is opt-in and only goes to the verified Clerk primary address. An Inngest scheduler checks due email reminders every five minutes. Frozen payloads, database leases and Resend idempotency keys prevent duplicate retries; sends are never retried beyond the provider deduplication window. Sent rows remain as a delivery ledger.

Failed/incomplete OCR remains a private draft. Successful pages and successful AI extraction are reused on retry. Missing/failed AI extraction falls back to explicit text labels with a review warning, never fabricated output. Saving is retry-safe and updates the bill, document link and reminder schedule together.

OCR preparation preserves digital PDF text, targets 300 DPI for scanned PDFs within a 3000-pixel edge limit, and enlarges small images by at most two times. PNG preserves fine text when it fits; photos use bounded JPEG compression. Both server and device-local Tesseract use built-in deskewing. An empty, sparse or low-confidence first reading gets one adaptive-threshold/sparse-layout retry within the same 90-second deadline. The app chooses one complete reading rather than mixing identifiers from different passes. Confidence is a heuristic, not a guarantee of accuracy; originals and review remain essential. See [Tesseract image-quality guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html).

Extraction version 2 attempts one targeted name repair for a missing/rejected/unreadable name, preserving other verified fields. Explicit absence/ambiguity and existing name corrections skip the repair. Missing-name review messages distinguish these states. Each actual primary/repair provider request consumes the existing three-call document budget atomically, including failed requests; at most two calls occur in one extraction run. Corrections remain separate from AI output. Thinking stays off by default. `NVIDIA_EXTRACTION_REPAIR_THINKING=1` opts into a 512-token `reasoning_budget` for name repair only; this parameter is for NVIDIA's hosted Lightning endpoint, not a guarantee of compatibility with custom endpoints or improved accuracy. See the [hosted API reference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-5-lightning-30b-a3b-infer).

## Local development

Use Node.js 22.12+ or 24 and npm. Add credentials to the ignored `.env` using `.env.example` as the variable reference.

```sh
npm ci
npm run db:migrate
npm run dev -- --host 127.0.0.1 --port 3000
# In a second terminal, with INNGEST_DEV=1 in the local .env:
npm run dev:jobs
```

Only `VITE_CLERK_PUBLISHABLE_KEY` is browser-visible. Never prefix a secret with `VITE_`. Never commit `.env` or real credentials in `.env.example`.

| Variable                                     | Purpose                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `VITE_CLERK_PUBLISHABLE_KEY`                 | Clerk public application key, needed at build time                                                                   |
| `CLERK_SECRET_KEY`                           | Server session verification                                                                                          |
| `APP_BASE_URL`                               | Exact deployed origin, or local URL                                                                                  |
| `DATABASE_URL`                               | Neon Postgres connection used by the HTTP driver and migrations                                                      |
| `AWS_ENDPOINT_URL_S3`                        | S3-compatible storage endpoint, including Neon storage                                                               |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Server-only storage credentials                                                                                      |
| `AWS_REGION`, `S3_BUCKET`                    | Private storage region and bucket                                                                                    |
| `NVIDIA_NEMOTRON_OCR_API_KEY`                | Server-only NVIDIA OCR key                                                                                           |
| `NVIDIA_NEMOTRON_OCR_URL`                    | Optional endpoint override; defaults to hosted Nemotron OCR v1                                                       |
| `NVIDIA_LLM_API_KEY`                         | Optional dedicated server-only key for extraction and assistant chat; takes precedence                               |
| `NVIDIA_API_KEY`                             | Optional shared NVIDIA key; on the default NVIDIA endpoint, falls back to the existing `NVIDIA_NEMOTRON_OCR_API_KEY` |
| `NVIDIA_LLM_BASE_URL`                        | Defaults to `https://integrate.api.nvidia.com/v1`                                                                    |
| `NVIDIA_LLM_MODEL`                           | Defaults to `nvidia/nemotron-3.5-lightning-30b-a3b`                                                                  |
| `INNGEST_DEV`                                | `1` for local jobs, `0` or unset in production                                                                       |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`   | Hosted event dispatch and signed worker requests                                                                     |
| `RESEND_API_KEY`                             | Reminder email provider key                                                                                          |
| `REMINDER_FROM_EMAIL`                        | Sender address on a verified Resend domain                                                                           |

`DATABASE_URL_POOLED`, `CLERK_WEBHOOK_SIGNING_SECRET` and `NEON_AI_GATEWAY_*` are reserved and are not used by this workflow. Local `.env` values do not populate Vercel: set the NVIDIA key in the correct Production/Preview environment and redeploy. The existing OCR key can also authenticate extraction/chat at the default NVIDIA LLM endpoint. Custom LLM endpoints require an explicit `NVIDIA_LLM_API_KEY`; shared/fallback keys are never forwarded there. Real bills used for debugging belong in the ignored `sample folder`, never `public` or committed test fixtures.

## Database and security

- Server operations derive account identity from Clerk, never request-supplied owner IDs. Bills, drafts, OCR pages, signed downloads, edits and deletes are owner-scoped.
- Shared tables have `user_id` ownership. Composite foreign keys reject cross-account document/item/page/reminder associations. This is server-enforced tenant isolation, not per-user tables or Postgres RLS; do not expose the database credentials or a direct SQL API to clients.
- Server-side Zod validation, positive sizes, decimal amounts, date checks, file signatures and upload/page limits bound input. An atomic 30-upload account window lasts 24 hours; deleting drafts does not reset it. Each NVIDIA OCR page has up to three processing attempts. Each document's AI extraction has up to three actual provider calls shared by primary extraction and name repair. Atomic extraction claims prevent concurrent duplicate LLM calls.
- Originals stay private. Signed upload/download URLs expire after five minutes. Responses from the application server use `private, no-store`.
- Assistant context is loaded server-side with the Clerk user ID. Only whitelisted purchase fields are sent, not owner IDs, notes, addresses, raw documents or credentials. Source IDs are checked against that context. Requests are limited atomically to 40 per rolling 24 hours and one every three seconds; failures count toward the limit. Client history is bounded and never accepted as system instructions. Migration `0003_assistant_limits` adds the counters without modifying bills.
- Uploading an original bypasses the Vercel function body limit; OCR requests contain one compressed page (under 2.5 million data-URL characters). The `/api/inngest` function is configured for 300 seconds to allow OCR and bounded Tesseract fallback. Verify the deployment plan permits that duration. Server PDF/Tesseract packages and their worker/font/WASM files are explicitly traced into the build; native canvas must be built for the deployment OS and architecture.
- The server stores per-page OCR text and average confidence, plus AI source quotes/model/method in document metadata. Submitted edits are separate from raw results. Receipt text is untrusted prompt data, never system instructions. There is no browser-local document persistence in the production app; Tesseract caches only its language data.

Migrations use Neon HTTP transactions, not WebSockets. Run one migration process at a time, after taking a restorable backup or Neon branch. `db:migrate` checks the recorded migration hashes and applies each pending migration atomically. Never edit an already-applied migration.

`npm run db:backup` creates a private JSON snapshot in a temporary directory. `npm run db:verify-backup -- /absolute/path/to/database.json` restores its recorded schema and rows into isolated PGlite and checks counts/constraints. This is an application-table snapshot, not a replacement for managed Neon point-in-time recovery or independent original-file backups. Snapshot files contain private user data; protect them and never commit them. Migration `0004_background_review_reminders` adds the job outbox, revisioned draft patches and delivery ledger without deleting existing bills.

For a legacy installation with original tables but no migration journal, `npm run db:migrate -- --repair-baseline` compares columns, indexes and constraints against an isolated Postgres reference. It can add missing original indexes/foreign keys and record the baseline. It refuses unexpected definitions rather than dropping or replacing data. This recovery needs dev dependencies installed.

## Deployment

Use Vercel's TanStack Start preset (`vercel.json`), with the repository root as the project root. Add the variables above to the correct Vercel environment and redeploy; the Clerk public key is bundled at build time. Apply database migrations separately before deploying code that uses new columns.

Keep Google as the only sign-in method in Clerk. Use the exact OAuth redirect URI supplied by the matching Clerk instance. Production Clerk keys, Google OAuth credentials and origins must refer to the same environment.

Create an Inngest application, add its event/signing keys to Vercel, leave `INNGEST_DEV` unset or `0`, and sync `https://your-domain/api/inngest` in the Inngest dashboard. Confirm all four functions register and scheduled functions are enabled. Configure a verified sending domain in Resend, then add `RESEND_API_KEY` and `REMINDER_FROM_EMAIL`. `APP_BASE_URL` must be the deployed HTTPS origin for reminder links. Users opt in on Reminders; installing code alone does not enable email delivery.

Storage must support HEAD, ranged GET, conditional CopyObject, PUT and DELETE. Configure bucket CORS for the exact deployed and local origins with PUT/GET/HEAD and Content-Type allowed; do not make the bucket public. Use a lifecycle policy to expire abandoned `users/*/pending/*` objects. Verify provider-specific lifecycle support before relying on it.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run verify:build
```

Unit/integration tests run the actual Drizzle queries and all migrations against isolated PGlite Postgres, with Clerk/storage/AI/email boundaries mocked. They check tenant isolation, foreign keys, retry/save idempotency, background recovery, autosave revision conflicts, timezone/DST scheduling and concurrent email delivery guards. Server rendering and Tesseract tests execute actual PDF/image recognition. Browser tests use production screen components through a separate test-only Vite config and require Chrome installed. They cover desktop/mobile upload, PDF rendering, camera denial/capture/cleanup, evidence review, navigation-safe autosave, reminder preferences/snooze/dismiss, editing, filtering and deletion. Tesseract tests need network access for model assets. Test doubles and fixtures never enter the app route tree or production service imports. These checks do not replace real provider delivery and authenticated deployment smoke tests.

### Live extraction evaluation

`npm run eval:extraction` sends six synthetic receipt cases to the configured NVIDIA endpoint. These fixtures never populate application screens. It reports exact field matches, name coverage, false name autofills, provider-call counts and latency; label fallback does not count as a passing AI case. Provider availability and exact field coverage vary, so do not treat this small suite as a production accuracy guarantee.

`npm run eval:extraction -- --case wrapped-accessory --force-name-repair --compare-thinking` obtains one real baseline, removes its name, then replays that baseline for two live name-repair calls. This isolates standard versus bounded reasoning using the same input. Baseline calls are additional to per-mode counts; a provider failure can prevent a comparison. The command evaluates suggested fields without touching the application database or storage.

For private real bills, use `--manifest /absolute/path/to/private-cases.json` with `{ "cases": [{ "id": "private-bill", "file": "/absolute/path/to/bill.pdf", "raster": true, "expected": { "name": "Expected item", "purchasePrice": "170.00" } }] }`. Omit `raster` to prefer embedded PDF text; when true, PDFs go through rendering and actual Tesseract. Alternatively supply `text` or `pages` instead of `file`. Private manifests/originals must stay outside Git. Commands send text to NVIDIA and print comparison outcomes, never source text or credentials. They require a server key and consume provider capacity independently of application quotas.

## Scope and launch gates

- Nemotron OCR reads text; the text-only Lightning LLM maps it into receipt fields. Source-quote checks reduce unsupported suggestions but do not prove that a model chose the correct amount or identifier: review remains mandatory. Currency defaults to INR if none is recognized. Numeric dates prefer day/month/year. Barcode text is captured when readable; barcode symbol decoding is not implemented. Local Tesseract currently uses English language data.
- A bill represents one saved record/total. Multi-page originals and all extracted text are retained, but separate line-item records are not created automatically. For bundles containing product and service invoices, extraction targets the product invoice and warns that separate fees are excluded. Verify this selection before saving.
- In-app reminders appear on Today and Reminders. Email delivery requires configured Inngest and Resend credentials, a verified sending domain and user opt-in. Push notifications are not implemented. Support requests are editable templates using real bill details; they are not sent automatically and do not invent support contacts.
- Validate the live NVIDIA account, endpoint access, response size, latency and extraction accuracy with representative bills after adding its key. Hosted evaluation endpoints are not a production SLA. Provider failures/timeouts remain editable drafts.
- Before public launch: rotate any previously shared secrets, restrict storage CORS, configure backups and retention, add account deletion/export and a Clerk deletion webhook, verify privacy/consent for sending document pages to NVIDIA, add orphan-file reconciliation, enforce project-wide OCR spending limits, monitor errors, validate hosted background/email execution and complete a two-account live smoke test. Large vaults also need server pagination.

Primary integration references: [NVIDIA OCR request/response contract](https://docs.nvidia.com/nim/ingestion/image-ocr/latest/use-the-api.html), [NVIDIA OCR model access](https://build.nvidia.com/nvidia/nemotron-ocr-v1), [NVIDIA Lightning JSON mode](https://docs.nvidia.com/nim/large-language-models/2.0.10/get-started/advanced/get-started-nemotron-3.5-lightning.html), [NVIDIA queued-result polling](https://docs.api.nvidia.com/cloud-functions/reference/getfunctioninvocationresult), [Tesseract.js](https://github.com/naptha/tesseract.js), and [Vercel function limits](https://vercel.com/docs/functions/limitations).
