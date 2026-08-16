import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("USDA staging benchmark safety guard", () => {
  it("recusa import quando config nao e staging", () => {
    const dir = mkdtempSync(join(tmpdir(), "usda-staging-guard-"));
    tempDirs.push(dir);
    const config = join(dir, "d1-config.json");
    const allowlist = join(dir, "allowlist.json");
    const fakeDb = join(dir, "v3.sqlite");
    writeFileSync(config, JSON.stringify({
      environment: "production",
      database_name: "forms_bruna_nutri",
      database_id: "prod-id",
    }));
    writeFileSync(allowlist, JSON.stringify({ entries: [] }));
    writeFileSync(fakeDb, "");

    expect(() => execFileSync("node", [
      "scripts/usda-staging-benchmark.mjs",
      "--config", config,
      "--allowlist", allowlist,
      "--db", fakeDb,
      "--expected-database-name", "forms_bruna_nutri_staging",
    ], { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" })).toThrow(/REFUSE_IMPORT/);
  });
});
