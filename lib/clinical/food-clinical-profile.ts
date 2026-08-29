import { buildCuratedTacoClinicalProfile, FOOD_CLINICAL_TRAIT_CODES, type FoodClinicalProfile, type FoodClinicalTrait, type FoodClinicalTraitCode } from "@/lib/clinical/food-clinical-traits";
import { getTacoFoodByNumber } from "@/lib/nutrition/taco";
import { getCustomFoodById } from "@/lib/repositories/custom-foods";
import { listFoodClinicalTraits } from "@/lib/repositories/food-clinical-traits";
import { getRecipeById, type RecipePayload } from "@/lib/repositories/recipes";
import { normalizeIngredientForRead } from "@/lib/nutrition/recipes";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import type { FoodReference } from "@/lib/nutrition/food-catalog";

function completenessForTraits(traits: FoodClinicalTrait[]): FoodClinicalProfile["completeness"] {
  if (!traits.length) return "unknown";
  return FOOD_CLINICAL_TRAIT_CODES.every((code) => traits.some((trait) => trait.code === code)) ? "complete" : "partial";
}

export function getFoodClinicalProfileFromReference(food: MacroReferenceFood): FoodClinicalProfile {
  if (food.fonte === "taco" || food.fonte === "complementar") return buildCuratedTacoClinicalProfile(food);
  return {
    foodSource: food.fonte === "manufacturer" ? "MANUFACTURER" : "CUSTOM",
    foodId: String(food.numero),
    traits: [],
    completeness: "unknown",
    reasons: ["food_has_no_persisted_clinical_traits"],
  };
}

async function getPersistedFoodClinicalProfile(foodSource: "CUSTOM" | "MANUFACTURER", foodId: string): Promise<FoodClinicalProfile> {
  const food = await getCustomFoodById(foodId);
  if (!food || food.source !== foodSource) {
    return { foodSource, foodId, traits: [], completeness: "unknown", reasons: ["food_not_found_for_source"] };
  }
  const traits = await listFoodClinicalTraits(foodSource, foodId);
  return {
    foodSource,
    foodId,
    traits,
    completeness: completenessForTraits(traits),
    reasons: traits.length ? [] : ["food_has_no_persisted_clinical_traits"],
  };
}

function aggregateRecipeTraits(recipe: RecipePayload, ingredientProfiles: FoodClinicalProfile[]): FoodClinicalProfile {
  const reasons: string[] = [];
  if (recipe.ingredients.map(normalizeIngredientForRead).some((ingredient) => ingredient.food_source !== "TACO" || !ingredient.food_ref_id)) {
    reasons.push("recipe_has_free_text_ingredient");
  }

  const traits: FoodClinicalTrait[] = [];
  for (const code of FOOD_CLINICAL_TRAIT_CODES) {
    const codeTraits = ingredientProfiles.map((profile) => profile.traits.find((trait) => trait.code === code));
    if (codeTraits.some((trait) => trait?.relation === "contains")) {
      traits.push({ code, relation: "contains", provenance: "SYSTEM_CURATED", evidenceText: "Derivado de ingrediente TACO curado da receita." });
    } else if (codeTraits.some((trait) => trait?.relation === "may_contain")) {
      traits.push({ code, relation: "may_contain", provenance: "SYSTEM_CURATED", evidenceText: "Derivado de ingrediente com risco declarado na receita." });
    } else if (ingredientProfiles.length && codeTraits.every((trait) => trait?.relation === "free_from")) {
      traits.push({ code, relation: "free_from", provenance: "SYSTEM_CURATED", evidenceText: "Todos os ingredientes estruturados da receita sao livres deste trait." });
    } else {
      reasons.push(`recipe_trait_unknown:${code}`);
    }
  }

  return {
    foodSource: "RECIPE",
    foodId: recipe.id,
    traits,
    completeness: reasons.length ? (traits.length ? "partial" : "unknown") : "complete",
    reasons,
  };
}

async function getRecipeClinicalProfile(foodId: string): Promise<FoodClinicalProfile> {
  const recipe = await getRecipeById(foodId);
  if (!recipe) return { foodSource: "RECIPE", foodId, traits: [], completeness: "unknown", reasons: ["recipe_not_found"] };
  const profiles: FoodClinicalProfile[] = [];
  for (const raw of recipe.ingredients) {
    const ingredient = normalizeIngredientForRead(raw);
    if (ingredient.food_source !== "TACO" || !ingredient.food_ref_id) continue;
    const taco = getTacoFoodByNumber(ingredient.food_ref_id);
    if (!taco) {
      profiles.push({ foodSource: "TACO", foodId: ingredient.food_ref_id, traits: [], completeness: "unknown", reasons: ["recipe_taco_ingredient_not_found"] });
      continue;
    }
    profiles.push(buildCuratedTacoClinicalProfile(taco));
  }
  return aggregateRecipeTraits(recipe, profiles);
}

export async function getFoodClinicalProfile(input: {
  foodSource: "TACO" | "CUSTOM" | "MANUFACTURER" | "RECIPE";
  foodId: string;
}): Promise<FoodClinicalProfile> {
  if (input.foodSource === "TACO") {
    const food = getTacoFoodByNumber(input.foodId);
    return food ? buildCuratedTacoClinicalProfile(food) : { foodSource: "TACO", foodId: input.foodId, traits: [], completeness: "unknown", reasons: ["taco_food_not_found"] };
  }
  if (input.foodSource === "RECIPE") return getRecipeClinicalProfile(input.foodId);
  return getPersistedFoodClinicalProfile(input.foodSource, input.foodId);
}

export async function getFoodClinicalProfileByReference(ref: FoodReference): Promise<FoodClinicalProfile> {
  if (ref.source === "TACO" || ref.source === "COMPLEMENTARY") {
    return getFoodClinicalProfile({ foodSource: "TACO", foodId: ref.sourceId });
  }
  if (ref.source === "CUSTOM" || ref.source === "MANUFACTURER") {
    return getFoodClinicalProfile({ foodSource: ref.source, foodId: ref.sourceId });
  }
  return { foodSource: "TACO", foodId: ref.sourceId, traits: [], completeness: "unknown", reasons: ["food_source_not_supported_for_clinical_profile"] };
}

export function getTraitForCode(profile: FoodClinicalProfile, code: string): FoodClinicalTrait | null {
  return profile.traits.find((trait) => trait.code === code as FoodClinicalTraitCode) ?? null;
}
