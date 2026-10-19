import { createHash } from "node:crypto";
import { readMigrationFiles } from "drizzle-orm/migrator";

const breakpoint = "--> statement-breakpoint";
const hashSql = (sql) => createHash("sha256").update(sql).digest("hex");

export function readProjectMigrationFiles(config) {
  return readMigrationFiles(config).map((migration) => {
    // Git's Windows checkout can convert LF to CRLF without changing the SQL.
    const sql = migration.sql.join(breakpoint).replace(/\r\n/g, "\n");
    const hash = hashSql(sql);
    return {
      ...migration,
      sql: sql.split(breakpoint),
      hash,
      // Recognize history written by older Windows checkouts without rewriting it.
      compatibleHashes: [hash, hashSql(sql.replace(/\n/g, "\r\n"))],
    };
  });
}

export function matchesMigrationHistory(migration, row) {
  return (
    migration.folderMillis === Number(row.created_at) &&
    migration.compatibleHashes.includes(row.hash)
  );
}
