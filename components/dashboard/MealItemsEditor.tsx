"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Beef, ChevronDown, ChevronUp, Copy, Flame, MoreHorizontal, Plus, RefreshCw, Save, Sparkles, Trash2, Utensils, Wheat } from "lucide-react";
import { resolveFoodItemMacros, roundedMacros, sumMacros, type MacroFoodReferenceFallback, type MacroReferenceFood, type MacroTotals } from "@/lib/nutrition/macros";
import type { HouseholdMeasureOption } from "@/lib/nutrition/quantity-resolution";
import type { FoodPortion } from "@/lib/repositories/food-portions";
import { RECIPE_MEAL_GROUP_LABELS, RECIPE_MEAL_GROUPS, type RecipeMealGroup } from "@/lib/nutrition/recipe-constants";
import { AiInstructionsModal } from "@/components/dashboard/AiInstructionsModal";
import type { FoodReference } from "@/lib/nutrition/food-catalog";

export type MealItem = {
  food: string;
  quantity?: string | null;
  unit?: string | null;
  notes?: string | null;
  ai_suggested?: boolean;
  taco_number?: number | string | null;
  // Vinculo estruturado a um alimento (TACO/personalizado) — FASE 2. So
  // preenchido quando o alimento vem de um resultado de busca escolhido;
  // digitacao livre mantem os dois como null (mesmo comportamento de hoje).
  food_source?: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | null;
  food_ref_id?: string | null;
  // Vinculo a uma medida caseira especifica (food_portions.id) — FASE 3.
  household_measure_id?: string | null;
  resolved_grams_snapshot?: number | null;
  quantity_resolution_snapshot?: string | null;
};

function toMeasureOption(portion: FoodPortion): HouseholdMeasureOption {
  return { id: portion.id, description: portion.description, gramEquivalent: portion.gram_equivalent, source: portion.source, confidence: portion.confidence };
}

export type Meal = {
  name: string;
  suggested_time?: string | null;
  notes?: string | null;
  source_recipe_id?: string | null;
  items: MealItem[];
};

type FoodSuggestion = MacroReferenceFood & {
  numero: number | string;
  grupo: string;
  ref?: FoodReference;
  sourceLabel?: string;
};

function toMealPlanFoodSource(suggestion: FoodSuggestion): "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" {
  if (suggestion.ref?.source === "CUSTOM" || suggestion.ref?.source === "MANUFACTURER" || suggestion.ref?.source === "USDA") return suggestion.ref.source;
  if (suggestion.fonte === "custom") return "CUSTOM";
  if (suggestion.fonte === "manufacturer") return "MANUFACTURER";
  if (suggestion.fonte === "usda") return "USDA";
  // COMPLEMENTARY ainda e persistido como TACO por compatibilidade com o schema atual.
  return "TACO";
}

function macroFallbackFromSuggestion(suggestion?: FoodSuggestion | null): MacroFoodReferenceFallback | null {
  if (!suggestion?.ref?.sourceId) return null;
  const { source, sourceId } = suggestion.ref;
  if (source !== "TACO" && source !== "COMPLEMENTARY" && source !== "CUSTOM" && source !== "MANUFACTURER" && source !== "USDA") return null;
  return { source, sourceId, reference: suggestion };
}

type RecipeLibraryItem = {
  id: string;
  title: string;
  description: string | null;
  meal_group: RecipeMealGroup;
  ingredients: Array<{ taco_number: number; food_name: string; grams: number }>;
  source_note: string | null;
  per_portion_kcal: number;
};

type RecipeDraft = {
  mealIndex: number;
  title: string;
  mealGroup: RecipeMealGroup;
  tags: string;
  error: string;
};

export const emptyMeal = (): Meal => ({
  name: "Nova refeicao",
  suggested_time: "",
  notes: "",
  source_recipe_id: null,
  items: [{ food: "", quantity: "", unit: "", notes: "" }],
});

/**
 * Reordena um item de posicao movendo-o uma casa na direcao indicada.
 * Fora dos limites, devolve a lista original sem mudanca (nao-op seguro
 * para botoes desabilitados na borda). Puro — a persistencia da nova
 * ordem acontece naturalmente no proximo save, que ja grava sort_order
 * pelo indice do array (lib/repositories/meal-plans.ts).
 */
export function reorderArray<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

/**
 * Duplica uma refeicao inteira (com seus itens) logo apos a original.
 * O backend sempre gera um id novo por linha no save (meal-plans.ts),
 * entao nao ha risco de colisao mesmo sem remover nenhum campo aqui.
 */
export function duplicateMealAt(meals: Meal[], index: number): Meal[] {
  const source = meals[index];
  if (!source) return meals;
  const copy: Meal = { ...source, name: `${source.name} (cópia)`, items: source.items.map((item) => ({ ...item })) };
  const next = [...meals];
  next.splice(index + 1, 0, copy);
  return next;
}

/** Duplica um item de refeicao logo apos o original. Mesma logica acima. */
export function duplicateItemAt(items: MealItem[], index: number): MealItem[] {
  const source = items[index];
  if (!source) return items;
  const next = [...items];
  next.splice(index + 1, 0, { ...source });
  return next;
}

