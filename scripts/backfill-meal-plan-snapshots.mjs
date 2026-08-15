// Backfill do P1-A (integraca o de snapshots/versionamento do plano alimentar).
//
// Parte A: para cada meal_plan_item ANTIGO com vinculo (food_source/food_ref_id)
//          ainda sem nutrition_snapshot, congela nome+composicao por 100g.
// Parte B: para cada meal_plan existente SEM historico, cria a versao inicial V1
//          (snapshot cifrado do estado atual).
//
// Modos:
//   (default)  dry-run: apenas conta, NUNCA escreve.
//   --apply    escreve (idempotente).
//
// Regras: unresolved NAO vira 0 (preserva legado, fallback continua);
//         so cria snapshot com referencia confiavel; nunca loga plaintext/secret.
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveKey, encryptFieldValue } from "./lib/migrate-encrypted-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");

const MACRO_FIELDS = ["energia_kcal", "proteina_g", "carboidrato_g", "lipidios_g"];
const MICRO_FIELDS = ["fibra_g", "sodio_mg", "calcio_mg", "ferro_mg", "potassio_mg", "vitamina_c_mg"];

// --- env (mesmo padrao do backfill do prontuario) ---
const rawKeys = {};
function loadEnv() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const sep = line.indexOf("=");
    if (sep <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "");
    (rawKeys[key] ??= []).push(value);
  }
}
loadEnv();
for (const k of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_D1_API_TOKEN"]) {
  const vals = rawKeys[k] ?? [];
  if (vals.length) process.env[k] = vals[vals.length - 1];
}
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
const lastOf = (k) => { const d = [...new Set(rawKeys[k] ?? [])]; return d.length ? d[d.length - 1] : null; };

async function q(sql, params = []) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(params.length ? { sql, params } : { sql }),
  });
  const d = await r.json();
  const bad = d.result?.find((x) => !x.success);
  if (!r.ok || !d.success || bad) throw new Error(d.errors?.map((e) => e.message).join("; ") || "D1 fail");
  return d.result?.[0]?.results ?? [];
}

// --- coercao identica a lib/nutrition/taco.ts ---
function coerceTacoNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const n = value.trim().toLowerCase();
  if (!n || n === "na" || n === "tr") return 0;
  const parsed = Number(n.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}
function coerceTacoNumberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const n = value.trim().toLowerCase();
  if (!n || n === "na") return null;
  if (n === "tr") return 0;
  const parsed = Number(n.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function loadTacoReferences() {
  const taco = JSON.parse(readFileSync(join(root, "lib/nutrition/data/taco.json"), "utf8"));
  const comp = JSON.parse(readFileSync(join(root, "lib/nutrition/data/taco-complementar.json"), "utf8"));
  const rows = [];
  for (const file of [taco, comp]) {
    const list = Array.isArray(file) ? file : (file.alimentos ?? []);
    for (const row of list) {
      const ref = { descricao: row.descricao };
      for (const f of MACRO_FIELDS) ref[f] = coerceTacoNumber(row[f]);
      for (const f of MICRO_FIELDS) ref[f] = coerceTacoNumberOrNull(row[f]);
      rows.push({ numero: String(row.numero), ref });
    }
  }
  return new Map(rows.map((r) => [r.numero, r.ref]));
}

async function main() {
  if (!accountId || !databaseId || !apiToken) throw new Error("D1 creds ausentes.");
  const clinical = lastOf("CLINICAL_DATA_ENCRYPTION_KEY");
  const mfa = lastOf("MFA_ENCRYPTION_KEY");
  const auth = lastOf("AUTH_SECRET");
  if (!clinical) throw new Error("CLINICAL_DATA_ENCRYPTION_KEY ausente.");
  const currentPrimary = deriveKey(clinical);

  const tacoRefs = loadTacoReferences();
  const customRows = await q("SELECT id, name, brand, source, portion_base_grams, energy_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, sodium_mg, calcium_mg, iron_mg, potassium_mg, vitamin_c_mg FROM custom_foods");
  const customRefs = new Map();
  for (const row of customRows) {
    const factor = row.portion_base_grams > 0 ? 100 / row.portion_base_grams : 1;
    const scale = (v) => (v == null ? null : v * factor);
    customRefs.set(row.id, {
      descricao: row.brand ? `${row.name} (${row.brand})` : row.name,
      energia_kcal: scale(row.energy_kcal) ?? 0,
      proteina_g: scale(row.protein_g) ?? 0,
      carboidrato_g: scale(row.carbohydrate_g) ?? 0,
      lipidios_g: scale(row.fat_g) ?? 0,
      fibra_g: scale(row.fiber_g),
      sodio_mg: scale(row.sodium_mg),
      calcio_mg: scale(row.calcium_mg),
      ferro_mg: scale(row.iron_mg),
      potassio_mg: scale(row.potassium_mg),
      vitamina_c_mg: scale(row.vitamin_c_mg),
    });
  }

  // ---- Parte A: snapshots de itens ----
  const items = await q("SELECT id, food, food_source, food_ref_id, food_name_snapshot, nutrition_snapshot FROM meal_plan_items");
  let items_total = items.length;
  let snapshottable = 0, already_snapshot = 0, unresolved = 0, failed = 0, conflicts = 0;
  const itemWrites = [];
  for (const item of items) {
    if (!item.food_source || !item.food_ref_id) continue; // legado sem vinculo -> fallback
    if (item.nutrition_snapshot) { already_snapshot++; continue; }
    let ref = null;
    if (item.food_source === "TACO") ref = tacoRefs.get(String(item.food_ref_id)) ?? null;
    else if (item.food_source === "CUSTOM" || item.food_source === "MANUFACTURER") ref = customRefs.get(item.food_ref_id) ?? null;
    if (!ref) { unresolved++; continue; }
    snapshottable++;
    const snapshot = {};
    for (const f of MACRO_FIELDS) snapshot[f] = ref[f];
    for (const f of MICRO_FIELDS) snapshot[f] = ref[f] ?? null;
    itemWrites.push({ id: item.id, food_name_snapshot: ref.descricao, nutrition_snapshot: JSON.stringify(snapshot) });
  }
  if (apply) {
    for (const w of itemWrites) {
      try {
        await q("UPDATE meal_plan_items SET food_name_snapshot = ?1, nutrition_snapshot = ?2 WHERE id = ?3 AND nutrition_snapshot IS NULL", [w.food_name_snapshot, w.nutrition_snapshot, w.id]);
      } catch { failed++; }
    }
  }

  // ---- Parte B: versao V1 dos planos sem historico ----
  const plans = await q("SELECT id, client_id, title, status, version, notes, target_energy_kcal, target_protein_g, target_carbohydrate_g, target_fat_g FROM meal_plans");
  let plans_total = plans.length, plans_without_v1 = 0;
  const versionWrites = [];
  for (const plan of plans) {
    const existing = await q("SELECT 1 FROM meal_plan_versions WHERE meal_plan_id = ?1 AND version = 1", [plan.id]);
    if (existing.length) continue;
    plans_without_v1++;
    const meals = await q("SELECT id, name, suggested_time, notes, source_recipe_id FROM meal_plan_meals WHERE meal_plan_id = ?1 ORDER BY sort_order ASC", [plan.id]);
    const allItems = await q("SELECT id, meal_id, food, quantity, unit, notes, food_source, food_ref_id, household_measure_id, food_name_snapshot, nutrition_snapshot FROM meal_plan_items WHERE meal_id IN (SELECT id FROM meal_plan_meals WHERE meal_plan_id = ?1) ORDER BY sort_order ASC", [plan.id]);
    const weekly = await q("SELECT weekday, meal_type, title, notes, source_meal_id FROM meal_plan_weekly_slots WHERE meal_plan_id = ?1 ORDER BY sort_order ASC", [plan.id]);
    const subst = await q("SELECT base_food, option_food, quantity, unit, notes FROM meal_plan_substitutions WHERE meal_plan_id = ?1 ORDER BY sort_order ASC", [plan.id]);
    const suppl = await q("SELECT name, dosage, unit, instructions, notes FROM meal_plan_supplements WHERE meal_plan_id = ?1 ORDER BY sort_order ASC", [plan.id]);
    const itemsByMeal = new Map();
    for (const it of allItems) {
      if (!itemsByMeal.has(it.meal_id)) itemsByMeal.set(it.meal_id, []);
      itemsByMeal.get(it.meal_id).push(it);
    }
    const snapshot = {
      version: 1,
      title: plan.title,
      status: plan.status,
      notes: plan.notes ?? null,
      target_energy_kcal: plan.target_energy_kcal ?? null,
      target_protein_g: plan.target_protein_g ?? null,
      target_carbohydrate_g: plan.target_carbohydrate_g ?? null,
      target_fat_g: plan.target_fat_g ?? null,
      meals: meals.map((m) => ({
        name: m.name,
        suggested_time: m.suggested_time ?? null,
        notes: m.notes ?? null,
        source_recipe_id: m.source_recipe_id ?? null,
        items: (itemsByMeal.get(m.id) ?? []).map((it) => ({
          food: it.food,
          quantity: it.quantity ?? null,
          unit: it.unit ?? null,
          notes: it.notes ?? null,
          food_source: it.food_source ?? null,
          food_ref_id: it.food_ref_id ?? null,
          household_measure_id: it.household_measure_id ?? null,
          food_name_snapshot: it.food_name_snapshot ?? null,
          nutrition_snapshot: it.nutrition_snapshot ?? null,
        })),
      })),
      weekly_slots: weekly.map((w) => ({ weekday: w.weekday, meal_type: w.meal_type, title: w.title ?? null, notes: w.notes ?? null, source_meal_id: w.source_meal_id ?? null })),
      substitutions: subst.map((s) => ({ base_food: s.base_food, option_food: s.option_food, quantity: s.quantity ?? null, unit: s.unit ?? null, notes: s.notes ?? null })),
      supplements: suppl.map((s) => ({ name: s.name, dosage: s.dosage ?? null, unit: s.unit ?? null, instructions: s.instructions ?? null, notes: s.notes ?? null })),
    };
    versionWrites.push({ id: plan.id, client_id: plan.client_id, encrypted: encryptFieldValue(JSON.stringify(snapshot), currentPrimary) });
  }
  if (apply) {
    for (const w of versionWrites) {
      try {
        await q("INSERT OR IGNORE INTO meal_plan_versions (id, meal_plan_id, client_id, version, encrypted_snapshot, changed_by_admin_id, source, reason, created_at) VALUES (?1, ?2, ?3, 1, ?4, NULL, 'system', NULL, ?5)", [crypto.randomUUID(), w.id, w.client_id, w.encrypted, new Date().toISOString()]);
      } catch { failed++; }
    }
  }

  console.log(`[backfill] modo=${apply ? "apply" : "dry-run"}`);
  console.log(`[backfill] plans_total=${plans_total} plans_without_v1=${plans_without_v1}`);
  console.log(`[backfill] items_total=${items_total} snapshottable=${snapshottable} already_snapshot=${already_snapshot} unresolved=${unresolved} failed=${failed} conflicts=${conflicts}`);
  if (!apply) console.log("[backfill] DRY-RUN: nenhuma escrita realizada.");
}

main().catch((e) => { console.error("[backfill] Falha:", e.message); process.exit(1); });