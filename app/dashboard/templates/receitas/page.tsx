"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, Edit3, Plus, Save, Search, Utensils, X } from "lucide-react";
import { RECIPE_MEAL_GROUP_LABELS, RECIPE_MEAL_GROUPS, type RecipeMealGroup } from "@/lib/nutrition/recipe-constants";

type RecipeIngredient = {
  taco_number: number;
  food_name: string;
  grams: number;
};

type FoodSuggestion = {
  numero: number;
  descricao: string;
  grupo: string;
  energia_kcal: number;
};

type Recipe = {
  id: string;
  title: string;
  description: string | null;
  meal_group: RecipeMealGroup;
  servings: number;
  portion_grams: number | null;
  preparation_steps: string | null;
  ingredients: RecipeIngredient[];
  tags: string[];
  source_note: string | null;
  per_portion_kcal: number;
  per_portion_protein_g: number;
  per_portion_carbs_g: number;
  per_portion_fat_g: number;
  is_active: number;
};

type RecipeForm = Omit<Recipe, "id" | "per_portion_kcal" | "per_portion_protein_g" | "per_portion_carbs_g" | "per_portion_fat_g" | "is_active"> & {
  id?: string;
  tags_text: string;
  is_active: boolean;
};

const emptyForm: RecipeForm = {
  title: "",
  description: "",
  meal_group: "lanche",
  servings: 1,
  portion_grams: null,
  preparation_steps: "",
  ingredients: [{ taco_number: 0, food_name: "", grams: 100 }],
  tags: [],
  tags_text: "",
  source_note: "",
  is_active: true,
};

