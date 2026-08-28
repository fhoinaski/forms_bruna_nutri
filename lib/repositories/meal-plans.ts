import { d1Batch, d1Execute, d1Query, type D1Statement } from "@/lib/d1/client";
import { getAllTemplates, getSlotClassificationBySourceItemId, type ProtocolTemplate } from "@/lib/repositories/protocol-templates";
import type { ProtocolTemplateTargetGroup } from "@/lib/protocol-templates/constants";
import { buildItemSnapshot } from "@/lib/nutrition/food-snapshot-server";
import type { MealPlanVersionSource } from "@/lib/repositories/meal-plan-versions";
import { encryptJsonValue } from "@/lib/security/encrypted-fields";
import { getFoodPortionById, toHouseholdMeasureOption, type FoodPortion } from "@/lib/repositories/food-portions";
import { resolveQuantity, type QuantityResolution } from "@/lib/nutrition/quantity-resolution";
import { getExistingNutritionRecord } from "@/lib/repositories/nutrition-records";
import { listPatientClinicalMarkers } from "@/lib/repositories/patient-clinical-markers";
import { checkFoodAgainstPatientRestrictions } from "@/lib/clinical/food-safety";
import { CLINICAL_MARKER_CODE_LABELS, type ClinicalMarkerCode } from "@/lib/clinical/structured-markers";
import { getFoodByReference, toPersistedMealFoodSource, type PersistedMealFoodSource } from "@/lib/nutrition/food-catalog";
import { approveAlternatives, generateAndSaveExchangeGroup, listExchangeGroupsForPlan, NoEligibleExchangeAlternativesError } from "@/lib/repositories/exchange-groups";
import type { ExchangeGroupCandidate } from "@/lib/nutrition/food-exchange-engine";
import { resolveFoodCandidate, type FoodResolutionCandidate, type FoodResolutionStatus } from "@/lib/nutrition/food-resolver";
import { mealContextForTemplateMeal } from "@/lib/meal-templates/system-template-contract";
import { validateMealTemplateIntegrity, type MealTemplateIntegrityIssue } from "@/lib/repositories/meal-template-integrity";
import { getMealStructure, validateMealStructure, type MealChoiceGroupPayload, type MealOptionPayload, type MealStructureType } from "@/lib/meal-plans/flexible-structure";

export type MealPlanStatus = "draft" | "active" | "archived";

export type MealPlanPayload = {
  id: string;
  client_id: string;
  title: string;
  target_group: string | null;
  status: MealPlanStatus;
  version: number;
  notes: string | null;
  // FASE 8 (item 13) — proveniência do template usado pra criar o plano
  // ("Criar por modelo"). NULL em todo plano criado de outra forma (manual,
  // IA, duplicado) e em todo plano histórico anterior a esta fase — nunca
  // retroativo (item 14: "planos já criados com versão antiga não podem
  // mudar retroativamente").
  template_id?: string | null;
  template_version?: number | null;
  // Metas nutricionais do plano (FASE 2, seçao 11) — definidas manualmente
  // pela nutricionista, nunca calculadas automaticamente (seçao 12).
  // Opcionais no tipo (alem de aceitarem null) para nao exigir atualizar
  // fixtures de teste anteriores a esta fase que nao tratam de metas.
  target_energy_kcal?: number | null;
  target_protein_g?: number | null;
  target_carbohydrate_g?: number | null;
  target_fat_g?: number | null;
  created_at: string;
  updated_at: string;
  meals: MealPlanMealPayload[];
  weekly_slots: MealPlanWeeklySlotPayload[];
  substitutions: MealPlanSubstitutionPayload[];
  supplements: MealPlanSupplementPayload[];
};

export type MealPlanMealPayload = {
  id?: string;
  name: string;
  meal_context?: string | null;
  suggested_time?: string | null;
  notes?: string | null;
  source_recipe_id?: string | null;
  /** NULL is legacy-compatible and is always interpreted as SIMPLE. */
  meal_structure?: MealStructureType | null;
  patient_instruction?: string | null;
  items: MealPlanItemPayload[];
  options?: MealOptionPayload[];
  choice_groups?: MealChoiceGroupPayload[];
};

export type MealPlanItemPayload = {
  id?: string;
  food: string;
  quantity?: string | null;
  unit?: string | null;
  notes?: string | null;
  is_optional?: boolean;
  // Vinculo estruturado a um alimento (TACO/personalizado) — FASE 2.
  // Ambos nulos = item legado ou digitado livremente; o calculo cai para o
  // match aproximado por texto ja existente (findBestFoodReference).
  // FASE 6.5 (item 5): TBCA/IBGE_POF aceitos aqui — identidade transportada,
  // mas o Nutrition Engine ainda trata como "nao reconhecido" pro calculo
  // (ver lib/nutrition/nutrients.ts#resolveItemReference, item 8).
  food_source?: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF" | null;
  food_ref_id?: string | null;
  // FASE 6.5 (item 3) — identidade canonica completa quando food_source e
  // TBCA/IBGE_POF (ex.: "tbca:medidas_caseiras:BRC0001C"). NULL pra item legado.
  canonical_food_id?: string | null;
  // Vinculo a uma medida caseira especifica (food_portions.id) — FASE 3.
  // Quando presente, tem prioridade maxima na resolucao de quantidade
  // (lib/nutrition/quantity-resolution.ts), independente do texto de `unit`.
  household_measure_id?: string | null;
  // Snapshot de composicao congelado na prescricao (P1-A, FASE 20) — evita que
  // o plano mude retroativamente se a base (taco.json/custom_foods) mudar.
  food_name_snapshot?: string | null;
  nutrition_snapshot?: string | null;
  resolved_grams_snapshot?: number | null;
  quantity_resolution_snapshot?: string | null;
  // Locks (seções 4-5 do pedido de fechamento de gaps) — reaproveitados
  // pelo Optimizer V2 (nunca ajusta quantidade de um item com
  // quantity_locked) e pela sugestão de substituições (nunca sugere para um
  // item com substitutions_locked, automática ou manualmente — mas a
  // nutricionista ainda pode adicionar substituição manual mesmo com o item
  // bloqueado, se explicitamente escolher fazer isso pela UI).
  quantity_locked?: boolean;
  substitutions_locked?: boolean;
  // FASE 8 (item 8) — proveniência do slot de template que originou este
  // item (grupo/subgrupo/papel nutricional), quando o plano foi criado "por
  // modelo" e o alimento do item bate com uma sugestão de um slot. NULL para
  // item manual, gerado por IA, ou de um template ainda não migrado (item 7
  // — informativo, nunca obrigatório: o item continua funcionando sem isso).
  slot_food_group?: string | null;
  slot_food_subgroup?: string | null;
  slot_nutritional_role?: string | null;
  // FASE 8.5 (item 2) — contrato funcional do slot: id do slot de origem
  // (diet_template_slots.id) e se ele é elegível pra substituição/grupo de
  // troca automático (item 9 — água/tempero/suplemento normalmente não).
  // NULL = sem slot de origem (item manual/IA/legado), nunca confundir com
  // false.
  template_slot_id?: string | null;
  slot_exchange_eligible?: boolean | null;
};

export type MealPlanWeeklySlotPayload = {
  id?: string;
  weekday: number;
  meal_type: "almoco" | "jantar";
  title?: string | null;
  notes?: string | null;
  source_meal_id?: string | null;
};

export type MealPlanSubstitutionPayload = {
  id?: string;
  base_food: string;
  option_food: string;
  quantity?: string | null;
  unit?: string | null;
  notes?: string | null;
  // Substituições nutricionais equivalentes por item (evolução desta mesma
  // tabela — nunca uma tabela nova). Todos os campos abaixo são opcionais e
  // `null` por padrão: uma linha SEM eles continua sendo uma substituição de
  // "grupo de troca" em texto livre, exatamente como já funcionava antes.
  //
  // base_food_source/base_food_ref_id: identidade do alimento PRESCRITO ao
  // qual esta substituição pertence (quando ele tem vínculo estruturado) —
  // não usamos um item_id porque os itens são recriados a cada save
  // (ver buildMealPlanDetailStatements), então um id nunca é estável entre
  // salvamentos; a identidade fonte+refId é.
  base_food_source?: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | null;
  base_food_ref_id?: string | null;
  option_food_source?: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | null;
  option_food_ref_id?: string | null;
  option_household_measure_id?: string | null;
  option_nutrition_snapshot?: string | null;
  equivalence_mode?: "energy" | "nutritional" | null;
  equivalence_score?: number | null;
  equivalence_quality?: "EXCELLENT" | "GOOD" | "REVIEW" | "UNSUITABLE" | null;
  // Default true nas linhas já existentes (curadoria humana por definição —
  // templates/edição manual); só sugestões novas da IA começam em false.
  approved_by_professional?: boolean;
  ai_suggested?: boolean;
};

export type MealPlanSupplementPayload = {
  id?: string;
  name: string;
  dosage?: string | null;
  unit?: string | null;
  instructions?: string | null;
  notes?: string | null;
};

