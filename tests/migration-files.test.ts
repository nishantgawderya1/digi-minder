import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  matchesMigrationHistory,
  readProjectMigrationFiles,
} from "../scripts/migration-files.mjs";

const directories: string[] = [];
const timestamp = 1700000000000;
const sql =
  'CREATE TABLE "sample" (\n  "id" integer PRIMARY KEY\n);\n--> statement-breakpoint\nCREATE INDEX "sample_id" ON "sample" ("id");\n';
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function readFixture(content: string) {
  const folder = mkdtempSync(join(tmpdir(), "warrantly-migrations-"));
  directories.push(folder);
  mkdirSync(join(folder, "meta"));
  writeFileSync(
    join(folder, "meta", "_journal.json"),
    JSON.stringify({
      entries: [{ tag: "0000_sample", when: timestamp, breakpoints: true }],
    }),
  );
  writeFileSync(join(folder, "0000_sample.sql"), content);
  return readProjectMigrationFiles({ migrationsFolder: folder })[0];
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("migration history across platforms", () => {
  it("uses the original LF checksum and SQL for LF and CRLF checkouts", () => {
    const linux = readFixture(sql);
    const windows = readFixture(sql.replace(/\n/g, "\r\n"));
    expect(windows.hash).toBe(hash(sql));
    expect(windows).toEqual(linux);
    expect(windows.sql).toHaveLength(2);
  });

  it("recognizes existing CRLF migration history on an LF checkout", () => {
    const migration = readFixture(sql);
    expect(
      matchesMigrationHistory(migration, {
        hash: hash(sql.replace(/\n/g, "\r\n")),
        created_at: String(timestamp),
      }),
    ).toBe(true);
  });

  it("rejects SQL changes and timestamp mismatches", () => {
    const migration = readFixture(sql);
    expect(
      matchesMigrationHistory(migration, {
        hash: hash(sql.replace("PRIMARY KEY", "NOT NULL")),
        created_at: timestamp,
      }),
    ).toBe(false);
    expect(
      matchesMigrationHistory(migration, {
        hash: hash(sql),
        created_at: timestamp + 1,
      }),
    ).toBe(false);
  });
});
