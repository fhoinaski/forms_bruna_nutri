import { d1Execute, d1Query } from "@/lib/d1/client";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";
import { listCustomFoods, toMacroReferenceFood } from "@/lib/repositories/custom-foods";
import type { FoodReference } from "@/lib/nutrition/food-catalog";
import {
  generateExchangeGroupAlternatives,
  type ExchangeGroupAlternative,
  type ExchangeGroupCandidate,
} from "@/lib/nutrition/food-exchange-engine";
import { classifyFoodExchangeGroup, type FoodClassification } from "@/lib/nutrition/food-exchange-hierarchy";

/**
 * FASE 7 (itens 2/6/13/24) — persistência dos grupos de troca. Único
 * lugar que grava `state` numa alternativa — reforça em CÓDIGO (não só no
 * CHECK do schema) que uma sugestão nova (inclusive vinda da IA) SEMPRE
 * nasce SUGGESTED (item 12: AI_CAN_APPROVE=false) e que só
 * `approveAlternatives` (chamado exclusivamente pela rota admin, nunca
 * pelo agente de IA) muda pra APPROVED.
 */

export type ExchangeAlternativeState = "SUGGESTED" | "APPROVED" | "EDITED" | "REJECTED";

export interface ExchangeGroupRow {
  id: string;
  meal_plan_id: string;
  primary_food_source: string;
  primary_food_ref_id: string;
  primary_canonical_food_id: string | null;
  primary_food_name: string;
  primary_quantity_grams: number;
  food_group: string;
  food_subgroup: string;
  nutritional_role: string;
  target_energy_kcal: number | null;
  target_protein_g: number | null;
  target_carbohydrate_g: number | null;
  target_fat_g: number | null;
  target_fiber_g: number | null;
  allow_cross_group: number;
  created_at: string;
  updated_at: string;
}

export interface ExchangeAlternativeRow {
  id: string;
  exchange_group_id: string;
  food_source: string;
  food_ref_id: string;
  canonical_food_id: string | null;
  food_name: string;
  quantity_grams: number;
  energy_kcal: number | null;
  protein_g: number | null;
  carbohydrate_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  score: number | null;
  quality: string | null;
  same_subgroup: number;
  same_group: number;
  state: ExchangeAlternativeState;
  ai_suggested: number;
  sort_order: number;
}

/**
 * item 11 — pool de candidatos pra gerar sugestões automaticamente.
 * Cobertura REAL nesta fase: TACO (referências estáticas já usadas em
 * todo o app) + alimentos personalizados da clínica. Candidatos TBCA/
 * IBGE_POF podem ser passados explicitamente (ex.: um resultado do piloto
 * canônico) — a hierarquia/motor já sabe classificá-los e usá-los (Fase
 * 6.5 expandiu a identidade de fonte) — mas esta função NÃO faz uma
 * varredura ampla das ~10 mil linhas canônicas por categoria nesta fase
 * (dependeria de uma tabela de classificação própria pro catálogo
 * canônico inteiro, fora de escopo aqui — documentado como próximo passo
 * no relatório final).
 */
async function defaultCandidatePool(): Promise<ExchangeGroupCandidate[]> {
  const tacoCandidates: ExchangeGroupCandidate[] = TACO_REFERENCES.map((food) => ({
    food,
    ref: { source: "TACO", sourceId: String(food.numero) },
  }));
  const customFoods = await listCustomFoods();
  const customCandidates: ExchangeGroupCandidate[] = customFoods.map((row) => ({
    food: toMacroReferenceFood(row),
    ref: { source: row.source, sourceId: row.id },
  }));
  return [...tacoCandidates, ...customCandidates];
}

export interface GenerateExchangeGroupInput {
  mealPlanId: string;
  primaryFood: MacroReferenceFood;
  primaryRef: FoodReference;
  primaryGrams: number;
  allowCrossGroup?: boolean;
  /** item 17 — nunca aplicado automaticamente por este repositório; o chamador decide com base nas restrições reais do paciente. */
  isRestricted?: (candidate: ExchangeGroupCandidate) => boolean;
  /** Candidatos extras (ex.: um resultado TBCA/IBGE_POF já resolvido pelo piloto canônico) — somados ao pool padrão TACO+custom. */
  extraCandidates?: ExchangeGroupCandidate[];
  limit?: number;
  aiSuggested?: boolean;
}

export interface GenerateExchangeGroupResult {
  group: ExchangeGroupRow;
  alternatives: ExchangeAlternativeRow[];
  classification: FoodClassification;
  excludedByGroup: number;
  excludedByRestriction: number;
}

/**
 * item 11/25 — gera E JÁ PERSISTE um grupo de troca com alternativas em
 * estado SUGGESTED. Nunca aprova nada sozinho — mesmo quando chamado a
 * partir do gerador de IA (`aiSuggested: true` só marca a origem, nunca
 * muda o estado inicial).
 */
