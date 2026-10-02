# Warrantly

Private bills, purchase documents and warranty dates. TanStack Start + React, Clerk Google sign-in, Neon Postgres, S3-compatible object storage, NVIDIA Nemotron OCR and structured LLM extraction, with local Tesseract fallback.

## Current workflow

1. Sign in, then capture a photo or choose a JPEG, PNG, WebP or PDF (15 MB, up to 10 pages).
2. Upload the original directly to private storage using a short-lived signed URL. The server validates the stored size, media type and signature, then copies it to a separate private original key.
3. The browser preserves embedded text in digital PDFs, avoiding OCR corruption of invoice numbers. Sparse-text pages, scans and photos are rendered with PDF.js and sent to NVIDIA OCR. PDF decoder/font assets ship with the app. If NVIDIA rejects, times out, returns no text or average confidence below 85%, Tesseract.js attempts English OCR locally in the browser. Its worker is bundled; its pinned core and English language data download on first use. It does not send the image to a Tesseract service.
4. The server sends OCR text to `nvidia/nemotron-3.5-lightning-30b-a3b` for JSON field extraction. Suggestions need matching source quotes and pass schema validation. Numeric dates are parsed day-first from the quote; serial/barcode identifiers retain leading zeroes. Neither NVIDIA key reaches the browser.
5. Review the original, raw OCR text and editable bill fields. Unknown facts stay blank. Confirm the name, retailer, invoice, serial/IMEI, model, barcode, price, currency, dates and warranty/return terms, then save.
6. Saved bills populate Today, Vault, search/filter results and item details. You can edit, download the original, or delete a bill. No sample records are inserted or displayed.
7. Assistant chat uses NVIDIA with the signed-in user's saved bill fields, and links back to supporting bills. Select one bill or ask across the latest 50. Chat is ephemeral; it does not send requests to sellers or change records. The separate support-draft tab remains available.

Failed/incomplete OCR remains a private draft. Successful pages and successful AI extraction are reused on retry. Missing/failed AI extraction falls back to explicit text labels with a review warning, never fabricated output. Saving is retry-safe and updates the bill, document link and reminder schedule together.

## Local development

Use Node.js 22.12+ or 24 and npm. Add credentials to the ignored `.env` using `.env.example` as the variable reference.

```sh
npm ci
npm run db:migrate
npm run dev -- --host 127.0.0.1 --port 3000
```

Only `VITE_CLERK_PUBLISHABLE_KEY` is browser-visible. Never prefix a secret with `VITE_`. Never commit `.env` or real credentials in `.env.example`.

| Variable | Purpose |
| --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk public application key, needed at build time |
| `CLERK_SECRET_KEY` | Server session verification |
| `APP_BASE_URL` | Exact deployed origin, or local URL |
| `DATABASE_URL` | Neon Postgres connection used by the HTTP driver and migrations |
| `AWS_ENDPOINT_URL_S3` | S3-compatible storage endpoint, including Neon storage |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Server-only storage credentials |
| `AWS_REGION`, `S3_BUCKET` | Private storage region and bucket |
| `NVIDIA_NEMOTRON_OCR_API_KEY` | Server-only NVIDIA OCR key |
| `NVIDIA_NEMOTRON_OCR_URL` | Optional endpoint override; defaults to hosted Nemotron OCR v1 |
| `NVIDIA_LLM_API_KEY` | Server-only NVIDIA key for structured field extraction and assistant chat |
| `NVIDIA_LLM_BASE_URL` | Defaults to `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_LLM_MODEL` | Defaults to `nvidia/nemotron-3.5-lightning-30b-a3b` |

`DATABASE_URL_POOLED`, `CLERK_WEBHOOK_SIGNING_SECRET` and `NEON_AI_GATEWAY_*` are reserved and are not used by this workflow. Local `.env` values do not populate Vercel: set both NVIDIA keys there separately and redeploy. Real bills used for debugging belong in the ignored `sample folder`, never `public` or committed test fixtures.

## Database and security

- Server operations derive account identity from Clerk, never request-supplied owner IDs. Bills, drafts, OCR pages, signed downloads, edits and deletes are owner-scoped.
- Shared tables have `user_id` ownership. Composite foreign keys reject cross-account document/item/page/reminder associations. This is server-enforced tenant isolation, not per-user tables or Postgres RLS; do not expose the database credentials or a direct SQL API to clients.
- Server-side Zod validation, positive sizes, decimal amounts, date checks, file signatures and upload/page limits bound input. An atomic 30-upload account window lasts 24 hours; deleting drafts does not reset it. Each NVIDIA OCR page and each document's AI extraction have up to three processing attempts. Atomic extraction claims prevent concurrent duplicate LLM calls.
- Originals stay private. Signed upload/download URLs expire after five minutes. Responses from the application server use `private, no-store`.
- Assistant context is loaded server-side with the Clerk user ID. Only whitelisted purchase fields are sent, not owner IDs, notes, addresses, raw documents or credentials. Source IDs are checked against that context. Requests are limited atomically to 40 per rolling 24 hours and one every three seconds; failures count toward the limit. Client history is bounded and never accepted as system instructions. Migration `0003_assistant_limits` adds the counters without modifying bills.
- Uploading an original bypasses the Vercel function body limit; OCR requests contain one compressed page (under 2.5 million data-URL characters). Configure function execution time to at least 60 seconds for the 50-second OCR timeout plus database work.
- The server stores per-page OCR text and average confidence, plus AI source quotes/model/method in document metadata. Submitted edits are separate from raw results. Receipt text is untrusted prompt data, never system instructions. There is no browser-local document persistence in the production app; Tesseract caches only its language data.

