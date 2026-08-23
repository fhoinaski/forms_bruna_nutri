import { d1Batch, d1Query } from "@/lib/d1/client";
import { getFoodByReference } from "@/lib/nutrition/food-catalog";
import { resolveQuantity } from "@/lib/nutrition/quantity-resolution";
import {
  isValidTemplateQuantity,
  isValidTemplateUnit,
  mealContextForTemplateMeal,
  type TemplateClinicalRole,
} from "@/lib/meal-templates/system-template-contract";

export type MealTemplateIntegrityIssueCode =
  | "MISSING_MEAL_CONTEXT"
  | "MISSING_SLOT_ROLE"
  | "UNRESOLVED_FOOD"
  | "UNCALCULABLE_FOOD"
  | "INVALID_QUANTITY"
  | "INVALID_UNIT"
  | "ORPHAN_SLOT"
  | "ORPHAN_SLOT_FOOD"
  | "DUPLICATE_SLOT"
  | "DUPLICATE_FOOD"
  | "INVALID_EXCHANGE_LIST"
  | "AMBIGUOUS_TEMPLATE_VERSION"
  | "EMPTY_TEMPLATE";

export type MealTemplateIntegrityIssue = {
  code: MealTemplateIntegrityIssueCode;
  severity: "ERROR" | "WARN";
  templateId: string;
  mealId?: string | null;
  slotId?: string | null;
  foodId?: string | null;
  message: string;
};

export type MealTemplateIntegrityResult = {
  templateId: string;
  valid: boolean;
  issues: MealTemplateIntegrityIssue[];
  stats: {
    meals: number;
    slots: number;
    foods: number;
    resolved: number;
    calculable: number;
  };
};

type TemplateRow = {
  id: string;
  type: string;
  target_group: string;
  title: string;
  is_active: number;
  version: number | null;
  template_origin: string;
  is_default: number;
};

type MealRow = {
  id: string;
  template_id: string;
  name: string;
  meal_context: string | null;
  sort_order: number;
};

type ItemRow = {
  id: string;
  meal_id: string;
  food: string;
  quantity: string | null;
  unit: string | null;
  food_source: string | null;
  food_ref_id: string | null;
  canonical_food_id: string | null;
  sort_order: number;
};

type SlotRow = {
  id: string;
  meal_id: string;
  food_group: string;
  food_subgroup: string;
  nutritional_role: string;
  exchange_list_id: string | null;
  required: number;
  exchange_eligible: number;
  sort_order: number;
};

type SlotFoodRow = {
  id: string;
  slot_id: string;
  food: string;
  quantity: string | null;
  unit: string | null;
  source_item_id: string | null;
  food_source: string | null;
  food_ref_id: string | null;
  canonical_food_id: string | null;
  sort_order: number;
};

type ExchangeListRow = { id: string; slug: string; active: number };

const ROLE_EXCHANGE_LIST: Partial<Record<TemplateClinicalRole, string>> = {
  BREAKFAST_CARB: "exl-system-breakfast-carbs",
  MAIN_STARCH: "exl-system-main-meal-starches",
  MAIN_PROTEIN: "exl-system-lean-main-proteins",
  FRUIT: "exl-system-fruit-portions",
  LEGUME: "exl-system-legume-options",
  VEGETABLE: "exl-system-vegetable-sides",
  DAIRY: "exl-system-dairy-options",
};

const CLINICAL_ROLES = new Set<string>([
  "BREAKFAST_CARB",
  "FRUIT",
  "MAIN_STARCH",
  "LEGUME",
  "MAIN_PROTEIN",
  "VEGETABLE",
  "DAIRY",
  "FAT",
  "OTHER",
]);

function issue(input: Omit<MealTemplateIntegrityIssue, "severity"> & { severity?: "ERROR" | "WARN" }): MealTemplateIntegrityIssue {
  return { severity: "ERROR", ...input };
}

function key(parts: Array<string | number | null | undefined>): string {
  return parts.map((part) => String(part ?? "")).join("|");
}

export async function listActiveSystemDietTemplates(): Promise<TemplateRow[]> {
  return d1Query<TemplateRow>(
    `SELECT id, type, target_group, title, is_active, version, template_origin, is_default
       FROM protocol_templates
      WHERE is_active = 1
        AND template_origin = 'SYSTEM'
        AND type = 'DIETA'
      ORDER BY target_group ASC, is_default DESC, title ASC`,
    []
  );
}

