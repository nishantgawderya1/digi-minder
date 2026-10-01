# Roadmap

Scope (current): Clerk Google sign-in, Neon Postgres backend, and Nvidia Nemotron OCR. Document-file storage provider is still undecided.

## Done
- [x] Mobile-first design system: Paper & Signal palette, Outfit + Figtree, square-ish utility styling
- [x] Landing screen (/)
- [x] Sign in / create account screen (/auth)
- [x] Today dashboard (/home)
- [x] Scan + review document screen (/scan)
- [x] Assistant chat with draft-email card (/agent)
- [x] Vault list with filters (/vault)
- [x] Item detail with docs + escalation contacts (/item/$itemId)
- [x] Clerk server middleware and sign-in component
- [x] Protected app routes and session-derived owner identity
- [x] Neon/Drizzle schema for users, items, documents, OCR data and reminders
- [x] Initial owner-scoped item list/create server functions

## Not started
- Configure Clerk keys and enable Google only in the Clerk Dashboard
- Run generated migrations against the Neon development database
- Replace remaining demo screens with Neon-backed records
- Choose private document object storage and implement upload/download access
- Nvidia Nemotron OCR extraction, review and persistence workflow
- Reminder delivery, AI replies and email sending
- Account deletion webhook, audit logging, rate limits and production monitoring