type MealPlanRow = Omit<MealPlanPayload, "meals" | "weekly_slots" | "substitutions" | "supplements">;
type MealRow = Omit<MealPlanMealPayload, "items" | "options" | "choice_groups"> & { id: string; meal_plan_id: string; sort_order: number };
type ItemRow = MealPlanItemPayload & { id: string; meal_id: string; meal_option_id?: string | null; choice_group_id?: string | null; sort_order: number };
type MealOptionRow = Omit<MealOptionPayload, "items"> & { id: string; meal_id: string; sort_order: number };
type MealChoiceGroupRow = Omit<MealChoiceGroupPayload, "items"> & { id: string; meal_id: string; sort_order: number };
type WeeklySlotRow = MealPlanWeeklySlotPayload & { id: string; meal_plan_id: string; sort_order: number };
type SubstitutionRow = MealPlanSubstitutionPayload & { id: string; meal_plan_id: string; sort_order: number };
type SupplementRow = MealPlanSupplementPayload & { id: string; meal_plan_id: string; sort_order: number };
type DietTemplateMealRow = Omit<MealPlanMealPayload, "items"> & { id: string; template_id: string; sort_order: number };
type DietTemplateItemRow = MealPlanItemPayload & { id: string; meal_id: string; sort_order: number };
type DietTemplateSubstitutionRow = MealPlanSubstitutionPayload & { id: string; template_id: string; sort_order: number };
type DietTemplateSupplementRow = MealPlanSupplementPayload & { id: string; template_id: string; sort_order: number };

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }
  return grouped;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function normalizeSubstitutionKeyPart(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function substitutionDeduplicationKey(item: Pick<MealPlanSubstitutionPayload, "base_food" | "option_food" | "quantity" | "unit">): string {
  return [
    normalizeSubstitutionKeyPart(item.base_food),
    normalizeSubstitutionKeyPart(item.option_food),
    normalizeSubstitutionKeyPart(item.quantity),
    normalizeSubstitutionKeyPart(item.unit),
  ].join("|");
}

function dedupeMealPlanSubstitutions(items: MealPlanSubstitutionPayload[]): MealPlanSubstitutionPayload[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = substitutionDeduplicationKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeMealName(name: string) {
  return name.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseMealItems(items: unknown): MealPlanItemPayload[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    if (typeof item === "string") return { food: item, quantity: null, unit: null, notes: null };
    const row = item as Record<string, unknown>;
    return {
      food: String(row.alimento ?? row.food ?? row.nome ?? ""),
      quantity: text(row.quantidade ?? row.quantity),
      unit: text(row.unidade ?? row.unit),
      notes: text(row.observacao ?? row.notes),
    };
  }).filter((item) => item.food.trim());
}

function extractMeals(content: Record<string, unknown>): MealPlanMealPayload[] {
  const meals = content.refeicoes;
  if (Array.isArray(meals)) {
    return meals.map((meal, index) => {
      const row = meal as Record<string, unknown>;
      return {
        name: String(row.nome ?? row.name ?? `Refeição ${index + 1}`),
        suggested_time: text(row.horario ?? row.suggested_time),
        notes: text(row.observacao ?? row.notes),
        items: parseMealItems(row.itens ?? row.items),
      };
    }).filter((meal) => meal.items.length);
  }
  if (meals && typeof meals === "object") {
    return Object.entries(meals).map(([name, items]) => ({
      name: normalizeMealName(name),
      suggested_time: null,
      notes: null,
      items: parseMealItems(items),
    })).filter((meal) => meal.items.length);
  }
  return [];
}

function extractSupplements(content: Record<string, unknown>): MealPlanSupplementPayload[] {
  const supplements = content.suplementos ?? content.suplementos_sugeridos;
  if (!Array.isArray(supplements)) return [];
  return supplements.map((item) => {
    if (typeof item === "string") return { name: item, dosage: null, unit: null, instructions: null, notes: null };
    const row = item as Record<string, unknown>;
    return {
      name: String(row.nome ?? row.nutriente ?? row.name ?? ""),
      dosage: text(row.dosagem ?? row.faixa_dose_usual ?? row.dosage),
      unit: text(row.unidade ?? row.unit),
      instructions: text(row.indicacao ?? row.quando_tomar ?? row.instructions),
      notes: text(row.conduta ?? row.notes),
    };
  }).filter((item) => item.name.trim());
}

function extractSubstitutions(content: Record<string, unknown>): MealPlanSubstitutionPayload[] {
  if (Array.isArray(content.grupos)) {
    return content.grupos.flatMap((group, groupIndex) => {
      const row = group as Record<string, unknown>;
      const base = (row.base ?? {}) as Record<string, unknown>;
      const baseFood = String(base.alimento ?? base.food ?? `Grupo ${groupIndex + 1}`);
      const options = Array.isArray(row.opcoes) ? row.opcoes : [];
      return options.map((option) => {
        const item = option as Record<string, unknown>;
        return {
          base_food: baseFood,
          option_food: String(item.alimento ?? item.food ?? ""),
          quantity: text(item.quantidade ?? item.quantity),
          unit: text(item.unidade ?? item.unit),
          notes: null,
        };
      }).filter((item) => item.option_food.trim());
    });
  }

  return Object.entries(content).flatMap(([groupName, detail]) => {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) return [];
    const row = detail as { opcoes?: unknown[]; porcao_referencia?: string };
    if (!Array.isArray(row.opcoes)) return [];
    return row.opcoes.map((option) => ({
      base_food: normalizeMealName(groupName),
      option_food: String(option),
      quantity: null,
      unit: null,
      notes: row.porcao_referencia ?? null,
    }));
  });
}

async function getRelationalDietTemplates(templateIds: string[]): Promise<Map<string, {
  meals: MealPlanMealPayload[];
  substitutions: MealPlanSubstitutionPayload[];
  supplements: MealPlanSupplementPayload[];
}>> {
  const grouped = new Map<string, { meals: MealPlanMealPayload[]; substitutions: MealPlanSubstitutionPayload[]; supplements: MealPlanSupplementPayload[] }>();
  if (!templateIds.length) return grouped;

  const ids = JSON.stringify(templateIds);
  const results = await d1Batch([
    {
      sql: "SELECT m.* FROM diet_template_meals m JOIN json_each(?1) ids ON m.template_id = ids.value ORDER BY m.template_id, m.sort_order ASC",
      params: [ids],
    },
    {
      sql: `SELECT i.* FROM diet_template_items i
            JOIN diet_template_meals m ON m.id = i.meal_id
            JOIN json_each(?1) ids ON m.template_id = ids.value
            ORDER BY m.template_id, m.sort_order ASC, i.sort_order ASC`,
      params: [ids],
    },
    {
      sql: "SELECT s.* FROM diet_template_substitutions s JOIN json_each(?1) ids ON s.template_id = ids.value ORDER BY s.template_id, s.sort_order ASC",
      params: [ids],
    },
    {
      sql: "SELECT s.* FROM diet_template_supplements s JOIN json_each(?1) ids ON s.template_id = ids.value ORDER BY s.template_id, s.sort_order ASC",
      params: [ids],
    },
  ]);

  const meals = (results[0]?.results ?? []) as DietTemplateMealRow[];
  const items = (results[1]?.results ?? []) as DietTemplateItemRow[];
  const substitutions = (results[2]?.results ?? []) as DietTemplateSubstitutionRow[];
  const supplements = (results[3]?.results ?? []) as DietTemplateSupplementRow[];
  const itemsByMeal = groupBy(items, (item) => item.meal_id);
  const mealsByTemplate = groupBy(meals, (meal) => meal.template_id);
  const substitutionsByTemplate = groupBy(substitutions, (item) => item.template_id);
  const supplementsByTemplate = groupBy(supplements, (item) => item.template_id);

  for (const templateId of templateIds) {
    grouped.set(templateId, {
      meals: (mealsByTemplate.get(templateId) ?? []).map((meal) => ({
        id: meal.id,
        name: meal.name,
        meal_context: meal.meal_context ?? null,
        suggested_time: meal.suggested_time,
        notes: meal.notes,
        source_recipe_id: meal.source_recipe_id,
        items: (itemsByMeal.get(meal.id) ?? []).map((item) => ({
          id: item.id,
          food: item.food,
          quantity: item.quantity,
          unit: item.unit,
          notes: item.notes,
          food_source: item.food_source ?? null,
          food_ref_id: item.food_ref_id ?? null,
          canonical_food_id: item.canonical_food_id ?? null,
        })),
      })),
      substitutions: (substitutionsByTemplate.get(templateId) ?? []).map(({ id, base_food, option_food, quantity, unit, notes }) => ({ id, base_food, option_food, quantity, unit, notes })),
      supplements: (supplementsByTemplate.get(templateId) ?? []).map(({ id, name, dosage, unit, instructions, notes }) => ({ id, name, dosage, unit, instructions, notes })),
    });
  }

  return grouped;
}

export interface MealPlanMetrics {
  total: number;
  active: number;
  draft: number;
  archived: number;
}

export async function getMealPlanMetrics(): Promise<MealPlanMetrics> {
  const rows = await d1Query<{ status: MealPlanStatus; c: number }>(
    "SELECT status, COUNT(*) as c FROM meal_plans GROUP BY status",
    []
  );
  const metrics: MealPlanMetrics = { total: 0, active: 0, draft: 0, archived: 0 };
  for (const row of rows) {
    metrics.total += row.c;
    if (row.status === "active") metrics.active = row.c;
    else if (row.status === "draft") metrics.draft = row.c;
    else if (row.status === "archived") metrics.archived = row.c;
  }
  return metrics;
}

export async function getClientMealPlans(clientId: string): Promise<MealPlanPayload[]> {
  const rows = await d1Query<MealPlanRow>(
    "SELECT * FROM meal_plans WHERE client_id = ?1 ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, updated_at DESC",
    [clientId]
  );
  return hydrateMealPlans(rows);
}

