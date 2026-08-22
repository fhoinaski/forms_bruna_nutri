import { d1Batch, d1Query, type D1Statement } from "@/lib/d1/client";
import { getAllTemplates, getSlotClassificationBySourceItemId } from "@/lib/repositories/protocol-templates";
import type { ProtocolTemplateTargetGroup } from "@/lib/protocol-templates/constants";
import { buildItemSnapshot } from "@/lib/nutrition/food-snapshot-server";
import type { MealPlanVersionSource } from "@/lib/repositories/meal-plan-versions";
import { encryptJsonValue } from "@/lib/security/encrypted-fields";
import { getFoodPortionById, toHouseholdMeasureOption, type FoodPortion } from "@/lib/repositories/food-portions";
import { resolveQuantity, type QuantityResolution } from "@/lib/nutrition/quantity-resolution";

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
  suggested_time?: string | null;
  notes?: string | null;
  source_recipe_id?: string | null;
  items: MealPlanItemPayload[];
};

export type MealPlanItemPayload = {
  id?: string;
  food: string;
  quantity?: string | null;
  unit?: string | null;
  notes?: string | null;
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
type MealRow = Omit<MealPlanMealPayload, "items"> & { id: string; meal_plan_id: string; sort_order: number };
type ItemRow = MealPlanItemPayload & { id: string; meal_id: string; sort_order: number };
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
        suggested_time: meal.suggested_time,
        notes: meal.notes,
        source_recipe_id: meal.source_recipe_id,
        items: (itemsByMeal.get(meal.id) ?? []).map((item) => ({
          id: item.id,
          food: item.food,
          quantity: item.quantity,
          unit: item.unit,
          notes: item.notes,
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
    "SELECT * FROM meal_plans WHERE client_id = ?1 AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
    [clientId]
  );
  return rows[0] ? (await hydrateMealPlans(rows))[0] : null;
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
  const weeklySlots = (results[2]?.results ?? []) as WeeklySlotRow[];
  const substitutions = (results[3]?.results ?? []) as SubstitutionRow[];
  const supplements = (results[4]?.results ?? []) as SupplementRow[];
  const mealsByPlan = groupBy(meals, (meal) => meal.meal_plan_id);
  const itemsByMeal = groupBy(items, (item) => item.meal_id);
  const weeklySlotsByPlan = groupBy(weeklySlots, (item) => item.meal_plan_id);
  const substitutionsByPlan = groupBy(substitutions, (item) => item.meal_plan_id);
  const supplementsByPlan = groupBy(supplements, (item) => item.meal_plan_id);
  return rows.map((row) => ({
    ...row,
    meals: (mealsByPlan.get(row.id) ?? []).map((meal) => ({
      id: meal.id,
      name: meal.name,
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

export async function createMealPlanFromTemplates(input: {
  clientId: string;
  targetGroup: ProtocolTemplateTargetGroup;
  title?: string | null;
}): Promise<MealPlanPayload> {
  const templates = await getAllTemplates({ targetGroup: input.targetGroup });
  const dietTemplates = templates.filter((template) => template.type === "DIETA");
  // FASE 8 (auditoria) — Bariátrico/Renal/Oncológico nunca tiveram nenhum
  // modelo DIETA cadastrado (gap real encontrado na auditoria, não algo que
  // esta fase deveria inventar — ver relatório final). Antes desta checagem,
  // "Criar por modelo" pra esses 3 grupos criava silenciosamente um plano
  // com zero refeições, sem qualquer sinal pra nutricionista do porquê.
  if (!dietTemplates.length) throw new NoTemplateForTargetGroupError(input.targetGroup);
  const relationalTemplates = await getRelationalDietTemplates(templates.map((template) => template.id));
  // FASE 8 (item 8) — mapa sourceItemId -> classificação de slot (só existe
  // pra template já migrado, structure_version='v2'; template ainda
  // "legacy" simplesmente não produz nenhuma entrada aqui, e os itens
  // criados ficam sem slot_* — comportamento idêntico ao de antes desta fase).
  const slotBySourceItemId = await getSlotClassificationBySourceItemId(dietTemplates.map((template) => template.id));
  const meals = dietTemplates.flatMap((template) => {
    const relational = relationalTemplates.get(template.id);
    const templateMeals = relational?.meals.length ? relational.meals : extractMeals(parseJson(template.content));
    return templateMeals.map((meal) => ({
      ...meal,
      items: meal.items.map((item) => {
        const slot = item.id ? slotBySourceItemId.get(item.id) : undefined;
        return slot
          ? { ...item, slot_food_group: slot.food_group, slot_food_subgroup: slot.food_subgroup, slot_nutritional_role: slot.nutritional_role }
          : item;
      }),
    }));
  });
  // Proveniência (item 13): quando há exatamente um template DIETA ativo
  // pro grupo (o caso normal, após a Fase 8 desativar os duplicados
  // legados), registra sua identidade no plano criado.
  const primaryDietTemplate = dietTemplates.length === 1 ? dietTemplates[0] : null;
  const supplements = templates.filter((template) => template.type === "SUPLEMENTACAO").flatMap((template) => {
    const relational = relationalTemplates.get(template.id);
    return relational?.supplements.length ? relational.supplements : extractSupplements(parseJson(template.content));
  });
  const rawSubstitutions = [
    ...dietTemplates.flatMap((template) => relationalTemplates.get(template.id)?.substitutions ?? []),
    ...templates.filter((template) => template.type === "SUBSTITUICAO").flatMap((template) => {
      const relational = relationalTemplates.get(template.id);
      return relational?.substitutions.length ? relational.substitutions : extractSubstitutions(parseJson(template.content));
    }),
  ];
  const substitutions = dedupeMealPlanSubstitutions(rawSubstitutions);

  return createMealPlan({
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
        (id, type, target_group, title, content, notes, is_active, created_at, updated_at)
        VALUES (?1, 'DIETA', ?2, ?3, '', ?4, 1, ?5, ?6)`,
      params: [templateId, input.targetGroup, input.title, plan.notes ?? "Modelo criado a partir de um plano personalizado. Revisar antes de reutilizar.", now, now],
    },
  ];
  if (mealRows.length) statements.push({
    sql: `INSERT INTO diet_template_meals (id, template_id, name, suggested_time, notes, source_recipe_id, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.templateId'), json_extract(value,'$.name'), json_extract(value,'$.time'), json_extract(value,'$.notes'), json_extract(value,'$.sourceRecipeId'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(mealRows)],
  });
  if (itemRows.length) statements.push({
    sql: `INSERT INTO diet_template_items (id, meal_id, food, quantity, unit, notes, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.mealId'), json_extract(value,'$.food'), json_extract(value,'$.quantity'), json_extract(value,'$.unit'), json_extract(value,'$.notes'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
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
  const measureIds = Array.from(new Set(meals.flatMap((meal) => meal.items.map((item) => item.household_measure_id).filter((id): id is string => Boolean(id)))));
  const portions = await Promise.all(measureIds.map((id) => getFoodPortionById(id)));
  const portionsById = new Map(portions.filter((portion): portion is FoodPortion => Boolean(portion)).map((portion) => [portion.id, portion]));
  return Promise.all(
    meals.map(async (meal) => ({
      ...meal,
      items: await Promise.all(
        meal.items.map(async (item) => {
          if (!item.food.trim()) return item;
          const snapshot = await buildItemSnapshot(item.food_source, item.food_ref_id);
          const quantitySnapshot = buildQuantitySnapshots(item, portionsById);
          return { ...item, ...snapshot, ...quantitySnapshot };
        })
      ),
    }))
  );
}

/** Monta o snapshot clinico completo do plano para versionamento (FASE 21). */
function buildMealPlanVersionSnapshot(
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
  const itemRows: Record<string, unknown>[] = [];
  const savedMealIdsByClientId = new Map<string, string>();
  for (const [mealIndex, meal] of meals.entries()) {
    const mealId = crypto.randomUUID();
    if (meal.id) savedMealIdsByClientId.set(meal.id, mealId);
    mealRows.push({ id: mealId, planId, name: meal.name, time: meal.suggested_time ?? null, notes: meal.notes ?? null, sourceRecipeId: meal.source_recipe_id ?? null, order: mealIndex, now });
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
        order: itemIndex,
        now,
      });
    }
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
    { sql: "DELETE FROM meal_plan_weekly_slots WHERE meal_plan_id = ?1", params: [planId] },
    { sql: "DELETE FROM meal_plan_meals WHERE meal_plan_id = ?1", params: [planId] },
    { sql: "DELETE FROM meal_plan_substitutions WHERE meal_plan_id = ?1", params: [planId] },
    { sql: "DELETE FROM meal_plan_supplements WHERE meal_plan_id = ?1", params: [planId] },
  ];
  if (mealRows.length) statements.push({
    sql: `INSERT INTO meal_plan_meals (id, meal_plan_id, name, suggested_time, notes, source_recipe_id, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.planId'), json_extract(value,'$.name'), json_extract(value,'$.time'), json_extract(value,'$.notes'), json_extract(value,'$.sourceRecipeId'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(mealRows)],
  });
  if (itemRows.length) statements.push({
    sql: `INSERT INTO meal_plan_items (id, meal_id, food, quantity, unit, notes, food_source, food_ref_id, canonical_food_id, household_measure_id, food_name_snapshot, nutrition_snapshot, resolved_grams_snapshot, quantity_resolution_snapshot, quantity_locked, substitutions_locked, slot_food_group, slot_food_subgroup, slot_nutritional_role, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.mealId'), json_extract(value,'$.food'), json_extract(value,'$.quantity'), json_extract(value,'$.unit'), json_extract(value,'$.notes'), json_extract(value,'$.foodSource'), json_extract(value,'$.foodRefId'), json_extract(value,'$.canonicalFoodId'), json_extract(value,'$.householdMeasureId'), json_extract(value,'$.foodNameSnapshot'), json_extract(value,'$.nutritionSnapshot'), json_extract(value,'$.resolvedGramsSnapshot'), json_extract(value,'$.quantityResolutionSnapshot'), json_extract(value,'$.quantityLocked'), json_extract(value,'$.substitutionsLocked'), json_extract(value,'$.slotFoodGroup'), json_extract(value,'$.slotFoodSubgroup'), json_extract(value,'$.slotNutritionalRole'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
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
