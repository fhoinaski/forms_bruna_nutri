import { d1Batch, d1Execute, d1Query, type D1Statement } from "@/lib/d1/client";
import type {
  MealPlanItemPayload,
  MealPlanMealPayload,
  MealPlanSubstitutionPayload,
  MealPlanSupplementPayload,
} from "@/lib/repositories/meal-plans";
import {
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  PROTOCOL_TEMPLATE_TYPES,
  type ProtocolTemplateTargetGroup,
  type ProtocolTemplateType,
} from "@/lib/protocol-templates/constants";
import { classifyCulinaryRole, classifyFoodExchangeGroup, normalizeMealContext, type FoodClassification } from "@/lib/nutrition/food-exchange-hierarchy";
import { mealContextForTemplateMeal, SYSTEM_TEMPLATE_FOOD_CONTRACTS } from "@/lib/meal-templates/system-template-contract";

export type { ProtocolTemplateTargetGroup, ProtocolTemplateType };

export interface ProtocolTemplate {
  id: string;
  type: ProtocolTemplateType;
  target_group: ProtocolTemplateTargetGroup;
  title: string;
  content: string;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  // FASE 8 (itens 3/11/13) — metadados de estrutura/risco clínico/versão.
  clinical_risk_level: "low" | "medium" | "high";
  requires_professional_review: number;
  version: number;
  structure_version: "legacy" | "v2";
  template_origin: "SYSTEM" | "USER";
  owner_admin_id: string | null;
  is_default: number;
}

export interface ProtocolTemplateInput {
  type: ProtocolTemplateType;
  target_group: ProtocolTemplateTargetGroup;
  title: string;
  content?: string;
  notes?: string | null;
  is_active?: boolean;
  meals?: MealPlanMealPayload[];
  substitutions?: MealPlanSubstitutionPayload[];
  supplements?: MealPlanSupplementPayload[];
  template_origin?: "SYSTEM" | "USER";
  owner_admin_id?: string | null;
  is_default?: boolean;
}

export type TemplateDetail = {
  meals: MealPlanMealPayload[];
  substitutions: MealPlanSubstitutionPayload[];
  supplements: MealPlanSupplementPayload[];
};

type DietTemplateMealRow = Omit<MealPlanMealPayload, "items"> & { id: string; template_id: string; sort_order: number };
type DietTemplateItemRow = MealPlanItemPayload & { id: string; meal_id: string; sort_order: number };
type DietTemplateSubstitutionRow = MealPlanSubstitutionPayload & { id: string; template_id: string; sort_order: number };
type DietTemplateSupplementRow = MealPlanSupplementPayload & { id: string; template_id: string; sort_order: number };

export function isProtocolTemplateType(value: string): value is ProtocolTemplateType {
  return (PROTOCOL_TEMPLATE_TYPES as readonly string[]).includes(value);
}

export function isProtocolTemplateTargetGroup(value: string): value is ProtocolTemplateTargetGroup {
  return (PROTOCOL_TEMPLATE_TARGET_GROUPS as readonly string[]).includes(value);
}

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

function classifyTemplateFood(food: string) {
  return classifyFoodExchangeGroup({
    descricao: food,
    grupo: "",
    proteina_g: 0,
    carboidrato_g: 0,
    lipidios_g: 0,
  });
}

function defaultExchangeListIdForSlot(classification: FoodClassification, mealName: string): string | null {
  const mealContext = normalizeMealContext(mealName);
  const culinaryRole = classifyCulinaryRole(classification, mealContext);
  if (classification.foodGroup === "CARBOHYDRATE" && culinaryRole === "STARCH_MAIN") return "exl-system-main-meal-starches";
  if (classification.foodGroup === "CARBOHYDRATE" && (culinaryRole === "BREAKFAST_CARB" || culinaryRole === "BREAD_BASE")) return "exl-system-breakfast-carbs";
  if (classification.foodGroup === "PROTEIN" && culinaryRole === "LEAN_PROTEIN_MAIN") return "exl-system-lean-main-proteins";
  if (classification.foodGroup === "FRUIT") return "exl-system-fruit-portions";
  if (classification.foodGroup === "DAIRY") return "exl-system-dairy-options";
  if (classification.foodSubgroup === "LEGUME" || classification.foodSubgroup === "SOY") return "exl-system-legume-options";
  if (classification.foodGroup === "VEGETABLE") return "exl-system-vegetable-sides";
  return null;
}