function recipeToForm(recipe: Recipe): RecipeForm {
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description ?? "",
    meal_group: recipe.meal_group,
    servings: recipe.servings,
    portion_grams: recipe.portion_grams,
    preparation_steps: recipe.preparation_steps ?? "",
    ingredients: recipe.ingredients.length ? recipe.ingredients : [{ taco_number: 0, food_name: "", grams: 100 }],
    tags: recipe.tags,
    tags_text: recipe.tags.join(", "),
    source_note: recipe.source_note ?? "",
    is_active: Boolean(recipe.is_active),
  };
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mealGroup, setMealGroup] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [form, setForm] = useState<RecipeForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ includeInactive: includeInactive ? "true" : "false" });
    if (search.trim()) params.set("q", search.trim());
    if (mealGroup) params.set("meal_group", mealGroup);
    const response = await fetch(`/api/admin/recipes?${params}`, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json() as { items: Recipe[] };
      setRecipes(data.items);
    }
    setLoading(false);
  }, [includeInactive, mealGroup, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRecipes(), 250);
    return () => window.clearTimeout(timer);
  }, [loadRecipes]);

  const stats = useMemo(() => ({
    total: recipes.length,
    active: recipes.filter((recipe) => recipe.is_active).length,
  }), [recipes]);

  async function saveRecipe() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description?.trim() || null,
        meal_group: form.meal_group,
        servings: Number(form.servings),
        portion_grams: form.portion_grams ? Number(form.portion_grams) : null,
        preparation_steps: form.preparation_steps?.trim() || null,
        ingredients: form.ingredients.filter((item) => item.taco_number && item.food_name.trim() && Number(item.grams) > 0),
        tags: form.tags_text.split(",").map((tag) => tag.trim()).filter(Boolean),
        source_note: form.source_note?.trim() || null,
        is_active: form.is_active,
      };
      const response = await fetch(form.id ? `/api/admin/recipes/${form.id}` : "/api/admin/recipes", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Nao foi possivel salvar a receita.");
      setForm(null);
      await loadRecipes();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel salvar a receita.");
    } finally {
      setSaving(false);
    }
  }

  async function archive(recipe: Recipe) {
    if (!confirm(`Arquivar a receita "${recipe.title}"?`)) return;
    const response = await fetch(`/api/admin/recipes/${recipe.id}`, { method: "DELETE" });
    if (response.ok) await loadRecipes();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="brand-kicker mb-3">Biblioteca culinaria</p>
            <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028] sm:text-5xl">Receitas brasileiras</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Crie receitas reutilizaveis com ingredientes da TACO. Ao inserir no plano, os dados sao copiados para o paciente como snapshot.
            </p>
          </div>
          <button type="button" onClick={() => setForm({ ...emptyForm })} className="brand-btn-primary w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Nova receita
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Stat label="Receitas filtradas" value={stats.total} />
          <Stat label="Ativas" value={stats.active} />
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
          <div>
            <label className="brand-label">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="brand-input brand-input-with-icon" placeholder="Nome, tag ou descricao..." />
            </div>
          </div>
          <div>
            <label className="brand-label">Grupo</label>
            <select value={mealGroup} onChange={(event) => setMealGroup(event.target.value)} className="brand-input">
              <option value="">Todos</option>
              {RECIPE_MEAL_GROUPS.map((group) => <option key={group} value={group}>{RECIPE_MEAL_GROUP_LABELS[group]}</option>)}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 text-sm text-[#75675E]">
            <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
            Inativas
          </label>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <p className="text-sm text-[#8C6E52]">Carregando receitas...</p>
        ) : recipes.map((recipe) => (
          <article key={recipe.id} className="flex min-w-0 flex-col rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF0E4] text-[#607A56]"><Utensils className="h-5 w-5" /></span>
              <span className="rounded-full border border-[#D9E4D3] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#607A56]">{recipe.is_active ? "Ativa" : "Inativa"}</span>
            </div>
            <h2 className="mt-4 break-words font-serif text-xl font-semibold text-[#3A3028]">{recipe.title}</h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#8C5F50]">{RECIPE_MEAL_GROUP_LABELS[recipe.meal_group]} · {recipe.servings} porcao(oes)</p>
            {recipe.description && <p className="mt-3 text-sm leading-6 text-[#75675E]">{recipe.description}</p>}
            {recipe.source_note && (
              <p className="mt-3 rounded-xl border border-[#F0D4C7] bg-[#FFF7F3] px-3 py-2 text-xs leading-5 text-[#8C5F50]">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                {recipe.source_note}
              </p>
            )}
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
              <Macro label="Kcal" value={Math.round(recipe.per_portion_kcal)} />
              <Macro label="Prot." value={recipe.per_portion_protein_g.toFixed(1)} />
              <Macro label="Carb." value={recipe.per_portion_carbs_g.toFixed(1)} />
              <Macro label="Gord." value={recipe.per_portion_fat_g.toFixed(1)} />
            </div>
            <div className="mt-auto flex gap-2 pt-5">
              <button type="button" onClick={() => setForm(recipeToForm(recipe))} className="brand-btn-secondary flex-1">
                <Edit3 className="h-4 w-4" />
                Editar
              </button>
              <button type="button" onClick={() => void archive(recipe)} className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-[#9A5C4E] hover:bg-[#FFF5F3]">
                <Archive className="h-4 w-4" />
              </button>
            </div>
          </article>
        ))}
      </section>

      {form && (
        <RecipeModal
          form={form}
          error={error}
          saving={saving}
          setForm={setForm}
          onClose={() => setForm(null)}
          onSave={() => void saveRecipe()}
        />
      )}
    </div>
  );
}

