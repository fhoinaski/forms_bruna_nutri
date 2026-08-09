import { d1Batch, d1Query, type D1Statement } from "@/lib/d1/client";
import { getAllTemplates } from "@/lib/repositories/protocol-templates";
import type { ProtocolTemplateTargetGroup } from "@/lib/protocol-templates/constants";

export type MealPlanStatus = "draft" | "active" | "archived";

export type MealPlanPayload = {
  id: string;
  client_id: string;
  title: string;
  target_group: string | null;
  status: MealPlanStatus;
  version: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  meals: MealPlanMealPayload[];
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
};

export type MealPlanSubstitutionPayload = {
  id?: string;
  base_food: string;
  option_food: string;
  quantity?: string | null;
  unit?: string | null;
  notes?: string | null;
};

export type MealPlanSupplementPayload = {
  id?: string;
  name: string;
  dosage?: string | null;
  unit?: string | null;
  instructions?: string | null;
  notes?: string | null;
};

type MealPlanRow = Omit<MealPlanPayload, "meals" | "substitutions" | "supplements">;
type MealRow = Omit<MealPlanMealPayload, "items"> & { id: string; meal_plan_id: string; sort_order: number };
type ItemRow = MealPlanItemPayload & { id: string; meal_id: string; sort_order: number };
type SubstitutionRow = MealPlanSubstitutionPayload & { id: string; meal_plan_id: string; sort_order: number };
type SupplementRow = MealPlanSupplementPayload & { id: string; meal_plan_id: string; sort_order: number };

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
  const substitutions = (results[2]?.results ?? []) as SubstitutionRow[];
  const supplements = (results[3]?.results ?? []) as SupplementRow[];
  const mealsByPlan = groupBy(meals, (meal) => meal.meal_plan_id);
  const itemsByMeal = groupBy(items, (item) => item.meal_id);
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
      })),
    })),
    substitutions: (substitutionsByPlan.get(row.id) ?? []).map(({ id, base_food, option_food, quantity, unit, notes }) => ({ id, base_food, option_food, quantity, unit, notes })),
    supplements: (supplementsByPlan.get(row.id) ?? []).map(({ id, name, dosage, unit, instructions, notes }) => ({ id, name, dosage, unit, instructions, notes })),
  }));
}

export async function createMealPlanFromTemplates(input: {
  clientId: string;
  targetGroup: ProtocolTemplateTargetGroup;
  title?: string | null;
}): Promise<MealPlanPayload> {
  const templates = await getAllTemplates({ targetGroup: input.targetGroup });
  const meals = templates.filter((template) => template.type === "DIETA").flatMap((template) => extractMeals(parseJson(template.content)));
  const supplements = templates.filter((template) => template.type === "SUPLEMENTACAO").flatMap((template) => extractSupplements(parseJson(template.content)));
  const substitutions = templates.filter((template) => template.type === "SUBSTITUICAO").flatMap((template) => extractSubstitutions(parseJson(template.content)));

  return createMealPlan({
    clientId: input.clientId,
    title: input.title?.trim() || `Plano alimentar - ${input.targetGroup.replaceAll("_", " ").toLowerCase()}`,
    targetGroup: input.targetGroup,
    status: "draft",
    notes: "Plano criado a partir de modelo predefinido. Revisar e personalizar antes de ativar no portal.",
    meals,
    substitutions,
    supplements,
  });
}

export async function createMealPlan(input: {
  clientId: string;
  title: string;
  targetGroup?: string | null;
  status?: MealPlanStatus;
  notes?: string | null;
  meals: MealPlanMealPayload[];
  substitutions: MealPlanSubstitutionPayload[];
  supplements: MealPlanSupplementPayload[];
}): Promise<MealPlanPayload> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1Statement[] = [];
  if (input.status === "active") {
    statements.push({
      sql: "UPDATE meal_plans SET status = 'archived', version = version + 1, updated_at = ?1 WHERE client_id = ?2 AND status = 'active'",
      params: [now, input.clientId],
    });
  }
  statements.push({
    sql: `INSERT INTO meal_plans (id, client_id, title, target_group, status, version, notes, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?8)`,
    params: [id, input.clientId, input.title, input.targetGroup ?? null, input.status ?? "draft", input.notes ?? null, now, now],
  });
  statements.push(...buildMealPlanDetailStatements(id, input.meals, input.substitutions, input.supplements, now));
  await d1Batch(statements);
  const rows = await d1Query<MealPlanRow>("SELECT * FROM meal_plans WHERE id = ?1 LIMIT 1", [id]);
  return (await hydrateMealPlans(rows))[0];
}