function buildTemplateMealStatements(templateId: string, meals: MealPlanMealPayload[], now: string): D1Statement[] {
  const mealRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  const slotRows: Record<string, unknown>[] = [];
  const slotFoodRows: Record<string, unknown>[] = [];

  for (const [mealIndex, meal] of meals.entries()) {
    if (!meal.name.trim()) continue;
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
      const itemId = crypto.randomUUID();
      const slotId = crypto.randomUUID();
      const classification = classifyTemplateFood(item.food);
      const contract = SYSTEM_TEMPLATE_FOOD_CONTRACTS[item.food];
      itemRows.push({
        id: itemId,
        mealId,
        food: item.food,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        notes: item.notes ?? null,
        foodSource: item.food_source ?? contract?.food_source ?? null,
        foodRefId: item.food_ref_id ?? contract?.food_ref_id ?? null,
        canonicalFoodId: item.canonical_food_id ?? contract?.canonical_food_id ?? null,
        order: itemIndex,
        now,
      });
      slotRows.push({
        id: slotId,
        mealId,
        foodGroup: item.slot_food_group ?? contract?.food_group ?? classification.foodGroup,
        foodSubgroup: item.slot_food_subgroup ?? contract?.food_subgroup ?? classification.foodSubgroup,
        nutritionalRole: item.slot_nutritional_role ?? contract?.clinical_role ?? classification.nutritionalRole,
        exchangeListId: contract?.exchange_list_id ?? defaultExchangeListIdForSlot(classification, meal.name),
        required: 1,
        exchangeEligible: contract?.exchange_eligible ?? (classification.foodGroup === "OTHER" ? 0 : 1),
        minItems: 1,
        maxItems: 1,
        order: itemIndex,
        now,
      });
      slotFoodRows.push({
        id: crypto.randomUUID(),
        slotId,
        food: item.food,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        sourceItemId: itemId,
        foodSource: item.food_source ?? contract?.food_source ?? null,
        foodRefId: item.food_ref_id ?? contract?.food_ref_id ?? null,
        canonicalFoodId: item.canonical_food_id ?? contract?.canonical_food_id ?? null,
        order: 0,
        now,
      });
    }
  }

  const statements: D1Statement[] = [
    { sql: "DELETE FROM diet_template_slot_foods WHERE slot_id IN (SELECT s.id FROM diet_template_slots s JOIN diet_template_meals m ON m.id = s.meal_id WHERE m.template_id = ?1)", params: [templateId] },
    { sql: "DELETE FROM diet_template_slots WHERE meal_id IN (SELECT id FROM diet_template_meals WHERE template_id = ?1)", params: [templateId] },
    { sql: "DELETE FROM diet_template_items WHERE meal_id IN (SELECT id FROM diet_template_meals WHERE template_id = ?1)", params: [templateId] },
    { sql: "DELETE FROM diet_template_meals WHERE template_id = ?1", params: [templateId] },
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
  if (slotRows.length) statements.push({
    sql: `INSERT INTO diet_template_slots (id, meal_id, food_group, food_subgroup, nutritional_role, exchange_list_id, required, exchange_eligible, min_items, max_items, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.mealId'), json_extract(value,'$.foodGroup'), json_extract(value,'$.foodSubgroup'), json_extract(value,'$.nutritionalRole'), json_extract(value,'$.exchangeListId'), json_extract(value,'$.required'), json_extract(value,'$.exchangeEligible'), json_extract(value,'$.minItems'), json_extract(value,'$.maxItems'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(slotRows)],
  });
  if (slotFoodRows.length) statements.push({
    sql: `INSERT INTO diet_template_slot_foods (id, slot_id, food, quantity, unit, source_item_id, food_source, food_ref_id, canonical_food_id, sort_order, created_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.slotId'), json_extract(value,'$.food'), json_extract(value,'$.quantity'), json_extract(value,'$.unit'), json_extract(value,'$.sourceItemId'), json_extract(value,'$.foodSource'), json_extract(value,'$.foodRefId'), json_extract(value,'$.canonicalFoodId'), json_extract(value,'$.order'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(slotFoodRows)],
  });

  return statements;
}

function buildTemplateSubstitutionStatements(templateId: string, substitutions: MealPlanSubstitutionPayload[], now: string): D1Statement[] {
  const rows = substitutions.filter((item) => item.base_food.trim() && item.option_food.trim()).map((item, order) => ({
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
  const statements: D1Statement[] = [
    { sql: "DELETE FROM diet_template_substitutions WHERE template_id = ?1", params: [templateId] },
  ];
  if (rows.length) statements.push({
    sql: `INSERT INTO diet_template_substitutions (id, template_id, base_food, option_food, quantity, unit, notes, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.templateId'), json_extract(value,'$.baseFood'), json_extract(value,'$.optionFood'), json_extract(value,'$.quantity'), json_extract(value,'$.unit'), json_extract(value,'$.notes'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(rows)],
  });
  return statements;
}

function buildTemplateSupplementStatements(templateId: string, supplements: MealPlanSupplementPayload[], now: string): D1Statement[] {
  const rows = supplements.filter((item) => item.name.trim()).map((item, order) => ({
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
    { sql: "DELETE FROM diet_template_supplements WHERE template_id = ?1", params: [templateId] },
  ];
  if (rows.length) statements.push({
    sql: `INSERT INTO diet_template_supplements (id, template_id, name, dosage, unit, instructions, notes, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.templateId'), json_extract(value,'$.name'), json_extract(value,'$.dosage'), json_extract(value,'$.unit'), json_extract(value,'$.instructions'), json_extract(value,'$.notes'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(rows)],
  });
  return statements;
}

export function buildTemplateDetailStatements(
  templateId: string,
  detail: Partial<TemplateDetail>,
  now: string
): D1Statement[] {
  return [
    ...(detail.meals ? buildTemplateMealStatements(templateId, detail.meals, now) : []),
    ...(detail.substitutions ? buildTemplateSubstitutionStatements(templateId, detail.substitutions, now) : []),
    ...(detail.supplements ? buildTemplateSupplementStatements(templateId, detail.supplements, now) : []),
  ];
}

export async function getAllTemplates(filters: {
  includeInactive?: boolean;
  type?: ProtocolTemplateType;
  targetGroup?: ProtocolTemplateTargetGroup;
} = {}): Promise<ProtocolTemplate[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (!filters.includeInactive) conditions.push("is_active = 1");
  if (filters.type) {
    conditions.push(`type = ?${idx++}`);
    params.push(filters.type);
  }
  if (filters.targetGroup) {
    conditions.push(`target_group = ?${idx++}`);
    params.push(filters.targetGroup);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return d1Query<ProtocolTemplate>(
    `SELECT id, type, target_group, title, content, notes, is_active, created_at, updated_at, clinical_risk_level, requires_professional_review, version, structure_version, template_origin, owner_admin_id, is_default FROM protocol_templates ${where} ORDER BY target_group ASC, type ASC, template_origin ASC, is_default DESC, title ASC`,
    params
  );
}

export async function getTemplatesByGroup(
  group: ProtocolTemplateTargetGroup,
  options: { includeInactive?: boolean } = {}
): Promise<ProtocolTemplate[]> {
  return getAllTemplates({ targetGroup: group, includeInactive: options.includeInactive });
}

export async function getTemplateById(id: string): Promise<ProtocolTemplate | null> {
  const rows = await d1Query<ProtocolTemplate>(
    "SELECT id, type, target_group, title, content, notes, is_active, created_at, updated_at, clinical_risk_level, requires_professional_review, version, structure_version, template_origin, owner_admin_id, is_default FROM protocol_templates WHERE id = ?1 LIMIT 1",
    [id]
  );
  return rows[0] ?? null;
}

export async function getTemplateDetail(id: string): Promise<TemplateDetail> {
  const results = await d1Batch([
    { sql: "SELECT * FROM diet_template_meals WHERE template_id = ?1 ORDER BY sort_order ASC", params: [id] },
    {
      sql: `SELECT i.* FROM diet_template_items i
            JOIN diet_template_meals m ON m.id = i.meal_id
            WHERE m.template_id = ?1
            ORDER BY m.sort_order ASC, i.sort_order ASC`,
      params: [id],
    },
    { sql: "SELECT * FROM diet_template_substitutions WHERE template_id = ?1 ORDER BY sort_order ASC", params: [id] },
    { sql: "SELECT * FROM diet_template_supplements WHERE template_id = ?1 ORDER BY sort_order ASC", params: [id] },
  ]);

  const meals = (results[0]?.results ?? []) as DietTemplateMealRow[];
  const items = (results[1]?.results ?? []) as DietTemplateItemRow[];
  const substitutions = (results[2]?.results ?? []) as DietTemplateSubstitutionRow[];
  const supplements = (results[3]?.results ?? []) as DietTemplateSupplementRow[];
  const itemsByMeal = groupBy(items, (item) => item.meal_id);

  return {
    meals: meals.map((meal) => ({
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
    substitutions: substitutions.map(({ id: rowId, base_food, option_food, quantity, unit, notes }) => ({
      id: rowId,
      base_food,
      option_food,
      quantity,
      unit,
      notes,
    })),
    supplements: supplements.map(({ id: rowId, name, dosage, unit, instructions, notes }) => ({
      id: rowId,
      name,
      dosage,
      unit,
      instructions,
      notes,
    })),
  };
}

export async function replaceTemplateMeals(templateId: string, meals: MealPlanMealPayload[]): Promise<void> {
  await d1Batch(buildTemplateMealStatements(templateId, meals, new Date().toISOString()));
}

export async function replaceTemplateSubstitutions(templateId: string, substitutions: MealPlanSubstitutionPayload[]): Promise<void> {
  await d1Batch(buildTemplateSubstitutionStatements(templateId, substitutions, new Date().toISOString()));
}

export async function replaceTemplateSupplements(templateId: string, supplements: MealPlanSupplementPayload[]): Promise<void> {
  await d1Batch(buildTemplateSupplementStatements(templateId, supplements, new Date().toISOString()));
}

export async function createTemplate(input: ProtocolTemplateInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1Statement[] = [
    {
      sql: `INSERT INTO protocol_templates
        (id, type, target_group, title, content, notes, is_active, template_origin, owner_admin_id, is_default, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
      params: [id, input.type, input.target_group, input.title, input.content ?? "", input.notes ?? null, input.is_active === false ? 0 : 1, input.template_origin ?? "USER", input.owner_admin_id ?? null, input.is_default ? 1 : 0, now, now],
    },
    ...buildTemplateDetailStatements(id, input, now),
  ];
  await d1Batch(statements);
  return id;
}

export async function updateTemplate(
  id: string,
  input: Partial<ProtocolTemplateInput>
): Promise<void> {
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.type !== undefined) {
    updates.push(`type = ?${idx++}`);
    params.push(input.type);
  }
  if (input.target_group !== undefined) {
    updates.push(`target_group = ?${idx++}`);
    params.push(input.target_group);
  }
  if (input.title !== undefined) {
    updates.push(`title = ?${idx++}`);
    params.push(input.title);
  }
  if (input.content !== undefined) {
    updates.push(`content = ?${idx++}`);
    params.push(input.content);
  }
  if (input.notes !== undefined) {
    updates.push(`notes = ?${idx++}`);
    params.push(input.notes);
  }
  if (input.is_active !== undefined) {
    updates.push(`is_active = ?${idx++}`);
    params.push(input.is_active ? 1 : 0);
  }
  if (input.template_origin !== undefined) {
    updates.push(`template_origin = ?${idx++}`);
    params.push(input.template_origin);
  }
  if (input.owner_admin_id !== undefined) {
    updates.push(`owner_admin_id = ?${idx++}`);
    params.push(input.owner_admin_id);
  }
  if (input.is_default !== undefined) {
    updates.push(`is_default = ?${idx++}`);
    params.push(input.is_default ? 1 : 0);
  }

  const now = new Date().toISOString();
  const statements: D1Statement[] = [];
  if (updates.length) {
    updates.push(`updated_at = ?${idx++}`);
    params.push(now, id);
    statements.push({ sql: `UPDATE protocol_templates SET ${updates.join(", ")} WHERE id = ?${idx}`, params });
  }
  statements.push(...buildTemplateDetailStatements(id, input, now));

  if (!statements.length) return;
  await d1Batch(statements);
}

export async function deleteTemplate(id: string): Promise<void> {
  await d1Execute("DELETE FROM protocol_templates WHERE id = ?1", [id]);
}

// FASE 8 — modelo estruturado do template (item 3 do pedido): refeições com
// slots (grupo/subgrupo/papel nutricional) e alimentos-sugestão dentro de
// cada slot, em vez da prescrição fixa que diet_template_items representa
// sozinho. Não substitui getTemplateDetail (que a UI de CRUD atual continua
// usando) — é uma leitura adicional, paralela, da mesma fonte de dados.
export interface TemplateSlotFood {
  food: string;
  quantity: string | null;
  unit: string | null;
  foodSource: string | null;
  foodRefId: string | null;
  canonicalFoodId: string | null;
}
export interface TemplateSlot {
  foodGroup: string;
  foodSubgroup: string;
  nutritionalRole: string;
  exchangeListId: string | null;
  required: boolean;
  exchangeEligible: boolean;
  minItems: number;
  maxItems: number;
  suggestedFoods: TemplateSlotFood[];
}
export interface TemplateMealStructure {
  name: string;
  mealContext: string | null;
  suggestedTime: string | null;
  slots: TemplateSlot[];
}
export interface TemplateStructure {
  id: string;
  name: string;
  description: string | null;
  category: ProtocolTemplateTargetGroup;
  clinicalRiskLevel: "low" | "medium" | "high";
  requiresProfessionalReview: boolean;
  version: number;
  structureVersion: "legacy" | "v2";
  meals: TemplateMealStructure[];
}

interface SlotRow {
  id: string;
  meal_id: string;
  food_group: string;
  food_subgroup: string;
  nutritional_role: string;
  exchange_list_id: string | null;
  required: number;
  exchange_eligible: number;
  min_items: number;
  max_items: number;
  sort_order: number;
}
interface SlotFoodRow {
  slot_id: string;
  food: string;
  quantity: string | null;
  unit: string | null;
  food_source: string | null;
  food_ref_id: string | null;
  canonical_food_id: string | null;
  source_item_id: string | null;
  sort_order: number;
}

/**
 * FASE 8 (item 8) — para cada item de template já classificado em slot,
 * devolve sua classificação, indexada pelo id ORIGINAL de diet_template_items
 * (o mesmo id preservado em getRelationalDietTemplates). Usado por
 * createMealPlanFromTemplates pra carimbar slot_food_group/subgroup/role no
 * meal_plan_item criado a partir desse item de template.
 */
export interface SlotClassification {
  slot_id: string;
  food_group: string;
  food_subgroup: string;
  nutritional_role: string;
  exchange_eligible: boolean;
  exchange_list_id: string | null;
}

export async function getSlotClassificationBySourceItemId(
  templateIds: string[]
): Promise<Map<string, SlotClassification>> {
  const result = new Map<string, SlotClassification>();
  if (!templateIds.length) return result;
  const rows = await d1Query<{ source_item_id: string; slot_id: string; food_group: string; food_subgroup: string; nutritional_role: string; exchange_eligible: number; exchange_list_id: string | null }>(
    `SELECT sf.source_item_id as source_item_id, s.id as slot_id, s.food_group as food_group, s.food_subgroup as food_subgroup, s.nutritional_role as nutritional_role, s.exchange_eligible as exchange_eligible, s.exchange_list_id as exchange_list_id
     FROM diet_template_slot_foods sf
     JOIN diet_template_slots s ON s.id = sf.slot_id
     JOIN diet_template_meals m ON m.id = s.meal_id
     JOIN json_each(?1) ids ON m.template_id = ids.value
     WHERE sf.source_item_id IS NOT NULL`,
    [JSON.stringify(templateIds)]
  );
  for (const row of rows) {
    if (!row.source_item_id) continue;
    result.set(row.source_item_id, {
      slot_id: row.slot_id,
      food_group: row.food_group,
      food_subgroup: row.food_subgroup,
      nutritional_role: row.nutritional_role,
      exchange_eligible: Boolean(row.exchange_eligible),
      exchange_list_id: row.exchange_list_id ?? null,
    });
  }
  return result;
}

export async function getTemplateStructure(id: string): Promise<TemplateStructure | null> {
  const template = await getTemplateById(id);
  if (!template) return null;

  const results = await d1Batch([
    { sql: "SELECT * FROM diet_template_meals WHERE template_id = ?1 ORDER BY sort_order ASC", params: [id] },
    {
      sql: `SELECT s.* FROM diet_template_slots s
            JOIN diet_template_meals m ON m.id = s.meal_id
            WHERE m.template_id = ?1
            ORDER BY m.sort_order ASC, s.sort_order ASC`,
      params: [id],
    },
    {
      sql: `SELECT sf.* FROM diet_template_slot_foods sf
            JOIN diet_template_slots s ON s.id = sf.slot_id
            JOIN diet_template_meals m ON m.id = s.meal_id
            WHERE m.template_id = ?1
            ORDER BY s.sort_order ASC, sf.sort_order ASC`,
      params: [id],
    },
  ]);

  const meals = (results[0]?.results ?? []) as DietTemplateMealRow[];
  const slots = (results[1]?.results ?? []) as SlotRow[];
  const slotFoods = (results[2]?.results ?? []) as SlotFoodRow[];
  const slotsByMeal = groupBy(slots, (slot) => slot.meal_id);
  const foodsBySlot = groupBy(slotFoods, (food) => food.slot_id);

  return {
    id: template.id,
    name: template.title,
    description: template.notes,
    category: template.target_group,
    clinicalRiskLevel: template.clinical_risk_level,
    requiresProfessionalReview: Boolean(template.requires_professional_review),
    version: template.version,
    structureVersion: template.structure_version,
    meals: meals.map((meal) => ({
      name: meal.name,
      mealContext: meal.meal_context ?? mealContextForTemplateMeal(meal.name),
      suggestedTime: meal.suggested_time ?? null,
      slots: (slotsByMeal.get(meal.id) ?? []).map((slot) => ({
        foodGroup: slot.food_group,
        foodSubgroup: slot.food_subgroup,
        nutritionalRole: slot.nutritional_role,
        exchangeListId: slot.exchange_list_id ?? null,
        required: Boolean(slot.required),
        exchangeEligible: Boolean(slot.exchange_eligible),
        minItems: slot.min_items,
        maxItems: slot.max_items,
        suggestedFoods: (foodsBySlot.get(slot.id) ?? []).map((food) => ({
          food: food.food,
          quantity: food.quantity,
          unit: food.unit,
          foodSource: food.food_source ?? null,
          foodRefId: food.food_ref_id ?? null,
          canonicalFoodId: food.canonical_food_id ?? null,
        })),
      })),
    })),
  };
}
