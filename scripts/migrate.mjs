import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const client = neon(process.env.DATABASE_URL);
const migrations = readMigrationFiles({
  migrationsFolder: "./src/db/migrations/generated",
});
await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
await client.query(
  "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)",
);
let applied = await client.query(
  "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at",
);
const tables = ["app_users", "documents", "items", "reminders"];
const existing = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)",
  [tables],
);

if (!applied.length && existing.length) {
  if (!process.argv.includes("--repair-baseline"))
    throw new Error(
      "Existing tables have no migration history. Back up the database, then run npm run db:migrate -- --repair-baseline to validate and complete the original baseline.",
    );
  const { PGlite } = await import("@electric-sql/pglite");
  const reference = new PGlite();
  try {
    await reference.exec(migrations[0].sql.join(";\n"));
    const columnQuery =
      "SELECT table_name,column_name,data_type,is_nullable,column_default,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1) ORDER BY table_name,ordinal_position";
    const expectedColumns = (await reference.query(columnQuery, [tables])).rows;
    const actualColumns = await client.query(columnQuery, [tables]);
    if (JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns))
      throw new Error(
        "Existing columns differ from migration 0000. No baseline changes were made.",
      );
    const constraintQuery =
      "SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype <> 'n' AND conrelid IN (SELECT oid FROM pg_class WHERE relname = ANY($1)) ORDER BY conname";
    const indexQuery =
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename = ANY($1) ORDER BY indexname";
    const expectedConstraints = (
      await reference.query(constraintQuery, [tables])
    ).rows;
    const actualConstraints = await client.query(constraintQuery, [tables]);
    const expectedIndexes = (await reference.query(indexQuery, [tables])).rows;
    const actualIndexes = await client.query(indexQuery, [tables]);
    for (const [actual, expected, key] of [
      [actualConstraints, expectedConstraints, "conname"],
      [actualIndexes, expectedIndexes, "indexname"],
    ]) {
      for (const entry of actual) {
        const match = expected.find((value) => value[key] === entry[key]);
        if (JSON.stringify(match) !== JSON.stringify(entry))
          throw new Error(
            `Existing definition differs from baseline: ${entry[key]}. No changes were made.`,
          );
      }
    }
    const missing = new Set([
      ...expectedConstraints
        .filter(
          (entry) =>
            !actualConstraints.some((value) => value.conname === entry.conname),
        )
        .map((entry) => entry.conname),
      ...expectedIndexes
        .filter(
          (entry) =>
            !actualIndexes.some((value) => value.indexname === entry.indexname),
        )
        .map((entry) => entry.indexname),
    ]);
    const repairs = [];
    for (const statement of migrations[0].sql) {
      const name =
        statement.match(/^\s*CREATE (?:UNIQUE )?INDEX "([^"]+)"/)?.[1] ??
        statement.match(
          /^\s*ALTER TABLE "[^"]+" ADD CONSTRAINT "([^"]+)"/,
        )?.[1];
      if (name && missing.delete(name)) repairs.push(statement);
    }
    if (missing.size)
      throw new Error(
        "Baseline is missing table constraints that require manual review. No changes were made.",
      );
    await client.transaction([
      ...repairs.map((statement) => client.query(statement)),
      client.query(
        "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)",
        [migrations[0].hash, migrations[0].folderMillis],
      ),
    ]);
    console.log(
      `Validated baseline and restored ${repairs.length} missing indexes/constraints. Existing records preserved.`,
    );
    applied = [
      { hash: migrations[0].hash, created_at: migrations[0].folderMillis },
    ];
  } finally {
    await reference.close();
  }
}

for (const row of applied) {
  if (
    !migrations.some(
      (migration) =>
        migration.hash === row.hash &&
        migration.folderMillis === Number(row.created_at),
    )
  )
    throw new Error(
      "Migration history does not match the checked-in files. Refusing to continue.",
    );
}
for (const migration of migrations) {
  if (applied.some((row) => row.hash === migration.hash)) continue;
  await client.transaction([
    ...migration.sql
      .filter((statement) => statement.trim())
      .map((statement) => client.query(statement)),
    client.query(
      "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)",
      [migration.hash, migration.folderMillis],
    ),
  ]);
  console.log(`Applied migration ${migration.folderMillis} atomically.`);
}
console.log("Database migrations are up to date.");
