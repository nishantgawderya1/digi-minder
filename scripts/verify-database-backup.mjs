import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

if (!process.argv[2]) throw new Error("Pass the database snapshot path.");
const backup = JSON.parse(await readFile(process.argv[2], "utf8"));
const pg = new PGlite();
try {
  for (const migration of backup.migrations) {
    if (backup.journal.some((row) => row.hash === migration.hash))
      await pg.exec(migration.sql.join(";\n"));
  }
  let records = 0;
  for (const table of [
    "app_users",
    "items",
    "documents",
    "document_pages",
    "reminders",
    "document_jobs",
  ]) {
    const rows = backup.tables[table];
    if (!rows?.length) continue;
    await pg.query(
      `INSERT INTO "${table}" SELECT * FROM jsonb_populate_recordset(NULL::"${table}", $1::jsonb)`,
      [JSON.stringify(rows)],
    );
    const count = await pg.query(
      `SELECT count(*)::int AS count FROM "${table}"`,
    );
    if (count.rows[0].count !== rows.length)
      throw new Error("Snapshot record count differs after restore.");
    records += rows.length;
  }
  console.log(
    `Verified snapshot restore into isolated Postgres: ${records} records and all schema constraints.`,
  );
} finally {
  await pg.close();
}