export async function getActiveMealPlan(clientId: string): Promise<MealPlanPayload | null> {
  const rows = await d1Query<MealPlanRow>(
    "SELECT * FROM meal_plans WHERE client_id = ?1 AND status = 'active' ORDER BY version DESC, created_at DESC LIMIT 1",
    [clientId]
  );
  return rows[0] ? (await hydrateMealPlans(rows))[0] : null;
}

export async function getActiveMealPlanVersion(clientId: string): Promise<MealPlanPayload | null> {
  return getActiveMealPlan(clientId);
}

/**
 * Busca por id sozinho (sem escopo de cliente) — uso interno da tool/handler
 * de proposta de IA para plano alimentar, que precisa ler o plano ANTES de
 * saber com certeza a quem ele pertence (a checagem de ownership real
 * acontece depois, comparando `plan.client_id` com o clientId da proposta).
 * Nunca usar isto num lugar que decida autorizacao sozinho.
 */
export async function getMealPlanById(planId: string): Promise<MealPlanPayload | null> {
  const rows = await d1Query<MealPlanRow>("SELECT * FROM meal_plans WHERE id = ?1 LIMIT 1", [planId]);
  return rows[0] ? (await hydrateMealPlans(rows))[0] : null;
}

export async function getMealPlanVersionById(planId: string): Promise<MealPlanPayload | null> {
  return getMealPlanById(planId);
}

async function hydrateMealPlans(rows: MealPlanRow[]): Promise<MealPlanPayload[]> {
  if (!rows.length) return [];
  const planIds = JSON.stringify(rows.map((row) => row.id));
  const results = await d1Batch([
    {
      sql: "SELECT m.* FROM meal_plan_meals m JOIN json_each(?1) ids ON m.meal_plan_id = ids.value ORDER BY m.meal_plan_id, m.sort_order ASC",
      params: [planIds],
    },
    {
      sql: `SELECT i.* FROM meal_plan_items i
            JOIN meal_plan_meals m ON m.id = i.meal_id
            JOIN json_each(?1) ids ON m.meal_plan_id = ids.value
            ORDER BY m.meal_plan_id, m.sort_order ASC, i.sort_order ASC`,
      params: [planIds],
    },
    {
      sql: "SELECT o.* FROM meal_plan_meal_options o JOIN meal_plan_meals m ON m.id = o.meal_id JOIN json_each(?1) ids ON m.meal_plan_id = ids.value ORDER BY m.meal_plan_id, o.meal_id, o.sort_order ASC",
      params: [planIds],
    },
    {
      sql: "SELECT g.* FROM meal_plan_choice_groups g JOIN meal_plan_meals m ON m.id = g.meal_id JOIN json_each(?1) ids ON m.meal_plan_id = ids.value ORDER BY m.meal_plan_id, g.meal_id, g.sort_order ASC",
      params: [planIds],
    },
    {
      sql: "SELECT w.* FROM meal_plan_weekly_slots w JOIN json_each(?1) ids ON w.meal_plan_id = ids.value ORDER BY w.meal_plan_id, w.weekday ASC, w.meal_type ASC, w.sort_order ASC",
      params: [planIds],
    },
    {
      sql: "SELECT s.* FROM meal_plan_substitutions s JOIN json_each(?1) ids ON s.meal_plan_id = ids.value ORDER BY s.meal_plan_id, s.sort_order ASC",
      params: [planIds],
    },
    {
      sql: "SELECT s.* FROM meal_plan_supplements s JOIN json_each(?1) ids ON s.meal_plan_id = ids.value ORDER BY s.meal_plan_id, s.sort_order ASC",
      params: [planIds],
    },
  ]);
  const meals = (results[0]?.results ?? []) as MealRow[];
  const items = (results[1]?.results ?? []) as ItemRow[];
  const options = (results[2]?.results ?? []) as MealOptionRow[];
  const choiceGroups = (results[3]?.results ?? []) as MealChoiceGroupRow[];
  const weeklySlots = (results[4]?.results ?? []) as WeeklySlotRow[];
  const substitutions = (results[5]?.results ?? []) as SubstitutionRow[];
  const supplements = (results[6]?.results ?? []) as SupplementRow[];
  const mealsByPlan = groupBy(meals, (meal) => meal.meal_plan_id);
  const itemsByMeal = groupBy(items, (item) => item.meal_id);
  const optionsByMeal = groupBy(options, (option) => option.meal_id);
  const groupsByMeal = groupBy(choiceGroups, (group) => group.meal_id);
  const itemsByOption = groupBy(items.filter((item) => item.meal_option_id), (item) => item.meal_option_id!);
  const itemsByChoiceGroup = groupBy(items.filter((item) => item.choice_group_id), (item) => item.choice_group_id!);
  const weeklySlotsByPlan = groupBy(weeklySlots, (item) => item.meal_plan_id);
  const substitutionsByPlan = groupBy(substitutions, (item) => item.meal_plan_id);
  const supplementsByPlan = groupBy(supplements, (item) => item.meal_plan_id);
  return rows.map((row) => ({
    ...row,
    meals: (mealsByPlan.get(row.id) ?? []).map((meal) => ({
      id: meal.id,
      name: meal.name,
      meal_context: meal.meal_context ?? null,
      suggested_time: meal.suggested_time,
      notes: meal.notes,
      source_recipe_id: meal.source_recipe_id,
      meal_structure: getMealStructure(meal),
      patient_instruction: meal.patient_instruction ?? null,
      items: (itemsByMeal.get(meal.id) ?? []).filter((item) => !item.meal_option_id && !item.choice_group_id).map((item) => ({
        id: item.id,
        food: item.food,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes,
        food_source: item.food_source ?? null,
        food_ref_id: item.food_ref_id ?? null,
        canonical_food_id: item.canonical_food_id ?? null,
        household_measure_id: item.household_measure_id ?? null,
        food_name_snapshot: item.food_name_snapshot ?? null,
        nutrition_snapshot: item.nutrition_snapshot ?? null,
        resolved_grams_snapshot: item.resolved_grams_snapshot ?? null,
        quantity_resolution_snapshot: item.quantity_resolution_snapshot ?? null,
        quantity_locked: Boolean(item.quantity_locked),
        substitutions_locked: Boolean(item.substitutions_locked),
        slot_food_group: item.slot_food_group ?? null,
        slot_food_subgroup: item.slot_food_subgroup ?? null,
        slot_nutritional_role: item.slot_nutritional_role ?? null,
        template_slot_id: item.template_slot_id ?? null,
        slot_exchange_eligible: item.slot_exchange_eligible === null || item.slot_exchange_eligible === undefined ? null : Boolean(item.slot_exchange_eligible),
        is_optional: Boolean(item.is_optional),
        })),
      options: (optionsByMeal.get(meal.id) ?? []).map((option) => ({
        id: option.id, label: option.label, description: option.description ?? null,
        items: (itemsByOption.get(option.id) ?? []).map((item) => ({ ...item, is_optional: Boolean(item.is_optional) })),
      })),
      choice_groups: (groupsByMeal.get(meal.id) ?? []).map((group) => ({
        id: group.id, title: group.title, description: group.description ?? null,
        min_selections: group.min_selections, max_selections: group.max_selections,
        items: (itemsByChoiceGroup.get(group.id) ?? []).map((item) => ({ ...item, is_optional: Boolean(item.is_optional) })),
      })),
      })),
    weekly_slots: (weeklySlotsByPlan.get(row.id) ?? []).map(({ id, weekday, meal_type, title, notes, source_meal_id }) => ({
      id,
      weekday,
      meal_type,
      title,
      notes,
      source_meal_id,
    })),
    // Dedupe tambem na leitura — defende dado legado (planos gravados antes
    // do dedupe existir no caminho de escrita) sem precisar de uma migracao
    // de limpeza; mantem a primeira ocorrencia (sort_order menor).
    substitutions: dedupeMealPlanSubstitutions(
      (substitutionsByPlan.get(row.id) ?? []).map((row) => ({
        id: row.id,
        base_food: row.base_food,
        option_food: row.option_food,
        quantity: row.quantity,
        unit: row.unit,
        notes: row.notes,
        base_food_source: row.base_food_source ?? null,
        base_food_ref_id: row.base_food_ref_id ?? null,
        option_food_source: row.option_food_source ?? null,
        option_food_ref_id: row.option_food_ref_id ?? null,
        option_household_measure_id: row.option_household_measure_id ?? null,
        option_nutrition_snapshot: row.option_nutrition_snapshot ?? null,
        equivalence_mode: row.equivalence_mode ?? null,
        equivalence_score: row.equivalence_score ?? null,
        equivalence_quality: row.equivalence_quality ?? null,
        approved_by_professional: Boolean(row.approved_by_professional ?? true),
        ai_suggested: Boolean(row.ai_suggested ?? false),
      }))
    ),
    supplements: (supplementsByPlan.get(row.id) ?? []).map(({ id, name, dosage, unit, instructions, notes }) => ({ id, name, dosage, unit, instructions, notes })),
  }));
}

export class NoTemplateForTargetGroupError extends Error {
  constructor(targetGroup: string) {
    super(`Nenhum modelo DIETA ativo encontrado para o grupo ${targetGroup}.`);
    this.name = "NoTemplateForTargetGroupError";
  }
}