Migrations use Neon HTTP transactions, not WebSockets. Run one migration process at a time, after taking a restorable backup or Neon branch. `db:migrate` checks the recorded migration hashes and applies each pending migration atomically. Never edit an already-applied migration.

For a legacy installation with original tables but no migration journal, `npm run db:migrate -- --repair-baseline` compares columns, indexes and constraints against an isolated Postgres reference. It can add missing original indexes/foreign keys and record the baseline. It refuses unexpected definitions rather than dropping or replacing data. This recovery needs dev dependencies installed.

## Deployment

Use Vercel's TanStack Start preset (`vercel.json`), with the repository root as the project root. Add the variables above to the correct Vercel environment and redeploy; the Clerk public key is bundled at build time. Apply database migrations separately before deploying code that uses new columns.

Keep Google as the only sign-in method in Clerk. Use the exact OAuth redirect URI supplied by the matching Clerk instance. Production Clerk keys, Google OAuth credentials and origins must refer to the same environment.

Storage must support HEAD, ranged GET, conditional CopyObject, PUT and DELETE. Configure bucket CORS for the exact deployed and local origins with PUT/GET/HEAD and Content-Type allowed; do not make the bucket public. Use a lifecycle policy to expire abandoned `users/*/pending/*` objects. Verify provider-specific lifecycle support before relying on it.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Unit/integration tests run the actual Drizzle queries and all migrations against isolated PGlite Postgres, with Clerk/storage/AI boundaries mocked. They check tenant isolation, database foreign keys, retry/save idempotency, quotas, evidence validation, day-first dates and provider failures. Browser tests use production screen components through a separate test-only Vite config and require Chrome installed. They cover desktop/mobile upload, PDF rendering, camera denial/capture/cleanup, review, editing, filtering, deletion and actual Tesseract recognition of a generated test receipt. Tesseract tests need network access for model assets. Test doubles and fixtures never enter the app route tree or production service imports.

## Scope and launch gates

- Nemotron OCR reads text; the text-only Lightning LLM maps it into receipt fields. Source-quote checks reduce unsupported suggestions but do not prove that a model chose the correct amount or identifier: review remains mandatory. Currency defaults to INR if none is recognized. Numeric dates prefer day/month/year. Barcode text is captured when readable; barcode symbol decoding is not implemented. Local Tesseract currently uses English language data.
- A bill represents one saved record/total. Multi-page originals and all extracted text are retained, but separate line-item records are not created automatically. For bundles containing product and service invoices, extraction targets the product invoice and warns that separate fees are excluded. Verify this selection before saving.
- Reminders are in-app notices on Today. No email/push worker is enabled. Support requests are editable templates using real bill details; they are not sent automatically and do not invent support contacts.
- Validate the live NVIDIA account, endpoint access, response size, latency and extraction accuracy with representative bills after adding its key. Hosted evaluation endpoints are not a production SLA. Provider failures/timeouts remain editable drafts.
- Before public launch: rotate any previously shared secrets, restrict storage CORS, configure backups and retention, add account deletion/export and a Clerk deletion webhook, verify privacy/consent for sending document pages to NVIDIA, add durable background jobs/orphan-file reconciliation, enforce project-wide OCR spending limits, monitor errors, and complete a two-account live smoke test. Large vaults also need server pagination.

Primary integration references: [NVIDIA OCR request/response contract](https://docs.nvidia.com/nim/ingestion/image-ocr/latest/use-the-api.html), [NVIDIA OCR model access](https://build.nvidia.com/nvidia/nemotron-ocr-v1), [NVIDIA Lightning JSON mode](https://docs.nvidia.com/nim/large-language-models/2.0.10/get-started/advanced/get-started-nemotron-3.5-lightning.html), [NVIDIA queued-result polling](https://docs.api.nvidia.com/cloud-functions/reference/getfunctioninvocationresult), [Tesseract.js](https://github.com/naptha/tesseract.js), and [Vercel function limits](https://vercel.com/docs/functions/limitations).
