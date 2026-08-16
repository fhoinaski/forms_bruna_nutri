import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("USDA full allowlist staging guard", () => {
  it("recusa config que nao aponta para o staging exato", () => {
    const dir = mkdtempSync(join(tmpdir(), "usda-full-staging-guard-"));
    tempDirs.push(dir);
    const config = join(dir, "d1-config.json");
    const allowlist = join(dir, "allowlist.json");
    const fakeDb = join(dir, "v3.sqlite");
    writeFileSync(config, JSON.stringify({
      environment: "staging",
      database_name: "forms_bruna_nutri",
      database_id: "88baf58a-dea4-4fa8-98c4-a220ae5dbf55",
    }));
    writeFileSync(allowlist, JSON.stringify({ version: "USDA_ALLOWLIST_V1", entries: [] }));
    writeFileSync(fakeDb, "");

    expect(() => execFileSync("node", [
      "scripts/usda-full-allowlist-staging.mjs",
      "--config", config,
      "--allowlist", allowlist,
      "--db", fakeDb,
      "--expected-database-name", "forms_bruna_nutri_staging",
      "--expected-database-id", "88baf58a-dea4-4fa8-98c4-a220ae5dbf55",
    ], { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" })).toThrow(/REFUSE_IMPORT/);
  });

  it("recusa producao sem approved_imports versionado", () => {
    const dir = mkdtempSync(join(tmpdir(), "usda-full-production-guard-"));
    tempDirs.push(dir);
    const config = join(dir, "d1-config.json");
    const allowlist = join(dir, "allowlist.json");
    const fakeDb = join(dir, "v3.sqlite");
    writeFileSync(config, JSON.stringify({
      environment: "production",
      database_name: "forms_bruna_nutri",
      database_id: "prod-id",
    }));
    writeFileSync(allowlist, JSON.stringify({ version: "USDA_ALLOWLIST_V1", entries: [] }));
    writeFileSync(fakeDb, "");

    expect(() => execFileSync("node", [
      "scripts/usda-full-allowlist-staging.mjs",
      "--config", config,
      "--allowlist", allowlist,
      "--db", fakeDb,
      "--expected-database-name", "forms_bruna_nutri",
      "--expected-database-id", "prod-id",
    ], { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" })).toThrow(/approved_imports/);
  });
});
