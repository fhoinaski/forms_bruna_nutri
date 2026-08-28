"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Search, Star, X } from "lucide-react";
import type { MealPlanMealPayload, MealPlanItemPayload } from "@/lib/repositories/meal-plans";
import { useDialogKeyboard } from "@/hooks/use-dialog-keyboard";

type ReuseTab = "recent" | "favorites" | "saved" | "plans" | "templates";

interface FoodRefItem {
  ref: { source: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA"; sourceId: string };
  name: string;
  sourceLabel: string | null;
}

interface SavedMealItem {
  id: string;
  name: string;
  meal_structure: string;
  meal: MealPlanMealPayload;
  usage_count: number;
}

interface PlanSummary {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  meals: MealPlanMealPayload[];
}

interface TemplateSummary {
  id: string;
  title: string;
  target_group: string;
}

/**
 * R4 (seções 4-5/10/13/16/30-31) — biblioteca de reuso do Composer: uma
 * busca única, seções para alimentos recentes/favoritos, refeições salvas,
 * refeições de outros planos do MESMO paciente, e modelos de plano
 * existentes. Toda inserção acontece só no estado LOCAL do draft (nunca
 * auto-save — mesmo contrato de "duplicar refeição"/"inserir receita" já
 * existentes) e sempre limpa qualquer snapshot de nutrição congelado antes
 * de inserir, forçando a Nutrition Engine a recalcular pela identidade
 * canônica atual (food_source/food_ref_id) — nunca confia num
 * nutrition_snapshot antigo como autoridade.
 */
export function ReuseLibraryDrawer({
  clientId,
  currentPlanId,
  onInsertMeal,
  onClose,
}: {
  clientId: string;
  currentPlanId?: string | null;
  onInsertMeal: (meal: MealPlanMealPayload) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ReuseTab>("recent");
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const [recent, setRecent] = useState<FoodRefItem[] | null>(null);
  const [favorites, setFavorites] = useState<FoodRefItem[] | null>(null);
  const [favoriteSearchQuery, setFavoriteSearchQuery] = useState("");
  const [favoriteSearchResults, setFavoriteSearchResults] = useState<FoodRefItem[]>([]);
  const [savedMeals, setSavedMeals] = useState<SavedMealItem[] | null>(null);
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [templateMeals, setTemplateMeals] = useState<Record<string, MealPlanMealPayload[]>>({});
  const [loadingTab, setLoadingTab] = useState(false);
  const [tabError, setTabError] = useState(false);

  useEffect(() => {
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
  }, []);

  // R6.5.3 — Escape/Tab-trap extraído pro hook compartilhado `useDialogKeyboard`.
  useDialogKeyboard(containerRef, onClose, true);

  async function loadTab(target: ReuseTab) {
    setLoadingTab(true);
    setTabError(false);
    try {
      if (target === "recent" && recent === null) {
        const response = await fetch("/api/admin/foods/recent", { cache: "no-store" });
        if (!response.ok) throw new Error("failed");
        const data = await response.json() as { items: FoodRefItem[] };
        setRecent(data.items);
      } else if (target === "favorites" && favorites === null) {
        const response = await fetch("/api/admin/foods/favorites", { cache: "no-store" });
        if (!response.ok) throw new Error("failed");
        const data = await response.json() as { items: FoodRefItem[] };
        setFavorites(data.items);
      } else if (target === "saved" && savedMeals === null) {
        const response = await fetch("/api/admin/saved-meals", { cache: "no-store" });
        if (!response.ok) throw new Error("failed");
        const data = await response.json() as { items: SavedMealItem[] };
        setSavedMeals(data.items);
      } else if (target === "plans" && plans === null) {
        const response = await fetch(`/api/admin/clients/${clientId}/meal-plans`, { cache: "no-store" });
        if (!response.ok) throw new Error("failed");
        const data = await response.json() as PlanSummary[];
        setPlans(data.filter((item) => item.id !== currentPlanId));
      } else if (target === "templates" && templates === null) {
        const response = await fetch("/api/admin/protocol-templates?type=DIETA", { cache: "no-store" });
        if (!response.ok) throw new Error("failed");
        const data = await response.json() as { items: TemplateSummary[] };
        setTemplates(data.items);
      }
    } catch {
      setTabError(true);
    } finally {
      setLoadingTab(false);
    }
  }

  useEffect(() => {
    void loadTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== "favorites" || favoriteSearchQuery.trim().length < 2) {
      setFavoriteSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/foods/search?q=${encodeURIComponent(favoriteSearchQuery.trim())}&limit=8`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json() as { items?: Array<{ ref?: { source: string; sourceId: string }; displayName?: string; name?: string; descricao?: string; sourceLabel?: string }> };
        setFavoriteSearchResults((data.items ?? [])
          .filter((item): item is typeof item & { ref: { source: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA"; sourceId: string } } => Boolean(item.ref) && ["TACO", "CUSTOM", "MANUFACTURER", "USDA"].includes(item.ref!.source))
          .map((item) => ({ ref: item.ref, name: item.displayName ?? item.name ?? item.descricao ?? "Alimento", sourceLabel: item.sourceLabel ?? null })));
      } catch (cause) {
        if (!(cause instanceof Error && cause.name === "AbortError")) setFavoriteSearchResults([]);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [tab, favoriteSearchQuery]);

  async function toggleFavorite(item: FoodRefItem, isFavorited: boolean) {
    if (isFavorited) {
      await fetch(`/api/admin/foods/favorites?source=${item.ref.source}&refId=${encodeURIComponent(item.ref.sourceId)}`, { method: "DELETE" });
      setFavorites((current) => (current ?? []).filter((fav) => !(fav.ref.source === item.ref.source && fav.ref.sourceId === item.ref.sourceId)));
    } else {
      await fetch("/api/admin/foods/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: item.ref.source, refId: item.ref.sourceId }) });
      setFavorites((current) => [{ ...item }, ...(current ?? [])]);
    }
  }

  /** Nunca confia num snapshot antigo ao reutilizar — sempre limpa, forçando a Nutrition Engine a recalcular pela identidade canônica atual (princípio central da R4). */
  function stripSnapshot(item: MealPlanItemPayload): MealPlanItemPayload {
    return { ...item, food_name_snapshot: null, nutrition_snapshot: null, resolved_grams_snapshot: null, quantity_resolution_snapshot: null, quantity_locked: false, substitutions_locked: false };
  }
  function stripMealSnapshots(meal: MealPlanMealPayload): MealPlanMealPayload {
    return {
      ...meal,
      items: meal.items.map(stripSnapshot),
      options: (meal.options ?? []).map((option) => ({ ...option, items: option.items.map(stripSnapshot) })),
      choice_groups: (meal.choice_groups ?? []).map((group) => ({ ...group, items: group.items.map(stripSnapshot) })),
    };
  }

  function insertFoodAsMeal(item: FoodRefItem) {
    onInsertMeal({
      name: item.name,
      items: [{ food: item.name, quantity: "100", unit: "g", food_source: item.ref.source, food_ref_id: item.ref.sourceId }],
    });
    onClose();
  }

  async function insertSavedMeal(saved: SavedMealItem) {
    onInsertMeal(stripMealSnapshots(saved.meal));
    void fetch(`/api/admin/saved-meals/${saved.id}`, { method: "POST" });
    onClose();
  }

  function insertCopiedMeal(meal: MealPlanMealPayload) {
    onInsertMeal(stripMealSnapshots(meal));
    onClose();
  }

  async function applyTemplateMeals(templateId: string) {
    let meals = templateMeals[templateId];
    if (!meals) {
      const response = await fetch(`/api/admin/protocol-templates/${templateId}/meals`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { meals: MealPlanMealPayload[] };
      meals = data.meals;
      setTemplateMeals((current) => ({ ...current, [templateId]: meals! }));
    }
    for (const meal of meals) onInsertMeal(stripMealSnapshots(meal));
    onClose();
  }

  const favoriteKeySet = useMemo(() => new Set((favorites ?? []).map((item) => `${item.ref.source}:${item.ref.sourceId}`)), [favorites]);
  const searchLower = search.trim().toLowerCase();
  const filteredRecent = (recent ?? []).filter((item) => !searchLower || item.name.toLowerCase().includes(searchLower));
  const filteredFavorites = (favorites ?? []).filter((item) => !searchLower || item.name.toLowerCase().includes(searchLower));
  const filteredSaved = (savedMeals ?? []).filter((item) => !searchLower || item.name.toLowerCase().includes(searchLower));
  const filteredTemplates = (templates ?? []).filter((item) => !searchLower || item.title.toLowerCase().includes(searchLower));
  const selectedPlan = (plans ?? []).find((item) => item.id === selectedPlanId) ?? null;
  const filteredPlans = (plans ?? []).filter((item) => !searchLower || item.title.toLowerCase().includes(searchLower));

  const TABS: Array<{ id: ReuseTab; label: string }> = [
    { id: "recent", label: "Recentes" },
    { id: "favorites", label: "Favoritos" },
    { id: "saved", label: "Minhas refeições" },
    { id: "plans", label: "Planos anteriores" },
    { id: "templates", label: "Modelos de planos" },
  ];

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Biblioteca de reuso" className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/30 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
      <section
        ref={containerRef}
        className="flex h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[#EAD8C2] bg-[#FFFDFC] shadow-[0_-16px_60px_rgba(58,48,40,0.28)] sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-3xl sm:rounded-[1.25rem] sm:shadow-[0_28px_90px_rgba(58,48,40,0.24)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EDE1D6] px-5 py-4">
          <div>
            <p className="brand-kicker">Reutilizar</p>
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Biblioteca de reuso</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" aria-label="Fechar biblioteca de reuso" title="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 border-b border-[#EDE1D6] p-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-[#75675E]" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="brand-input"
              placeholder="Buscar alimento, refeição ou modelo..."
              aria-label="Buscar na biblioteca de reuso"
            />
          </div>
          <div role="tablist" aria-label="Seções da biblioteca" className="mt-3 flex flex-wrap gap-1.5">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={`min-h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${tab === entry.id ? "border-[#607A56] bg-[#607A56] text-white" : "border-[#EAD8C2] bg-white text-[#75675E] hover:bg-[#FAF7F2]"}`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {loadingTab && (
            <p className="flex items-center gap-2 text-sm text-[#75675E]"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</p>
          )}
          {!loadingTab && tabError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700">Não foi possível carregar esta seção agora.</p>
              <button type="button" onClick={() => void loadTab(tab)} className="mt-2 text-xs font-semibold text-[#607A56] hover:underline">Tentar novamente</button>
            </div>
          )}

          {!loadingTab && !tabError && tab === "recent" && (
            filteredRecent.length ? (
              <ul className="space-y-1.5">
                {filteredRecent.map((item) => (
                  <li key={`${item.ref.source}:${item.ref.sourceId}`} className="flex items-center gap-2 rounded-lg border border-[#EDE1D6] bg-white px-3 py-2">
                    <button type="button" onClick={() => insertFoodAsMeal(item)} className="flex-1 min-w-0 text-left">
                      <span className="block truncate text-sm font-semibold text-[#3A3028]">{item.name}</span>
                      <span className="block text-[10px] uppercase tracking-[0.08em] text-[#8C6E52]">{item.sourceLabel ?? "Catálogo"}</span>
                    </button>
                    <button type="button" onClick={() => void toggleFavorite(item, favoriteKeySet.has(`${item.ref.source}:${item.ref.sourceId}`))} className="shrink-0 rounded-lg p-2 text-[#8C6E52] hover:bg-[#FAF7F2]" aria-label={favoriteKeySet.has(`${item.ref.source}:${item.ref.sourceId}`) ? `Remover ${item.name} dos favoritos` : `Favoritar ${item.name}`}>
                      <Star className={`h-4 w-4 ${favoriteKeySet.has(`${item.ref.source}:${item.ref.sourceId}`) ? "fill-[#D9A441] text-[#D9A441]" : ""}`} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-[#75675E]">Você ainda não usou alimentos recentemente.</p>
          )}

          {!loadingTab && !tabError && tab === "favorites" && (
            <div className="space-y-4">
              <div>
                <label className="brand-label" htmlFor="reuse-favorite-search">Favoritar um alimento</label>
                <input id="reuse-favorite-search" value={favoriteSearchQuery} onChange={(event) => setFavoriteSearchQuery(event.target.value)} className="brand-input mt-1" placeholder="Buscar no catálogo..." />
                {favoriteSearchResults.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-[#EAD8C2] bg-white p-1">
                    {favoriteSearchResults.map((item) => (
                      <button key={`${item.ref.source}:${item.ref.sourceId}`} type="button" onClick={() => void toggleFavorite(item, false)} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#FAF7F2]">
                        {item.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {filteredFavorites.length ? (
                <ul className="space-y-1.5">
                  {filteredFavorites.map((item) => (
                    <li key={`${item.ref.source}:${item.ref.sourceId}`} className="flex items-center gap-2 rounded-lg border border-[#EDE1D6] bg-white px-3 py-2">
                      <button type="button" onClick={() => insertFoodAsMeal(item)} className="flex-1 min-w-0 text-left">
                        <span className="block truncate text-sm font-semibold text-[#3A3028]">{item.name}</span>
                        <span className="block text-[10px] uppercase tracking-[0.08em] text-[#8C6E52]">{item.sourceLabel ?? "Catálogo"}</span>
                      </button>
                      <button type="button" onClick={() => void toggleFavorite(item, true)} className="shrink-0 rounded-lg p-2 text-[#D9A441] hover:bg-[#FAF7F2]" aria-label={`Remover ${item.name} dos favoritos`}>
                        <Star className="h-4 w-4 fill-[#D9A441] text-[#D9A441]" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-[#75675E]">Nenhum alimento favoritado ainda.</p>}
            </div>
          )}

          {!loadingTab && !tabError && tab === "saved" && (
            filteredSaved.length ? (
              <ul className="space-y-1.5">
                {filteredSaved.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => void insertSavedMeal(item)} className="block w-full rounded-lg border border-[#EDE1D6] bg-white px-3 py-2 text-left hover:bg-[#FAF7F2]">
                      <span className="block text-sm font-semibold text-[#3A3028]">{item.name}</span>
                      <span className="block text-[10px] uppercase tracking-[0.08em] text-[#8C6E52]">{item.meal.items.length} item(ns) · {item.meal_structure}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-[#75675E]">Nenhum modelo criado.</p>
          )}

          {!loadingTab && !tabError && tab === "plans" && (
            filteredPlans.length ? (
              <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
                <ul className="space-y-1.5">
                  {filteredPlans.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => setSelectedPlanId(item.id)} className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedPlanId === item.id ? "border-[#607A56] bg-[#EAF0E4]" : "border-[#EDE1D6] bg-white hover:bg-[#FAF7F2]"}`}>
                        <span className="block font-semibold text-[#3A3028]">{item.title}</span>
                        <span className="block text-[10px] uppercase tracking-[0.08em] text-[#8C6E52]">{item.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="space-y-1.5">
                  {selectedPlan ? (selectedPlan.meals.length ? selectedPlan.meals.map((meal, index) => (
                    <button key={index} type="button" onClick={() => insertCopiedMeal(meal)} className="block w-full rounded-lg border border-[#EDE1D6] bg-white px-3 py-2 text-left hover:bg-[#FAF7F2]">
                      <span className="block text-sm font-semibold text-[#3A3028]">{meal.name}</span>
                      <span className="block text-[10px] uppercase tracking-[0.08em] text-[#8C6E52]">{meal.items.length} item(ns)</span>
                    </button>
                  )) : <p className="text-sm text-[#75675E]">Este plano não tem refeições.</p>) : <p className="text-sm text-[#75675E]">Selecione um plano à esquerda.</p>}
                </div>
              </div>
            ) : <p className="text-sm text-[#75675E]">Nenhum outro plano deste paciente ainda.</p>
          )}

          {!loadingTab && !tabError && tab === "templates" && (
            filteredTemplates.length ? (
              <ul className="space-y-1.5">
                {filteredTemplates.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => void applyTemplateMeals(item.id)} className="block w-full rounded-lg border border-[#EDE1D6] bg-white px-3 py-2 text-left hover:bg-[#FAF7F2]">
                      <span className="block text-sm font-semibold text-[#3A3028]">{item.title}</span>
                      <span className="block text-[10px] uppercase tracking-[0.08em] text-[#8C6E52]">{item.target_group}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-[#75675E]">Nenhum modelo de plano cadastrado.</p>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
