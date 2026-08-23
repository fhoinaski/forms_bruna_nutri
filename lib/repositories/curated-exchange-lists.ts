import { d1Query } from "@/lib/d1/client";
import { getFoodByReference, type FoodReference } from "@/lib/nutrition/food-catalog";
import type { ExchangeGroupCandidate } from "@/lib/nutrition/food-exchange-engine";
import {
  classifyCulinaryRole,
  classifyFoodExchangeGroup,
  normalizeMealContext,
  type CulinaryRole,
  type FoodClassification,
  type MealContext,
} from "@/lib/nutrition/food-exchange-hierarchy";

export type ExchangeListOrigin = "SYSTEM" | "USER";
export type ExchangeProfile = "BALANCED" | "ENERGY" | "PROTEIN" | "CARBOHYDRATE" | "FAT" | "FIBER";

export interface ExchangeListRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  origin: ExchangeListOrigin;
  owner_admin_id: string | null;
  food_group: string;
  food_subgroup: string | null;
  nutritional_role: string | null;
  meal_context: string | null;
  culinary_role: string | null;
  default_profile: ExchangeProfile;
  active: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ExchangeListItemRow {
  id: string;
  exchange_list_id: string;
  food_source: FoodReference["source"];
  food_ref_id: string;
  canonical_food_id: string | null;
  display_name: string;
  family: string | null;
  priority: number;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface ResolvedExchangeList {
  list: ExchangeListRow;
  items: ExchangeListItemRow[];
  candidates: ExchangeGroupCandidate[];
  resolution: "TEMPLATE_SLOT" | "CONTEXT" | "NUTRITIONAL_ROLE";
}

export interface ResolveExchangeListInput {
  classification: FoodClassification;
  mealName?: string | null;
  mealContext?: MealContext;
  templateSlotId?: string | null;
  explicitExchangeListId?: string | null;
  ownerAdminId?: string | null;
}

function csvIncludes(value: string | null, expected: string): boolean {
  if (!value) return false;
  return value.split(",").map((item) => item.trim()).includes(expected);
}

function rowMatchesContext(row: ExchangeListRow, classification: FoodClassification, mealContext: MealContext, culinaryRole: CulinaryRole): boolean {
  if (!row.active) return false;
  if (row.food_group !== classification.foodGroup) return false;
  if (row.nutritional_role && row.nutritional_role !== classification.nutritionalRole) return false;
  const culinaryRoleMatches = row.culinary_role === culinaryRole
    || (row.culinary_role === "BREAKFAST_CARB" && culinaryRole === "BREAD_BASE");
  if (row.culinary_role && !culinaryRoleMatches) return false;
  if (row.meal_context && !csvIncludes(row.meal_context, mealContext)) return false;
  return true;
}

async function getExchangeListById(id: string, ownerAdminId?: string | null): Promise<ExchangeListRow | null> {
  const rows = await d1Query<ExchangeListRow>(
    `SELECT * FROM exchange_lists
      WHERE id = ?1 AND active = 1
        AND (origin = 'SYSTEM' OR owner_admin_id = ?2)
      LIMIT 1`,
    [id, ownerAdminId ?? null]
  );
  return rows[0] ?? null;
}

async function getTemplateSlotExchangeListId(templateSlotId: string): Promise<string | null> {
  const rows = await d1Query<{ exchange_list_id: string | null }>(
    "SELECT exchange_list_id FROM diet_template_slots WHERE id = ?1 LIMIT 1",
    [templateSlotId]
  );
  return rows[0]?.exchange_list_id ?? null;
}

async function listAvailableExchangeLists(ownerAdminId?: string | null): Promise<ExchangeListRow[]> {
  return d1Query<ExchangeListRow>(
    `SELECT * FROM exchange_lists
      WHERE active = 1 AND (origin = 'SYSTEM' OR owner_admin_id = ?1)
      ORDER BY origin ASC, name ASC`,
    [ownerAdminId ?? null]
  );
}

async function listItems(exchangeListId: string): Promise<ExchangeListItemRow[]> {
  return d1Query<ExchangeListItemRow>(
    "SELECT * FROM exchange_list_items WHERE exchange_list_id = ?1 AND active = 1 ORDER BY priority ASC, display_name ASC",
    [exchangeListId]
  );
}

async function resolveCandidates(items: ExchangeListItemRow[]): Promise<ExchangeGroupCandidate[]> {
  const candidates: ExchangeGroupCandidate[] = [];
  for (const item of items) {
    const details = await getFoodByReference({ source: item.food_source, sourceId: item.food_ref_id, canonicalId: item.canonical_food_id });
    if (!details) continue;
    candidates.push({ food: details.macroReference, ref: { source: item.food_source, sourceId: item.food_ref_id, canonicalId: item.canonical_food_id } });
  }
  return candidates;
}

export async function resolveExchangeListForContext(input: ResolveExchangeListInput): Promise<ResolvedExchangeList | null> {
  const mealContext = input.mealContext ?? normalizeMealContext(input.mealName);
  const culinaryRole = classifyCulinaryRole(input.classification, mealContext);

  const explicitId = input.explicitExchangeListId
    ?? (input.templateSlotId ? await getTemplateSlotExchangeListId(input.templateSlotId) : null);
  if (explicitId) {
    const list = await getExchangeListById(explicitId, input.ownerAdminId);
    if (list) {
      const items = await listItems(list.id);
      return { list, items, candidates: await resolveCandidates(items), resolution: "TEMPLATE_SLOT" };
    }
  }

  const lists = await listAvailableExchangeLists(input.ownerAdminId);
  const contextList = lists.find((row) => rowMatchesContext(row, input.classification, mealContext, culinaryRole));
  if (contextList) {
    const items = await listItems(contextList.id);
    return { list: contextList, items, candidates: await resolveCandidates(items), resolution: "CONTEXT" };
  }

  const roleList = lists.find((row) =>
    row.food_group === input.classification.foodGroup
    && row.nutritional_role === input.classification.nutritionalRole
    && !row.meal_context
  );
  if (roleList) {
    const items = await listItems(roleList.id);
    return { list: roleList, items, candidates: await resolveCandidates(items), resolution: "NUTRITIONAL_ROLE" };
  }

  return null;
}

export async function listExchangeListsForLibrary(ownerAdminId?: string | null): Promise<Array<ExchangeListRow & { item_count: number }>> {
  return d1Query<ExchangeListRow & { item_count: number }>(
    `SELECT l.*, COUNT(i.id) AS item_count
       FROM exchange_lists l
       LEFT JOIN exchange_list_items i ON i.exchange_list_id = l.id AND i.active = 1
      WHERE l.active = 1 AND (l.origin = 'SYSTEM' OR l.owner_admin_id = ?1)
      GROUP BY l.id
      ORDER BY l.origin ASC, l.name ASC`,
    [ownerAdminId ?? null]
  );
}

export { classifyFoodExchangeGroup };
