"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Beef, CheckCircle2, Flame, Plus, Save, Trash2, Utensils, Wheat } from "lucide-react";
import {
  PROTOCOL_TEMPLATE_GROUP_LABELS,
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  type ProtocolTemplateTargetGroup,
} from "@/lib/protocol-templates/constants";
import { estimateFoodMacros, roundedMacros, sumMacros, type MacroReferenceFood } from "@/lib/nutrition/macros";
import { RECIPE_MEAL_GROUP_LABELS, RECIPE_MEAL_GROUPS, type RecipeMealGroup } from "@/lib/nutrition/recipe-constants";

type MealPlanStatus = "draft" | "active" | "archived";
type MealItem = { food: string; quantity?: string | null; unit?: string | null; notes?: string | null };
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

  const knownFoodReferences = useMemo(() => {
    const byKey = new Map<string, FoodSuggestion>();
    for (const suggestion of Object.values(foodSuggestions).flat()) {
      byKey.set(String(suggestion.numero ?? suggestion.descricao), suggestion);
    }
    return Array.from(byKey.values());
  }, [foodSuggestions]);

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
                  <button type="button" onClick={() => setPlan({ ...plan, meals: plan.meals.filter((_, index) => index !== mealIndex) })} className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-lg text-red-600 hover:bg-red-50 sm:self-auto" aria-label={`Remover ${meal.name || "refeição"}`} title="Remover refeição">
                    <Trash2 className="h-4 w-4" />
                  </button>
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
                                  {suggestion.grupo} · {Math.round(suggestion.energia_kcal)} kcal/100g
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
