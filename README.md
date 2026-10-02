# Warrantly

Private bills, purchase documents and warranty dates. TanStack Start + React, Clerk Google sign-in, Neon Postgres, S3-compatible object storage and NVIDIA Nemotron OCR.

## Current workflow

1. Sign in, then capture a photo or choose a JPEG, PNG, WebP or PDF (15 MB, up to 10 pages).
2. Upload the original directly to private storage using a short-lived signed URL. The server validates the stored size, media type and signature, then copies it to a separate private original key.
3. The browser renders PDFs one page at a time using PDF.js. The server sends the page image to NVIDIA, stores text and confidence, and extracts labelled bill fields. The API key never reaches the browser.
4. Review the original, raw OCR text and editable bill fields. Unknown facts stay blank. Confirm the name, retailer, invoice, serial/IMEI, model, barcode, price, currency, dates and warranty/return terms, then save.
5. Saved bills populate Today, Vault, search/filter results and item details. You can edit, download the original, or delete a bill. No sample records are inserted or displayed.

Failed/incomplete OCR remains a private draft. Successful pages are reused on retry. A missing OCR key does not create fake output: the user can enter details manually. Saving is retry-safe and updates the bill, document link and reminder schedule together.

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

`DATABASE_URL_POOLED`, `CLERK_WEBHOOK_SIGNING_SECRET` and `NEON_AI_GATEWAY_*` are reserved and are not used by this workflow. No LLM gateway key is needed for OCR or the current support-request template.

## Database and security

- Server operations derive account identity from Clerk, never request-supplied owner IDs. Bills, drafts, OCR pages, signed downloads, edits and deletes are owner-scoped.
- Shared tables have `user_id` ownership. Composite foreign keys reject cross-account document/item/page/reminder associations. This is server-enforced tenant isolation, not per-user tables or Postgres RLS; do not expose the database credentials or a direct SQL API to clients.
- Server-side Zod validation, positive sizes, decimal amounts, date checks, file signatures and upload/page limits bound input. An atomic 30-upload account window lasts 24 hours; deleting drafts does not reset it. Each OCR page has up to three processing attempts.
- Originals stay private. Signed upload/download URLs expire after five minutes. Responses from the application server use `private, no-store`.
- Uploading an original bypasses the Vercel function body limit; OCR requests contain one compressed page (under 2.5 million data-URL characters). Configure function execution time to at least 60 seconds for the 50-second OCR timeout plus database work.
- The server stores full per-page OCR text and average confidence. Submitted edits are separate from those raw results. There is no browser-local document persistence in the production app.

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

Unit/integration tests run the actual Drizzle queries and all migrations against isolated PGlite Postgres, with only Clerk/storage/OCR boundaries mocked. They check tenant isolation, database foreign keys, retry/save idempotency, quotas, parsing and validation. Browser tests use the production screen components through a separate test-only Vite config and require Chrome installed. They cover desktop/mobile upload, PDF rendering, camera denial/capture/cleanup, review, editing, filtering and deletion. Test doubles and fixtures never enter the app route tree or production service imports.

## Scope and launch gates

- Nemotron provides text detection, not semantic receipt JSON. The parser only extracts explicit labels; unusual/table-based invoices may need manual entry. Currency defaults to INR if none is recognized. Numeric dates prefer day/month/year. Review is mandatory. Barcode text is captured when labelled/readable; barcode symbol decoding is not implemented.
- A bill represents one saved record/total. Multi-page originals and all extracted text are retained, but separate line-item records are not created automatically.
- Reminders are in-app notices on Today. No email/push worker is enabled. Support requests are editable templates using real bill details; they are not sent automatically and do not invent support contacts.
- Validate the live NVIDIA account, endpoint access, response size, latency and extraction accuracy with representative bills after adding its key. Hosted evaluation endpoints are not a production SLA. Provider failures/timeouts remain editable drafts.
- Before public launch: rotate any previously shared secrets, restrict storage CORS, configure backups and retention, add account deletion/export and a Clerk deletion webhook, verify privacy/consent for sending document pages to NVIDIA, add durable background jobs/orphan-file reconciliation, enforce project-wide OCR spending limits, monitor errors, and complete a two-account live smoke test. Large vaults also need server pagination.

Primary integration references: [NVIDIA OCR request/response contract](https://docs.nvidia.com/nim/ingestion/image-ocr/latest/use-the-api.html), [NVIDIA OCR model access](https://build.nvidia.com/nvidia/nemotron-ocr-v1), and [Vercel function limits](https://vercel.com/docs/functions/limitations).
