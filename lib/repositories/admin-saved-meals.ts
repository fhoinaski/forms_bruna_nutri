import { d1Execute, d1Query } from "@/lib/d1/client";
import type { MealPlanItemPayload, MealPlanMealPayload } from "@/lib/repositories/meal-plans";
import { getMealStructure, type MealStructureType } from "@/lib/meal-plans/flexible-structure";

/**
 * Refeição salva/reutilizável por um profissional (R4, seções 10/21-24) —
 * MEAL_TEMPLATE, distinta de PLAN_TEMPLATE (protocol_templates). Guarda só
 * ESTRUTURA (nome, tipo, itens/opções/grupos de escolha com identidade
 * canônica) — nunca nutrição congelada como autoridade (seção 27): ao
 * salvar, `sanitizeMealForSaving` remove os campos de snapshot/lock/slot;
 * ao aplicar, `applySavedMeal` gera identities novas pra tudo, e a
 * Nutrition Engine recalcula a partir de food_source/food_ref_id.
 */
export interface AdminSavedMealRow {
  id: string;
  admin_id: string;
  name: string;
  meal_structure: MealStructureType;
  content: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminSavedMeal {
  id: string;
  admin_id: string;
  name: string;
  meal_structure: MealStructureType;
  meal: MealPlanMealPayload;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

/** Nunca persiste nutrição congelada, locks ou proveniência de slot de um plano específico — só a estrutura reutilizável. */
function sanitizeItemForSaving(item: MealPlanItemPayload): MealPlanItemPayload {
  return {
    food: item.food,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    notes: item.notes ?? null,
    is_optional: item.is_optional ?? false,
    food_source: item.food_source ?? null,
    food_ref_id: item.food_ref_id ?? null,
    canonical_food_id: item.canonical_food_id ?? null,
    household_measure_id: item.household_measure_id ?? null,
  };
}

function sanitizeMealForSaving(meal: MealPlanMealPayload): MealPlanMealPayload {
  return {
    name: meal.name,
    meal_context: meal.meal_context ?? null,
    suggested_time: meal.suggested_time ?? null,
    notes: meal.notes ?? null,
    meal_structure: getMealStructure(meal),
    patient_instruction: meal.patient_instruction ?? null,
    items: meal.items.map(sanitizeItemForSaving),
    options: (meal.options ?? []).map((option) => ({ label: option.label, description: option.description ?? null, items: option.items.map(sanitizeItemForSaving) })),
    choice_groups: (meal.choice_groups ?? []).map((group) => ({
      title: group.title,
      description: group.description ?? null,
      min_selections: group.min_selections,
      max_selections: group.max_selections,
      items: group.items.map(sanitizeItemForSaving),
    })),
  };
}

function rowToSavedMeal(row: AdminSavedMealRow): AdminSavedMeal {
  return {
    id: row.id,
    admin_id: row.admin_id,
    name: row.name,
    meal_structure: row.meal_structure,
    meal: JSON.parse(row.content) as MealPlanMealPayload,
    usage_count: row.usage_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function saveMealForReuse(input: { adminId: string; name: string; meal: MealPlanMealPayload }): Promise<AdminSavedMeal> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const sanitized = sanitizeMealForSaving(input.meal);
  await d1Execute(
    `INSERT INTO admin_saved_meals (id, admin_id, name, meal_structure, content, usage_count, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)`,
    [id, input.adminId, input.name.trim(), sanitized.meal_structure, JSON.stringify(sanitized), now]
  );
  return { id, admin_id: input.adminId, name: input.name.trim(), meal_structure: sanitized.meal_structure as MealStructureType, meal: sanitized, usage_count: 0, created_at: now, updated_at: now };
}

export async function listSavedMeals(adminId: string, limit = 50): Promise<AdminSavedMeal[]> {
  const rows = await d1Query<AdminSavedMealRow>(
    `SELECT * FROM admin_saved_meals WHERE admin_id = ?1 ORDER BY updated_at DESC LIMIT ?2`,
    [adminId, Math.max(1, Math.min(200, limit))]
  );
  return rows.map(rowToSavedMeal);
}

export async function getSavedMeal(adminId: string, id: string): Promise<AdminSavedMeal | null> {
  const rows = await d1Query<AdminSavedMealRow>(
    `SELECT * FROM admin_saved_meals WHERE admin_id = ?1 AND id = ?2 LIMIT 1`,
    [adminId, id]
  );
  return rows[0] ? rowToSavedMeal(rows[0]) : null;
}

export async function deleteSavedMeal(adminId: string, id: string): Promise<void> {
  await d1Execute(`DELETE FROM admin_saved_meals WHERE admin_id = ?1 AND id = ?2`, [adminId, id]);
}

export async function incrementSavedMealUsage(adminId: string, id: string): Promise<void> {
  await d1Execute(
    `UPDATE admin_saved_meals SET usage_count = usage_count + 1, updated_at = ?3 WHERE admin_id = ?1 AND id = ?2`,
    [adminId, id, new Date().toISOString()]
  );
}

/**
 * Materializa uma refeição salva pronta pra entrar no draft do Composer
 * (seção 31: aplica no estado local, nunca auto-save). `id` é omitido em
 * tudo — o backend sempre gera identity nova ao salvar o plano (mesma
 * regra já usada por "duplicar refeição" no Composer).
 */
export function applySavedMeal(saved: AdminSavedMeal): MealPlanMealPayload {
  return sanitizeMealForSaving(saved.meal);
}
