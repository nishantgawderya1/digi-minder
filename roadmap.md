# Warrantly Roadmap

## Implemented

- [x] Existing mobile/desktop Warrantly design retained.
- [x] Compact Home bill action, no duplicate Assistant shortcut, and direct unfinished-bill review links.
- [x] Clerk-protected routes with server-derived account identity.
- [x] Real Neon-backed Today, Vault, bill details and support drafts; demo data removed.
- [x] Private original-image/PDF upload, content validation and expiring downloads.
- [x] Camera permission handling, capture and stream cleanup.
- [x] Multi-page PDF rasterization and server-only NVIDIA OCR integration.
- [x] Editable review: bill name, retailer, invoice, serial/IMEI, model, barcode, amount, currency, purchase date, warranty/return dates, notes and reminder offsets.
- [x] Raw OCR text, confidence, saved drafts, partial-page recovery and bounded retries.
- [x] Idempotent save, edit, delete, account isolation and composite tenant foreign keys.
- [x] Real statistics, category/status/search filters and in-app deadline reminders.
- [x] Atomic per-account upload quota, migration recovery and test suites.
- [x] NVIDIA LLM field mapping with source quotes, schema validation and day-first dates.
- [x] Local Tesseract fallback, actionable provider errors and queued OCR polling.
- [x] Shared server/browser Tesseract deskewing and bounded adaptive-threshold/layout retry, with higher-resolution lossless OCR inputs where size limits allow.
- [x] Digital PDF text preservation and bundled PDF decoder/font assets; low-confidence OCR retries locally.
- [x] NVIDIA assistant chat scoped to saved bills, verified source links, bounded context and atomic account quotas.
- [x] Inngest background OCR, per-page durable steps, database outbox recovery, server PDF rendering and Tesseract fallback.
- [x] Autosaved review corrections, optimistic revision checks, field source quotes/page numbers and calculated-date labels.
- [x] Opt-in verified-email reminders with timezone/hour preferences, snooze/dismiss, delivery leases and idempotent retries.
- [x] Live NVIDIA OCR/extraction and four assistant questions checked against a user-supplied bill, plus desktop/mobile UI tests and actual Tesseract recognition.

## Next validation

1. Configure NVIDIA credentials in the correct Vercel environment; the existing OCR key also supports extraction/chat at the default NVIDIA endpoint. Redeploy after changes. Add Inngest event/signing keys and sync `/api/inngest` for durable jobs; keep `INNGEST_DEV` disabled in production. Without hosted jobs, uploads automatically read in the browser. Add Resend verified-domain credentials before enabling email delivery.
2. Test photos and multi-page PDFs from representative real bills. Review missing fields and extraction accuracy; never silently fill gaps.
3. Run an authenticated two-account smoke test against the deployed environment, including upload, review, save, reload, signed download, edit and delete.
4. Verify camera capture in mobile Safari on HTTPS and confirm storage CORS for all deployed origins.

## Extraction quality plan

Observed on the supplied bill: the product name populated from embedded PDF text. On a rasterized goods page, Tesseract read the product description, but the LLM returned a full name with a quote containing only its first line. The existing validator correctly rejected the unsupported remainder. Require the name's evidence to cover the complete value (including wrapped source text); repair the evidence/field mismatch rather than weakening validation. NVIDIA's low-confidence response correctly triggered Tesseract fallback. This is a single debugging case, not an accuracy benchmark.

- [x] Add a live evaluation command with six synthetic cases and private text/page/PDF/image manifest support. Report exact field matches, name coverage, false name autofills and latency. Keep real originals out of Git. Label fallback is reported, not counted as a passing AI response.
- [x] Send structured pages without flattening table rows. Detected separate invoices require page selection with one invoice ID; field evidence is restricted to that scope. Unclear selection stays blank with a review warning.
- [x] Validate ordered literal product-name fragments from a complete source block. Keep the raw product description separately from its joined display name. Product counts/ambiguity prevent automatically selecting an individual product when the model flags multiple items.
- [x] Store missing/absent/ambiguous/unreadable/rejected field diagnostics and show specific name guidance in review. Add one scoped name-repair request without replacing verified values or user corrections. Charge every actual request against the existing atomic document budget, including failures. Older extraction versions can be upgraded within remaining budget.
- [x] Add an opt-in 512-token reasoning budget for repair only and an identical-baseline comparison command. The hosted endpoint uses `reasoning_budget`, not the self-hosted NIM `thinking_token_budget`; keep thinking off by default until evaluation supports enabling it. [Hosted NVIDIA parameter reference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-5-lightning-30b-a3b-infer).

Live checks during development populated a product name from the supplied digital PDF and recovered a name through Tesseract plus targeted repair. Exact descriptions and other field coverage still vary; some calls timed out and unsupported quotes correctly stayed blank. This is not a representative accuracy benchmark. Expand the private evaluation set before launch, and do not disable evidence validation to improve fill rates.

In one controlled wrapped-name comparison, standard repair populated the exact expected name in about 2.6 seconds; 512-token thinking failed to produce a usable repair in about 12.5 seconds. The hosted reasoning parameter separately returned HTTP 200. This single case supports keeping thinking off, not a general performance claim. Local validation also rejects table headers, unreadable placeholders, party-only labels and unsupported order/SKU-as-serial suggestions.

Still pending: separate line-item records and an invoice/item selection UI, broader real-bill accuracy testing, and project-wide spending limits. The application still saves one record/total per bill; OCR confidence and passing tests do not establish general accuracy.

## Before public launch

- Production Clerk/Google configuration and rotation of previously shared secrets.
- Monitoring, backup/restore drills, storage lifecycle rules and orphan-object cleanup.
- Account export/deletion, verified Clerk deletion webhook and document-processing consent/privacy policy.
- Project-wide OCR quotas and database pagination for large vaults.
- Production OCR capacity and latency testing; do not depend on an evaluation endpoint's availability.
- Validate real email delivery after configuring Resend and hosted Inngest. Push notifications and verified support-contact lookup remain unimplemented.