export async function updateMealPlan(planId: string, clientId: string, input: {
  title: string;
  status: MealPlanStatus;
  notes?: string | null;
  meals: MealPlanMealPayload[];
  substitutions: MealPlanSubstitutionPayload[];
  supplements: MealPlanSupplementPayload[];
}): Promise<MealPlanPayload | null> {
  const existingRows = await d1Query<MealPlanRow>(
    "SELECT * FROM meal_plans WHERE id = ?1 AND client_id = ?2 LIMIT 1",
    [planId, clientId]
  );
  if (!existingRows[0]) return null;

  const now = new Date().toISOString();
  const statements: D1Statement[] = [];
  if (input.status === "active") {
    statements.push({
      sql: "UPDATE meal_plans SET status = 'archived', version = version + 1, updated_at = ?1 WHERE client_id = ?2 AND status = 'active' AND id <> ?3",
      params: [now, clientId, planId],
    });
  }
  statements.push({
    sql: "UPDATE meal_plans SET title = ?1, status = ?2, notes = ?3, version = version + 1, updated_at = ?4 WHERE id = ?5 AND client_id = ?6",
    params: [input.title, input.status, input.notes ?? null, now, planId, clientId],
  });
  statements.push(...buildMealPlanDetailStatements(planId, input.meals, input.substitutions, input.supplements, now));
  await d1Batch(statements);
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
  substitutions: MealPlanSubstitutionPayload[],
  supplements: MealPlanSupplementPayload[],
  now: string
): D1Statement[] {
  const mealRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  for (const [mealIndex, meal] of meals.entries()) {
    const mealId = crypto.randomUUID();
    mealRows.push({ id: mealId, planId, name: meal.name, time: meal.suggested_time ?? null, notes: meal.notes ?? null, sourceRecipeId: meal.source_recipe_id ?? null, order: mealIndex, now });
    for (const [itemIndex, item] of meal.items.entries()) {
      if (!item.food.trim()) continue;
      itemRows.push({ id: crypto.randomUUID(), mealId, food: item.food, quantity: item.quantity ?? null, unit: item.unit ?? null, notes: item.notes ?? null, order: itemIndex, now });
    }
  }
  const substitutionRows = substitutions.filter((item) => item.base_food.trim() && item.option_food.trim()).map((item, order) => ({
    id: crypto.randomUUID(), planId, baseFood: item.base_food, optionFood: item.option_food, quantity: item.quantity ?? null, unit: item.unit ?? null, notes: item.notes ?? null, order, now,
  }));
  const supplementRows = supplements.filter((item) => item.name.trim()).map((item, order) => ({
    id: crypto.randomUUID(), planId, name: item.name, dosage: item.dosage ?? null, unit: item.unit ?? null, instructions: item.instructions ?? null, notes: item.notes ?? null, order, now,
  }));
  const statements: D1Statement[] = [
    { sql: "DELETE FROM meal_plan_items WHERE meal_id IN (SELECT id FROM meal_plan_meals WHERE meal_plan_id = ?1)", params: [planId] },
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
    sql: `INSERT INTO meal_plan_items (id, meal_id, food, quantity, unit, notes, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.mealId'), json_extract(value,'$.food'), json_extract(value,'$.quantity'), json_extract(value,'$.unit'), json_extract(value,'$.notes'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(itemRows)],
  });
  if (substitutionRows.length) statements.push({
    sql: `INSERT INTO meal_plan_substitutions (id, meal_plan_id, base_food, option_food, quantity, unit, notes, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.planId'), json_extract(value,'$.baseFood'), json_extract(value,'$.optionFood'), json_extract(value,'$.quantity'), json_extract(value,'$.unit'), json_extract(value,'$.notes'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(substitutionRows)],
  });
  if (supplementRows.length) statements.push({
    sql: `INSERT INTO meal_plan_supplements (id, meal_plan_id, name, dosage, unit, instructions, notes, sort_order, created_at, updated_at)
          SELECT json_extract(value,'$.id'), json_extract(value,'$.planId'), json_extract(value,'$.name'), json_extract(value,'$.dosage'), json_extract(value,'$.unit'), json_extract(value,'$.instructions'), json_extract(value,'$.notes'), json_extract(value,'$.order'), json_extract(value,'$.now'), json_extract(value,'$.now') FROM json_each(?1)`,
    params: [JSON.stringify(supplementRows)],
  });
  return statements;
}
