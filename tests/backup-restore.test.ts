import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { readProjectMigrationFiles } from "../scripts/migration-files.mjs";

it("restores a backup whose production migration history uses different line endings", async () => {
  const folder = mkdtempSync(join(tmpdir(), "warrantly-restore-test-"));
  const pg = new PGlite();
  try {
    const migrations = readProjectMigrationFiles({
      migrationsFolder: "./src/db/migrations/generated",
    });
    for (const migration of migrations)
      await pg.exec(migration.sql.join(";\n"));
    await pg.query("INSERT INTO app_users(id) VALUES('synthetic-backup-test')");
    const file = join(folder, "backup.json");
    writeFileSync(
      file,
      JSON.stringify({
        migrations,
        journal: migrations.map((migration) => ({
          hash: migration.compatibleHashes[1],
          created_at: migration.folderMillis,
        })),
        tables: { app_users: (await pg.query("SELECT * FROM app_users")).rows },
      }),
    );
    const output = execFileSync(
      process.execPath,
      ["scripts/verify-database-backup.mjs", file],
      { encoding: "utf8", timeout: 30000 },
    );
    expect(output).toContain(
      "Verified snapshot restore into isolated Postgres: 1 records",
    );
  } finally {
    await pg.close();
    rmSync(folder, { recursive: true, force: true });
  }
}, 30000);