export class AmbiguousTemplateForTargetGroupError extends Error {
  constructor(targetGroup: string) {
    super(`Mais de um modelo DIETA ativo/default encontrado para o grupo ${targetGroup}.`);
    this.name = "AmbiguousTemplateForTargetGroupError";
  }
}

export class MealTemplateIntegrityError extends Error {
  issues: MealTemplateIntegrityIssue[];

  constructor(templateId: string, issues: MealTemplateIntegrityIssue[]) {
    super(`TEMPLATE_INTEGRITY_ERROR: template ${templateId} possui ${issues.length} problema(s) de integridade.`);
    this.name = "MealTemplateIntegrityError";
    this.issues = issues;
  }
}

export interface MealPlanTemplateConflict {
  mealName: string;
  food: string;
  reason: string;
  source: "structured_marker" | "free_text";
}

export interface MealPlanTemplateImportPreview {
  template: {
    id: string;
    title: string;
    origin: "SYSTEM" | "USER";
    version: number;
    targetGroup: ProtocolTemplateTargetGroup;
    mealCount: number;
    itemCount: number;
  };
  hasConflicts: boolean;
  conflicts: MealPlanTemplateConflict[];
}

function normalizeForConflict(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const FREE_TEXT_RESTRICTION_TERMS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(leite|lactose|iogurte|queijo|requeijao|ricota|mussarela|muçarela)\b/i, label: "leite/lactose" },
  { pattern: /\b(ovo|clara|gema)\b/i, label: "ovo" },
  { pattern: /\b(amendoim|castanha|noz|nozes|amendoa)\b/i, label: "oleaginosas/amendoim" },
  { pattern: /\b(soja|tofu)\b/i, label: "soja" },
  { pattern: /\b(trigo|gluten|glúten|pao|macarrao|massa|farinha)\b/i, label: "trigo/gluten" },
  { pattern: /\b(peixe|tilapia|merluza|salmao|sardinha|atum)\b/i, label: "peixe" },
  { pattern: /\b(camarao|crustaceo|marisco|lula|polvo)\b/i, label: "frutos do mar" },
];

function buildPseudoMacroFood(food: string) {
  return { numero: food, descricao: food, grupo: "", energia_kcal: 0, proteina_g: 0, carboidrato_g: 0, lipidios_g: 0 };
}

