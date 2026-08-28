// @ts-expect-error Node 22 ships node:sqlite; the workspace @types/node version does not declare it yet.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMealPlanVersionSnapshot } from "@/lib/repositories/meal-plans";
import { splitSqlStatements } from "../scripts/migration-utils.mjs";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE meal_plans (id TEXT PRIMARY KEY);
    CREATE TABLE meal_plan_meals (id TEXT PRIMARY KEY, meal_plan_id TEXT NOT NULL, name TEXT NOT NULL, suggested_time TEXT, notes TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(meal_plan_id) REFERENCES meal_plans(id));
    CREATE TABLE meal_plan_items (id TEXT PRIMARY KEY, meal_id TEXT NOT NULL, food TEXT NOT NULL, quantity TEXT, unit TEXT, notes TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(meal_id) REFERENCES meal_plan_meals(id));`);
  for (const statement of splitSqlStatements(readFileSync("db/20260826_0069_meal_plan_flexible_structure.sql", "utf8"))) db.exec(statement);
  db.exec("INSERT INTO meal_plans(id) VALUES ('p1');");
  return db;
}

function insertStructuredPlan(db: DatabaseSync) {
  const now = "2026-08-26T00:00:00.000Z";
  db.prepare("INSERT INTO meal_plan_meals(id, meal_plan_id, name, meal_structure, sort_order, created_at, updated_at) VALUES (?, 'p1', ?, ?, ?, ?, ?)").run("options", "Café", "OPTIONS", 0, now, now);
  db.prepare("INSERT INTO meal_plan_meals(id, meal_plan_id, name, meal_structure, sort_order, created_at, updated_at) VALUES (?, 'p1', ?, ?, ?, ?, ?)").run("combo", "Almoço", "COMBINATION", 1, now, now);
  db.prepare("INSERT INTO meal_plan_meal_options(id, meal_id, label, sort_order, created_at, updated_at) VALUES (?, 'options', ?, ?, ?, ?)").run("o2", "Opção 2", 1, now, now);
  db.prepare("INSERT INTO meal_plan_meal_options(id, meal_id, label, sort_order, created_at, updated_at) VALUES (?, 'options', ?, ?, ?, ?)").run("o1", "Opção 1", 0, now, now);
  db.prepare("INSERT INTO meal_plan_choice_groups(id, meal_id, title, min_selections, max_selections, sort_order, created_at, updated_at) VALUES (?, 'combo', ?, ?, ?, ?, ?, ?)").run("protein", "Proteína", 1, 1, 0, now, now);
  db.prepare("INSERT INTO meal_plan_choice_groups(id, meal_id, title, min_selections, max_selections, sort_order, created_at, updated_at) VALUES (?, 'combo', ?, ?, ?, ?, ?, ?)").run("carb", "Carboidrato", 1, 2, 1, now, now);
  const insert = db.prepare("INSERT INTO meal_plan_items(id, meal_id, food, quantity, unit, meal_option_id, choice_group_id, is_optional, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  insert.run("fixed", "combo", "Salada", "100", "g", null, null, 1, 0, now, now);
  insert.run("oa", "options", "Ovo", "2", "un", "o1", null, 0, 0, now, now);
  insert.run("ob", "options", "Iogurte", "170", "g", "o2", null, 1, 0, now, now);
  insert.run("pa", "combo", "Frango", "120", "g", null, "protein", 0, 0, now, now);
  insert.run("ca", "combo", "Arroz", "100", "g", null, "carb", 0, 0, now, now);
}

describe("meal flexible structure SQLite roundtrip", () => {
  it("preserves OPTIONS, COMBINATION, fixed/optional items and order", () => {
    const db = database(); insertStructuredPlan(db);
    const options = db.prepare("SELECT label FROM meal_plan_meal_options WHERE meal_id = 'options' ORDER BY sort_order").all().map((r: { label: string }) => r.label);
    const groups = db.prepare("SELECT title, min_selections, max_selections FROM meal_plan_choice_groups WHERE meal_id = 'combo' ORDER BY sort_order").all();
    const items = db.prepare("SELECT food, quantity, unit, is_optional FROM meal_plan_items WHERE meal_id = 'combo' ORDER BY sort_order").all();
    expect(options).toEqual(["Opção 1", "Opção 2"]);
    expect(groups).toEqual([{ title: "Proteína", min_selections: 1, max_selections: 1 }, { title: "Carboidrato", min_selections: 1, max_selections: 2 }]);
    expect(items).toEqual([{ food: "Salada", quantity: "100", unit: "g", is_optional: 1 }, { food: "Frango", quantity: "120", unit: "g", is_optional: 0 }, { food: "Arroz", quantity: "100", unit: "g", is_optional: 0 }]);
  });

  it("cascades option/group removal without orphans", () => {
    const db = database(); insertStructuredPlan(db);
    db.exec("DELETE FROM meal_plan_meal_options WHERE id = 'o2'; DELETE FROM meal_plan_choice_groups WHERE id = 'carb';");
    expect(db.prepare("SELECT count(*) AS count FROM meal_plan_items WHERE meal_option_id = 'o2' OR choice_group_id = 'carb'").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT count(*) AS count FROM meal_plan_meal_options o LEFT JOIN meal_plan_meals m ON m.id = o.meal_id WHERE m.id IS NULL").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT count(*) AS count FROM meal_plan_choice_groups g LEFT JOIN meal_plan_meals m ON m.id = g.meal_id WHERE m.id IS NULL").get()).toEqual({ count: 0 });
  });

  it("keeps flexible fields in an immutable version snapshot", () => {
    const v1 = buildMealPlanVersionSnapshot({ title: "Plano", status: "active", meals: [{ name: "Café", meal_structure: "OPTIONS", items: [], options: [{ label: "Opção 1", items: [{ food: "Ovo", quantity: "2", unit: "un", is_optional: true }] }], choice_groups: [] }], substitutions: [], supplements: [] }, 1);
    const v2 = buildMealPlanVersionSnapshot({ title: "Plano", status: "draft", meals: [{ name: "Café", meal_structure: "OPTIONS", items: [], options: [{ label: "Opção rápida", items: [{ food: "Ovo", quantity: "3", unit: "un", is_optional: false }] }], choice_groups: [] }], substitutions: [], supplements: [] }, 2);
    expect(JSON.stringify(v1)).toContain("Opção 1");
    expect(JSON.stringify(v1)).toContain('"quantity":"2"');
    expect(JSON.stringify(v1)).not.toEqual(JSON.stringify(v2));
  });

  it("reads a pre-0069 meal as SIMPLE", () => {
    const db = database();
    db.exec("INSERT INTO meal_plan_meals(id, meal_plan_id, name, sort_order, created_at, updated_at) VALUES ('legacy', 'p1', 'Legado', 0, 'n', 'n')");
    expect(db.prepare("SELECT meal_structure FROM meal_plan_meals WHERE id = 'legacy'").get()).toEqual({ meal_structure: null });
  });
});
