#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// lib/d1/client.ts le process.env no momento do import (top-level) — carregar
// .env.local antes de qualquer import de "@/lib/d1/client", mesmo padrao de
// scripts/canonical-nutrition-import/deploy-to-d1.ts.
const envPath = resolve(".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

type D1ClientModule = typeof import("@/lib/d1/client");
type TacoModule = typeof import("@/lib/nutrition/taco");
type HierarchyModule = typeof import("@/lib/nutrition/food-exchange-hierarchy");

/**
 * FASE 8 (item 3/7/13) — backfill único e idempotente: converte os
 * diet_template_items dos templates canônicos (tpl-{grupo}-dieta-base) e do
 * template personalizado existente em diet_template_slots +
 * diet_template_slot_foods, sem apagar diet_template_items (item 7 — "não
 * apagar informação sem análise", os alimentos viram sugestões dentro do
 * slot). Reaproveita o MESMO classificador da Fase 7
 * (classifyFoodExchangeGroup) — nunca uma segunda lógica de categorização.
 *
 * Idempotente: pula qualquer refeição que já tenha slots (permite rodar de
 * novo com segurança se novos templates canônicos forem criados depois).
 */

const EXCHANGE_INELIGIBLE_KEYWORDS = ["agua", "sal ", "sal,", "tempero", "condimento", "vinagre", "oleo de cozinha spray", "adocante"];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isExchangeEligible(foodName: string): boolean {
  const normalized = normalize(foodName);
  return !EXCHANGE_INELIGIBLE_KEYWORDS.some((kw) => normalized.includes(kw));
}

// Só usa o alimento TACO como fonte de grupo/macro real quando o nome bate
// EXATO (após normalizar vírgulas/acentos/espaços) — nunca substring/fuzzy:
// um match parcial contra uma descrição curta ou malformada da TACO (ex.:
// uma linha residual "L") pode "bater" como substring de quase qualquer
// nome real e classificar tudo errado. Sem match exato, cai para o nome
// bruto do item — o classificador já cobre esse caso via nameKeywords.
function findTacoMatch(foodName: string, tacoReferences: TacoModule["TACO_REFERENCES"]) {
  const normalized = normalize(foodName);
  if (normalized.length < 4) return null;
  return tacoReferences.find((f) => normalize(f.descricao) === normalized) ?? null;
}

interface TemplateRow {
  id: string;
  target_group: string;
  structure_version: string;
}
interface MealRow {
  id: string;
  template_id: string;
  name: string;
}
interface ItemRow {
  id: string;
  meal_id: string;
  food: string;
  quantity: string | null;
  unit: string | null;
}

const FORCE = process.argv.includes("--force");

async function main() {
  const { d1Batch, d1Query }: D1ClientModule = await import("@/lib/d1/client");
  const { TACO_REFERENCES }: TacoModule = await import("@/lib/nutrition/taco");
  const { classifyFoodExchangeGroup }: HierarchyModule = await import("@/lib/nutrition/food-exchange-hierarchy");

  const templates = await d1Query<TemplateRow>(
    "SELECT id, target_group, structure_version FROM protocol_templates WHERE type = 'DIETA' AND is_active = 1",
    []
  );

  console.log(`${templates.length} templates DIETA ativos encontrados.`);

  let migratedTemplates = 0;
  let migratedMeals = 0;
  let skippedMeals = 0;
  let createdSlots = 0;
  let createdSlotFoods = 0;

  for (const template of templates) {
    const meals = await d1Query<MealRow>(
      "SELECT id, template_id, name FROM diet_template_meals WHERE template_id = ?1 ORDER BY sort_order ASC",
      [template.id]
    );
    if (!meals.length) continue;

    let touchedTemplate = false;

    for (const meal of meals) {
      const existingSlots = await d1Query<{ n: number }>(
        "SELECT COUNT(*) as n FROM diet_template_slots WHERE meal_id = ?1",
        [meal.id]
      );
      if ((existingSlots[0]?.n ?? 0) > 0) {
        if (!FORCE) {
          skippedMeals++;
          continue;
        }
        // --force: descarta os slots já gerados (cascade apaga diet_template_slot_foods
        // junto) e reclassifica do zero — usado só pra corrigir um backfill anterior
        // com classificação ruim, nunca no fluxo normal (idempotente por padrão).
        await d1Batch([{ sql: "DELETE FROM diet_template_slots WHERE meal_id = ?1", params: [meal.id] }]);
      }

      const items = await d1Query<ItemRow>(
        "SELECT id, meal_id, food, quantity, unit FROM diet_template_items WHERE meal_id = ?1 ORDER BY sort_order ASC",
        [meal.id]
      );
      if (!items.length) continue;

      type SlotKey = string;
      const slotGroups = new Map<SlotKey, { foodGroup: string; foodSubgroup: string; nutritionalRole: string; items: ItemRow[] }>();

      for (const item of items) {
        const tacoMatch = findTacoMatch(item.food, TACO_REFERENCES);
        const classification = classifyFoodExchangeGroup(
          tacoMatch ?? { descricao: item.food, grupo: undefined, proteina_g: 0, carboidrato_g: 0, lipidios_g: 0 }
        );
        const key = `${classification.foodGroup}::${classification.foodSubgroup}::${classification.nutritionalRole}`;
        const bucket = slotGroups.get(key) ?? {
          foodGroup: classification.foodGroup,
          foodSubgroup: classification.foodSubgroup,
          nutritionalRole: classification.nutritionalRole,
          items: [],
        };
        bucket.items.push(item);
        slotGroups.set(key, bucket);
      }

      const now = new Date().toISOString();
      const statements = [];
      let sortOrder = 0;
      for (const bucket of slotGroups.values()) {
        const slotId = crypto.randomUUID();
        const eligible = bucket.items.every((item) => isExchangeEligible(item.food));
        statements.push({
          sql: `INSERT INTO diet_template_slots
            (id, meal_id, food_group, food_subgroup, nutritional_role, required, exchange_eligible, min_items, max_items, sort_order, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, 1, 1, ?7, ?8, ?8)`,
          params: [slotId, meal.id, bucket.foodGroup, bucket.foodSubgroup, bucket.nutritionalRole, eligible ? 1 : 0, sortOrder, now],
        });
        let foodOrder = 0;
        for (const item of bucket.items) {
          statements.push({
            sql: `INSERT INTO diet_template_slot_foods (id, slot_id, food, quantity, unit, source_item_id, sort_order, created_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
            params: [crypto.randomUUID(), slotId, item.food, item.quantity, item.unit, item.id, foodOrder, now],
          });
          foodOrder++;
          createdSlotFoods++;
        }
        sortOrder++;
        createdSlots++;
      }

      if (statements.length) {
        await d1Batch(statements);
        migratedMeals++;
        touchedTemplate = true;
      }
    }

    if (touchedTemplate) {
      await d1Batch([
        {
          sql: "UPDATE protocol_templates SET structure_version = 'v2', version = version + 1, updated_at = ?2 WHERE id = ?1",
          params: [template.id, new Date().toISOString()],
        },
      ]);
      migratedTemplates++;
    }
  }

  console.log(`Templates migrados: ${migratedTemplates}`);
  console.log(`Refeições migradas: ${migratedMeals} (puladas por já terem slots: ${skippedMeals})`);
  console.log(`Slots criados: ${createdSlots}`);
  console.log(`Alimentos-sugestão criados: ${createdSlotFoods}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
