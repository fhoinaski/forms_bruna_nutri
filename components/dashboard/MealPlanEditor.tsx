"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Beef, CheckCircle2, Flame, Plus, Save, Sparkles, Trash2, Utensils, Wheat } from "lucide-react";
import {
  PROTOCOL_TEMPLATE_GROUP_LABELS,
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  type ProtocolTemplateTargetGroup,
} from "@/lib/protocol-templates/constants";
import { estimateFoodMacros, roundedMacros, sumMacros, type MacroReferenceFood } from "@/lib/nutrition/macros";
import { RECIPE_MEAL_GROUP_LABELS, RECIPE_MEAL_GROUPS, type RecipeMealGroup } from "@/lib/nutrition/recipe-constants";

type MealPlanStatus = "draft" | "active" | "archived";
type MealItem = { food: string; quantity?: string | null; unit?: string | null; notes?: string | null; ai_suggested?: boolean; taco_number?: number | string | null };
type Meal = { name: string; suggested_time?: string | null; notes?: string | null; source_recipe_id?: string | null; items: MealItem[] };
type Substitution = { base_food: string; option_food: string; quantity?: string | null; unit?: string | null; notes?: string | null };
type Supplement = { name: string; dosage?: string | null; unit?: string | null; instructions?: string | null; notes?: string | null };
type FoodSuggestion = MacroReferenceFood & { numero: number | string; grupo: string };
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
type TemplateDraft = {
  title: string;
  targetGroup: ProtocolTemplateTargetGroup;
  error: string;
};
type MealPlan = {
  id: string;
  title: string;
  target_group: string | null;
  status: MealPlanStatus;
  version: number;
  notes: string | null;
  meals: Meal[];
  substitutions: Substitution[];
  supplements: Supplement[];
};

const emptyMeal = (): Meal => ({ name: "Nova refeição", suggested_time: "", notes: "", items: [{ food: "", quantity: "", unit: "", notes: "" }] });

