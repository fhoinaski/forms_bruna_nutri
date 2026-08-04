import { d1Execute, d1Query } from "@/lib/d1/client";
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
  const plans: MealPlanPayload[] = [];
  for (const row of rows) {
    plans.push(await hydrateMealPlan(row));
  }
  return plans;
}

export async function getActiveMealPlan(clientId: string): Promise<MealPlanPayload | null> {
  const rows = await d1Query<MealPlanRow>(
    "SELECT * FROM meal_plans WHERE client_id = ?1 AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
    [clientId]
  );
  return rows[0] ? hydrateMealPlan(rows[0]) : null;
}

async function hydrateMealPlan(row: MealPlanRow): Promise<MealPlanPayload> {
  const [meals, substitutions, supplements] = await Promise.all([
    d1Query<MealRow>("SELECT * FROM meal_plan_meals WHERE meal_plan_id = ?1 ORDER BY sort_order ASC", [row.id]),
    d1Query<SubstitutionRow>("SELECT * FROM meal_plan_substitutions WHERE meal_plan_id = ?1 ORDER BY sort_order ASC", [row.id]),
    d1Query<SupplementRow>("SELECT * FROM meal_plan_supplements WHERE meal_plan_id = ?1 ORDER BY sort_order ASC", [row.id]),
  ]);
  const itemsByMeal = new Map<string, ItemRow[]>();
  for (const meal of meals) {
    itemsByMeal.set(meal.id, await d1Query<ItemRow>("SELECT * FROM meal_plan_items WHERE meal_id = ?1 ORDER BY sort_order ASC", [meal.id]));
  }
  return {
    ...row,
    meals: meals.map((meal) => ({
      id: meal.id,
      name: meal.name,
      suggested_time: meal.suggested_time,
      notes: meal.notes,
      items: (itemsByMeal.get(meal.id) ?? []).map((item) => ({
        id: item.id,
        food: item.food,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes,
      })),
    })),
    substitutions: substitutions.map(({ id, base_food, option_food, quantity, unit, notes }) => ({ id, base_food, option_food, quantity, unit, notes })),
    supplements: supplements.map(({ id, name, dosage, unit, instructions, notes }) => ({ id, name, dosage, unit, instructions, notes })),
  };
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
  await d1Execute(
    `INSERT INTO meal_plans (id, client_id, title, target_group, status, version, notes, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?8)`,
    [id, input.clientId, input.title, input.targetGroup ?? null, input.status ?? "draft", input.notes ?? null, now, now]
  );
  await replaceMealPlanDetails(id, input.meals, input.substitutions, input.supplements, now);
  const rows = await d1Query<MealPlanRow>("SELECT * FROM meal_plans WHERE id = ?1 LIMIT 1", [id]);
  return hydrateMealPlan(rows[0]);
}

export async function updateMealPlan(planId: string, input: {
  title: string;
  status: MealPlanStatus;
  notes?: string | null;
  meals: MealPlanMealPayload[];
  substitutions: MealPlanSubstitutionPayload[];
  supplements: MealPlanSupplementPayload[];
}): Promise<MealPlanPayload | null> {
  const now = new Date().toISOString();
  await d1Execute(
    "UPDATE meal_plans SET title = ?1, status = ?2, notes = ?3, version = version + 1, updated_at = ?4 WHERE id = ?5",
    [input.title, input.status, input.notes ?? null, now, planId]
  );
  await replaceMealPlanDetails(planId, input.meals, input.substitutions, input.supplements, now);
  const rows = await d1Query<MealPlanRow>("SELECT * FROM meal_plans WHERE id = ?1 LIMIT 1", [planId]);
  return rows[0] ? hydrateMealPlan(rows[0]) : null;
}

async function replaceMealPlanDetails(
  planId: string,
  meals: MealPlanMealPayload[],
  substitutions: MealPlanSubstitutionPayload[],
  supplements: MealPlanSupplementPayload[],
  now: string
) {
  await d1Execute("DELETE FROM meal_plan_items WHERE meal_id IN (SELECT id FROM meal_plan_meals WHERE meal_plan_id = ?1)", [planId]);
  await d1Execute("DELETE FROM meal_plan_meals WHERE meal_plan_id = ?1", [planId]);
  await d1Execute("DELETE FROM meal_plan_substitutions WHERE meal_plan_id = ?1", [planId]);
  await d1Execute("DELETE FROM meal_plan_supplements WHERE meal_plan_id = ?1", [planId]);

  for (const [mealIndex, meal] of meals.entries()) {
    const mealId = crypto.randomUUID();
    await d1Execute(
      `INSERT INTO meal_plan_meals (id, meal_plan_id, name, suggested_time, notes, sort_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      [mealId, planId, meal.name, meal.suggested_time ?? null, meal.notes ?? null, mealIndex, now, now]
    );
    for (const [itemIndex, item] of meal.items.entries()) {
      if (!item.food.trim()) continue;
      await d1Execute(
        `INSERT INTO meal_plan_items (id, meal_id, food, quantity, unit, notes, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        [crypto.randomUUID(), mealId, item.food, item.quantity ?? null, item.unit ?? null, item.notes ?? null, itemIndex, now, now]
      );
    }
  }

  for (const [index, item] of substitutions.entries()) {
    if (!item.base_food.trim() || !item.option_food.trim()) continue;
    await d1Execute(
      `INSERT INTO meal_plan_substitutions (id, meal_plan_id, base_food, option_food, quantity, unit, notes, sort_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      [crypto.randomUUID(), planId, item.base_food, item.option_food, item.quantity ?? null, item.unit ?? null, item.notes ?? null, index, now, now]
    );
  }

  for (const [index, item] of supplements.entries()) {
    if (!item.name.trim()) continue;
    await d1Execute(
      `INSERT INTO meal_plan_supplements (id, meal_plan_id, name, dosage, unit, instructions, notes, sort_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      [crypto.randomUUID(), planId, item.name, item.dosage ?? null, item.unit ?? null, item.instructions ?? null, item.notes ?? null, index, now, now]
    );
  }
}
