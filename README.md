# Warranty Whisperer

I want to create a reminder agent, a full-stack web app, maybe. The primary use case will be for mobiles, where anybody can just upload his bills and his warranty or guarantee card for any electronic item or any item. The app will be exporting all the details from that warranty card. It will use an OCR tool and store it in memory.

Later on, there will be a knowledge base created for all the information of the person, all the warranty cards, his bills, and everything. Whenever an issue arises with the electronic machine, let's say it was a washing machine with a 6-month warranty and an issue arrived in the 4th month, the person can just type into the AI agent. It will fetch all the information and the contact details of whom the thing is to be escalated to, and automatically draft the message. It will email the person and get the support team's feedback.

This is what I just want from you:

- A super clean, modern-looking frontend design of the main landing website

- Authentication

- The main dashboard and how the AI agent will look

- How the OCR tool will look

- Any additional feature that can be added to this

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Application Stack

- Auth: Clerk sessions, configured for Google sign-in only in the Clerk Dashboard.
- Database: Neon Postgres with Drizzle schema and migrations. User-owned rows carry the Clerk user ID; server operations derive it from the verified session.
- OCR: Nvidia Nemotron OCR for extracting fields from bills, invoices, warranty cards and uploaded PDFs.
- Files: Original document bytes need a dedicated private object-storage provider. Postgres stores metadata and OCR results, not large file blobs.

Copy `.env.example` to `.env` and add your Clerk and Neon credentials. Keep `.env` out of version control. Apply the schema with `npm run db:generate` and `npm run db:migrate` after installing dependencies and setting `DATABASE_URL`.

For Google-only access, enable Google as a social connection in Clerk and disable other sign-in methods in the Clerk Dashboard. The app displays the providers enabled there.
