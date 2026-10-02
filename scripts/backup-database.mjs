import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const sql = neon(process.env.DATABASE_URL);
const tables = await sql.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('app_users','documents','document_pages','items','reminders','document_jobs') ORDER BY table_name",
);
const snapshot = await sql.transaction(
  [
    ...tables.map(({ table_name }) =>
      sql.query(
        `SELECT coalesce(jsonb_agg(t),'[]'::jsonb) AS rows FROM "${table_name}" t`,
      ),
    ),
    sql.query(
      "SELECT coalesce(jsonb_agg(t),'[]'::jsonb) AS rows FROM drizzle.__drizzle_migrations t",
    ),
  ],
  { isolationLevel: "RepeatableRead", readOnly: true },
);
const folder = await mkdtemp(join(tmpdir(), "warrantly-db-backup-"));
const file = join(folder, "database.json");
await writeFile(
  file,
  JSON.stringify(
    {
      version: 1,
      createdAt: new Date().toISOString(),
      tables: Object.fromEntries(
        tables.map((row, index) => [row.table_name, snapshot[index][0].rows]),
      ),
      journal: snapshot.at(-1)[0].rows,
      migrations: readMigrationFiles({
        migrationsFolder: "./src/db/migrations/generated",
      }),
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(`Database snapshot saved privately to ${file}`);