function numericQuantity(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function itemQuantityGrams(item: MealPlanItemPayload): number | null {
  if (typeof item.resolved_grams_snapshot === "number" && Number.isFinite(item.resolved_grams_snapshot) && item.resolved_grams_snapshot > 0) return item.resolved_grams_snapshot;
  const unit = (item.unit ?? "").trim().toLowerCase();
  if (unit === "g" || unit === "grama" || unit === "gramas") return numericQuantity(item.quantity);
  return null;
}

async function resolveTemplateFoodIdentity(item: MealPlanItemPayload, markers = [] as Awaited<ReturnType<typeof listPatientClinicalMarkers>>): Promise<MealPlanItemPayload> {
  if (item.food_source && item.food_ref_id) return item;
  const resolution = await resolveFoodCandidate(item.food, markers);
  if (resolution.status !== "RESOLVED" || !resolution.ref) return item;
  const persistedSource = toPersistedMealFoodSource(resolution.ref.source);
  if (!persistedSource) return item;
  const details = await getFoodByReference({ source: persistedSource, sourceId: resolution.ref.sourceId, canonicalId: resolution.ref.canonicalId ?? null });
  if (!details) return item;
  return {
    ...item,
    food_source: persistedSource,
    food_ref_id: resolution.ref.sourceId,
    canonical_food_id: resolution.ref.canonicalId ?? null,
  };
}

async function resolveTemplateMealsFoodIdentities(meals: MealPlanMealPayload[], markers = [] as Awaited<ReturnType<typeof listPatientClinicalMarkers>>): Promise<MealPlanMealPayload[]> {
  return Promise.all(meals.map(async (meal) => ({
    ...meal,
    items: await Promise.all(meal.items.map((item) => resolveTemplateFoodIdentity(item, markers))),
  })));
}

function collectFreeTextConflicts(recordText: string, mealName: string, food: string): MealPlanTemplateConflict[] {
  const haystack = normalizeForConflict(recordText);
  const foodName = normalizeForConflict(food);
  const conflicts: MealPlanTemplateConflict[] = [];
  for (const term of FREE_TEXT_RESTRICTION_TERMS) {
    if (term.pattern.test(haystack) && term.pattern.test(foodName)) {
      conflicts.push({ mealName, food, reason: `Restricao textual registrada: ${term.label}`, source: "free_text" });
    }
  }
  if (/\b(vegano|vegetariano estrito|vegetarianismo estrito)\b/i.test(haystack) && /\b(frango|carne|bovina|peixe|tilapia|salmao|ovo|leite|queijo|iogurte|whey)\b/i.test(foodName)) {
    conflicts.push({ mealName, food, reason: "Restricao textual registrada: vegetariano estrito/vegano", source: "free_text" });
  }
  return conflicts;
}

function chooseTemplateForImport(dietTemplates: ProtocolTemplate[], targetGroup: ProtocolTemplateTargetGroup): ProtocolTemplate {
  if (!dietTemplates.length) throw new NoTemplateForTargetGroupError(targetGroup);
  const systemDefaults = dietTemplates.filter((template) => template.template_origin === "SYSTEM" && template.is_default === 1);
  if (systemDefaults.length === 1) return systemDefaults[0];
  if (systemDefaults.length > 1) throw new AmbiguousTemplateForTargetGroupError(targetGroup);
  const systemTemplates = dietTemplates.filter((template) => template.template_origin === "SYSTEM");
  if (systemTemplates.length === 1) return systemTemplates[0];
  if (dietTemplates.length === 1) return dietTemplates[0];
  throw new AmbiguousTemplateForTargetGroupError(targetGroup);
}

async function resolveTemplateImport(input: {
  clientId: string;
  targetGroup: ProtocolTemplateTargetGroup;
}): Promise<{ templates: ProtocolTemplate[]; template: ProtocolTemplate; relationalTemplates: Map<string, { meals: MealPlanMealPayload[]; substitutions: MealPlanSubstitutionPayload[]; supplements: MealPlanSupplementPayload[] }>; meals: MealPlanMealPayload[] }> {
  const templates = await getAllTemplates({ targetGroup: input.targetGroup });
  const dietTemplates = templates.filter((template) => template.type === "DIETA");
  const template = chooseTemplateForImport(dietTemplates, input.targetGroup);
  if (template.template_origin === "SYSTEM") {
    const integrity = await validateMealTemplateIntegrity(template.id);
    if (!integrity.valid) throw new MealTemplateIntegrityError(template.id, integrity.issues);
  }
  const relationalTemplates = await getRelationalDietTemplates(templates.map((item) => item.id));
  const slotBySourceItemId = await getSlotClassificationBySourceItemId([template.id]);
  const relational = relationalTemplates.get(template.id);
  const templateMeals = relational?.meals.length ? relational.meals : extractMeals(parseJson(template.content));
  const markers = await listPatientClinicalMarkers(input.clientId).catch(() => []);
  const meals = await resolveTemplateMealsFoodIdentities(templateMeals.map((meal) => ({
    ...meal,
    items: meal.items.map((item) => {
      const slot = item.id ? slotBySourceItemId.get(item.id) : undefined;
      return slot
        ? {
            ...item,
            slot_food_group: slot.food_group,
            slot_food_subgroup: slot.food_subgroup,
            slot_nutritional_role: slot.nutritional_role,
            template_slot_id: slot.slot_id,
            slot_exchange_eligible: slot.exchange_eligible,
          }
        : item;
    }),
  })), markers);
  return { templates, template, relationalTemplates, meals };
}

export async function previewMealPlanTemplateImport(input: {
  clientId: string;
  targetGroup: ProtocolTemplateTargetGroup;
}): Promise<MealPlanTemplateImportPreview> {
  const { template, meals } = await resolveTemplateImport(input);
  const [record, markers] = await Promise.all([
    getExistingNutritionRecord(input.clientId).catch(() => null),
    listPatientClinicalMarkers(input.clientId).catch(() => []),
  ]);
  const freeText = [
    record?.allergies,
    record?.restrictions,
    record?.food_aversions,
    record?.diagnoses,
    record?.risk_flags,
  ].filter(Boolean).join("\n");

  const conflicts: MealPlanTemplateConflict[] = [];
  for (const meal of meals) {
    for (const item of meal.items) {
      const safety = checkFoodAgainstPatientRestrictions({ food: buildPseudoMacroFood(item.food), markers });
      if (safety.status === "conflict") {
        for (const conflict of safety.conflicts) {
          const code = conflict.normalizedCode as ClinicalMarkerCode;
          conflicts.push({
            mealName: meal.name,
            food: item.food,
            reason: `${conflict.type}: ${CLINICAL_MARKER_CODE_LABELS[code] ?? conflict.label}`,
            source: "structured_marker",
          });
        }
      }
      conflicts.push(...collectFreeTextConflicts(freeText, meal.name, item.food));
    }
  }

  const unique = new Map<string, MealPlanTemplateConflict>();
  for (const conflict of conflicts) unique.set(`${conflict.mealName}|${conflict.food}|${conflict.reason}`, conflict);
  const deduped = Array.from(unique.values());

  return {
    template: {
      id: template.id,
      title: template.title,
      origin: template.template_origin,
      version: template.version,
      targetGroup: template.target_group,
      mealCount: meals.length,
      itemCount: meals.reduce((total, meal) => total + meal.items.length, 0),
    },
    hasConflicts: deduped.length > 0,
    conflicts: deduped,
  };
}

export async function createMealPlanFromTemplates(input: {
  clientId: string;
  targetGroup: ProtocolTemplateTargetGroup;
  title?: string | null;
  confirmed?: boolean;
}): Promise<MealPlanPayload> {
  const preview = await previewMealPlanTemplateImport({ clientId: input.clientId, targetGroup: input.targetGroup });
  if (preview.hasConflicts && !input.confirmed) {
    throw new Error(`Este modelo contém ${preview.conflicts.length} item(ns) que precisam ser revisados antes de importar.`);
  }
  const { templates, template: primaryDietTemplate, relationalTemplates, meals } = await resolveTemplateImport(input);
  const supplements = templates.filter((template) => template.type === "SUPLEMENTACAO").flatMap((template) => {
    const relational = relationalTemplates.get(template.id);
    return relational?.supplements.length ? relational.supplements : extractSupplements(parseJson(template.content));
  });
  const rawSubstitutions = [
    ...(relationalTemplates.get(primaryDietTemplate.id)?.substitutions ?? []),
    ...templates.filter((template) => template.type === "SUBSTITUICAO").flatMap((template) => {
      const relational = relationalTemplates.get(template.id);
      return relational?.substitutions.length ? relational.substitutions : extractSubstitutions(parseJson(template.content));
    }),
  ];
  const substitutions = dedupeMealPlanSubstitutions(rawSubstitutions);

  const created = await createMealPlan({
    clientId: input.clientId,
    title: input.title?.trim() || `Plano alimentar - ${input.targetGroup.replaceAll("_", " ").toLowerCase()}`,
    targetGroup: input.targetGroup,
    status: "draft",
    notes: "Plano criado a partir de modelo predefinido. Revisar e personalizar antes de ativar no portal.",
    meals,
    weekly_slots: [],
    substitutions,
    supplements,
    templateId: primaryDietTemplate?.id ?? null,
    templateVersion: primaryDietTemplate?.version ?? null,
  });
  await generateExchangeGroupsForMealPlanItems({ clientId: input.clientId, plan: created, approveGenerated: false, limit: 5 });
  const refreshed = (await getClientMealPlans(input.clientId)).find((plan) => plan.id === created.id);
  return refreshed ?? created;
}

export async function saveMealPlanAsDietTemplate(input: {
  clientId: string;
  planId: string;
  title: string;
  targetGroup: ProtocolTemplateTargetGroup;
}): Promise<string | null> {
  const plan = (await getClientMealPlans(input.clientId)).find((item) => item.id === input.planId);
  if (!plan) return null;

  const templateId = crypto.randomUUID();
  const now = new Date().toISOString();

  const mealRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  for (const [mealIndex, meal] of plan.meals.entries()) {
    const mealId = crypto.randomUUID();
    mealRows.push({
      id: mealId,
      templateId,
      name: meal.name,
      mealContext: meal.meal_context ?? mealContextForTemplateMeal(meal.name),
      time: meal.suggested_time ?? null,
      notes: meal.notes ?? null,
      sourceRecipeId: meal.source_recipe_id ?? null,
      order: mealIndex,
      now,
    });
    for (const [itemIndex, item] of meal.items.entries()) {
      if (!item.food.trim()) continue;
      itemRows.push({
        id: crypto.randomUUID(),
        mealId,
        food: item.food,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        notes: item.notes ?? null,
        foodSource: item.food_source ?? null,
        foodRefId: item.food_ref_id ?? null,
        canonicalFoodId: item.canonical_food_id ?? null,
        order: itemIndex,
        now,
      });
    }
  }
  const substitutionRows = plan.substitutions.filter((item) => item.base_food.trim() && item.option_food.trim()).map((item, order) => ({
    id: crypto.randomUUID(),
    templateId,
    baseFood: item.base_food,
    optionFood: item.option_food,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    notes: item.notes ?? null,
    order,
    now,
  }));
  const supplementRows = plan.supplements.filter((item) => item.name.trim()).map((item, order) => ({
    id: crypto.randomUUID(),
    templateId,
    name: item.name,
    dosage: item.dosage ?? null,
    unit: item.unit ?? null,
    instructions: item.instructions ?? null,
    notes: item.notes ?? null,
    order,
    now,
  }));

  const statements: D1Statement[] = [
    {
      sql: `INSERT INTO protocol_templates
        (id, type, target_group, title, content, notes, is_active, template_origin, owner_admin_id, is_default, created_at, updated_at)
        VALUES (?1, 'DIETA', ?2, ?3, '', ?4, 1, 'USER', NULL, 0, ?5, ?6)`,
      params: [templateId, input.targetGroup, input.title, plan.notes ?? "Modelo criado a partir de um plano personalizado. Revisar antes de reutilizar.", now, now],
    },
  ];
  if (mealRows.length) statements.push({
    sql: `INSERT INTO diet_template_meals (id, template_id, name, meal_context, suggested_time, notes, source_recipe_id, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.templateId'), json_extract(value,'$.name'), json_extract(value,'$.mealContext'), json_extract(value,'$.time'), json_extract(value,'$.notes'), json_extract(value,'$.sourceRecipeId'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(mealRows)],
  });
  if (itemRows.length) statements.push({
    sql: `INSERT INTO diet_template_items (id, meal_id, food, quantity, unit, notes, food_source, food_ref_id, canonical_food_id, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.mealId'), json_extract(value,'$.food'), json_extract(value,'$.quantity'), json_extract(value,'$.unit'), json_extract(value,'$.notes'), json_extract(value,'$.foodSource'), json_extract(value,'$.foodRefId'), json_extract(value,'$.canonicalFoodId'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(itemRows)],
  });
  if (substitutionRows.length) statements.push({
    sql: `INSERT INTO diet_template_substitutions (id, template_id, base_food, option_food, quantity, unit, notes, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.templateId'), json_extract(value,'$.baseFood'), json_extract(value,'$.optionFood'), json_extract(value,'$.quantity'), json_extract(value,'$.unit'), json_extract(value,'$.notes'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(substitutionRows)],
  });
  if (supplementRows.length) statements.push({
    sql: `INSERT INTO diet_template_supplements (id, template_id, name, dosage, unit, instructions, notes, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.templateId'), json_extract(value,'$.name'), json_extract(value,'$.dosage'), json_extract(value,'$.unit'), json_extract(value,'$.instructions'), json_extract(value,'$.notes'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(supplementRows)],
  });

  await d1Batch(statements);
  return templateId;
}

export class MealPlanVersionConflictError extends Error {
  constructor() {
    super("O plano alimentar foi atualizado em outra sessao. Recarregue antes de salvar.");
    this.name = "MealPlanVersionConflictError";
  }
}

function isMealPlanVersionConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /UNIQUE constraint failed: meal_plan_versions/i.test(error.message);
}

function portionMatchesItem(portion: FoodPortion, item: MealPlanItemPayload): boolean {
  return portion.food_source === item.food_source && portion.food_ref_id === item.food_ref_id;
}

function serializeQuantityResolution(resolution: QuantityResolution): string {
  return JSON.stringify({
    grams: resolution.grams,
    method: resolution.method,
    confidence: resolution.confidence,
    source: resolution.source ?? null,
    measureId: resolution.measureId ?? null,
    warning: resolution.warning ?? null,
  });
}

function buildQuantitySnapshots(item: MealPlanItemPayload, portionsById: Map<string, FoodPortion>): Pick<MealPlanItemPayload, "resolved_grams_snapshot" | "quantity_resolution_snapshot"> {
  if (!item.household_measure_id) {
    return { resolved_grams_snapshot: null, quantity_resolution_snapshot: null };
  }
  // Canonical TBCA/IBGE portions live in canonical_food_portions rather than
  // the legacy food_portions table. The editor resolves them through the same
  // quantity contract and sends an immutable snapshot; preserve that snapshot
  // here so save/reload cannot discard an official selected measure.
  if ((item.food_source === "TBCA" || item.food_source === "IBGE_POF")
    && typeof item.resolved_grams_snapshot === "number" && item.resolved_grams_snapshot > 0
    && item.quantity_resolution_snapshot) {
    return { resolved_grams_snapshot: item.resolved_grams_snapshot, quantity_resolution_snapshot: item.quantity_resolution_snapshot };
  }
  const portion = portionsById.get(item.household_measure_id);
  if (!portion || !portionMatchesItem(portion, item)) {
    return { resolved_grams_snapshot: null, quantity_resolution_snapshot: null };
  }
  const resolution = resolveQuantity({
    quantity: item.quantity,
    unit: item.unit,
    householdMeasure: toHouseholdMeasureOption(portion),
  });
  if (resolution.grams === null || resolution.grams <= 0) {
    return { resolved_grams_snapshot: null, quantity_resolution_snapshot: null };
  }
  return {
    resolved_grams_snapshot: resolution.grams,
    quantity_resolution_snapshot: serializeQuantityResolution(resolution),
  };
}

/** Congela nome + composicao de cada item vinculado (P1-A, FASE 20) e a gramagem da medida caseira selecionada. */
async function resolveMealsWithSnapshots(meals: MealPlanMealPayload[]): Promise<MealPlanMealPayload[]> {
  const allItems = (meal: MealPlanMealPayload) => [meal.items, ...(meal.options ?? []).map((option) => option.items), ...(meal.choice_groups ?? []).map((group) => group.items)].flat();
  const measureIds = Array.from(new Set(meals.flatMap((meal) => allItems(meal).map((item) => item.household_measure_id).filter((id): id is string => Boolean(id)))));
  const portions = await Promise.all(measureIds.map((id) => getFoodPortionById(id)));
  const portionsById = new Map(portions.filter((portion): portion is FoodPortion => Boolean(portion)).map((portion) => [portion.id, portion]));
  return Promise.all(
    meals.map(async (meal) => {
      const resolveItems = (items: MealPlanItemPayload[]) => Promise.all(items.map(async (item) => {
          if (!item.food.trim()) return item;
          const snapshot = await buildItemSnapshot(item.food_source, item.food_ref_id);
          const quantitySnapshot = buildQuantitySnapshots(item, portionsById);
          return { ...item, ...snapshot, ...quantitySnapshot };
      }));
      return {
        ...meal,
        items: await resolveItems(meal.items),
        options: await Promise.all((meal.options ?? []).map(async (option) => ({ ...option, items: await resolveItems(option.items) }))),
        choice_groups: await Promise.all((meal.choice_groups ?? []).map(async (group) => ({ ...group, items: await resolveItems(group.items) }))),
      };
    })
  );
}

/** Monta o snapshot clinico completo do plano para versionamento (FASE 21). */
export function buildMealPlanVersionSnapshot(
  input: {
    title: string;
    status: MealPlanStatus;
    notes?: string | null;
    target_energy_kcal?: number | null;
    target_protein_g?: number | null;
    target_carbohydrate_g?: number | null;
    target_fat_g?: number | null;
    meals: MealPlanMealPayload[];
    weekly_slots?: MealPlanWeeklySlotPayload[];
    substitutions: MealPlanSubstitutionPayload[];
    supplements: MealPlanSupplementPayload[];
  },
  version: number
): Record<string, unknown> {
  return {
    version,
    title: input.title,
    status: input.status,
    notes: input.notes ?? null,
    target_energy_kcal: input.target_energy_kcal ?? null,
    target_protein_g: input.target_protein_g ?? null,
    target_carbohydrate_g: input.target_carbohydrate_g ?? null,
    target_fat_g: input.target_fat_g ?? null,
    meals: input.meals.map((meal) => ({
      name: meal.name,
      suggested_time: meal.suggested_time ?? null,
      notes: meal.notes ?? null,
      source_recipe_id: meal.source_recipe_id ?? null,
      meal_structure: getMealStructure(meal),
      patient_instruction: meal.patient_instruction ?? null,
      items: meal.items.map((item) => ({
        food: item.food,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        notes: item.notes ?? null,
        food_source: item.food_source ?? null,
        food_ref_id: item.food_ref_id ?? null,
        household_measure_id: item.household_measure_id ?? null,
        food_name_snapshot: item.food_name_snapshot ?? null,
        nutrition_snapshot: item.nutrition_snapshot ?? null,
        resolved_grams_snapshot: item.resolved_grams_snapshot ?? null,
        quantity_resolution_snapshot: item.quantity_resolution_snapshot ?? null,
        quantity_locked: Boolean(item.quantity_locked),
        substitutions_locked: Boolean(item.substitutions_locked),
      })),
      options: (meal.options ?? []).map((option) => ({
        label: option.label, description: option.description ?? null,
        items: option.items.map((item) => ({ ...item, is_optional: Boolean(item.is_optional) })),
      })),
      choice_groups: (meal.choice_groups ?? []).map((group) => ({
        title: group.title, description: group.description ?? null, min_selections: group.min_selections, max_selections: group.max_selections,
        items: group.items.map((item) => ({ ...item, is_optional: Boolean(item.is_optional) })),
      })),
    })),
    weekly_slots: input.weekly_slots ?? [],
    substitutions: input.substitutions,
    supplements: input.supplements,
  };
}

function mealPlanVersionStatement(input: {
  mealPlanId: string;
  clientId: string;
  version: number;
  snapshot: Record<string, unknown>;
  changedByAdminId?: string | null;
  source: MealPlanVersionSource;
  reason?: string | null;
  now: string;
}): D1Statement {
  return {
    sql: `INSERT OR IGNORE INTO meal_plan_versions (id, meal_plan_id, client_id, version, encrypted_snapshot, changed_by_admin_id, source, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    params: [crypto.randomUUID(), input.mealPlanId, input.clientId, input.version, encryptJsonValue(input.snapshot), input.changedByAdminId ?? null, input.source, input.reason ?? null, input.now],
  };
}

export async function createMealPlan(input: {
  clientId: string;
  title: string;
  targetGroup?: string | null;
  status?: MealPlanStatus;
  notes?: string | null;
  meals: MealPlanMealPayload[];
  weekly_slots?: MealPlanWeeklySlotPayload[];
  substitutions: MealPlanSubstitutionPayload[];
  supplements: MealPlanSupplementPayload[];
  templateId?: string | null;
  templateVersion?: number | null;
}): Promise<MealPlanPayload> {
  const structureErrors = input.meals.flatMap(validateMealStructure);
  if (structureErrors.length) throw new Error(structureErrors.join(" "));
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const meals = await resolveMealsWithSnapshots(input.meals);
  const statements: D1Statement[] = [];
  if (input.status === "active") {
    statements.push({
      sql: "UPDATE meal_plans SET status = 'archived', version = version + 1, updated_at = ?1 WHERE client_id = ?2 AND status = 'active'",
      params: [now, input.clientId],
    });
  }
  statements.push({
    sql: `INSERT INTO meal_plans (id, client_id, title, target_group, status, version, notes, template_id, template_version, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?8, ?9, ?10)`,
    params: [id, input.clientId, input.title, input.targetGroup ?? null, input.status ?? "draft", input.notes ?? null, input.templateId ?? null, input.templateVersion ?? null, now, now],
  });
  statements.push(mealPlanVersionStatement({
    mealPlanId: id,
    clientId: input.clientId,
    version: 1,
    snapshot: buildMealPlanVersionSnapshot({ title: input.title, status: input.status ?? "draft", notes: input.notes, meals, weekly_slots: input.weekly_slots, substitutions: input.substitutions, supplements: input.supplements }, 1),
    source: "manual",
    now,
  }));
  statements.push(...buildMealPlanDetailStatements(id, meals, input.weekly_slots ?? [], input.substitutions, input.supplements, now));
  await d1Batch(statements);
  const rows = await d1Query<MealPlanRow>("SELECT * FROM meal_plans WHERE id = ?1 LIMIT 1", [id]);
  return (await hydrateMealPlans(rows))[0];
}

export type MealPlanItemIdentityResolution =
  | {
      status: "RESOLVED";
      itemId: string;
      food_source: PersistedMealFoodSource;
      food_ref_id: string;
      canonical_food_id: string | null;
      food_name: string;
    }
  | {
      status: Exclude<FoodResolutionStatus, "RESOLVED"> | "UNSUPPORTED_SOURCE";
      itemId: string;
      reason: string;
      candidates: FoodResolutionCandidate[];
    };

export async function resolveMealPlanItemIdentity(input: {
  clientId: string;
  mealPlanId: string;
  itemId: string;
  food: string;
  adminId?: string | null;
}): Promise<MealPlanItemIdentityResolution> {
  const markers = await listPatientClinicalMarkers(input.clientId).catch(() => []);
  const resolution = await resolveFoodCandidate(input.food, markers, input.adminId ?? null);
  if (resolution.status !== "RESOLVED" || !resolution.ref) {
    return {
      status: resolution.status as Exclude<FoodResolutionStatus, "RESOLVED">,
      itemId: input.itemId,
      reason: resolution.reason,
      candidates: resolution.candidates,
    };
  }

  const persistedSource = toPersistedMealFoodSource(resolution.ref.source);
  if (!persistedSource) {
    return {
      status: "UNSUPPORTED_SOURCE",
      itemId: input.itemId,
      reason: "Fonte de alimento não suportada para alternativas calculadas.",
      candidates: [],
    };
  }

  const ref = { source: persistedSource, sourceId: resolution.ref.sourceId, canonicalId: resolution.ref.canonicalId ?? null };
  const details = await getFoodByReference(ref);
  if (!details) {
    return {
      status: "UNSUPPORTED_SOURCE",
      itemId: input.itemId,
      reason: "Este alimento ainda não tem dados nutricionais calculáveis para gerar alternativas.",
      candidates: [],
    };
  }

  const snapshot = await buildItemSnapshot(persistedSource, resolution.ref.sourceId);
  const now = new Date().toISOString();
  await d1Execute(
    `UPDATE meal_plan_items
        SET food_source = ?1,
            food_ref_id = ?2,
            canonical_food_id = ?3,
            food_name_snapshot = ?4,
            nutrition_snapshot = ?5,
            updated_at = ?6
      WHERE id = ?7
        AND meal_id IN (SELECT id FROM meal_plan_meals WHERE meal_plan_id = ?8)`,
    [
      persistedSource,
      resolution.ref.sourceId,
      resolution.ref.canonicalId ?? null,
      snapshot.food_name_snapshot ?? details.name,
      snapshot.nutrition_snapshot ?? null,
      now,
      input.itemId,
      input.mealPlanId,
    ]
  );

  return {
    status: "RESOLVED",
    itemId: input.itemId,
    food_source: persistedSource,
    food_ref_id: resolution.ref.sourceId,
    canonical_food_id: resolution.ref.canonicalId ?? null,
    food_name: details.name,
  };
}

export async function generateExchangeGroupsForMealPlanItems(input: {
  clientId: string;
  plan: MealPlanPayload;
  approveGenerated?: boolean;
  limit?: number;
  ownerAdminId?: string | null;
}): Promise<{ generated: number; approved: number; skipped: number }> {
  const markers = await listPatientClinicalMarkers(input.clientId).catch(() => []);
  const existing = await listExchangeGroupsForPlan(input.plan.id);
  const exchangeGroupKey = (source: string, refId: string, grams: number) => `${source}:${refId}:${Math.round(grams * 10) / 10}`;
  const existingKeys = new Set(existing.map(({ group }) => exchangeGroupKey(group.primary_food_source, group.primary_food_ref_id, group.primary_quantity_grams)));
  let generated = 0;
  let approved = 0;
  let skipped = 0;

  const isRestricted = (candidate: ExchangeGroupCandidate) =>
    checkFoodAgainstPatientRestrictions({ food: candidate.food, markers }).status === "conflict";

  for (const meal of input.plan.meals) {
    for (const item of meal.items) {
      if (item.slot_exchange_eligible === false || item.substitutions_locked) {
        skipped++;
        continue;
      }
      if (!item.food_source || !item.food_ref_id) {
        skipped++;
        continue;
      }
      const grams = itemQuantityGrams(item);
      if (!grams) {
        skipped++;
        continue;
      }
      const key = exchangeGroupKey(item.food_source, item.food_ref_id, grams);
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }
      const primaryRef = { source: item.food_source, sourceId: item.food_ref_id, canonicalId: item.canonical_food_id ?? null };
      const primaryDetails = await getFoodByReference(primaryRef);
      if (!primaryDetails) {
        skipped++;
        continue;
      }
      const safety = checkFoodAgainstPatientRestrictions({ food: primaryDetails.macroReference, markers });
      if (safety.status === "conflict") {
        skipped++;
        continue;
      }
      let result: Awaited<ReturnType<typeof generateAndSaveExchangeGroup>>;
      try {
        result = await generateAndSaveExchangeGroup({
          mealPlanId: input.plan.id,
          primaryFood: primaryDetails.macroReference,
          primaryRef,
          primaryGrams: grams,
          isRestricted,
          limit: input.limit ?? 5,
          mealName: meal.name,
          templateSlotId: item.template_slot_id ?? null,
          ownerAdminId: input.ownerAdminId,
        });
      } catch (error) {
        if (error instanceof NoEligibleExchangeAlternativesError) {
          skipped++;
          continue;
        }
        throw error;
      }
      generated++;
      existingKeys.add(key);
      if (input.approveGenerated && result.alternatives.length) {
        await approveAlternatives(result.group.id, result.alternatives.map((alternative) => alternative.id));
        approved += result.alternatives.length;
      }
    }
  }

  return { generated, approved, skipped };
}

export interface UpdateMealPlanOptions {
  expectedVersion?: number;
  changedByAdminId?: string | null;
  source?: MealPlanVersionSource;
  reason?: string | null;
}

export async function updateMealPlan(planId: string, clientId: string, input: {
  title: string;
  status: MealPlanStatus;
  notes?: string | null;
  target_energy_kcal?: number | null;
  target_protein_g?: number | null;
  target_carbohydrate_g?: number | null;
  target_fat_g?: number | null;
  meals: MealPlanMealPayload[];
  weekly_slots?: MealPlanWeeklySlotPayload[];
  substitutions: MealPlanSubstitutionPayload[];
  supplements: MealPlanSupplementPayload[];
}, options: UpdateMealPlanOptions = {}): Promise<MealPlanPayload | null> {
  const structureErrors = input.meals.flatMap(validateMealStructure);
  if (structureErrors.length) throw new Error(structureErrors.join(" "));
  const existingRows = await d1Query<MealPlanRow>(
    "SELECT * FROM meal_plans WHERE id = ?1 AND client_id = ?2 LIMIT 1",
    [planId, clientId]
  );
  if (!existingRows[0]) return null;
  const existing = existingRows[0];

  const expected = options.expectedVersion ?? existing.version;
  if (options.expectedVersion !== undefined && options.expectedVersion !== existing.version) {
    throw new MealPlanVersionConflictError();
  }

  const now = new Date().toISOString();
  const nextVersion = existing.version + 1;
  const meals = await resolveMealsWithSnapshots(input.meals);
  const statements: D1Statement[] = [];
  if (input.status === "active") {
    statements.push({
      sql: "UPDATE meal_plans SET status = 'archived', version = version + 1, updated_at = ?1 WHERE client_id = ?2 AND status = 'active' AND id <> ?3",
      params: [now, clientId, planId],
    });
  }
  statements.push({
    sql: `UPDATE meal_plans SET title = ?1, status = ?2, notes = ?3,
            target_energy_kcal = ?4, target_protein_g = ?5, target_carbohydrate_g = ?6, target_fat_g = ?7,
            version = version + 1, updated_at = ?8 WHERE id = ?9 AND client_id = ?10 AND version = ?11`,
    params: [
      input.title,
      input.status,
      input.notes ?? null,
      input.target_energy_kcal ?? null,
      input.target_protein_g ?? null,
      input.target_carbohydrate_g ?? null,
      input.target_fat_g ?? null,
      now,
      planId,
      clientId,
      expected,
    ],
  });
  statements.push(mealPlanVersionStatement({
    mealPlanId: planId,
    clientId,
    version: nextVersion,
    snapshot: buildMealPlanVersionSnapshot({ ...input, meals }, nextVersion),
    changedByAdminId: options.changedByAdminId ?? null,
    source: options.source ?? "manual",
    reason: options.reason ?? null,
    now,
  }));
  statements.push(...buildMealPlanDetailStatements(planId, meals, input.weekly_slots ?? [], input.substitutions, input.supplements, now));

  try {
    await d1Batch(statements);
  } catch (error) {
    if (isMealPlanVersionConflictError(error)) throw new MealPlanVersionConflictError();
    throw error;
  }
  const rows = await d1Query<MealPlanRow>("SELECT * FROM meal_plans WHERE id = ?1 LIMIT 1", [planId]);
  return rows[0] ? (await hydrateMealPlans(rows))[0] : null;
}

export async function deleteMealPlan(planId: string, clientId: string): Promise<MealPlanRow | null> {
  const rows = await d1Query<MealPlanRow>(
    "SELECT * FROM meal_plans WHERE id = ?1 AND client_id = ?2 LIMIT 1",
    [planId, clientId]
  );
  if (!rows[0]) return null;
  await d1Batch([{ sql: "DELETE FROM meal_plans WHERE id = ?1 AND client_id = ?2", params: [planId, clientId] }]);
  return rows[0];
}

function buildMealPlanDetailStatements(
  planId: string,
  meals: MealPlanMealPayload[],
  weeklySlots: MealPlanWeeklySlotPayload[],
  substitutions: MealPlanSubstitutionPayload[],
  supplements: MealPlanSupplementPayload[],
  now: string
): D1Statement[] {
  const mealRows: Record<string, unknown>[] = [];
  const optionRows: Record<string, unknown>[] = [];
  const choiceGroupRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  const savedMealIdsByClientId = new Map<string, string>();
  for (const [mealIndex, meal] of meals.entries()) {
    const mealId = crypto.randomUUID();
    if (meal.id) savedMealIdsByClientId.set(meal.id, mealId);
    mealRows.push({ id: mealId, planId, name: meal.name, mealContext: meal.meal_context ?? mealContextForTemplateMeal(meal.name), time: meal.suggested_time ?? null, notes: meal.notes ?? null, sourceRecipeId: meal.source_recipe_id ?? null, structure: getMealStructure(meal), patientInstruction: meal.patient_instruction ?? null, order: mealIndex, now });
    const appendItems = (items: MealPlanItemPayload[], mealOptionId: string | null, choiceGroupId: string | null) => items.forEach((item, itemIndex) => {
      if (!item.food.trim()) return;
      itemRows.push({
        id: crypto.randomUUID(),
        mealId,
        food: item.food,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        notes: item.notes ?? null,
        foodSource: item.food_source ?? null,
        foodRefId: item.food_ref_id ?? null,
        canonicalFoodId: item.canonical_food_id ?? null,
        householdMeasureId: item.household_measure_id ?? null,
        foodNameSnapshot: item.food_name_snapshot ?? null,
        nutritionSnapshot: item.nutrition_snapshot ?? null,
        resolvedGramsSnapshot: item.resolved_grams_snapshot ?? null,
        quantityResolutionSnapshot: item.quantity_resolution_snapshot ?? null,
        quantityLocked: item.quantity_locked ? 1 : 0,
        substitutionsLocked: item.substitutions_locked ? 1 : 0,
        slotFoodGroup: item.slot_food_group ?? null,
        slotFoodSubgroup: item.slot_food_subgroup ?? null,
        slotNutritionalRole: item.slot_nutritional_role ?? null,
        templateSlotId: item.template_slot_id ?? null,
        slotExchangeEligible: item.slot_exchange_eligible === undefined || item.slot_exchange_eligible === null ? null : (item.slot_exchange_eligible ? 1 : 0),
        mealOptionId,
        choiceGroupId,
        isOptional: item.is_optional ? 1 : 0,
        order: itemIndex,
        now,
      });
    });
    appendItems(meal.items, null, null);
    (meal.options ?? []).forEach((option, optionIndex) => {
      const optionId = crypto.randomUUID();
      optionRows.push({ id: optionId, mealId, label: option.label || `Opção ${optionIndex + 1}`, description: option.description ?? null, order: optionIndex, now });
      appendItems(option.items, optionId, null);
    });
    (meal.choice_groups ?? []).forEach((group, groupIndex) => {
      const groupId = crypto.randomUUID();
      choiceGroupRows.push({ id: groupId, mealId, title: group.title, description: group.description ?? null, minSelections: group.min_selections, maxSelections: group.max_selections, order: groupIndex, now });
      appendItems(group.items, null, groupId);
    });
  }
  const weeklyRows = weeklySlots
    .filter((slot) => Number.isInteger(slot.weekday) && slot.weekday >= 0 && slot.weekday <= 6 && (slot.meal_type === "almoco" || slot.meal_type === "jantar"))
    .filter((slot) => (slot.title ?? "").trim() || (slot.notes ?? "").trim() || slot.source_meal_id)
    .map((slot, order) => ({
      id: crypto.randomUUID(),
      planId,
      weekday: slot.weekday,
      mealType: slot.meal_type,
      title: (slot.title ?? "").trim() || null,
      notes: (slot.notes ?? "").trim() || null,
      sourceMealId: slot.source_meal_id ? savedMealIdsByClientId.get(slot.source_meal_id) ?? null : null,
      order,
      now,
    }));
  // Dedupe aqui, no unico ponto que grava substituicoes de verdade (usado por
  // createMealPlan E updateMealPlan) — antes disso o dedupe so existia em
  // createMealPlanFromTemplates (que combina substituicoes de um template
  // DIETA com templates SUBSTITUICAO, fonte real da duplicata), deixando
  // qualquer outro caminho de escrita (editor admin, propostas de IA) livre
  // pra persistir duplicata se recebesse uma.
  const substitutionRows = dedupeMealPlanSubstitutions(
    substitutions.filter((item) => item.base_food.trim() && item.option_food.trim())
  ).map((item, order) => ({
    id: crypto.randomUUID(),
    planId,
    baseFood: item.base_food,
    optionFood: item.option_food,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    notes: item.notes ?? null,
    baseFoodSource: item.base_food_source ?? null,
    baseFoodRefId: item.base_food_ref_id ?? null,
    optionFoodSource: item.option_food_source ?? null,
    optionFoodRefId: item.option_food_ref_id ?? null,
    optionHouseholdMeasureId: item.option_household_measure_id ?? null,
    optionNutritionSnapshot: item.option_nutrition_snapshot ?? null,
    equivalenceMode: item.equivalence_mode ?? null,
    equivalenceScore: item.equivalence_score ?? null,
    equivalenceQuality: item.equivalence_quality ?? null,
    approvedByProfessional: item.approved_by_professional === false ? 0 : 1,
    aiSuggested: item.ai_suggested === true ? 1 : 0,
    order,
    now,
  }));
  const supplementRows = supplements.filter((item) => item.name.trim()).map((item, order) => ({
    id: crypto.randomUUID(), planId, name: item.name, dosage: item.dosage ?? null, unit: item.unit ?? null, instructions: item.instructions ?? null, notes: item.notes ?? null, order, now,
  }));
  const statements: D1Statement[] = [
    { sql: "DELETE FROM meal_plan_items WHERE meal_id IN (SELECT id FROM meal_plan_meals WHERE meal_plan_id = ?1)", params: [planId] },
    { sql: "DELETE FROM meal_plan_meal_options WHERE meal_id IN (SELECT id FROM meal_plan_meals WHERE meal_plan_id = ?1)", params: [planId] },
    { sql: "DELETE FROM meal_plan_choice_groups WHERE meal_id IN (SELECT id FROM meal_plan_meals WHERE meal_plan_id = ?1)", params: [planId] },
    { sql: "DELETE FROM meal_plan_weekly_slots WHERE meal_plan_id = ?1", params: [planId] },
    { sql: "DELETE FROM meal_plan_meals WHERE meal_plan_id = ?1", params: [planId] },
    { sql: "DELETE FROM meal_plan_substitutions WHERE meal_plan_id = ?1", params: [planId] },
    { sql: "DELETE FROM meal_plan_supplements WHERE meal_plan_id = ?1", params: [planId] },
  ];
  if (mealRows.length) statements.push({
    sql: `INSERT INTO meal_plan_meals (id, meal_plan_id, name, meal_context, suggested_time, notes, source_recipe_id, meal_structure, patient_instruction, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.planId'), json_extract(value,'$.name'), json_extract(value,'$.mealContext'), json_extract(value,'$.time'), json_extract(value,'$.notes'), json_extract(value,'$.sourceRecipeId'), json_extract(value,'$.structure'), json_extract(value,'$.patientInstruction'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(mealRows)],
  });
  if (optionRows.length) statements.push({
    sql: `INSERT INTO meal_plan_meal_options (id, meal_id, label, description, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.mealId'), json_extract(value,'$.label'), json_extract(value,'$.description'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(optionRows)],
  });
  if (choiceGroupRows.length) statements.push({
    sql: `INSERT INTO meal_plan_choice_groups (id, meal_id, title, description, min_selections, max_selections, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.mealId'), json_extract(value,'$.title'), json_extract(value,'$.description'), json_extract(value,'$.minSelections'), json_extract(value,'$.maxSelections'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(choiceGroupRows)],
  });
  if (itemRows.length) statements.push({
    sql: `INSERT INTO meal_plan_items (id, meal_id, food, quantity, unit, notes, food_source, food_ref_id, canonical_food_id, household_measure_id, food_name_snapshot, nutrition_snapshot, resolved_grams_snapshot, quantity_resolution_snapshot, quantity_locked, substitutions_locked, slot_food_group, slot_food_subgroup, slot_nutritional_role, template_slot_id, slot_exchange_eligible, meal_option_id, choice_group_id, is_optional, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.mealId'), json_extract(value,'$.food'), json_extract(value,'$.quantity'), json_extract(value,'$.unit'), json_extract(value,'$.notes'), json_extract(value,'$.foodSource'), json_extract(value,'$.foodRefId'), json_extract(value,'$.canonicalFoodId'), json_extract(value,'$.householdMeasureId'), json_extract(value,'$.foodNameSnapshot'), json_extract(value,'$.nutritionSnapshot'), json_extract(value,'$.resolvedGramsSnapshot'), json_extract(value,'$.quantityResolutionSnapshot'), json_extract(value,'$.quantityLocked'), json_extract(value,'$.substitutionsLocked'), json_extract(value,'$.slotFoodGroup'), json_extract(value,'$.slotFoodSubgroup'), json_extract(value,'$.slotNutritionalRole'), json_extract(value,'$.templateSlotId'), json_extract(value,'$.slotExchangeEligible'), json_extract(value,'$.mealOptionId'), json_extract(value,'$.choiceGroupId'), json_extract(value,'$.isOptional'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(itemRows)],
  });
  if (weeklyRows.length) statements.push({
    sql: `INSERT INTO meal_plan_weekly_slots (id, meal_plan_id, weekday, meal_type, title, notes, source_meal_id, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.planId'), json_extract(value,'$.weekday'), json_extract(value,'$.mealType'), json_extract(value,'$.title'), json_extract(value,'$.notes'), json_extract(value,'$.sourceMealId'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(weeklyRows)],
  });
  if (substitutionRows.length) statements.push({
    sql: `INSERT INTO meal_plan_substitutions (
            id, meal_plan_id, base_food, option_food, quantity, unit, notes,
            base_food_source, base_food_ref_id, option_food_source, option_food_ref_id,
            option_household_measure_id, option_nutrition_snapshot, equivalence_mode,
            equivalence_score, equivalence_quality, approved_by_professional, ai_suggested,
            sort_order, created_at, updated_at)
          SELECT
            json_extract(value,'$.id'), json_extract(value,'$.planId'), json_extract(value,'$.baseFood'), json_extract(value,'$.optionFood'), json_extract(value,'$.quantity'), json_extract(value,'$.unit'), json_extract(value,'$.notes'),
            json_extract(value,'$.baseFoodSource'), json_extract(value,'$.baseFoodRefId'), json_extract(value,'$.optionFoodSource'), json_extract(value,'$.optionFoodRefId'),
            json_extract(value,'$.optionHouseholdMeasureId'), json_extract(value,'$.optionNutritionSnapshot'), json_extract(value,'$.equivalenceMode'),
            json_extract(value,'$.equivalenceScore'), json_extract(value,'$.equivalenceQuality'), json_extract(value,'$.approvedByProfessional'), json_extract(value,'$.aiSuggested'),
            json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now')
          FROM json_each(?1)`,
    params: [JSON.stringify(substitutionRows)],
  });
  if (supplementRows.length) statements.push({
    sql: `INSERT INTO meal_plan_supplements (id, meal_plan_id, name, dosage, unit, instructions, notes, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.planId'), json_extract(value,'$.name'), json_extract(value,'$.dosage'), json_extract(value,'$.unit'), json_extract(value,'$.instructions'), json_extract(value,'$.notes'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(supplementRows)],
  });
  return statements;
}
