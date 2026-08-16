import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const sqlite = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => any };

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const nutrientColumns = [
  "energy_kcal", "energy_kj", "protein_g", "carbohydrate_g", "sugars_g", "fat_g",
  "saturated_fat_g", "monounsaturated_fat_g", "polyunsaturated_fat_g", "trans_fat_g",
  "fiber_g", "sodium_mg", "calcium_mg", "iron_mg", "magnesium_mg", "phosphorus_mg",
  "potassium_mg", "zinc_mg", "copper_mg", "manganese_mg", "selenium_mcg",
  "vitamin_a_mcg", "vitamin_c_mg", "vitamin_d_mcg", "vitamin_e_mg", "vitamin_b1_mg",
  "vitamin_b2_mg", "vitamin_b3_mg", "vitamin_b6_mg", "vitamin_b12_mcg", "folate_mcg",
  "cholesterol_mg",
];

function createMiniV3(path: string) {
  const db = new sqlite.DatabaseSync(path);
  db.exec(`
    CREATE TABLE foods (
      id TEXT PRIMARY KEY,
      original_name TEXT,
      normalized_name TEXT,
      source TEXT,
      source_id TEXT,
      source_url TEXT,
      source_version TEXT,
      food_group TEXT,
      data_quality TEXT,
      is_branded INTEGER,
      is_recipe INTEGER
    );
    CREATE TABLE food_nutrients (
      food_id TEXT,
      basis TEXT,
      ${nutrientColumns.map((column) => `${column} REAL`).join(",\n      ")}
    );
    CREATE TABLE canonical_food_source_links (canonical_food_id TEXT, food_id TEXT);
    CREATE TABLE canonical_group_audits (canonical_food_id TEXT, risk_level TEXT, audit_status TEXT);
  `);
  const insertFood = db.prepare("INSERT INTO foods VALUES (?, ?, ?, 'USDA_SR_LEGACY', ?, 'https://fdc.nal.usda.gov/download-datasets', 'mini', ?, 'COMPLETE', 0, 0)");
  const placeholders = nutrientColumns.map(() => "?").join(", ");
  const insertNutrient = db.prepare(`INSERT INTO food_nutrients (food_id, basis, ${nutrientColumns.join(", ")}) VALUES (?, '100_g', ${placeholders})`);
  const names = [
    ["rice cooked", "Cereal Grains and Pasta"],
    ["beans cooked", "Legumes and Legume Products"],
    ["chicken roasted", "Poultry Products"],
    ["salmon raw", "Finfish and Shellfish Products"],
    ["egg whole raw", "Dairy and Egg Products"],
    ["milk whole", "Dairy and Egg Products"],
    ["apple raw", "Fruits and Fruit Juices"],
    ["spinach raw", "Vegetables and Vegetable Products"],
    ["potato baked", "Vegetables and Vegetable Products"],
    ["almond raw", "Nut and Seed Products"],
    ["chia seed", "Nut and Seed Products"],
    ["olive oil", "Fats and Oils"],
    ["coffee brewed", "Beverages"],
    ["vegetable soup prepared", "Soups, Sauces, and Gravies"],
  ];
  for (let index = 0; index < 360; index += 1) {
    const [base, group] = names[index % names.length];
    const id = `food-${index}`;
    const name = `${base} allowlist ${index}`;
    insertFood.run(id, name, name, String(200000 + index), group);
    insertNutrient.run(
      id,
      100 + index,
      400 + index,
      10 + index / 100,
      20 + index / 100,
      index % 3 === 0 ? 0 : 2,
      5 + index / 100,
      1,
      2,
      3,
      index % 5 === 0 ? null : 0,
      4,
      100,
      20,
      1,
      30,
      40,
      50,
      2,
      0.5,
      0.7,
      10,
      15,
      5,
      1,
      2,
      0.1,
      0.2,
      1.5,
      0.3,
      0,
      20,
      0
    );
  }
  db.close();
}

describe("USDA production allowlist script", () => {
  it("gera allowlist versionada, dry-run, idempotencia e rollback local", () => {
    const dir = mkdtempSync(join(tmpdir(), "usda-allowlist-"));
    tempDirs.push(dir);
    const v3 = join(dir, "mini-v3.sqlite");
    const allowlist = join(dir, "allowlist.json");
    const report = join(dir, "report.md");
    const benchmarkDb = join(dir, "benchmark.sqlite");
    createMiniV3(v3);

    const output = execFileSync("node", [
      "scripts/usda-production-allowlist.mjs",
      "--db", v3,
      "--target-size", "300",
      "--benchmark-size", "100",
      "--allowlist", allowlist,
      "--report", report,
      "--benchmark-db", benchmarkDb,
      "--batch-id", "USDA_ALLOWLIST_TEST",
    ], { cwd: process.cwd(), encoding: "utf8" });

    const result = JSON.parse(output.match(/\{[\s\S]*\}/)![0]);
    expect(result.version).toBe("USDA_ALLOWLIST_V1");
    expect(result.selected).toBeGreaterThan(100);
    expect(result.selected).toBeLessThanOrEqual(300);
    expect(result.dryRun.foods).toBe(result.selected);
    expect(result.benchmark.secondImport.createdFoods).toBe(0);
    expect(result.benchmark.secondImport.createdNutrients).toBe(0);
    expect(result.benchmark.rollback.afterFoods).toBe(0);
    expect(result.benchmark.rollback.orphanNutrientsAfterRollback).toBe(0);

    const json = JSON.parse(readFileSync(allowlist, "utf8"));
    expect(json.version).toBe("USDA_ALLOWLIST_V1");
    expect(json.entries[0]).toMatchObject({ version: "USDA_ALLOWLIST_V1", source_id: expect.stringMatching(/^USDA_SR_LEGACY:/) });
    expect(readFileSync(report, "utf8")).toContain("GO_WITH_INDEX/CACHE");
  }, 30_000);
});