export async function validateMealTemplateIntegrity(templateId: string): Promise<MealTemplateIntegrityResult> {
  const [templateRows, mealResult, itemResult, slotResult, slotFoodResult, exchangeListResult] = await Promise.all([
    d1Query<TemplateRow>(
      `SELECT id, type, target_group, title, is_active, version, template_origin, is_default
         FROM protocol_templates
        WHERE id = ?1
        LIMIT 1`,
      [templateId]
    ),
    d1Batch([
      { sql: "SELECT * FROM diet_template_meals WHERE template_id = ?1 ORDER BY sort_order ASC", params: [templateId] },
      {
        sql: `SELECT i.* FROM diet_template_items i
                JOIN diet_template_meals m ON m.id = i.meal_id
               WHERE m.template_id = ?1
               ORDER BY m.sort_order ASC, i.sort_order ASC`,
        params: [templateId],
      },
      {
        sql: `SELECT s.* FROM diet_template_slots s
                JOIN diet_template_meals m ON m.id = s.meal_id
               WHERE m.template_id = ?1
               ORDER BY m.sort_order ASC, s.sort_order ASC`,
        params: [templateId],
      },
      {
        sql: `SELECT sf.* FROM diet_template_slot_foods sf
                JOIN diet_template_slots s ON s.id = sf.slot_id
                JOIN diet_template_meals m ON m.id = s.meal_id
               WHERE m.template_id = ?1
               ORDER BY m.sort_order ASC, s.sort_order ASC, sf.sort_order ASC`,
        params: [templateId],
      },
      { sql: "SELECT id, slug, active FROM exchange_lists WHERE active = 1", params: [] },
    ]),
  ]).then(([templateRows, batch]) => [
    templateRows,
    batch[0],
    batch[1],
    batch[2],
    batch[3],
    batch[4],
  ] as const);

  const template = templateRows[0];
  const meals = (mealResult.results ?? []) as MealRow[];
  const items = (itemResult.results ?? []) as ItemRow[];
  const slots = (slotResult.results ?? []) as SlotRow[];
  const slotFoods = (slotFoodResult.results ?? []) as SlotFoodRow[];
  const exchangeLists = new Map(((exchangeListResult?.results ?? []) as ExchangeListRow[]).map((row) => [row.id, row]));
  const issues: MealTemplateIntegrityIssue[] = [];

  if (!template || template.version === null || template.version < 1) {
    issues.push(issue({ code: "AMBIGUOUS_TEMPLATE_VERSION", templateId, message: "Template sem versão explícita válida." }));
  }
  if (!meals.length) {
    issues.push(issue({ code: "EMPTY_TEMPLATE", templateId, message: "Template SYSTEM ativo de dieta não possui refeições." }));
  }

  const mealIds = new Set(meals.map((meal) => meal.id));
  const slotsByMeal = new Map<string, SlotRow[]>();
  for (const slot of slots) {
    if (!mealIds.has(slot.meal_id)) {
      issues.push(issue({ code: "ORPHAN_SLOT", templateId, mealId: slot.meal_id, slotId: slot.id, message: "Slot referencia refeição inexistente." }));
    }
    slotsByMeal.set(slot.meal_id, [...(slotsByMeal.get(slot.meal_id) ?? []), slot]);
  }

  for (const meal of meals) {
    const expectedContext = mealContextForTemplateMeal(meal.name);
    if (!meal.meal_context || meal.meal_context !== expectedContext || expectedContext === "GENERIC") {
      issues.push(issue({ code: "MISSING_MEAL_CONTEXT", templateId, mealId: meal.id, message: `Refeição "${meal.name}" sem mealContext determinístico.` }));
    }
  }

  for (const meal of meals) {
    const seenOrders = new Set<number>();
    const seenSlotKeys = new Set<string>();
    for (const slot of slotsByMeal.get(meal.id) ?? []) {
      if (seenOrders.has(slot.sort_order)) {
        issues.push(issue({ code: "DUPLICATE_SLOT", templateId, mealId: meal.id, slotId: slot.id, message: `Slot order ${slot.sort_order} duplicado na refeição.` }));
      }
      seenOrders.add(slot.sort_order);
      const slotKey = key([slot.food_group, slot.food_subgroup, slot.nutritional_role, slot.sort_order]);
      if (seenSlotKeys.has(slotKey)) {
        issues.push(issue({ code: "DUPLICATE_SLOT", templateId, mealId: meal.id, slotId: slot.id, message: "Slot estrutural duplicado." }));
      }
      seenSlotKeys.add(slotKey);
      if (!CLINICAL_ROLES.has(slot.nutritional_role)) {
        issues.push(issue({ code: "MISSING_SLOT_ROLE", templateId, mealId: meal.id, slotId: slot.id, message: `Slot sem role clínico explícito: ${slot.nutritional_role || "vazio"}.` }));
      }
      const expectedList = ROLE_EXCHANGE_LIST[slot.nutritional_role as TemplateClinicalRole] ?? null;
      if (slot.exchange_eligible && expectedList && slot.exchange_list_id !== expectedList) {
        issues.push(issue({ code: "INVALID_EXCHANGE_LIST", templateId, mealId: meal.id, slotId: slot.id, message: `Lista esperada ${expectedList}, recebida ${slot.exchange_list_id ?? "nenhuma"}.` }));
      }
      if (slot.exchange_list_id && !exchangeLists.has(slot.exchange_list_id)) {
        issues.push(issue({ code: "INVALID_EXCHANGE_LIST", templateId, mealId: meal.id, slotId: slot.id, message: `Lista ${slot.exchange_list_id} não existe ou está inativa.` }));
      }
    }
  }

  const seenFoodByMealSlot = new Set<string>();
  const slotIds = new Set(slots.map((slot) => slot.id));
  const itemById = new Map(items.map((item) => [item.id, item]));
  let resolved = 0;
  let calculable = 0;

  for (const slotFood of slotFoods) {
    if (!slotIds.has(slotFood.slot_id)) {
      issues.push(issue({ code: "ORPHAN_SLOT_FOOD", templateId, slotId: slotFood.slot_id, foodId: slotFood.id, message: "Slot food referencia slot inexistente." }));
    }
    const duplicateKey = key([slotFood.slot_id, slotFood.food_source, slotFood.food_ref_id, slotFood.food]);
    if (seenFoodByMealSlot.has(duplicateKey)) {
      issues.push(issue({ code: "DUPLICATE_FOOD", templateId, slotId: slotFood.slot_id, foodId: slotFood.id, message: "Mesmo alimento duplicado no mesmo slot." }));
    }
    seenFoodByMealSlot.add(duplicateKey);
    const sourceItem = slotFood.source_item_id ? itemById.get(slotFood.source_item_id) : null;
    const quantity = slotFood.quantity ?? sourceItem?.quantity ?? null;
    const unit = slotFood.unit ?? sourceItem?.unit ?? null;
    if (!isValidTemplateQuantity(quantity)) {
      issues.push(issue({ code: "INVALID_QUANTITY", templateId, slotId: slotFood.slot_id, foodId: slotFood.id, message: `Quantidade inválida para ${slotFood.food}.` }));
    }
    if (!isValidTemplateUnit(unit)) {
      issues.push(issue({ code: "INVALID_UNIT", templateId, slotId: slotFood.slot_id, foodId: slotFood.id, message: `Unidade inválida para ${slotFood.food}.` }));
    }
    const food_source = slotFood.food_source ?? sourceItem?.food_source ?? null;
    const food_ref_id = slotFood.food_ref_id ?? sourceItem?.food_ref_id ?? null;
    const canonical_food_id = slotFood.canonical_food_id ?? sourceItem?.canonical_food_id ?? null;
    if (!food_source || !food_ref_id) {
      issues.push(issue({ code: "UNRESOLVED_FOOD", templateId, slotId: slotFood.slot_id, foodId: slotFood.id, message: `Alimento obrigatório sem identidade: ${slotFood.food}.` }));
      continue;
    }
    const details = await getFoodByReference({ source: food_source as never, sourceId: food_ref_id, canonicalId: canonical_food_id });
    if (!details) {
      issues.push(issue({ code: "UNCALCULABLE_FOOD", templateId, slotId: slotFood.slot_id, foodId: slotFood.id, message: `Identidade não calculável: ${food_source}:${food_ref_id}.` }));
      continue;
    }
    resolved++;
    const quantityResolution = resolveQuantity({ quantity, unit });
    if (!quantityResolution.grams || quantityResolution.confidence === "none") {
      issues.push(issue({ code: "INVALID_QUANTITY", templateId, slotId: slotFood.slot_id, foodId: slotFood.id, message: `Quantidade não calculável para ${slotFood.food}.` }));
      continue;
    }
    calculable++;
  }

  return {
    templateId,
    valid: issues.every((item) => item.severity !== "ERROR"),
    issues,
    stats: {
      meals: meals.length,
      slots: slots.length,
      foods: slotFoods.length,
      resolved,
      calculable,
    },
  };
}

export async function validateAllActiveSystemMealTemplates(): Promise<MealTemplateIntegrityResult[]> {
  const templates = await listActiveSystemDietTemplates();
  return Promise.all(templates.map((template) => validateMealTemplateIntegrity(template.id)));
}