function RecipeModal({ form, error, saving, setForm, onClose, onSave }: {
  form: RecipeForm;
  error: string;
  saving: boolean;
  setForm: (form: RecipeForm | null) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <section className="flex h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)] sm:h-auto sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EDE1D6] px-5 py-4">
          <div>
            <p className="brand-kicker">{form.id ? "Editar receita" : "Nova receita"}</p>
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Receita da biblioteca</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" title="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><label className="brand-label">Titulo</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="brand-input" /></div>
            <div><label className="brand-label">Grupo da refeicao</label><select value={form.meal_group} onChange={(e) => setForm({ ...form, meal_group: e.target.value as RecipeMealGroup })} className="brand-input">{RECIPE_MEAL_GROUPS.map((group) => <option key={group} value={group}>{RECIPE_MEAL_GROUP_LABELS[group]}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="brand-label">Porcoes</label><input type="number" min={1} value={form.servings} onChange={(e) => setForm({ ...form, servings: Number(e.target.value) })} className="brand-input" /></div>
              <div><label className="brand-label">Porcao (g)</label><input type="number" min={1} value={form.portion_grams ?? ""} onChange={(e) => setForm({ ...form, portion_grams: e.target.value ? Number(e.target.value) : null })} className="brand-input" /></div>
            </div>
            <div className="md:col-span-2"><label className="brand-label">Descricao</label><textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="brand-input min-h-20" /></div>
            <div className="md:col-span-2"><label className="brand-label">Modo de preparo</label><textarea value={form.preparation_steps ?? ""} onChange={(e) => setForm({ ...form, preparation_steps: e.target.value })} className="brand-input min-h-28" /></div>
            <div className="md:col-span-2"><label className="brand-label">Tags</label><input value={form.tags_text} onChange={(e) => setForm({ ...form, tags_text: e.target.value })} className="brand-input" placeholder="Separadas por virgula" /></div>
            <div className="md:col-span-2"><label className="brand-label">Nota de fonte ou limitacao</label><textarea value={form.source_note ?? ""} onChange={(e) => setForm({ ...form, source_note: e.target.value })} className="brand-input min-h-20" placeholder="Ex: ingrediente aproximado por ausencia na TACO." /></div>
            <div className="md:col-span-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-serif text-xl font-semibold text-[#3A3028]">Ingredientes TACO</h3>
                <button type="button" onClick={() => setForm({ ...form, ingredients: [...form.ingredients, { taco_number: 0, food_name: "", grams: 100 }] })} className="brand-btn-secondary"><Plus className="h-4 w-4" />Ingrediente</button>
              </div>
              <div className="space-y-2">
                {form.ingredients.map((ingredient, index) => (
                  <IngredientRow
                    key={index}
                    ingredient={ingredient}
                    onChange={(next) => setForm({ ...form, ingredients: form.ingredients.map((item, itemIndex) => itemIndex === index ? next : item) })}
                    onRemove={() => setForm({ ...form, ingredients: form.ingredients.filter((_, itemIndex) => itemIndex !== index) })}
                  />
                ))}
              </div>
            </div>
            <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-sm text-[#75675E]">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="mt-1 accent-[#7F9A74]" />
              <span><strong className="block text-[#3A3028]">Receita ativa</strong>Disponivel para inserir em planos alimentares.</span>
            </label>
            {error && <p className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          </div>
        </div>
        <div className="grid shrink-0 gap-3 border-t border-[#EDE1D6] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:justify-end">
          <button type="button" onClick={onClose} className="brand-btn-secondary w-full sm:w-auto">Cancelar</button>
          <button type="button" onClick={onSave} disabled={saving || !form.title.trim()} className="brand-btn-primary w-full sm:w-auto"><Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar receita"}</button>
        </div>
      </section>
    </div>
  );
}

function IngredientRow({ ingredient, onChange, onRemove }: {
  ingredient: RecipeIngredient;
  onChange: (ingredient: RecipeIngredient) => void;
  onRemove: () => void;
}) {
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || ingredient.food_name.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/admin/foods/search?q=${encodeURIComponent(ingredient.food_name)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { items: [] })
        .then((data: { items?: FoodSuggestion[] }) => setSuggestions(data.items ?? []))
        .catch(() => setSuggestions([]));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [ingredient.food_name, open]);

  return (
    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_110px_auto]">
      <div className="relative min-w-0">
        <input
          value={ingredient.food_name}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          onChange={(event) => onChange({ ...ingredient, food_name: event.target.value })}
          className="brand-input"
          placeholder="Buscar alimento na TACO"
        />
        {open && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-56 overflow-y-auto rounded-xl border border-[#EAD8C2] bg-white p-1 shadow-[0_18px_44px_rgba(58,48,40,0.16)]">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.numero}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange({ ...ingredient, taco_number: Number(suggestion.numero), food_name: suggestion.descricao });
                  setSuggestions([suggestion]);
                  setOpen(false);
                }}
                className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#FAF7F2]"
              >
                <span className="block text-sm font-medium text-[#3A3028]">{suggestion.descricao}</span>
                <span className="text-[10px] uppercase tracking-[0.08em] text-[#8C6E52]">TACO {suggestion.numero} · {suggestion.grupo}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <input type="number" min={1} value={ingredient.grams} onChange={(event) => onChange({ ...ingredient, grams: Number(event.target.value) })} className="brand-input" placeholder="g" />
      <button type="button" onClick={onRemove} className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-red-600 hover:bg-red-50"><X className="h-4 w-4" /></button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">{label}</p>
      <p className="mt-2 font-serif text-3xl font-semibold text-[#607A56]">{value}</p>
    </div>
  );
}

function Macro({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-[#FBF7F1] px-2 py-2">
      <span className="block text-[9px] font-semibold uppercase text-[#8C6E52]">{label}</span>
      <strong className="text-[#3A3028]">{value}</strong>
    </div>
  );
}