export async function generateAndSaveExchangeGroup(input: GenerateExchangeGroupInput): Promise<GenerateExchangeGroupResult> {
  const pool = [...(await defaultCandidatePool()), ...(input.extraCandidates ?? [])];
  const generated = generateExchangeGroupAlternatives({
    primaryFood: input.primaryFood,
    primaryRef: input.primaryRef,
    primaryGrams: input.primaryGrams,
    candidates: pool,
    allowCrossGroup: input.allowCrossGroup,
    isRestricted: input.isRestricted,
    limit: input.limit,
  });

  const groupId = crypto.randomUUID();
  const now = new Date().toISOString();
  const target = { energyKcal: input.primaryFood.energia_kcal, proteinG: input.primaryFood.proteina_g, carbohydrateG: input.primaryFood.carboidrato_g, fatG: input.primaryFood.lipidios_g, fiberG: input.primaryFood.fibra_g ?? null };

  await d1Execute(
    `INSERT INTO exchange_groups
      (id, meal_plan_id, primary_food_source, primary_food_ref_id, primary_canonical_food_id, primary_food_name, primary_quantity_grams,
       food_group, food_subgroup, nutritional_role, target_energy_kcal, target_protein_g, target_carbohydrate_g, target_fat_g, target_fiber_g,
       allow_cross_group, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`,
    [groupId, input.mealPlanId, input.primaryRef.source, input.primaryRef.sourceId, input.primaryRef.canonicalId ?? null, input.primaryFood.descricao, input.primaryGrams,
      generated.primaryClassification.foodGroup, generated.primaryClassification.foodSubgroup, generated.primaryClassification.nutritionalRole,
      target.energyKcal ?? null, target.proteinG ?? null, target.carbohydrateG ?? null, target.fatG ?? null, target.fiberG ?? null,
      input.allowCrossGroup ? 1 : 0, now, now]
  );

  const alternativeRows: ExchangeAlternativeRow[] = [];
  let order = 0;
  for (const alt of generated.alternatives) {
    const id = crypto.randomUUID();
    await d1Execute(
      `INSERT INTO exchange_group_alternatives
        (id, exchange_group_id, food_source, food_ref_id, canonical_food_id, food_name, quantity_grams,
         energy_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, score, quality, same_subgroup, same_group,
         state, ai_suggested, sort_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, 'SUGGESTED', ?17, ?18, ?19, ?19)`,
      [id, groupId, alt.ref.source, alt.ref.sourceId, alt.ref.canonicalId ?? null, alt.food.descricao, alt.quantityGrams,
        alt.nutrition.energyKcal, alt.nutrition.proteinG, alt.nutrition.carbohydrateG, alt.nutrition.fatG, alt.nutrition.fiberG,
        alt.score, alt.quality, alt.sameSubgroup ? 1 : 0, alt.sameGroup ? 1 : 0,
        input.aiSuggested ? 1 : 0, order, now]
    );
    alternativeRows.push({
      id, exchange_group_id: groupId, food_source: alt.ref.source, food_ref_id: alt.ref.sourceId, canonical_food_id: alt.ref.canonicalId ?? null,
      food_name: alt.food.descricao, quantity_grams: alt.quantityGrams, energy_kcal: alt.nutrition.energyKcal, protein_g: alt.nutrition.proteinG,
      carbohydrate_g: alt.nutrition.carbohydrateG, fat_g: alt.nutrition.fatG, fiber_g: alt.nutrition.fiberG, score: alt.score, quality: alt.quality,
      same_subgroup: alt.sameSubgroup ? 1 : 0, same_group: alt.sameGroup ? 1 : 0, state: "SUGGESTED", ai_suggested: input.aiSuggested ? 1 : 0, sort_order: order,
    });
    order++;
  }

  const group: ExchangeGroupRow = {
    id: groupId, meal_plan_id: input.mealPlanId, primary_food_source: input.primaryRef.source, primary_food_ref_id: input.primaryRef.sourceId,
    primary_canonical_food_id: input.primaryRef.canonicalId ?? null, primary_food_name: input.primaryFood.descricao, primary_quantity_grams: input.primaryGrams,
    food_group: generated.primaryClassification.foodGroup, food_subgroup: generated.primaryClassification.foodSubgroup, nutritional_role: generated.primaryClassification.nutritionalRole,
    target_energy_kcal: target.energyKcal ?? null, target_protein_g: target.proteinG ?? null, target_carbohydrate_g: target.carbohydrateG ?? null,
    target_fat_g: target.fatG ?? null, target_fiber_g: target.fiberG ?? null, allow_cross_group: input.allowCrossGroup ? 1 : 0, created_at: now, updated_at: now,
  };

  return { group, alternatives: alternativeRows, classification: generated.primaryClassification, excludedByGroup: generated.excludedByGroup, excludedByRestriction: generated.excludedByRestriction };
}

export async function getExchangeGroupById(groupId: string): Promise<{ group: ExchangeGroupRow; alternatives: ExchangeAlternativeRow[] } | null> {
  const groups = await d1Query<ExchangeGroupRow>("SELECT * FROM exchange_groups WHERE id = ?1 LIMIT 1", [groupId]);
  const group = groups[0];
  if (!group) return null;
  const alternatives = await d1Query<ExchangeAlternativeRow>("SELECT * FROM exchange_group_alternatives WHERE exchange_group_id = ?1 ORDER BY sort_order", [groupId]);
  return { group, alternatives };
}

