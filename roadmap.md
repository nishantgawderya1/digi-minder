# Warrantly Roadmap

## Implemented

- [x] Existing mobile/desktop Warrantly design retained.
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

## Before public launch

- Production Clerk/Google configuration and rotation of previously shared secrets.
- Monitoring, backup/restore drills, storage lifecycle rules and orphan-object cleanup.
- Account export/deletion, verified Clerk deletion webhook and document-processing consent/privacy policy.
- Project-wide OCR quotas and database pagination for large vaults.
- Production OCR capacity and latency testing; do not depend on an evaluation endpoint's availability.
- Validate real email delivery after configuring Resend and hosted Inngest. Push notifications and verified support-contact lookup remain unimplemented.