export function MealPlanEditor({ clientId, onSaved }: { clientId: string; onSaved?: () => void }) {
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [targetGroup, setTargetGroup] = useState<ProtocolTemplateTargetGroup>("ADULTO_SAUDAVEL");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeFoodField, setActiveFoodField] = useState("");
  const [foodSearch, setFoodSearch] = useState<{ key: string; query: string }>({ key: "", query: "" });
  const [foodSuggestions, setFoodSuggestions] = useState<Record<string, FoodSuggestion[]>>({});
  const [recipeSelectorOpen, setRecipeSelectorOpen] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeMealGroup, setRecipeMealGroup] = useState("");
  const [recipes, setRecipes] = useState<RecipeLibraryItem[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft | null>(null);
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiLoadingMeal, setAiLoadingMeal] = useState<number | null>(null);

  const loadPlans = useCallback(async (preferredPlanId?: string) => {
    const response = await fetch(`/api/admin/clients/${clientId}/meal-plans`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as MealPlan[];
    setPlans(data);
    const current = data.find((item) => item.id === preferredPlanId) ?? data[0] ?? null;
    setSelectedPlanId(current?.id ?? "");
    setPlan(current);
  }, [clientId]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    fetch("/api/admin/settings/ai", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((settings: { has_api_key?: boolean } | null) => setAiEnabled(Boolean(settings?.has_api_key)))
      .catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    if (!plan) return;
    const foodsToPrime = plan.meals.flatMap((meal, mealIndex) =>
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
  }, [plan?.id]);

  useEffect(() => {
    const query = foodSearch.query.trim();
    if (!foodSearch.key || query.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/admin/foods/search?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal })
        .then((response) => response.ok ? response.json() : { items: [] })
        .then((data: { items?: FoodSuggestion[] }) => {
          setFoodSuggestions((current) => ({ ...current, [foodSearch.key]: data.items ?? [] }));
        })
        .catch((cause) => {
          if (cause instanceof Error && cause.name === "AbortError") return;
          setFoodSuggestions((current) => ({ ...current, [foodSearch.key]: [] }));
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [foodSearch]);

  function selectPlan(id: string) {
    setSelectedPlanId(id);
    setPlan(plans.find((item) => item.id === id) ?? null);
  }

  async function createFromTemplate() {
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGroup }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível criar o plano.");
      await loadPlans(data.id);
      setMessage("Plano criado a partir do modelo. Revise, personalize e ative quando estiver pronto.");
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o plano.");
    } finally {
      setCreating(false);
    }
  }

  async function save(nextStatus?: MealPlanStatus) {
    if (!plan) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        title: plan.title,
        status: nextStatus ?? plan.status,
        notes: plan.notes,
        meals: plan.meals
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
              })),
          }))
          .filter((meal) => meal.name.trim() && meal.items.length),
        substitutions: plan.substitutions
          .filter((item) => item.base_food.trim() && item.option_food.trim())
          .map((item) => ({
            base_food: item.base_food,
            option_food: item.option_food,
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
            notes: item.notes ?? null,
          })),
        supplements: plan.supplements
          .filter((item) => item.name.trim())
          .map((item) => ({
            name: item.name,
            dosage: item.dosage ?? null,
            unit: item.unit ?? null,
            instructions: item.instructions ?? null,
            notes: item.notes ?? null,
          })),
      };
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível salvar o plano.");
      await loadPlans(data.id);
      setMessage(nextStatus === "active" ? "Plano ativado no portal do cliente." : "Plano alimentar salvo.");
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o plano.");
    } finally {
      setSaving(false);
    }
  }

  async function removePlan() {
    if (!plan) return;
    const warning = plan.status === "active"
      ? `O plano “${plan.title}” está ativo no portal. Deseja realmente excluí-lo?`
      : `Deseja excluir o plano “${plan.title}”? Esta ação não pode ser desfeita.`;
    if (!window.confirm(warning)) return;

    setDeleting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/${plan.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Não foi possível excluir o plano.");
      setSelectedPlanId("");
      setPlan(null);
      await loadPlans();
      setMessage("Plano alimentar excluído.");
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir o plano.");
    } finally {
      setDeleting(false);
    }
  }

  const updateMeal = (index: number, patch: Partial<Meal>) => {
    if (!plan) return;
    setPlan({ ...plan, meals: plan.meals.map((meal, mealIndex) => mealIndex === index ? { ...meal, ...patch } : meal) });
  };

  const updateMealItem = (mealIndex: number, itemIndex: number, patch: Partial<MealItem>) => {
    if (!plan) return;
    setPlan({
      ...plan,
      meals: plan.meals.map((meal, currentMealIndex) => currentMealIndex === mealIndex
        ? { ...meal, items: meal.items.map((item, currentItemIndex) => currentItemIndex === itemIndex ? { ...item, ...patch } : item) }
        : meal),
    });
  };

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

  function insertRecipe(recipe: RecipeLibraryItem) {
    if (!plan) return;
    const mealIndex = plan.meals.length;
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
      })),
    };
    setPlan({ ...plan, meals: [...plan.meals, meal] });
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
    setMessage(`Receita "${recipe.title}" inserida como copia. Salve o plano para registrar no prontuario.`);
  };

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
    if (!plan) return;
    const meal = plan.meals[mealIndex];
    setRecipeDraft({
      mealIndex,
      title: meal.name || `Receita do plano - refeicao ${mealIndex + 1}`,
      mealGroup: inferMealGroup(meal.name),
      tags: [plan.target_group, "plano personalizado"].filter(Boolean).join(", "),
      error: "",
    });
  }

  async function saveMealAsRecipe() {
    if (!plan || !recipeDraft) return;
    const meal = plan.meals[recipeDraft.mealIndex];
    const missingFoods: string[] = [];
    const ingredients = meal.items
      .map((item, itemIndex) => {
        if (!item.food.trim()) return null;
        if (item.taco_number) {
          return {
            taco_number: Number(item.taco_number),
            food_name: item.food,
            grams: parseGrams(item.quantity, item.unit),
          };
        }
        const reference = findTacoReference(recipeDraft.mealIndex, itemIndex, item.food);
        if (!reference) {
          missingFoods.push(item.food);
          return null;
        }
        return {
          taco_number: Number(reference.numero),
          food_name: reference.descricao,
          grams: parseGrams(item.quantity, item.unit),
        };
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
          description: `Receita criada a partir da refeicao "${meal.name}" do plano "${plan.title}".`,
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
      setMessage("Receita salva na biblioteca. Ela ja pode ser inserida em outros planos.");
    } catch (cause) {
      setRecipeDraft({ ...recipeDraft, error: cause instanceof Error ? cause.message : "Nao foi possivel salvar a receita." });
    } finally {
      setRecipeSaving(false);
    }
  }

  function openSavePlanAsTemplate() {
    if (!plan) return;
    const planTargetGroup = PROTOCOL_TEMPLATE_TARGET_GROUPS.find((group) => group === plan.target_group);
    setTemplateDraft({
      title: `${plan.title} - modelo`,
      targetGroup: planTargetGroup ?? targetGroup,
      error: "",
    });
  }

  async function savePlanAsTemplate() {
    if (!plan || !templateDraft) return;
    setTemplateSaving(true);
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/${plan.id}/save-as-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: templateDraft.title.trim(), targetGroup: templateDraft.targetGroup }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Nao foi possivel salvar o modelo.");
      setTemplateDraft(null);
      setMessage("Novo modelo de dieta criado na biblioteca. O plano do paciente e o modelo original nao foram alterados.");
    } catch (cause) {
      setTemplateDraft({ ...templateDraft, error: cause instanceof Error ? cause.message : "Nao foi possivel salvar o modelo." });
    } finally {
      setTemplateSaving(false);
    }
  }

  async function suggestMealWithAi(mealIndex: number) {
    if (!plan) return;
    const meal = plan.meals[mealIndex];
    const instructions = window.prompt("Pedido opcional para a IA (ex: menos carboidrato, sem laticinio):") ?? "";
    setAiLoadingMeal(mealIndex);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/ai/suggest-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "meal",
          targetGroup: plan.target_group ?? targetGroup,
          mealName: meal.name,
          instructions,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Nao foi possivel sugerir a refeicao.");
      const suggested = result.resolvedMeals?.[0];
      if (!suggested) throw new Error("A IA nao retornou uma refeicao valida.");
      setPlan({
        ...plan,
        meals: plan.meals.map((current, index) => index === mealIndex ? {
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
        } : current),
      });
      setMessage("Sugestao aplicada no formulario. Revise, edite ou remova itens antes de salvar.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel sugerir a refeicao.");
    } finally {
      setAiLoadingMeal(null);
    }
  }

  const mealMacros = useMemo(() => plan?.meals.map((meal) => roundedMacros(sumMacros(
    meal.items.filter((item) => item.food.trim()).map((item) => estimateFoodMacros(item.food, item.quantity, item.unit, knownFoodReferences))
  ))) ?? [], [plan, knownFoodReferences]);

  const planMacros = useMemo(() => roundedMacros(sumMacros(mealMacros)), [mealMacros]);

  return (
    <div className="w-full min-w-0 space-y-5">
      <section className="rounded-2xl border border-[#EAD8C2] bg-[#FAF7F2]/70 p-5">
        <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="brand-kicker mb-1">Plano alimentar individual</p>
            <h2 className="font-serif text-xl font-semibold text-[#3A3028] sm:text-2xl">Prescrição visual para o cliente</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#75675E]">
              Use um modelo como ponto de partida, ajuste alimentos, quantidades, suplementos e substituições, depois ative no portal.
            </p>
          </div>
          {!aiEnabled && (
            <p className="mt-2 text-xs text-[#8C5F50]">
                Para usar Sugerir com IA, configure a chave em <a href="/dashboard/settings/ai" className="font-semibold underline">Inteligencia artificial</a>.
            </p>
          )}
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,220px)_auto] xl:shrink-0">
            <select value={targetGroup} onChange={(event) => setTargetGroup(event.target.value as ProtocolTemplateTargetGroup)} className="brand-input">
              {PROTOCOL_TEMPLATE_TARGET_GROUPS.map((group) => <option key={group} value={group}>{PROTOCOL_TEMPLATE_GROUP_LABELS[group]}</option>)}
            </select>
            <button type="button" onClick={() => void createFromTemplate()} disabled={creating} className="brand-btn-primary w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              {creating ? "Criando..." : "Criar por modelo"}
            </button>
          </div>
        </div>
      </section>

      {plans.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {plans.map((item) => (
            <button key={item.id} type="button" onClick={() => selectPlan(item.id)}
              className={`max-w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${selectedPlanId === item.id ? "border-[#7F9A74] bg-[#EAF0E4] text-[#607A56]" : "border-[#EAD8C2] bg-white text-[#75675E] hover:border-[#D9C4B2]"}`}>
              <span className="block max-w-52 truncate font-semibold">{item.title}</span>
              <span className="mt-0.5 block text-[10px] uppercase tracking-[0.06em]">{item.status === "active" ? "Ativo no portal" : item.status === "draft" ? "Rascunho" : "Arquivado"} · v{item.version}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded-xl border border-[#D9E4D3] bg-[#F4F8F1] px-4 py-3 text-sm text-[#4F6847]">{message}</p>}

      {!plan ? (
        <div className="rounded-2xl border border-dashed border-[#D9C4B2] bg-white p-10 text-center">
          <Utensils className="mx-auto mb-3 h-10 w-10 text-[#D9C4B2]" />
          <p className="text-sm font-semibold text-[#3A3028]">Nenhum plano alimentar criado ainda.</p>
          <p className="mt-1 text-xs text-[#75675E]">Selecione um grupo alvo e crie o primeiro plano a partir da base profissional.</p>
        </div>
      ) : (
        <section className="min-w-0 space-y-5 rounded-2xl border border-[#EAD8C2] bg-white p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
            <div>
              <label className="brand-label">Título do plano</label>
              <input value={plan.title} onChange={(event) => setPlan({ ...plan, title: event.target.value })} className="brand-input" />
            </div>
            <div>
              <label className="brand-label">Status</label>
              <select value={plan.status} onChange={(event) => setPlan({ ...plan, status: event.target.value as MealPlanStatus })} className="brand-input">
                <option value="draft">Rascunho</option>
                <option value="active">Ativo no portal</option>
                <option value="archived">Arquivado</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="brand-label">Orientações gerais para o cliente</label>
              <textarea value={plan.notes ?? ""} onChange={(event) => setPlan({ ...plan, notes: event.target.value })} className="brand-input min-h-24 resize-y" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-serif text-xl font-semibold text-[#3A3028]">Refeições</h3>
              <div className="grid gap-2 sm:flex">
              <button type="button" onClick={() => setPlan({ ...plan, meals: [...plan.meals, emptyMeal()] })} className="brand-btn-secondary w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                Refeição
              </button>
              <button type="button" onClick={() => setRecipeSelectorOpen(true)} className="brand-btn-secondary w-full sm:w-auto">
                <Utensils className="h-4 w-4" />
                Inserir receita
              </button>
              </div>
            </div>
            {plan.meals.map((meal, mealIndex) => (
              <article key={mealIndex} className="overflow-hidden rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_8px_28px_rgba(58,48,40,0.04)]">
                <div className="flex flex-col gap-3 border-b border-[#EDE1D6] bg-[#FBF7F1] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EAF0E4] text-[#607A56]"><Utensils className="h-4 w-4" /></div>
                    <div className="min-w-0"><p className="text-sm font-semibold text-[#3A3028]">{meal.name || `Refeição ${mealIndex + 1}`}</p><p className="text-xs text-[#75675E]">{meal.items.filter((item) => item.food.trim()).length} alimento(s) · {mealMacros[mealIndex]?.kcal ?? 0} kcal estimadas</p></div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                    <button type="button" onClick={() => void suggestMealWithAi(mealIndex)} disabled={!aiEnabled || aiLoadingMeal === mealIndex} title={aiEnabled ? "Sugerir itens com IA" : "Configure a IA em Dashboard > Inteligencia artificial"} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] px-3 text-xs font-semibold text-[#8C5F50] transition hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-50">
                      <Sparkles className="h-4 w-4" />
                      {aiLoadingMeal === mealIndex ? "Sugerindo..." : "Sugerir com IA"}
                    </button>
                    <button type="button" onClick={() => openSaveMealAsRecipe(mealIndex)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#D9E4D3] bg-[#FFFDFC] px-3 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]">
                      <Save className="h-4 w-4" />
                      Salvar como receita
                    </button>
                    <button type="button" onClick={() => setPlan({ ...plan, meals: plan.meals.filter((_, index) => index !== mealIndex) })} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" aria-label={`Remover ${meal.name || "refeição"}`} title="Remover refeição">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_130px]">
                  <input value={meal.name} onChange={(event) => updateMeal(mealIndex, { name: event.target.value })} className="brand-input" placeholder="Nome da refeição" />
                  <input value={meal.suggested_time ?? ""} onChange={(event) => updateMeal(mealIndex, { suggested_time: event.target.value })} className="brand-input" placeholder="Horário" />
                </div>
                <div className="mt-3 space-y-2">
                  {meal.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_110px_90px_auto]">
                      <div className="relative min-w-0">
                        <input
                          value={item.food}
                          onChange={(event) => {
                            const key = `${mealIndex}:${itemIndex}`;
                            updateMealItem(mealIndex, itemIndex, { food: event.target.value });
                            setActiveFoodField(key);
                            setFoodSearch({ key, query: event.target.value });
                          }}
                          onFocus={(event) => {
                            const key = `${mealIndex}:${itemIndex}`;
                            setActiveFoodField(key);
                            setFoodSearch({ key, query: event.target.value });
                          }}
                          onBlur={() => window.setTimeout(() => setActiveFoodField(""), 140)}
                          className="brand-input"
                          placeholder="Digite para buscar na TACO"
                        />
                        {item.ai_suggested && (
                          <span className="mt-1 inline-flex rounded-full bg-[#FFF7F3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8C5F50]">
                            sugerido por IA
                          </span>
                        )}
                        {activeFoodField === `${mealIndex}:${itemIndex}` && (foodSuggestions[`${mealIndex}:${itemIndex}`]?.length ?? 0) > 0 && (
                          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-64 overflow-y-auto rounded-xl border border-[#EAD8C2] bg-white p-1 shadow-[0_18px_44px_rgba(58,48,40,0.16)]">
                            {foodSuggestions[`${mealIndex}:${itemIndex}`].map((suggestion) => (
                              <button
                                key={suggestion.numero}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  updateMealItem(mealIndex, itemIndex, { food: suggestion.descricao });
                                  setFoodSuggestions((current) => ({ ...current, [`${mealIndex}:${itemIndex}`]: [suggestion] }));
                                  setActiveFoodField("");
                                }}
                                className="block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-[#FAF7F2]"
                              >
                                <span className="block text-sm font-medium text-[#3A3028]">{suggestion.descricao}</span>
                                <span className="mt-0.5 block text-[10px] uppercase tracking-[0.08em] text-[#8C6E52]">
                                  {suggestion.grupo} · {Math.round(suggestion.energia_kcal)} kcal/100g{suggestion.fonte === "complementar" ? " · TBCA/USDA" : ""}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <input value={item.quantity ?? ""} onChange={(event) => updateMealItem(mealIndex, itemIndex, { quantity: event.target.value })} className="brand-input" placeholder="Qtd." />
                      <input value={item.unit ?? ""} onChange={(event) => updateMealItem(mealIndex, itemIndex, { unit: event.target.value })} className="brand-input" placeholder="Un." />
                      <button type="button" onClick={() => updateMeal(mealIndex, { items: meal.items.filter((_, index) => index !== itemIndex) })} className="inline-flex h-11 items-center justify-center rounded-xl px-3 text-red-600 hover:bg-red-50" aria-label="Remover alimento" title="Remover alimento">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => updateMeal(mealIndex, { items: [...meal.items, { food: "", quantity: "", unit: "", notes: "" }] })} className="text-xs font-semibold text-[#607A56]">
                    + adicionar alimento
                  </button>
                </div>
                </div>
              </article>
            ))}
          </div>

          <EditableList
            title="Suplementos"
            items={plan.supplements}
            onChange={(supplements) => setPlan({ ...plan, supplements })}
            emptyItem={{ name: "", dosage: "", unit: "", instructions: "", notes: "" }}
            fields={["name", "dosage", "unit", "instructions"]}
            labels={["Nome", "Dose", "Un.", "Como usar"]}
          />

          <EditableList
            title="Substituições"
            items={plan.substitutions}
            onChange={(substitutions) => setPlan({ ...plan, substitutions })}
            emptyItem={{ base_food: "", option_food: "", quantity: "", unit: "", notes: "" }}
            fields={["base_food", "option_food", "quantity", "unit"]}
            labels={["Alimento base", "Pode trocar por", "Qtd.", "Un."]}
          />

          <div className="flex flex-col gap-3 border-t border-[#EDE1D6] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => void removePlan()} disabled={deleting || saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="h-4 w-4" />
              {deleting ? "Excluindo..." : "Excluir plano"}
            </button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={openSavePlanAsTemplate} disabled={saving || deleting || plan.meals.length === 0} className="brand-btn-secondary w-full sm:w-auto">
                <Save className="h-4 w-4" />
                Salvar como modelo
              </button>
              <button type="button" onClick={() => void save()} disabled={saving || deleting} className="brand-btn-secondary w-full sm:w-auto">
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar rascunho"}
              </button>
              <button type="button" onClick={() => void save("active")} disabled={saving || deleting || plan.status === "active"} className="brand-btn-primary w-full sm:w-auto">
                <CheckCircle2 className="h-4 w-4" />
                {plan.status === "active" ? "Plano ativo" : "Ativar no portal"}
              </button>
            </div>
          </div>

          <div className="sticky bottom-3 z-10 rounded-lg border border-[#D9C4B2] bg-[#FFFDFC]/95 p-3 shadow-[0_16px_42px_rgba(58,48,40,0.14)] backdrop-blur-xl sm:bottom-4">
            <div className="flex min-w-0 flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#607A56]">Macros em tempo real</p>
                <p className="mt-0.5 text-[11px] text-[#75675E]">Estimativa automática por alimento e porção. Confirme os valores antes de prescrever.</p>
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 2xl:shrink-0">
                <MacroMetric icon={<Flame className="h-4 w-4" />} label="Energia" value={`${planMacros.kcal} kcal`} />
                <MacroMetric icon={<Beef className="h-4 w-4" />} label="Proteínas" value={`${planMacros.protein} g`} />
                <MacroMetric icon={<Wheat className="h-4 w-4" />} label="Carboidratos" value={`${planMacros.carbs} g`} />
                <MacroMetric icon={<span className="text-xs font-bold">G</span>} label="Gorduras" value={`${planMacros.fat} g`} />
              </div>
            </div>
            {planMacros.totalItems > 0 && planMacros.recognizedItems < planMacros.totalItems && <p className="mt-2 text-[10px] text-[#8C5F50]">{planMacros.totalItems - planMacros.recognizedItems} alimento(s) ainda não reconhecido(s) pelo cálculo automático.</p>}
          </div>
        </section>
      )}
      {recipeSelectorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
          <section className="flex h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)] sm:h-auto sm:max-h-[calc(100dvh-3rem)]">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EDE1D6] px-5 py-4">
              <div>
                <p className="brand-kicker">Biblioteca de receitas</p>
                <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Inserir receita no plano</h2>
              </div>
              <button type="button" onClick={() => setRecipeSelectorOpen(false)} className="rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" title="Fechar">x</button>
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
                      <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.1em] text-[#8C5F50]">{RECIPE_MEAL_GROUP_LABELS[recipe.meal_group]} · {Math.round(recipe.per_portion_kcal)} kcal/porcao</span>
                      {recipe.description && <span className="mt-2 block text-xs leading-5 text-[#75675E]">{recipe.description}</span>}
                      {recipe.source_note && <span className="mt-2 block rounded-xl border border-[#F0D4C7] bg-[#FFF7F3] px-3 py-2 text-xs leading-5 text-[#8C5F50]">{recipe.source_note}</span>}
                    </button>
                  ))}
                  {!recipes.length && <p className="text-sm text-[#8C6E52]">Nenhuma receita encontrada.</p>}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      {recipeDraft && plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
          <section className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)]">
            <div className="shrink-0 border-b border-[#EDE1D6] px-5 py-4">
              <p className="brand-kicker">Salvar na biblioteca</p>
              <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Salvar refeicao como receita</h2>
              <p className="mt-1 text-xs leading-5 text-[#75675E]">Cria uma receita nova a partir dos alimentos desta refeicao. O plano do paciente nao sera alterado.</p>
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
                  {plan.meals[recipeDraft.mealIndex]?.items.filter((item) => item.food.trim()).map((item, index) => (
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
        </div>
      )}
      {templateDraft && plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
          <section className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)]">
            <div className="shrink-0 border-b border-[#EDE1D6] px-5 py-4">
              <p className="brand-kicker">Promover para biblioteca</p>
              <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Salvar plano como modelo</h2>
              <p className="mt-1 text-xs leading-5 text-[#75675E]">Isto cria um modelo novo de dieta. Nao altera o plano do paciente nem o modelo original usado como ponto de partida.</p>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
              <div>
                <label className="brand-label">Titulo do novo modelo</label>
                <input value={templateDraft.title} onChange={(event) => setTemplateDraft({ ...templateDraft, title: event.target.value })} className="brand-input" />
              </div>
              <div>
                <label className="brand-label">Grupo alvo</label>
                <select value={templateDraft.targetGroup} onChange={(event) => setTemplateDraft({ ...templateDraft, targetGroup: event.target.value as ProtocolTemplateTargetGroup })} className="brand-input">
                  {PROTOCOL_TEMPLATE_TARGET_GROUPS.map((group) => <option key={group} value={group}>{PROTOCOL_TEMPLATE_GROUP_LABELS[group]}</option>)}
                </select>
              </div>
              <div className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] p-3 text-sm text-[#75675E]">
                <p><strong className="text-[#3A3028]">{plan.meals.length}</strong> refeicao(oes), <strong className="text-[#3A3028]">{plan.substitutions.length}</strong> substituicao(oes) e vinculos com receitas serao copiados.</p>
              </div>
              {templateDraft.error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{templateDraft.error}</p>}
            </div>
            <div className="grid shrink-0 gap-3 border-t border-[#EDE1D6] px-5 py-3 sm:flex sm:justify-end">
              <button type="button" onClick={() => setTemplateDraft(null)} className="brand-btn-secondary w-full sm:w-auto">Cancelar</button>
              <button type="button" onClick={() => void savePlanAsTemplate()} disabled={templateSaving || !templateDraft.title.trim()} className="brand-btn-primary w-full sm:w-auto">
                <Save className="h-4 w-4" />
                {templateSaving ? "Salvando..." : "Criar modelo novo"}
              </button>
            </div>
          </section>
        </div>
      )}
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

function EditableList<T extends Record<string, string | null | undefined>>({
  title,
  items,
  onChange,
  emptyItem,
  fields,
  labels,
}: {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  emptyItem: T;
  fields: Array<keyof T>;
  labels: string[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-serif text-xl font-semibold text-[#3A3028]">{title}</h3>
        <button type="button" onClick={() => onChange([...items, emptyItem])} className="brand-btn-secondary w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#D9C4B2] px-4 py-5 text-center text-sm text-[#9A8B80]">Nenhum item cadastrado.</p>
      ) : items.map((item, itemIndex) => (
        <div key={itemIndex} className="grid min-w-0 gap-2 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          {fields.map((field, fieldIndex) => (
            <input
              key={String(field)}
              value={item[field] ?? ""}
              onChange={(event) => onChange(items.map((row, index) => index === itemIndex ? { ...row, [field]: event.target.value } : row))}
              className="brand-input"
              placeholder={labels[fieldIndex]}
            />
          ))}
          <button type="button" onClick={() => onChange(items.filter((_, index) => index !== itemIndex))} className="inline-flex h-11 items-center justify-center rounded-xl px-3 text-red-600 hover:bg-red-50" aria-label={`Remover ${title.toLowerCase()}`} title="Remover">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
