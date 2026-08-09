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

function buildTemplateMealStatements(templateId: string, meals: MealPlanMealPayload[], now: string): D1Statement[] {
  const mealRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];

  for (const [mealIndex, meal] of meals.entries()) {
    if (!meal.name.trim()) continue;
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

  const statements: D1Statement[] = [
    { sql: "DELETE FROM diet_template_items WHERE meal_id IN (SELECT id FROM diet_template_meals WHERE template_id = ?1)", params: [templateId] },
    { sql: "DELETE FROM diet_template_meals WHERE template_id = ?1", params: [templateId] },
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
    `SELECT id, type, target_group, title, content, notes, is_active, created_at, updated_at FROM protocol_templates ${where} ORDER BY target_group ASC, type ASC, title ASC`,
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
    "SELECT id, type, target_group, title, content, notes, is_active, created_at, updated_at FROM protocol_templates WHERE id = ?1 LIMIT 1",
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
        (id, type, target_group, title, content, notes, is_active, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      params: [id, input.type, input.target_group, input.title, input.content ?? "", input.notes ?? null, input.is_active === false ? 0 : 1, now, now],
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