export async function listExchangeGroupsForPlan(mealPlanId: string): Promise<Array<{ group: ExchangeGroupRow; alternatives: ExchangeAlternativeRow[] }>> {
  const groups = await d1Query<ExchangeGroupRow>("SELECT * FROM exchange_groups WHERE meal_plan_id = ?1 ORDER BY created_at", [mealPlanId]);
  if (!groups.length) return [];
  const groupIds = groups.map((g) => g.id);
  const placeholders = groupIds.map((_, i) => `?${i + 1}`).join(",");
  const allAlternatives = await d1Query<ExchangeAlternativeRow>(
    `SELECT * FROM exchange_group_alternatives WHERE exchange_group_id IN (${placeholders}) ORDER BY exchange_group_id, sort_order`,
    groupIds
  );
  const byGroup = new Map<string, ExchangeAlternativeRow[]>();
  for (const alt of allAlternatives) {
    const list = byGroup.get(alt.exchange_group_id) ?? [];
    list.push(alt);
    byGroup.set(alt.exchange_group_id, list);
  }
  return groups.map((group) => ({ group, alternatives: byGroup.get(group.id) ?? [] }));
}

/**
 * item 13 — ÚNICO caminho que produz o estado APPROVED. Nunca chamado
 * pelo código de IA (lib/ai/**) — só por rotas admin autenticadas (ver
 * app/api/admin/clients/[id]/meal-plans/exchange-groups/**).
 */
export async function approveAlternatives(groupId: string, alternativeIds: string[]): Promise<void> {
  if (!alternativeIds.length) return;
  const now = new Date().toISOString();
  for (const id of alternativeIds) {
    await d1Execute("UPDATE exchange_group_alternatives SET state = 'APPROVED', updated_at = ?1 WHERE id = ?2 AND exchange_group_id = ?3", [now, id, groupId]);
  }
}

export async function rejectAlternative(groupId: string, alternativeId: string): Promise<void> {
  await d1Execute("UPDATE exchange_group_alternatives SET state = 'REJECTED', updated_at = ?1 WHERE id = ?2 AND exchange_group_id = ?3", [new Date().toISOString(), alternativeId, groupId]);
}

/** item 16 — edição manual de quantidade SEMPRE recalcula nutrientes (nunca só troca o número exibido) e marca EDITED, exigindo nova aprovação. */
export async function editAlternativeQuantity(groupId: string, alternativeId: string, newGrams: number, recalculated: { energyKcal: number | null; proteinG: number | null; carbohydrateG: number | null; fatG: number | null; fiberG: number | null }): Promise<void> {
  await d1Execute(
    `UPDATE exchange_group_alternatives
       SET quantity_grams = ?1, energy_kcal = ?2, protein_g = ?3, carbohydrate_g = ?4, fat_g = ?5, fiber_g = ?6, state = 'EDITED', updated_at = ?7
     WHERE id = ?8 AND exchange_group_id = ?9`,
    [newGrams, recalculated.energyKcal, recalculated.proteinG, recalculated.carbohydrateG, recalculated.fatG, recalculated.fiberG, new Date().toISOString(), alternativeId, groupId]
  );
}

export async function addManualAlternative(groupId: string, input: { ref: FoodReference; food: MacroReferenceFood; quantityGrams: number; nutrition: { energyKcal: number | null; proteinG: number | null; carbohydrateG: number | null; fatG: number | null; fiberG: number | null } }): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const group = await getExchangeGroupById(groupId);
  const sortOrder = group ? group.alternatives.length : 0;
  await d1Execute(
    `INSERT INTO exchange_group_alternatives
      (id, exchange_group_id, food_source, food_ref_id, canonical_food_id, food_name, quantity_grams, energy_kcal, protein_g, carbohydrate_g, fat_g, fiber_g, score, quality, same_subgroup, same_group, state, ai_suggested, sort_order, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL, NULL, 0, 0, 'SUGGESTED', 0, ?13, ?14, ?14)`,
    [id, groupId, input.ref.source, input.ref.sourceId, input.ref.canonicalId ?? null, input.food.descricao, input.quantityGrams,
      input.nutrition.energyKcal, input.nutrition.proteinG, input.nutrition.carbohydrateG, input.nutrition.fatG, input.nutrition.fiberG, sortOrder, now]
  );
  return id;
}

export async function deleteExchangeGroup(groupId: string): Promise<void> {
  await d1Execute("DELETE FROM exchange_groups WHERE id = ?1", [groupId]);
}

/** item 22 — portal do paciente: SÓ estado APPROVED. */
export async function listApprovedAlternativesForPlan(mealPlanId: string): Promise<Array<{ group: ExchangeGroupRow; approved: ExchangeAlternativeRow[] }>> {
  const groups = await listExchangeGroupsForPlan(mealPlanId);
  return groups
    .map(({ group, alternatives }) => ({ group, approved: alternatives.filter((a) => a.state === "APPROVED") }))
    .filter(({ approved }) => approved.length > 0);
}

export { classifyFoodExchangeGroup };
export type { ExchangeGroupAlternative };