export function cleanMealsForSave(meals: Meal[]): Meal[] {
  return meals
    .map((meal) => ({
      name: meal.name,
      suggested_time: meal.suggested_time ?? null,
      notes: meal.notes ?? null,
      source_recipe_id: meal.source_recipe_id ?? null,
      items: meal.items
        .filter((item) => item.food.trim())
        .map((item) => ({
          food: item.food,
          quantity: item.quantity ?? null,
          unit: item.unit ?? null,
          notes: item.notes ?? null,
          food_source: item.food_source ?? null,
          food_ref_id: item.food_ref_id ?? null,
          household_measure_id: item.household_measure_id ?? null,
        })),
    }))
    .filter((meal) => meal.name.trim() && meal.items.length);
}

export function MealItemsEditor({
  meals,
  onChange,
  targetGroup,
  aiEnabled,
  context = "meal",
  recipeTags,
  recipeDescriptionPrefix = "Receita criada a partir de uma refeicao personalizada.",
  onMessage,
  onError,
  showMacroFooter = true,
}: {
  meals: Meal[];
  onChange: (meals: Meal[]) => void;
  targetGroup?: string | null;
  aiEnabled: boolean;
  context?: "meal" | "template" | "recipe";
  recipeTags?: string;
  recipeDescriptionPrefix?: string;
  onMessage?: (message: string) => void;
  onError?: (message: string) => void;
  showMacroFooter?: boolean;
}) {
  const [activeFoodField, setActiveFoodField] = useState("");
  const [foodSearch, setFoodSearch] = useState<{ key: string; query: string }>({ key: "", query: "" });
  const [foodSuggestions, setFoodSuggestions] = useState<Record<string, FoodSuggestion[]>>({});
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [searchLoadingKey, setSearchLoadingKey] = useState("");
  const [recipeSelectorOpen, setRecipeSelectorOpen] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeMealGroup, setRecipeMealGroup] = useState("");
  const [recipes, setRecipes] = useState<RecipeLibraryItem[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft | null>(null);
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [aiLoadingMeal, setAiLoadingMeal] = useState<number | null>(null);
  const [aiModalMealIndex, setAiModalMealIndex] = useState<number | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [measuresByFood, setMeasuresByFood] = useState<Record<string, FoodPortion[]>>({});
  const [openMealMenu, setOpenMealMenu] = useState<number | null>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!recipeSelectorOpen && !recipeDraft) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [recipeSelectorOpen, recipeDraft]);

  useEffect(() => {
    const foodsToPrime = meals.flatMap((meal, mealIndex) =>
      meal.items.map((item, itemIndex) => ({ key: `${mealIndex}:${itemIndex}`, query: item.food.trim() }))
    ).filter(({ key, query }) => query.length >= 2 && !foodSuggestions[key]?.length).slice(0, 24);
    if (!foodsToPrime.length) return;

    const controller = new AbortController();
    Promise.all(foodsToPrime.map(async ({ key, query }) => {
      try {
        const response = await fetch(`/api/admin/foods/search?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal });
        const data = response.ok ? await response.json() as { items?: FoodSuggestion[] } : { items: [] as FoodSuggestion[] };
        return [key, data.items ?? []] as const;
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return null;
        return [key, [] as FoodSuggestion[]] as const;
      }
    })).then((entries) => {
      setFoodSuggestions((current) => {
        const next = { ...current };
        for (const entry of entries) {
          if (!entry) continue;
          next[entry[0]] = entry[1];
        }
        return next;
      });
    });

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(meals.map((meal) => meal.items.map((item) => item.food)))]);

  useEffect(() => {
    const pairs = Array.from(
      new Set(
        meals
          .flatMap((meal) => meal.items)
          .filter((item) => item.food_ref_id && (item.food_source === "TACO" || item.food_source === "CUSTOM" || item.food_source === "MANUFACTURER"))
          .map((item) => `${item.food_source}:${item.food_ref_id}`)
          .filter((pair) => !measuresByFood[pair])
      )
    );
    if (!pairs.length) return;
    const controller = new AbortController();
    Promise.all(pairs.map(async (pair) => {
      const [source, refId] = pair.split(":");
      try {
        const response = await fetch(`/api/admin/foods/portions?source=${source}&refId=${encodeURIComponent(refId)}`, { cache: "no-store", signal: controller.signal });
        const data = response.ok ? await response.json() as { items?: FoodPortion[] } : { items: [] as FoodPortion[] };
        return [pair, data.items ?? []] as const;
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return null;
        return [pair, [] as FoodPortion[]] as const;
      }
    })).then((entries) => {
      setMeasuresByFood((current) => {
        const next = { ...current };
        for (const entry of entries) {
          if (!entry) continue;
          next[entry[0]] = entry[1];
        }
        return next;
      });
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(meals.map((meal) => meal.items.map((item) => `${item.food_source ?? ""}:${item.food_ref_id ?? ""}`)))]);

  useEffect(() => {
    const query = foodSearch.query.trim();
    if (!foodSearch.key || query.length < 2) {
      setSearchLoadingKey((current) => current === foodSearch.key ? "" : current);
      return;
    }

    const controller = new AbortController();
    setSearchLoadingKey(foodSearch.key);
    const timer = window.setTimeout(() => {
      fetch(`/api/admin/foods/search?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal })
        .then((response) => response.ok ? response.json() : { items: [] })
        .then((data: { items?: FoodSuggestion[] }) => {
          setFoodSuggestions((current) => ({ ...current, [foodSearch.key]: data.items ?? [] }));
          setHighlightedIndex(0);
        })
        .catch((cause) => {
          if (cause instanceof Error && cause.name === "AbortError") return;
          setFoodSuggestions((current) => ({ ...current, [foodSearch.key]: [] }));
        })
        .finally(() => {
          setSearchLoadingKey((current) => current === foodSearch.key ? "" : current);
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [foodSearch]);

  useEffect(() => {
    if (!recipeSelectorOpen) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setRecipesLoading(true);
      const params = new URLSearchParams({ includeInactive: "false" });
      if (recipeSearch.trim()) params.set("q", recipeSearch.trim());
      if (recipeMealGroup) params.set("meal_group", recipeMealGroup);
      fetch(`/api/admin/recipes?${params}`, { cache: "no-store", signal: controller.signal })
        .then((response) => response.ok ? response.json() : { items: [] })
        .then((data: { items?: RecipeLibraryItem[] }) => setRecipes(data.items ?? []))
        .catch((cause) => {
          if (cause instanceof Error && cause.name === "AbortError") return;
          setRecipes([]);
        })
        .finally(() => setRecipesLoading(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [recipeMealGroup, recipeSearch, recipeSelectorOpen]);

  const knownFoodReferences = useMemo(() => {
    const byKey = new Map<string, FoodSuggestion>();
    for (const suggestion of Object.values(foodSuggestions).flat()) {
      byKey.set(String(suggestion.numero ?? suggestion.descricao), suggestion);
    }
    return Array.from(byKey.values());
  }, [foodSuggestions]);

  function measureOptionsFor(item: MealItem): FoodPortion[] {
    if (!item.food_ref_id || (item.food_source !== "TACO" && item.food_source !== "CUSTOM" && item.food_source !== "MANUFACTURER")) return [];
    return measuresByFood[`${item.food_source}:${item.food_ref_id}`] ?? [];
  }

  function selectedMeasureFor(item: MealItem): HouseholdMeasureOption | null {
    if (!item.household_measure_id) return null;
    const portion = measureOptionsFor(item).find((candidate) => candidate.id === item.household_measure_id);
    return portion ? toMeasureOption(portion) : null;
  }

  /**
   * Resolucao completa (macros + metodo/confianca) por item, usando o motor
   * central (lib/nutrition/quantity-resolution.ts via resolveFoodItemMacros)
   * — respeita o vinculo estruturado (food_ref_id) e a medida caseira
   * selecionada quando presentes, em vez de so casar por texto como antes
   * (secao 11 do pedido: uma vez vinculado, nunca mais depende do nome).
   */
  const itemResolutions = useMemo(() => {
    const map: Record<string, ReturnType<typeof resolveFoodItemMacros>> = {};
    meals.forEach((meal, mealIndex) => {
      meal.items.forEach((item, itemIndex) => {
        if (!item.food.trim()) return;
        const key = `${mealIndex}:${itemIndex}`;
        map[key] = resolveFoodItemMacros(
          item,
          knownFoodReferences,
          selectedMeasureFor(item),
          macroFallbackFromSuggestion(foodSuggestions[key]?.[0])
        );
      });
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals, knownFoodReferences, measuresByFood, foodSuggestions]);

  const mealMacros = useMemo(() => meals.map((meal, mealIndex) => roundedMacros(sumMacros(
    meal.items.map((_, itemIndex) => itemResolutions[`${mealIndex}:${itemIndex}`]?.macros).filter((value): value is MacroTotals => Boolean(value))
  ))), [meals, itemResolutions]);

  const planMacros = useMemo(() => roundedMacros(sumMacros(mealMacros)), [mealMacros]);

  function updateMeal(index: number, patch: Partial<Meal>) {
    onChange(meals.map((meal, mealIndex) => mealIndex === index ? { ...meal, ...patch } : meal));
  }

  function updateMealItem(mealIndex: number, itemIndex: number, patch: Partial<MealItem>) {
    onChange(meals.map((meal, currentMealIndex) => currentMealIndex === mealIndex
      ? { ...meal, items: meal.items.map((item, currentItemIndex) => currentItemIndex === itemIndex ? { ...item, ...patch } : item) }
      : meal));
  }

  function focusFoodField(mealIndex: number, itemIndex: number) {
    const key = `${mealIndex}:${itemIndex}`;
    setActiveFoodField(key);
    setHighlightedIndex(0);
    setFoodSearch({ key, query: meals[mealIndex]?.items[itemIndex]?.food ?? "" });
    window.requestAnimationFrame(() => document.getElementById(`meal-food-${mealIndex}-${itemIndex}`)?.focus());
  }

  function selectSuggestion(mealIndex: number, itemIndex: number, suggestion: FoodSuggestion) {
    updateMealItem(mealIndex, itemIndex, {
      food: suggestion.descricao,
      taco_number: suggestion.numero,
      food_source: toMealPlanFoodSource(suggestion),
      food_ref_id: suggestion.ref?.sourceId ?? String(suggestion.numero),
      // Alimento trocado: a medida caseira anterior (se havia) era de outro alimento e nao se aplica mais.
      household_measure_id: null,
      resolved_grams_snapshot: null,
      quantity_resolution_snapshot: null,
    });
    setFoodSuggestions((current) => ({ ...current, [`${mealIndex}:${itemIndex}`]: [suggestion] }));
    setActiveFoodField("");
  }

  function insertRecipe(recipe: RecipeLibraryItem) {
    const mealIndex = meals.length;
    const meal: Meal = {
      name: recipe.title,
      suggested_time: "",
      notes: recipe.source_note ? `Receita da biblioteca. Observacao: ${recipe.source_note}` : "Receita inserida da biblioteca.",
      source_recipe_id: recipe.id,
      items: recipe.ingredients.map((ingredient) => ({
        food: ingredient.food_name,
        quantity: String(ingredient.grams),
        unit: "g",
        notes: null,
        taco_number: ingredient.taco_number,
      })),
    };
    onChange([...meals, meal]);
    void Promise.all(recipe.ingredients.map(async (ingredient, itemIndex) => {
      const response = await fetch(`/api/admin/foods/search?q=${encodeURIComponent(ingredient.food_name)}`, { cache: "no-store" });
      const data = response.ok ? await response.json() as { items?: FoodSuggestion[] } : { items: [] as FoodSuggestion[] };
      return [`${mealIndex}:${itemIndex}`, data.items ?? []] as const;
    })).then((entries) => {
      setFoodSuggestions((current) => {
        const next = { ...current };
        for (const [key, suggestions] of entries) next[key] = suggestions;
        return next;
      });
    });
    setRecipeSelectorOpen(false);
    onMessage?.(`Receita "${recipe.title}" inserida como copia. Salve para registrar.`);
  }

  function inferMealGroup(mealName: string): RecipeMealGroup {
    const normalized = mealName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (normalized.includes("almoco")) return "almoco";
    if (normalized.includes("jantar")) return "jantar";
    if (normalized.includes("sobremesa")) return "sobremesa";
    if (normalized.includes("bebida") || normalized.includes("suco") || normalized.includes("vitamina")) return "bebida";
    if (normalized.includes("cafe") || normalized.includes("manha")) return "cafe_da_manha";
    return "lanche";
  }

  function parseGrams(quantity?: string | null, unit?: string | null) {
    const numeric = Number(String(quantity ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(numeric) || numeric <= 0) return 100;
    const normalizedUnit = String(unit ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!normalizedUnit || normalizedUnit.includes("g") || normalizedUnit.includes("grama")) return numeric;
    return numeric;
  }

  function findTacoReference(mealIndex: number, itemIndex: number, food: string) {
    const key = `${mealIndex}:${itemIndex}`;
    const normalizedFood = food.trim().toLowerCase();
    return foodSuggestions[key]?.find((suggestion) => suggestion.descricao.trim().toLowerCase() === normalizedFood)
      ?? knownFoodReferences.find((suggestion) => suggestion.descricao.trim().toLowerCase() === normalizedFood)
      ?? foodSuggestions[key]?.[0]
      ?? null;
  }

  function openSaveMealAsRecipe(mealIndex: number) {
    const meal = meals[mealIndex];
    setRecipeDraft({
      mealIndex,
      title: meal.name || `Receita do plano - refeicao ${mealIndex + 1}`,
      mealGroup: inferMealGroup(meal.name),
      tags: [targetGroup, recipeTags].filter(Boolean).join(", "),
      error: "",
    });
  }

  async function saveMealAsRecipe() {
    if (!recipeDraft) return;
    const meal = meals[recipeDraft.mealIndex];
    const missingFoods: string[] = [];
    const ingredients = meal.items
      .map((item, itemIndex) => {
        if (!item.food.trim()) return null;
        if (item.taco_number) {
          return { taco_number: Number(item.taco_number), food_name: item.food, grams: parseGrams(item.quantity, item.unit) };
        }
        const reference = findTacoReference(recipeDraft.mealIndex, itemIndex, item.food);
        if (!reference) {
          missingFoods.push(item.food);
          return null;
        }
        return { taco_number: Number(reference.numero), food_name: reference.descricao, grams: parseGrams(item.quantity, item.unit) };
      })
      .filter((item): item is { taco_number: number; food_name: string; grams: number } => Boolean(item));

    if (!ingredients.length || missingFoods.length) {
      setRecipeDraft({
        ...recipeDraft,
        error: missingFoods.length
          ? `Confira estes alimentos na busca TACO antes de salvar: ${missingFoods.join(", ")}.`
          : "Adicione ao menos um alimento reconhecido pela TACO nesta refeicao.",
      });
      return;
    }

    setRecipeSaving(true);
    try {
      const response = await fetch("/api/admin/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: recipeDraft.title.trim(),
          description: `${recipeDescriptionPrefix} "${meal.name}".`,
          meal_group: recipeDraft.mealGroup,
          servings: 1,
          portion_grams: ingredients.reduce((sum, ingredient) => sum + ingredient.grams, 0),
          preparation_steps: meal.notes || null,
          ingredients,
          tags: recipeDraft.tags.split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean),
          source_note: "Criada a partir de uma refeicao personalizada. Revise preparo, porcao e adequacao clinica antes de reutilizar.",
          is_active: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Nao foi possivel salvar a receita.");
      setRecipeDraft(null);
      onMessage?.("Receita salva na biblioteca. Ela ja pode ser inserida em outros planos.");
    } catch (cause) {
      setRecipeDraft({ ...recipeDraft, error: cause instanceof Error ? cause.message : "Nao foi possivel salvar a receita." });
    } finally {
      setRecipeSaving(false);
    }
  }

  async function suggestMealWithAi(mealIndex: number, instructions: string) {
    const meal = meals[mealIndex];
    setAiModalMealIndex(null);
    setAiLoadingMeal(mealIndex);
    onError?.("");
    onMessage?.("");
    try {
      const response = await fetch("/api/admin/ai/suggest-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          targetGroup,
          mealName: meal.name,
          instructions,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Nao foi possivel sugerir a refeicao.");
      const suggested = result.resolvedMeals?.[0];
      if (!suggested) throw new Error("A IA nao retornou uma refeicao valida.");
      onChange(meals.map((current, index) => index === mealIndex ? {
        ...current,
        name: suggested.mealName || current.name,
        notes: suggested.notes ?? current.notes,
        source_recipe_id: suggested.source_recipe_id ?? current.source_recipe_id,
        items: suggested.items.map((item: MealItem) => ({
          food: item.food,
          quantity: item.quantity,
          unit: item.unit,
          notes: item.notes,
          ai_suggested: true,
          taco_number: item.taco_number ?? null,
        })),
      } : current));
      onMessage?.("Sugestao aplicada no formulario. Revise, edite ou remova itens antes de salvar.");
    } catch (cause) {
      onError?.(cause instanceof Error ? cause.message : "Nao foi possivel sugerir a refeicao.");
    } finally {
      setAiLoadingMeal(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-serif text-xl font-semibold text-[#3A3028]">Refeicoes</h3>
        <div className="grid gap-2 sm:flex">
          <button type="button" onClick={() => onChange([...meals, emptyMeal()])} className="brand-btn-secondary w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Refeicao
          </button>
          <button type="button" onClick={() => setRecipeSelectorOpen(true)} className="brand-btn-secondary w-full sm:w-auto">
            <Utensils className="h-4 w-4" />
            Inserir receita
          </button>
        </div>
      </div>

      {meals.map((meal, mealIndex) => (
        <article key={mealIndex} className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_8px_24px_rgba(58,48,40,0.035)]">
          <div className="relative flex flex-col gap-2 border-b border-[#EDE1D6] bg-[#FBF7F1] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF0E4] text-[#607A56]"><Utensils className="h-4 w-4" /></div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#3A3028]">{meal.name || `Refeicao ${mealIndex + 1}`}</p>
                <p className="text-xs text-[#75675E]">{meal.items.filter((item) => item.food.trim()).length} alimento(s) - {mealMacros[mealIndex]?.kcal ?? 0} kcal estimadas</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 self-end sm:self-auto">
              <button type="button" onClick={() => updateMeal(mealIndex, { items: [...meal.items, { food: "", quantity: "", unit: "", notes: "" }] })} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#D9E4D3] bg-[#FFFDFC] px-3 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]">
                <Plus className="h-4 w-4" />
                Alimento
              </button>
              <div className="flex items-center gap-1 rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-0.5">
                <button type="button" onClick={() => onChange(reorderArray(meals, mealIndex, -1))} disabled={mealIndex === 0} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#75675E] hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Mover ${meal.name || "refeicao"} para cima`} title="Mover refeicao para cima">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => onChange(reorderArray(meals, mealIndex, 1))} disabled={mealIndex === meals.length - 1} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#75675E] hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Mover ${meal.name || "refeicao"} para baixo`} title="Mover refeicao para baixo">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <button type="button" onClick={() => onChange(duplicateMealAt(meals, mealIndex))} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] text-[#607A56] hover:bg-[#EAF0E4]" aria-label={`Duplicar ${meal.name || "refeicao"}`} title="Duplicar refeicao">
                <Copy className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setOpenMealMenu((current) => current === mealIndex ? null : mealIndex)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] text-[#75675E] hover:bg-[#FBF7F1]" aria-label={`Mais ações para ${meal.name || "refeicao"}`} title="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {openMealMenu === mealIndex && (
                <div className="absolute right-3 top-[calc(100%-4px)] z-20 w-56 rounded-xl border border-[#EAD8C2] bg-white p-1 shadow-[0_16px_40px_rgba(58,48,40,0.14)]">
                  <button type="button" onClick={() => { setOpenMealMenu(null); setAiModalMealIndex(mealIndex); }} disabled={!aiEnabled || aiLoadingMeal === mealIndex} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#8C5F50] hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-50">
                    <Sparkles className="h-4 w-4" />
                    {aiLoadingMeal === mealIndex ? "Sugerindo..." : "Sugerir com IA"}
                  </button>
                  <button type="button" onClick={() => { setOpenMealMenu(null); openSaveMealAsRecipe(mealIndex); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4]">
                    <Save className="h-4 w-4" />
                    Salvar como receita
                  </button>
                  <button type="button" onClick={() => { setOpenMealMenu(null); onChange(meals.filter((_, index) => index !== mealIndex)); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                    Excluir refeição
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="p-3">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_118px]">
              <label className="sr-only" htmlFor={`meal-name-${mealIndex}`}>Nome da refeição</label>
              <input id={`meal-name-${mealIndex}`} value={meal.name} onChange={(event) => updateMeal(mealIndex, { name: event.target.value })} className="brand-input h-10" placeholder="Nome da refeicao" />
              <label className="sr-only" htmlFor={`meal-time-${mealIndex}`}>Horário</label>
              <input id={`meal-time-${mealIndex}`} value={meal.suggested_time ?? ""} onChange={(event) => updateMeal(mealIndex, { suggested_time: event.target.value })} className="brand-input h-10" placeholder="Horario" />
            </div>
            <label className="sr-only" htmlFor={`meal-notes-${mealIndex}`}>Observações da refeição</label>
            <textarea id={`meal-notes-${mealIndex}`} value={meal.notes ?? ""} onChange={(event) => updateMeal(mealIndex, { notes: event.target.value })} className="brand-input mt-2 min-h-14 resize-y" placeholder="Observacoes da refeicao" />
            <div className="mt-2 space-y-1.5">
              {meal.items.map((item, itemIndex) => {
                const key = `${mealIndex}:${itemIndex}`;
                const foodInputId = `meal-food-${mealIndex}-${itemIndex}`;
                const quantityInputId = `meal-quantity-${mealIndex}-${itemIndex}`;
                const measureInputId = `meal-measure-${mealIndex}-${itemIndex}`;
                const grams = itemResolutions[key]?.quantity.grams;
                const suggestions = foodSuggestions[key] ?? [];
                const dropdownOpen = activeFoodField === key && suggestions.length > 0;
                const showEmptyState = activeFoodField === key && !dropdownOpen && searchLoadingKey !== key && item.food.trim().length >= 2;
                const showLoading = activeFoodField === key && searchLoadingKey === key;
                const listboxId = `food-suggestions-${key}`;
                return (
                <div key={itemIndex} className="grid min-w-0 gap-1.5 rounded-lg border border-transparent bg-white/70 p-1.5 2xl:grid-cols-[minmax(0,1fr)_210px_auto] 2xl:items-start">
                  <div className="relative min-w-0">
                    <label className="sr-only" htmlFor={foodInputId}>Alimento</label>
                    <input
                      id={foodInputId}
                      role="combobox"
                      aria-expanded={dropdownOpen}
                      aria-autocomplete="list"
                      aria-controls={listboxId}
                      aria-activedescendant={dropdownOpen ? `${listboxId}-option-${highlightedIndex}` : undefined}
                      aria-label="Alimento"
                      value={item.food}
                      onChange={(event) => {
                        updateMealItem(mealIndex, itemIndex, { food: event.target.value, taco_number: null, food_source: null, food_ref_id: null, household_measure_id: null, resolved_grams_snapshot: null, quantity_resolution_snapshot: null });
                        setActiveFoodField(key);
                        setHighlightedIndex(0);
                        setFoodSearch({ key, query: event.target.value });
                      }}
                      onFocus={(event) => {
                        setActiveFoodField(key);
                        setHighlightedIndex(0);
                        setFoodSearch({ key, query: event.target.value });
                      }}
                      onBlur={() => window.setTimeout(() => setActiveFoodField(""), 140)}
                      onKeyDown={(event) => {
                        if (activeFoodField !== key || !suggestions.length) return;
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setHighlightedIndex((current) => (current + 1) % suggestions.length);
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setHighlightedIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
                        } else if (event.key === "Enter") {
                          const suggestion = suggestions[highlightedIndex];
                          if (suggestion) {
                            event.preventDefault();
                            selectSuggestion(mealIndex, itemIndex, suggestion);
                          }
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          setActiveFoodField("");
                        }
                      }}
                      className="brand-input"
                      placeholder="Buscar alimento"
                    />
                    {item.ai_suggested && (
                      <span className="mt-1 inline-flex rounded-full bg-[#FFF7F3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8C5F50]">
                        sugerido por IA
                      </span>
                    )}
                    {(() => {
                      const resolution = itemResolutions[key]?.quantity;
                      // "food_household_measure" e sua propria categoria (secao 9 do
                      // pedido: preciso / baseado em medida especifica / estimado /
                      // nao calculado) — mesmo quando a confianca da medida e
                      // "medium" (ex.: referencia de mercado, nao dado oficial
                      // publicado), isso NAO e a mesma coisa que a conversao
                      // generica estimada, entao nunca mostra este aviso aqui.
                      if (!resolution || resolution.method === "explicit_grams" || resolution.method === "generic_unit_conversion" || resolution.method === "food_household_measure" || resolution.method === "portion_snapshot") return null;
                      const label = resolution.method === "unresolved" ? "Não foi possível calcular" : "Valor estimado";
                      return (
                        <span
                          className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#FFF3E9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9A6B28]"
                          title={resolution.warning}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {label}
                        </span>
                      );
                    })()}
                    {dropdownOpen && (
                      <div id={listboxId} role="listbox" aria-label="Sugestoes de alimentos" className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-64 overflow-y-auto rounded-xl border border-[#EAD8C2] bg-white p-1 shadow-[0_18px_44px_rgba(58,48,40,0.16)]">
                        {suggestions.map((suggestion, suggestionIndex) => (
                          <button
                            key={suggestion.numero}
                            type="button"
                            id={`${listboxId}-option-${suggestionIndex}`}
                            role="option"
                            aria-selected={suggestionIndex === highlightedIndex}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setHighlightedIndex(suggestionIndex)}
                            onClick={() => selectSuggestion(mealIndex, itemIndex, suggestion)}
                            className={`block w-full rounded-lg px-3 py-2 text-left transition-colors ${suggestionIndex === highlightedIndex ? "bg-[#FAF7F2]" : "hover:bg-[#FAF7F2]"}`}
                          >
                            <span className="block text-sm font-medium text-[#3A3028]">{suggestion.descricao}</span>
                            <span className="mt-0.5 block text-[10px] uppercase tracking-[0.08em] text-[#8C6E52]">
                              {suggestion.grupo || "Alimento personalizado"} - {Math.round(suggestion.energia_kcal)} kcal/100g
                              {" - "}{suggestion.sourceLabel ?? (suggestion.fonte === "complementar" ? "Complementar" : suggestion.fonte === "custom" ? "Personalizado" : suggestion.fonte === "manufacturer" ? "Fabricante" : "TACO")}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {showLoading && (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-xl border border-[#EAD8C2] bg-white p-3 shadow-[0_18px_44px_rgba(58,48,40,0.16)]">
                        <p className="text-sm text-[#8C6E52]">Buscando...</p>
                      </div>
                    )}
                    {showEmptyState && (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-xl border border-[#EAD8C2] bg-white p-3 shadow-[0_18px_44px_rgba(58,48,40,0.16)]">
                        <p className="text-sm text-[#8C6E52]">Nenhum alimento encontrado.</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-1.5">
                      <label className="sr-only" htmlFor={quantityInputId}>Quantidade</label>
                      <input id={quantityInputId} aria-label="Quantidade" value={item.quantity ?? ""} onChange={(event) => updateMealItem(mealIndex, itemIndex, { quantity: event.target.value, resolved_grams_snapshot: null, quantity_resolution_snapshot: null })} className="brand-input h-10" placeholder="Qtd." />
                      {item.food_ref_id ? (
                        <>
                          <label className="sr-only" htmlFor={measureInputId}>Medida</label>
                          <select
                            id={measureInputId}
                            aria-label="Medida"
                            value={item.household_measure_id ?? "__grams__"}
                            onChange={(event) => {
                              const value = event.target.value;
                              updateMealItem(mealIndex, itemIndex, value === "__grams__"
                                ? { household_measure_id: null, unit: "g", resolved_grams_snapshot: null, quantity_resolution_snapshot: null }
                                : { household_measure_id: value, unit: null, resolved_grams_snapshot: null, quantity_resolution_snapshot: null });
                            }}
                            className="brand-input h-10"
                            title="Medida especifica do alimento — quando disponivel, o calculo usa o peso exato cadastrado em vez de uma aproximacao generica."
                          >
                            <option value="__grams__">Gramas (g)</option>
                            {measureOptionsFor(item).map((measure) => (
                              <option key={measure.id} value={measure.id}>{measure.description}</option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <>
                          <label className="sr-only" htmlFor={measureInputId}>Unidade</label>
                          <input id={measureInputId} aria-label="Unidade" value={item.unit ?? ""} onChange={(event) => updateMealItem(mealIndex, itemIndex, { unit: event.target.value, resolved_grams_snapshot: null, quantity_resolution_snapshot: null })} className="brand-input h-10" placeholder="Un." />
                        </>
                      )}
                    </div>
                    {typeof grams === "number" && Number.isFinite(grams) && grams > 0 && (
                      <p className="mt-1 text-[10px] font-medium text-[#9A8B80]">≈ {Math.round(grams * 10) / 10} g</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <button type="button" onClick={() => focusFoodField(mealIndex, itemIndex)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4]" aria-label="Substituir alimento" title="Substituir alimento">
                      <RefreshCw className="h-4 w-4" />
                      <span>Substituir</span>
                    </button>
                    <button type="button" onClick={() => updateMeal(mealIndex, { items: reorderArray(meal.items, itemIndex, -1) })} disabled={itemIndex === 0} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#75675E] hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-30" aria-label="Mover alimento para cima" title="Mover para cima">
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => updateMeal(mealIndex, { items: reorderArray(meal.items, itemIndex, 1) })} disabled={itemIndex === meal.items.length - 1} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#75675E] hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-30" aria-label="Mover alimento para baixo" title="Mover para baixo">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => updateMeal(mealIndex, { items: duplicateItemAt(meal.items, itemIndex) })} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#607A56] hover:bg-[#EAF0E4]" aria-label="Duplicar alimento" title="Duplicar alimento">
                      <Copy className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => updateMeal(mealIndex, { items: meal.items.filter((_, index) => index !== itemIndex) })} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" aria-label="Remover alimento" title="Remover alimento">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                );
              })}
              <button type="button" onClick={() => updateMeal(mealIndex, { items: [...meal.items, { food: "", quantity: "", unit: "", notes: "" }] })} className="text-xs font-semibold text-[#607A56]">
                + adicionar alimento
              </button>
            </div>
          </div>
        </article>
      ))}

      {showMacroFooter && (
        <div className="sticky bottom-3 z-10 rounded-lg border border-[#D9C4B2] bg-[#FFFDFC]/95 p-3 shadow-[0_16px_42px_rgba(58,48,40,0.14)] backdrop-blur-xl sm:bottom-4" aria-live="polite">
          <div className="flex min-w-0 flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#607A56]">Macros em tempo real</p>
              <p className="mt-0.5 text-[11px] text-[#75675E]">Estimativa automatica por alimento e porcao. Confirme os valores antes de prescrever.</p>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 2xl:shrink-0">
              <MacroMetric icon={<Flame className="h-4 w-4" />} label="Energia" value={`${planMacros.kcal} kcal`} />
              <MacroMetric icon={<Beef className="h-4 w-4" />} label="Proteinas" value={`${planMacros.protein} g`} />
              <MacroMetric icon={<Wheat className="h-4 w-4" />} label="Carboidratos" value={`${planMacros.carbs} g`} />
              <MacroMetric icon={<span className="text-xs font-bold">G</span>} label="Gorduras" value={`${planMacros.fat} g`} />
            </div>
          </div>
          {planMacros.totalItems > 0 && planMacros.recognizedItems < planMacros.totalItems && <p className="mt-2 text-[10px] text-[#8C5F50]">{planMacros.totalItems - planMacros.recognizedItems} alimento(s) ainda nao reconhecido(s) pelo calculo automatico.</p>}
        </div>
      )}

      {portalReady && recipeSelectorOpen && createPortal(
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
          <section className="flex h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)] sm:h-auto sm:max-h-[calc(100dvh-3rem)]">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EDE1D6] px-5 py-4">
              <div>
                <p className="brand-kicker">Biblioteca de receitas</p>
                <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Inserir receita</h2>
              </div>
              <button type="button" onClick={() => setRecipeSelectorOpen(false)} className="rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" aria-label="Fechar" title="Fechar">x</button>
            </div>
            <div className="grid shrink-0 gap-3 border-b border-[#EDE1D6] p-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <input value={recipeSearch} onChange={(event) => setRecipeSearch(event.target.value)} className="brand-input" placeholder="Buscar por nome ou tag..." />
              <select value={recipeMealGroup} onChange={(event) => setRecipeMealGroup(event.target.value)} className="brand-input">
                <option value="">Todos os grupos</option>
                {RECIPE_MEAL_GROUPS.map((group) => <option key={group} value={group}>{RECIPE_MEAL_GROUP_LABELS[group]}</option>)}
              </select>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {recipesLoading ? <p className="text-sm text-[#8C6E52]">Carregando receitas...</p> : (
                <div className="grid gap-3 md:grid-cols-2">
                  {recipes.map((recipe) => (
                    <button key={recipe.id} type="button" onClick={() => insertRecipe(recipe)} className="rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-left transition hover:border-[#7F9A74]/50 hover:bg-[#F5FAF0]">
                      <span className="block font-semibold text-[#3A3028]">{recipe.title}</span>
                      <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.1em] text-[#8C5F50]">{RECIPE_MEAL_GROUP_LABELS[recipe.meal_group]} - {Math.round(recipe.per_portion_kcal)} kcal/porcao</span>
                      {recipe.description && <span className="mt-2 block text-xs leading-5 text-[#75675E]">{recipe.description}</span>}
                      {recipe.source_note && <span className="mt-2 block rounded-xl border border-[#F0D4C7] bg-[#FFF7F3] px-3 py-2 text-xs leading-5 text-[#8C5F50]">{recipe.source_note}</span>}
                    </button>
                  ))}
                  {!recipes.length && <p className="text-sm text-[#8C6E52]">Nenhuma receita encontrada.</p>}
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body
      )}

      {portalReady && recipeDraft && createPortal(
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
          <section className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)]">
            <div className="shrink-0 border-b border-[#EDE1D6] px-5 py-4">
              <p className="brand-kicker">Salvar na biblioteca</p>
              <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Salvar refeicao como receita</h2>
              <p className="mt-1 text-xs leading-5 text-[#75675E]">Cria uma receita nova a partir dos alimentos desta refeicao. O modelo ou plano atual nao sera alterado.</p>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
              <div>
                <label className="brand-label">Titulo da receita</label>
                <input value={recipeDraft.title} onChange={(event) => setRecipeDraft({ ...recipeDraft, title: event.target.value })} className="brand-input" />
              </div>
              <div>
                <label className="brand-label">Grupo da refeicao</label>
                <select value={recipeDraft.mealGroup} onChange={(event) => setRecipeDraft({ ...recipeDraft, mealGroup: event.target.value as RecipeMealGroup })} className="brand-input">
                  {RECIPE_MEAL_GROUPS.map((group) => <option key={group} value={group}>{RECIPE_MEAL_GROUP_LABELS[group]}</option>)}
                </select>
              </div>
              <div>
                <label className="brand-label">Tags</label>
                <input value={recipeDraft.tags} onChange={(event) => setRecipeDraft({ ...recipeDraft, tags: event.target.value })} className="brand-input" placeholder="Separe por virgulas" />
              </div>
              <div className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8C5F50]">Ingredientes que serao copiados</p>
                <ul className="mt-2 space-y-1 text-sm text-[#75675E]">
                  {meals[recipeDraft.mealIndex]?.items.filter((item) => item.food.trim()).map((item, index) => (
                    <li key={`${item.food}-${index}`}>{item.food} - {item.quantity || "100"} {item.unit || "g"}</li>
                  ))}
                </ul>
              </div>
              {recipeDraft.error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{recipeDraft.error}</p>}
            </div>
            <div className="grid shrink-0 gap-3 border-t border-[#EDE1D6] px-5 py-3 sm:flex sm:justify-end">
              <button type="button" onClick={() => setRecipeDraft(null)} className="brand-btn-secondary w-full sm:w-auto">Cancelar</button>
              <button type="button" onClick={() => void saveMealAsRecipe()} disabled={recipeSaving || !recipeDraft.title.trim()} className="brand-btn-primary w-full sm:w-auto">
                <Save className="h-4 w-4" />
                {recipeSaving ? "Salvando..." : "Salvar receita"}
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}

      <AiInstructionsModal
        open={aiModalMealIndex !== null}
        description="Deixe em branco para uma sugestão livre, ou descreva um pedido (ex.: menos carboidrato, sem laticínio)."
        onCancel={() => setAiModalMealIndex(null)}
        onSubmit={(instructions) => {
          if (aiModalMealIndex !== null) void suggestMealWithAi(aiModalMealIndex, instructions);
        }}
      />
    </div>
  );
}

function MacroMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-[#FBF7F1] px-3 py-2">
      <span className="text-[#C9937B]">{icon}</span>
      <span className="min-w-0"><span className="block truncate text-[9px] font-semibold uppercase text-[#75675E]">{label}</span><strong className="block truncate text-sm text-[#3A3028]">{value}</strong></span>
    </div>
  );
}
