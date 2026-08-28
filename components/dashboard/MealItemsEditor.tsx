"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Beef, Check, ChevronDown, ChevronUp, Copy, Flame, Lock, MoreHorizontal, PanelRightClose, Pencil, Plus, RefreshCw, Save, Sparkles, Star, Trash2, Unlock, Utensils, Wheat, X } from "lucide-react";
import { resolveFoodItemMacros, roundedMacros, sumMacros, type MacroFoodReferenceFallback, type MacroReferenceFood, type MacroTotals } from "@/lib/nutrition/macros";
import { scaleRecipeIngredientsToPortions, normalizeIngredientForRead, type RecipeIngredient } from "@/lib/nutrition/recipes";
import { resolveQuantity, type HouseholdMeasureOption } from "@/lib/nutrition/quantity-resolution";
import type { FoodSearchResultViewModel } from "@/lib/nutrition/food-search-view-model";
import { RECIPE_MEAL_GROUP_LABELS, RECIPE_MEAL_GROUPS, type RecipeMealGroup } from "@/lib/nutrition/recipe-constants";
import { AiInstructionsModal } from "@/components/dashboard/AiInstructionsModal";
import { ItemSubstitutionsPanel, type ItemSubstitution } from "@/components/dashboard/ItemSubstitutionsPanel";
import { ExchangeGroupPanel, type ExchangeAlternativeView, type ExchangeGroupView } from "@/components/dashboard/ExchangeGroupPanel";
import { ReuseLibraryDrawer } from "@/components/dashboard/ReuseLibraryDrawer";
import type { FoodReference } from "@/lib/nutrition/food-catalog";
import { classifyFoodExchangeGroup, FOOD_GROUP_LABELS, type FoodGroup } from "@/lib/nutrition/food-exchange-hierarchy";
import { CLINICAL_ROLE_LABELS, type TemplateClinicalRole } from "@/lib/meal-templates/system-template-contract";
import { useDialogKeyboard } from "@/hooks/use-dialog-keyboard";

export type MealItem = {
  id?: string;
  food: string;
  quantity?: string | null;
  unit?: string | null;
  notes?: string | null;
  is_optional?: boolean;
  ai_suggested?: boolean;
  taco_number?: number | string | null;
  // Vinculo estruturado a um alimento (TACO/personalizado) — FASE 2. So
  // preenchido quando o alimento vem de um resultado de busca escolhido;
  // digitacao livre mantem os dois como null (mesmo comportamento de hoje).
  // FASE 6.5 (item 5): TBCA/IBGE_POF aceitos — vem do piloto de busca
  // canonica; identidade transportada, calculo do plano ainda trata como
  // "nao reconhecido" (ver lib/nutrition/nutrients.ts, item 8).
  food_source?: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF" | "RECIPE" | null;
  food_ref_id?: string | null;
  // FASE 6.5 (item 3) — identidade canonica completa, so quando
  // food_source e TBCA/IBGE_POF (ou TACO vindo do piloto canonico).
  canonical_food_id?: string | null;
  // Vinculo a uma medida caseira especifica (food_portions.id) — FASE 3.
  household_measure_id?: string | null;
  resolved_grams_snapshot?: number | null;
  quantity_resolution_snapshot?: string | null;
  // Locks — reaproveitados pelo Optimizer V2 (nunca ajusta um item com
  // quantity_locked) e por geração automática/global de substituições
  // (nunca gera pra um item com substitutions_locked); adição MANUAL de
  // substituição continua disponível mesmo com o item bloqueado.
  quantity_locked?: boolean;
  substitutions_locked?: boolean;
  // FASE 8/8.5 — proveniência do slot de template que originou este item
  // (posição na refeição), separada do alimento escolhido pra ocupá-la.
  // NULL = item manual/IA/legado, nunca escrito pela nutricionista direto.
  slot_food_group?: string | null;
  slot_food_subgroup?: string | null;
  slot_nutritional_role?: string | null;
  template_slot_id?: string | null;
  slot_exchange_eligible?: boolean | null;
};

type MealMeasure = {
  id: string;
  food_source: string;
  food_ref_id: string;
  description: string;
  gram_equivalent: number;
  source: string | null;
  confidence: "high" | "medium" | "low";
};

function toMeasureOption(portion: MealMeasure): HouseholdMeasureOption {
  return { id: portion.id, description: portion.description, gramEquivalent: portion.gram_equivalent, source: portion.source, confidence: portion.confidence };
}

export type Meal = {
  name: string;
  meal_context?: string | null;
  suggested_time?: string | null;
  notes?: string | null;
  source_recipe_id?: string | null;
  meal_structure?: "SIMPLE" | "OPTIONS" | "COMBINATION" | null;
  patient_instruction?: string | null;
  items: MealItem[];
  options?: Array<{ id?: string; label: string; description?: string | null; items: MealItem[] }>;
  choice_groups?: Array<{ id?: string; title: string; description?: string | null; min_selections: number; max_selections: number; items: MealItem[] }>;
};

type FoodSuggestion = MacroReferenceFood & {
  numero: number | string;
  grupo: string;
  ref?: FoodReference;
  sourceLabel?: string;
  // FASE 6 (item 7) — versão segura pra exibição ("Arroz integral cozido"),
  // separada do nome técnico (descricao, "Arroz, integral, cozido"). Nunca
  // usada pra resolver identidade — so a apresentação muda.
  displayName?: string;
};

/** R6 — item mínimo da biblioteca de receitas usado só pra escolher qual inserir; nunca acessa ingredientes/macros aqui (o motor recalcula via food_source RECIPE + food_ref_id no save). */
type RecipeLibraryEntry = { id: string; title: string; meal_group: string; servings: number; per_portion_kcal: number };

const RECORDABLE_FOOD_USAGE_SOURCES = new Set(["TACO", "CUSTOM", "MANUFACTURER", "USDA"]);

/**
 * R4 (seções 6-7) — registra o alimento como "recentemente usado" pelo
 * profissional autenticado quando ele é EFETIVAMENTE selecionado (nunca a
 * cada tecla digitada). Fire-and-forget: nunca bloqueia nem falha a
 * seleção do alimento em si se a chamada falhar.
 */
/**
 * R6.5.2B (seções 22-24) — só mostra o rótulo "Itens fixos" quando a refeição
 * é COMBINATION e tem de fato grupo(s) de escolha E itens base — evita um
 * rótulo órfão numa COMBINATION sem itens fixos ou numa refeição SIMPLE/OPTIONS.
 */
export function shouldShowFixedItemsLabel(meal: { meal_structure?: string | null; choice_groups?: { items: unknown[] }[] | null; items: unknown[] }): boolean {
  return meal.meal_structure === "COMBINATION" && (meal.choice_groups?.length ?? 0) > 0 && meal.items.length > 0;
}

function recordFoodUsageForReuse(source: string, refId: string | null | undefined) {
  if (!refId || !RECORDABLE_FOOD_USAGE_SOURCES.has(source)) return;
  void fetch("/api/admin/foods/recent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, refId }),
  }).catch(() => {});
}

function toMealPlanFoodSource(suggestion: FoodSuggestion): "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF" {
  // FASE 6.5 (item 5) — TBCA/IBGE_POF vem so do piloto canonico (nunca de
  // `fonte`, que e vocabulario legado) — sempre via ref.source explicito.
  if (suggestion.ref?.source === "CUSTOM" || suggestion.ref?.source === "MANUFACTURER" || suggestion.ref?.source === "USDA" || suggestion.ref?.source === "TBCA" || suggestion.ref?.source === "IBGE_POF") return suggestion.ref.source;
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
  // R6 — shape novo (qualquer food_source real) com os campos legados
  // ainda aceitos (receitas criadas antes desta fase); normalizeIngredientForRead
  // trata os dois casos uniformemente, nunca assume taco_number obrigatório.
  ingredients: RecipeIngredient[];
  source_note: string | null;
  per_portion_kcal: number;
  servings: number;
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
  meal_structure: "SIMPLE",
  patient_instruction: "",
  items: [{ food: "", quantity: "", unit: "", notes: "" }],
});

export function mealPlanItemDisplayQuantity(item: Pick<MealItem, "quantity" | "unit" | "household_measure_id">): string {
  const quantity = String(item.quantity ?? "").trim();
  const unit = String(item.unit ?? "").trim();
  if (quantity && unit) return `${quantity} ${unit}`;
  if (quantity && item.household_measure_id) return `${quantity} medida`;
  if (quantity) return quantity;
  return "Porcao a definir";
}

function snapshotForMeasure(quantity: string | null | undefined, measure: MealMeasure | null): Pick<MealItem, "resolved_grams_snapshot" | "quantity_resolution_snapshot"> {
  if (!measure) return { resolved_grams_snapshot: null, quantity_resolution_snapshot: null };
  const resolution = resolveQuantity({ quantity, householdMeasure: toMeasureOption(measure) });
  if (!resolution.grams) return { resolved_grams_snapshot: null, quantity_resolution_snapshot: null };
  return {
    resolved_grams_snapshot: resolution.grams,
    quantity_resolution_snapshot: JSON.stringify({ grams: resolution.grams, method: resolution.method, confidence: resolution.confidence, source: resolution.source ?? null, measureId: resolution.measureId ?? null, warning: resolution.warning ?? null }),
  };
}

export function mealPlanItemAlternativeSummary(approvedCount: number, pendingCount: number): string {
  if (approvedCount > 0) return `${approvedCount} alternativa${approvedCount === 1 ? "" : "s"}`;
  if (pendingCount > 0) return `${pendingCount} para revisar`;
  return "Gerar alternativas";
}

export function mealPlanExchangeSummary(approvedCount: number, pendingCount: number, stale = false): string {
  if (stale) return "Atualizar trocas";
  if (approvedCount > 0) return `${approvedCount} troca${approvedCount === 1 ? "" : "s"}`;
  if (pendingCount > 0) return `${pendingCount} sugest${pendingCount === 1 ? "ão" : "ões"}`;
  return "Sem trocas";
}

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
 * Duplica uma refeicao inteira (itens + opções + grupos de escolha) logo
 * apos a original — nunca compartilha array/objeto por referência com o
 * original (R4, seção 12/50): cada item, opção e grupo de escolha ganha
 * seu próprio objeto novo em memória. O backend sempre gera um id novo por
 * linha no save (meal-plans.ts), entao nao ha risco de colisao mesmo sem
 * remover nenhum campo aqui.
 */
export function duplicateMealAt(meals: Meal[], index: number): Meal[] {
  const source = meals[index];
  if (!source) return meals;
  const copy: Meal = {
    ...source,
    name: `${source.name} (cópia)`,
    items: source.items.map((item) => ({ ...item })),
    options: source.options?.map((option) => ({ ...option, items: option.items.map((item) => ({ ...item })) })),
    choice_groups: source.choice_groups?.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item })) })),
  };
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

/** Duplicates an entire OPTIONS branch without sharing item references. */
export function duplicateMealOptionAt(options: NonNullable<Meal["options"]>, index: number): NonNullable<Meal["options"]> {
  const source = options[index];
  if (!source) return options;
  const next = [...options];
  next.splice(index + 1, 0, { ...source, label: `${source.label || `Opção ${index + 1}`} (cópia)`, items: source.items.map((item) => ({ ...item })) });
  return next;
}

/**
 * R4 (seções 17-19) — reaproveita a ESTRUTURA de uma refeição (identidade
 * canônica, quantidade, tipo) ao clonar um plano inteiro como novo
 * rascunho, mas NUNCA a nutrição congelada: limpa todo campo de snapshot,
 * forçando a Nutrition Engine a recalcular pela identidade canônica atual
 * (food_source/food_ref_id) no momento da clonagem — nunca confia num
 * nutrition_snapshot antigo, mesmo que o plano de origem seja recente.
 * Também nunca compartilha array/objeto por referência com o plano original
 * (mesma garantia de duplicateMealAt).
 */
export function sanitizeMealForPlanClone(meal: Meal): Meal {
  // Reconstrói cada item a partir de uma lista explícita de campos (nunca
  // um spread do original) — o objeto vindo da API pode carregar
  // `food_name_snapshot`/`nutrition_snapshot` em runtime (campos do
  // servidor, fora do tipo `MealItem` local); reconstruir explicitamente
  // garante que eles nunca sobrevivem à clonagem, mesmo antes do primeiro
  // save (quando o preview de nutrição no navegador ainda lê o estado
  // local direto).
  const stripItem = (item: MealItem): MealItem => ({
    food: item.food,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    notes: item.notes ?? null,
    is_optional: item.is_optional ?? false,
    food_source: item.food_source ?? null,
    food_ref_id: item.food_ref_id ?? null,
    canonical_food_id: item.canonical_food_id ?? null,
    household_measure_id: item.household_measure_id ?? null,
    resolved_grams_snapshot: null,
    quantity_resolution_snapshot: null,
    quantity_locked: false,
    substitutions_locked: false,
  });
  return {
    ...meal,
    items: meal.items.map(stripItem),
    options: meal.options?.map((option) => ({ ...option, items: option.items.map(stripItem) })),
    choice_groups: meal.choice_groups?.map((group) => ({ ...group, items: group.items.map(stripItem) })),
  };
}

export function cleanMealsForSave(meals: Meal[]): Meal[] {
  const cleanItem = (item: MealItem) => ({
    food: item.food,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    notes: item.notes ?? null,
    is_optional: Boolean(item.is_optional),
    food_source: item.food_source ?? null,
    food_ref_id: item.food_ref_id ?? null,
    canonical_food_id: item.canonical_food_id ?? null,
    household_measure_id: item.household_measure_id ?? null,
    quantity_locked: item.quantity_locked ?? false,
    substitutions_locked: item.substitutions_locked ?? false,
    slot_food_group: item.slot_food_group ?? null,
    slot_food_subgroup: item.slot_food_subgroup ?? null,
    slot_nutritional_role: item.slot_nutritional_role ?? null,
    template_slot_id: item.template_slot_id ?? null,
    slot_exchange_eligible: item.slot_exchange_eligible ?? null,
  });
  return meals
    .map((meal) => ({
      name: meal.name,
      meal_context: meal.meal_context ?? null,
      suggested_time: meal.suggested_time ?? null,
      notes: meal.notes ?? null,
      source_recipe_id: meal.source_recipe_id ?? null,
      meal_structure: meal.meal_structure ?? "SIMPLE",
      patient_instruction: meal.patient_instruction ?? null,
      items: meal.items
        .filter((item) => item.food.trim())
        .map(cleanItem),
      options: (meal.options ?? []).map((option) => ({
        label: option.label, description: option.description ?? null,
        items: option.items.filter((item) => item.food.trim()).map(cleanItem),
      })),
      choice_groups: (meal.choice_groups ?? []).map((group) => ({
        title: group.title, description: group.description ?? null, min_selections: group.min_selections, max_selections: group.max_selections,
        items: group.items.filter((item) => item.food.trim()).map(cleanItem),
      })),
    }))
    .filter((meal) => meal.name.trim() && (meal.items.length > 0 || meal.options.some((option) => option.items.length > 0) || meal.choice_groups.some((group) => group.items.length > 0)));
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
  clientId,
  substitutions,
  onSubstitutionsChange,
  mealPlanId,
  readOnly = false,
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
  readOnly?: boolean;
  /** Substituições nutricionais equivalentes (evolução de plan.substitutions) — só disponível no contexto de um cliente real (não em templates/receitas, que não têm substituições por item). */
  clientId?: string;
  substitutions?: ItemSubstitution[];
  onSubstitutionsChange?: (substitutions: ItemSubstitution[]) => void;
  /** FASE 7 — grupos de troca só existem pra um plano já salvo (precisam de um id estável pra vincular por identidade). Ausente em templates/receitas/planos ainda não salvos. */
  mealPlanId?: string;
}) {
  const [openSubstitutionsKey, setOpenSubstitutionsKey] = useState("");
  const [openExchangeKey, setOpenExchangeKey] = useState("");
  const [editingItemKey, setEditingItemKey] = useState("");
  // R6 (seções 33-35) — picker de receita: adiciona um item RECIPE (nunca achatado em alimentos), quantidade em porções por padrão.
  const [recipePickerMealIndex, setRecipePickerMealIndex] = useState<number | null>(null);
  const [recipePickerQuery, setRecipePickerQuery] = useState("");
  const [recipePickerResults, setRecipePickerResults] = useState<RecipeLibraryEntry[]>([]);
  const [exchangeDrawerKey, setExchangeDrawerKey] = useState("");
  // R2.2 (seção 42) — devolve o foco ao botão que abriu o drawer ao fechar,
  // em vez de deixá-lo perdido no <body>.
  const exchangeDrawerTriggerRef = useRef<HTMLElement | null>(null);
  const exchangeDrawerRef = useRef<HTMLElement | null>(null);
  function openExchangeDrawer(key: string, trigger: HTMLElement) {
    exchangeDrawerTriggerRef.current = trigger;
    setExchangeDrawerKey(key);
  }
  function closeExchangeDrawer() {
    setExchangeDrawerKey("");
    exchangeDrawerTriggerRef.current?.focus();
    exchangeDrawerTriggerRef.current = null;
  }
  // FASE 8.5 (item 14) — aviso de incompatibilidade slot x alimento
  // escolhido, dispensável por item ("Manter mesmo assim"). Nunca bloqueia
  // a escolha da nutricionista, só avisa.
  const [dismissedSlotWarnings, setDismissedSlotWarnings] = useState<Record<string, boolean>>({});
  const [exchangeGroups, setExchangeGroups] = useState<Array<{ group: ExchangeGroupView & { primary_food_source: string; primary_food_ref_id: string }; alternatives: ExchangeAlternativeView[] }>>([]);

  const loadExchangeGroups = useCallback(async () => {
    if (!clientId || !mealPlanId) return;
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/exchange-groups?mealPlanId=${encodeURIComponent(mealPlanId)}`);
      if (!response.ok) return;
      const data = await response.json();
      setExchangeGroups(
        (data.groups ?? []).map((entry: { group: ExchangeGroupView & { primary_food_source: string; primary_food_ref_id: string }; alternatives: ExchangeAlternativeView[] }) => ({
          group: entry.group,
          alternatives: entry.alternatives,
        }))
      );
    } catch {
      // falha silenciosa — o painel simplesmente mostra "nenhum grupo gerado ainda"
    }
  }, [clientId, mealPlanId]);

  useEffect(() => {
    loadExchangeGroups();
  }, [loadExchangeGroups]);

  // R6.5.3 — Escape/Tab-trap extraído pro hook compartilhado `useDialogKeyboard`
  // (mesma lógica que já existia aqui, agora reaproveitada por outros diálogos).
  useDialogKeyboard(exchangeDrawerRef, closeExchangeDrawer, Boolean(exchangeDrawerKey));

  const [activeFoodField, setActiveFoodField] = useState("");
  const [foodSearch, setFoodSearch] = useState<{ key: string; query: string }>({ key: "", query: "" });
  const [foodSuggestions, setFoodSuggestions] = useState<Record<string, FoodSuggestion[]>>({});
  const [multiSourceResults, setMultiSourceResults] = useState<Record<string, FoodSearchResultViewModel[]>>({});
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [searchLoadingKey, setSearchLoadingKey] = useState("");
  const [recipeSelectorOpen, setRecipeSelectorOpen] = useState(false);
  const recipeSelectorRef = useRef<HTMLElement | null>(null);
  // R6.5.3 — este modal também não tinha Escape/Tab-trap antes desta fase.
  useDialogKeyboard(recipeSelectorRef, () => setRecipeSelectorOpen(false), recipeSelectorOpen);
  // R4 — biblioteca de reuso (recentes/favoritos/refeições salvas/planos
  // anteriores/modelos de plano), reaproveitando o mesmo padrão de
  // "inserir receita" já existente: insere no estado LOCAL, nunca auto-save.
  const [reuseLibraryOpen, setReuseLibraryOpen] = useState(false);
  const reuseLibraryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [savedMealDraft, setSavedMealDraft] = useState<{ mealIndex: number; name: string; saving: boolean; error: string } | null>(null);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeMealGroup, setRecipeMealGroup] = useState("");
  const [recipes, setRecipes] = useState<RecipeLibraryItem[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft | null>(null);
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [aiLoadingMeal, setAiLoadingMeal] = useState<number | null>(null);
  const [aiModalMealIndex, setAiModalMealIndex] = useState<number | null>(null);
  const [bulkGeneratingAlternatives, setBulkGeneratingAlternatives] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [measuresByFood, setMeasuresByFood] = useState<Record<string, MealMeasure[]>>({});
  const [openMealMenu, setOpenMealMenu] = useState<number | null>(null);
  const [openItemMenu, setOpenItemMenu] = useState("");
  const mealMenuTriggerRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  /** R6.5.2C (seção 7) — Escape fecha o menu "⋯" da refeição e devolve o foco pro botão que abriu. */
  useEffect(() => {
    if (openMealMenu === null) return;
    const triggerIndex = openMealMenu;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMealMenu(null);
        mealMenuTriggerRefs.current[triggerIndex]?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openMealMenu]);

  useEffect(() => {
    if (!recipeSelectorOpen && !recipeDraft && !exchangeDrawerKey) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [recipeSelectorOpen, recipeDraft, exchangeDrawerKey]);

  useEffect(() => {
    // N+1 (auditoria R2 final): um item que já tem identidade estruturada
    // (food_source+food_ref_id) não precisa de sugestões de busca — nunca
    // dispara 1 request por item num plano grande, só prime os itens ainda
    // em texto livre (sem vínculo), que é onde a sugestão realmente ajuda.
    const foodsToPrime = meals.flatMap((meal, mealIndex) =>
      meal.items.map((item, itemIndex) => ({ key: `${mealIndex}:${itemIndex}`, query: item.food.trim(), hasIdentity: Boolean(item.food_source && item.food_ref_id) }))
    ).filter(({ key, query, hasIdentity }) => !hasIdentity && query.length >= 2 && !foodSuggestions[key]?.length).slice(0, 24);
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
          .filter((item) => item.food_ref_id && (item.food_source === "TACO" || item.food_source === "CUSTOM" || item.food_source === "MANUFACTURER" || item.food_source === "TBCA" || item.food_source === "IBGE_POF"))
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
        const data = response.ok ? await response.json() as { items?: MealMeasure[] } : { items: [] as MealMeasure[] };
        return [pair, data.items ?? []] as const;
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return null;
        return [pair, [] as MealMeasure[]] as const;
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
        .then((data: { items?: FoodSuggestion[]; multiSourceItems?: FoodSearchResultViewModel[] }) => {
          setFoodSuggestions((current) => ({ ...current, [foodSearch.key]: data.items ?? [] }));
          setMultiSourceResults((current) => ({ ...current, [foodSearch.key]: data.multiSourceItems ?? [] }));
          setHighlightedIndex(0);
        })
        .catch((cause) => {
          if (cause instanceof Error && cause.name === "AbortError") return;
          setFoodSuggestions((current) => ({ ...current, [foodSearch.key]: [] }));
          setMultiSourceResults((current) => ({ ...current, [foodSearch.key]: [] }));
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

  function measureOptionsFor(item: MealItem): MealMeasure[] {
    if (!item.food_ref_id || (item.food_source !== "TACO" && item.food_source !== "CUSTOM" && item.food_source !== "MANUFACTURER" && item.food_source !== "TBCA" && item.food_source !== "IBGE_POF")) return [];
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

  // Soma sempre em precisao total (nunca arredonda cedo demais): cada
  // refeicao acumula os macros brutos dos itens, e o total do plano soma os
  // brutos das refeicoes — arredondamento so acontece na apresentacao
  // (mealMacros/planMacros abaixo), nunca antes de somar o proximo nivel.
  // Antes disso o total do dia era a soma de N refeicoes ja arredondadas
  // individualmente, o que podia divergir da soma real em ate ~0.5 kcal por
  // refeicao (auditoria do motor nutricional, item 23 do pedido).
  const rawMealMacros = useMemo(() => meals.map((meal, mealIndex) => sumMacros(
    meal.items.map((_, itemIndex) => itemResolutions[`${mealIndex}:${itemIndex}`]?.macros).filter((value): value is MacroTotals => Boolean(value))
  )), [meals, itemResolutions]);

  const mealMacros = useMemo(() => rawMealMacros.map((raw) => roundedMacros(raw)), [rawMealMacros]);

  const planMacros = useMemo(() => roundedMacros(sumMacros(rawMealMacros)), [rawMealMacros]);

  const exchangeDrawerContext = useMemo(() => {
    if (!exchangeDrawerKey) return null;
    const [mealIndexText, itemIndexText] = exchangeDrawerKey.split(":");
    const mealIndex = Number(mealIndexText);
    const itemIndex = Number(itemIndexText);
    const meal = meals[mealIndex];
    const item = meal?.items[itemIndex];
    if (!meal || !item) return null;
    const grams = itemResolutions[exchangeDrawerKey]?.quantity.grams;
    const itemSubstitutions = (substitutions ?? []).filter((sub) =>
      item.food_ref_id && item.food_source
        ? sub.base_food_source === item.food_source && sub.base_food_ref_id === item.food_ref_id
        : sub.base_food === item.food
    );
    const exchangeEntry = [...exchangeGroups].reverse().find(
      (entry) => entry.group.primary_food_source === item.food_source && entry.group.primary_food_ref_id === item.food_ref_id
    );
    return { mealIndex, itemIndex, meal, item, grams, itemSubstitutions, exchangeEntry };
  }, [exchangeDrawerKey, exchangeGroups, itemResolutions, meals, substitutions]);

  // R2.2 (seção 42) — foco inicial dentro do drawer ao abrir (fechar botão),
  // nunca deixado no elemento que estava embaixo do backdrop.
  useEffect(() => {
    if (!exchangeDrawerContext) return;
    const frame = window.requestAnimationFrame(() => {
      exchangeDrawerRef.current?.querySelector<HTMLElement>("button")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [exchangeDrawerContext]);

  function updateMeal(index: number, patch: Partial<Meal>) {
    onChange(meals.map((meal, mealIndex) => mealIndex === index ? { ...meal, ...patch } : meal));
  }

  function updateMealItem(mealIndex: number, itemIndex: number, patch: Partial<MealItem>) {
    onChange(meals.map((meal, currentMealIndex) => currentMealIndex === mealIndex
      ? { ...meal, items: meal.items.map((item, currentItemIndex) => currentItemIndex === itemIndex ? { ...item, ...patch } : item) }
      : meal));
  }

  function addMealForEditing() {
    const mealIndex = meals.length;
    onChange([...meals, emptyMeal()]);
    setEditingItemKey(`${mealIndex}:0`);
  }

  function addItemForEditing(mealIndex: number) {
    const meal = meals[mealIndex];
    if (!meal) return;
    const itemIndex = meal.items.length;
    updateMeal(mealIndex, { items: [...meal.items, { food: "", quantity: "", unit: "", notes: "" }] });
    setEditingItemKey(`${mealIndex}:${itemIndex}`);
  }

  /**
   * R6 (seções 33-36) — insere uma RECEITA como item, nunca achatado em
   * alimentos: food_source "RECIPE" + food_ref_id (id da receita).
   * Quantidade padrão "1 porção" — a nutricionista ajusta depois (porções
   * ou gramas, conforme o rendimento da receita). O motor de nutrição
   * (lib/nutrition/nutrients.ts) resolve a contribuição real ao salvar.
   */
  function addRecipeItem(mealIndex: number, recipe: RecipeLibraryEntry) {
    const meal = meals[mealIndex];
    if (!meal) return;
    updateMeal(mealIndex, {
      items: [...meal.items, {
        food: recipe.title,
        quantity: "1",
        unit: "porção",
        notes: null,
        food_source: "RECIPE",
        food_ref_id: recipe.id,
      }],
    });
    setRecipePickerMealIndex(null);
    setRecipePickerQuery("");
    setRecipePickerResults([]);
  }

  // R6 — busca na biblioteca de receitas (reaproveita GET /api/admin/recipes já existente, nunca uma busca paralela).
  useEffect(() => {
    if (recipePickerMealIndex === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (recipePickerQuery.trim()) params.set("q", recipePickerQuery.trim());
      fetch(`/api/admin/recipes?${params}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { items: [] })
        .then((data: { items?: RecipeLibraryEntry[] }) => setRecipePickerResults(data.items ?? []))
        .catch(() => setRecipePickerResults([]));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [recipePickerMealIndex, recipePickerQuery]);

  function focusFoodField(mealIndex: number, itemIndex: number) {
    const key = `${mealIndex}:${itemIndex}`;
    setActiveFoodField(key);
    setHighlightedIndex(0);
    setFoodSearch({ key, query: meals[mealIndex]?.items[itemIndex]?.food ?? "" });
    window.requestAnimationFrame(() => document.getElementById(`meal-food-${mealIndex}-${itemIndex}`)?.focus());
  }

  // FASE 8.5 (item 6/14) — classifica com o MESMO motor da Fase 7 (nunca
  // uma segunda logica), a partir só do NOME do alimento — funciona igual
  // pra uma sugestao recem-buscada (que tem grupo/macros reais) ou pra um
  // item ja carregado do banco (so tem o texto do nome), sem depender de
  // cache de busca que não sobrevive a um reload. "Compativel" = mesmo
  // foodGroup (nunca exige mesmo subgrupo — o slot so define a categoria
  // ampla esperada; o alimento exato e sempre escolha da nutricionista).
  function slotFoodGroupOf(food: Pick<FoodSuggestion, "descricao" | "grupo" | "proteina_g" | "carboidrato_g" | "lipidios_g">): FoodGroup {
    return classifyFoodExchangeGroup(food).foodGroup;
  }

  function isSuggestionCompatibleWithSlot(item: MealItem, suggestion: FoodSuggestion): boolean {
    if (!item.slot_food_group) return true;
    return slotFoodGroupOf(suggestion) === item.slot_food_group;
  }

  function isItemCompatibleWithSlot(item: MealItem): boolean {
    if (!item.slot_food_group || !item.food.trim()) return true;
    return slotFoodGroupOf({ descricao: item.food, grupo: "", proteina_g: 0, carboidrato_g: 0, lipidios_g: 0 }) === item.slot_food_group;
  }

  function selectSuggestion(mealIndex: number, itemIndex: number, suggestion: FoodSuggestion) {
    const key = `${mealIndex}:${itemIndex}`;
    updateMealItem(mealIndex, itemIndex, {
      food: suggestion.descricao,
      taco_number: suggestion.numero,
      food_source: toMealPlanFoodSource(suggestion),
      food_ref_id: suggestion.ref?.sourceId ?? String(suggestion.numero),
      // FASE 6.5 (item 3) — identidade canonica completa, so presente
      // quando a sugestao veio do piloto canonico (TBCA/IBGE_POF/TACO via
      // canonicalPilot); null pra qualquer sugestao do catalogo legado comum.
      canonical_food_id: suggestion.ref?.canonicalId ?? null,
      // Alimento trocado: a medida caseira anterior (se havia) era de outro alimento e nao se aplica mais.
      household_measure_id: null,
      resolved_grams_snapshot: null,
      quantity_resolution_snapshot: null,
    });
    setFoodSuggestions((current) => ({ ...current, [key]: [suggestion] }));
    setActiveFoodField("");
    recordFoodUsageForReuse(toMealPlanFoodSource(suggestion), suggestion.ref?.sourceId ?? String(suggestion.numero));
  }

  function selectMultiSourceResult(mealIndex: number, itemIndex: number, result: FoodSearchResultViewModel) {
    const key = `${mealIndex}:${itemIndex}`;
    const portion = result.defaultPortion;
    const source = result.sourceCode === "COMPLEMENTARY" ? "TACO" : result.sourceCode;
    recordFoodUsageForReuse(source, result.sourceFoodId);
    const quantity = meals[mealIndex]?.items[itemIndex]?.quantity?.trim() || "1";
    const measure: MealMeasure | null = portion.id && portion.gramWeight ? { id: portion.id, food_source: source, food_ref_id: result.sourceFoodId, description: portion.label, gram_equivalent: portion.gramWeight, source: result.sourceName, confidence: "high" } : null;
    updateMealItem(mealIndex, itemIndex, {
      food: result.displayName,
      taco_number: result.sourceFoodId,
      food_source: source,
      food_ref_id: result.sourceFoodId,
      canonical_food_id: result.canonicalFoodId,
      household_measure_id: portion.isFallback ? null : portion.id,
      quantity,
      unit: portion.isFallback ? "g" : null,
      ...snapshotForMeasure(quantity, measure),
    });
    setActiveFoodField("");
  }

  function insertRecipe(recipe: RecipeLibraryItem) {
    const mealIndex = meals.length;
    // R6 — ingredientes normalizados pro shape canônico ANTES de escalar:
    // receitas novas usam food/quantity/unit/food_source (qualquer fonte
    // real), receitas legadas usam taco_number/food_name/grams — os dois
    // shapes precisam virar {food, grams, food_source, food_ref_id}
    // uniformemente antes do rateio por porção.
    const normalizedIngredients = recipe.ingredients
      .map(normalizeIngredientForRead)
      .map((ingredient) => ({ ...ingredient, grams: ingredient.unit === "g" && ingredient.quantity ? Number(ingredient.quantity) : null }));
    // Insere 1 PORCAO prescrita, nao o lote inteiro da receita: as gramas
    // dos ingredientes vem cadastradas para o RENDIMENTO TOTAL (ex.:
    // servings=4), entao copiar direto fazia o motor calcular e exibir o
    // total da receita inteira como se fosse a refeicao de uma pessoa (ex.:
    // 1510 kcal em vez dos 377,5 kcal de 1 porcao). Escala pelo mesmo
    // rendimento cadastrado na receita (lib/nutrition/recipes.ts) — nunca
    // inventa um numero, so aplica a proporcao real porcoes/rendimento.
    const scaledIngredients = scaleRecipeIngredientsToPortions(normalizedIngredients, recipe.servings, 1);
    const meal: Meal = {
      name: recipe.title,
      suggested_time: "",
      notes: [
        `Receita da biblioteca - 1 porcao (rendimento total: ${recipe.servings} porcao(oes)).`,
        recipe.source_note ? `Observacao: ${recipe.source_note}` : null,
      ].filter(Boolean).join(" "),
      source_recipe_id: recipe.id,
      // food_source/food_ref_id (nao so o taco_number legado) — o motor
      // central (resolveItemReference em lib/nutrition/nutrients.ts) SO
      // consulta food_source+food_ref_id para vinculo por identidade; sem
      // isso o item caia no fuzzy-match por texto do nome do ingrediente
      // (lookup.fuzzyMatch), que falha silenciosamente para nomes que nao
      // batem bem com a descricao TACO — causa raiz de refeicoes com
      // receita mostrando "— kcal" mesmo com ingrediente 100% identificado
      // no cadastro da receita. Ingrediente sem massa em gramas conhecida
      // (unidade não-g, ou receita com rendimento só em porções) fica de
      // fora aqui — nunca uma quantidade inventada.
      items: scaledIngredients
        .filter((ingredient) => ingredient.food_ref_id && ingredient.grams)
        .map((ingredient) => ({
          food: ingredient.food,
          quantity: String(ingredient.grams),
          unit: "g",
          notes: null,
          food_source: ingredient.food_source as MealItem["food_source"],
          food_ref_id: ingredient.food_ref_id,
        })),
    };
    onChange([...meals, meal]);
    void Promise.all(normalizedIngredients.map(async (ingredient, itemIndex) => {
      const response = await fetch(`/api/admin/foods/search?q=${encodeURIComponent(ingredient.food)}`, { cache: "no-store" });
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
    onMessage?.(`Receita "${recipe.title}" inserida (1 porção). Salve para registrar.`);
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

  async function generateAlternativesForAll() {
    if (!clientId || !mealPlanId) return;
    setBulkGeneratingAlternatives(true);
    onError?.("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/exchange-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealPlanId, generateAll: true, limit: 5 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Nao foi possivel gerar trocas.");
      await loadExchangeGroups();
      onMessage?.(`Trocas geradas para ${result.generated ?? 0} alimento(s). Revise e aprove as sugestões antes de ativar para o paciente.`);
    } catch (cause) {
      onError?.(cause instanceof Error ? cause.message : "Nao foi possivel gerar trocas.");
    } finally {
      setBulkGeneratingAlternatives(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-serif text-xl font-semibold text-[#3A3028]">Refeicoes</h3>
        {/* R6.5.2 (regressão encontrada no fechamento) — a coluna central ficou mais estreita
            com a navegação de refeições nova; sem flex-wrap, esses botões extrapolavam a
            coluna e ficavam por baixo da sidebar de nutrição (clique interceptado). */}
        <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
          {clientId && mealPlanId && !readOnly && (
            <button type="button" onClick={() => void generateAlternativesForAll()} disabled={bulkGeneratingAlternatives} className="brand-btn-secondary w-full sm:w-auto">
              <Sparkles className="h-4 w-4" />
              {bulkGeneratingAlternatives ? "Gerando..." : "Gerar trocas para todos"}
            </button>
          )}
          {!readOnly && (
            <>
              <button type="button" onClick={addMealForEditing} className="brand-btn-secondary w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                Adicionar refeição
              </button>
              <button type="button" onClick={() => setRecipeSelectorOpen(true)} className="brand-btn-secondary w-full sm:w-auto">
                <Utensils className="h-4 w-4" />
                Inserir receita
              </button>
              {clientId && (
                <button ref={reuseLibraryTriggerRef} type="button" onClick={() => setReuseLibraryOpen(true)} className="brand-btn-secondary w-full sm:w-auto">
                  <Save className="h-4 w-4" />
                  Usar modelo
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {meals.map((meal, mealIndex) => (
        <article key={mealIndex} id={`meal-card-${mealIndex}`} className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_8px_24px_rgba(58,48,40,0.035)] scroll-mt-24">
          <div className="relative flex flex-col gap-2 border-b border-[#EDE1D6] bg-[#FBF7F1] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF0E4] text-[#607A56]"><Utensils className="h-4 w-4" /></div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-semibold text-[#3A3028]">{meal.name || `Refeicao ${mealIndex + 1}`}</p>
                  {/* R6.5.2 (seção 16) — badge discreto de estrutura, puramente visual, não altera meal_structure/cálculo. */}
                  <span className="rounded-full border border-[#EAD8C2] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#8C6E52]">
                    {meal.meal_structure === "OPTIONS" ? "Opções" : meal.meal_structure === "COMBINATION" ? "Combinação" : "Simples"}
                  </span>
                </div>
                <p className="text-xs text-[#75675E]">{meal.items.filter((item) => item.food.trim()).length} alimento(s) - {mealMacros[mealIndex]?.kcal ?? 0} kcal estimadas</p>
              </div>
            </div>
            {!readOnly && <div className="flex shrink-0 flex-wrap items-center gap-1.5 self-end sm:self-auto">
              <button type="button" onClick={() => addItemForEditing(mealIndex)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#D9E4D3] bg-[#FFFDFC] px-3 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]">
                <Plus className="h-4 w-4" />
                Alimento
              </button>
              <div className="relative">
                <button type="button" onClick={() => setRecipePickerMealIndex(recipePickerMealIndex === mealIndex ? null : mealIndex)} title="Adiciona a receita como 1 item desta refeição (referência viva, não expande em alimentos) — diferente de &quot;Inserir receita&quot;, que cria uma refeição nova já expandida." className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#D9E4D3] bg-[#FFFDFC] px-3 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]">
                  <Plus className="h-4 w-4" />
                  Item de receita
                </button>
                {recipePickerMealIndex === mealIndex && (
                  <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-72 rounded-xl border border-[#EAD8C2] bg-white p-2 shadow-[0_18px_44px_rgba(58,48,40,0.16)]">
                    <input
                      autoFocus
                      value={recipePickerQuery}
                      onChange={(event) => setRecipePickerQuery(event.target.value)}
                      className="brand-input mb-1.5"
                      placeholder="Buscar receita..."
                    />
                    <div className="max-h-56 overflow-y-auto">
                      {recipePickerResults.length === 0 && <p className="px-2 py-1.5 text-xs text-[#8C6E52]">Nenhuma receita encontrada.</p>}
                      {recipePickerResults.map((recipe) => (
                        <button
                          key={recipe.id}
                          type="button"
                          onClick={() => addRecipeItem(mealIndex, recipe)}
                          className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#FAF7F2]"
                        >
                          <span className="block text-sm font-medium text-[#3A3028]">{recipe.title}</span>
                          <span className="text-[10px] uppercase tracking-[0.08em] text-[#8C6E52]">{recipe.servings} porção(ões) · ~{Math.round(recipe.per_portion_kcal)} kcal/porção</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* R6.5.2C (seções 3-6) — Mover/Duplicar movidos pra dentro do menu "⋯"; mesmos
                  aria-label/title/handlers de sempre, só a localização visual mudou. */}
              <button ref={(el) => { mealMenuTriggerRefs.current[mealIndex] = el; }} type="button" onClick={() => setOpenMealMenu((current) => current === mealIndex ? null : mealIndex)} aria-haspopup="menu" aria-expanded={openMealMenu === mealIndex} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] text-[#75675E] hover:bg-[#FBF7F1]" aria-label={`Ações da refeição ${meal.name || "refeicao"}`} title="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {openMealMenu === mealIndex && (
                <div role="menu" aria-label={`Ações da refeição ${meal.name || "refeicao"}`} className="absolute right-3 top-[calc(100%-4px)] z-20 w-56 rounded-xl border border-[#EAD8C2] bg-white p-1 shadow-[0_16px_40px_rgba(58,48,40,0.14)]">
                  <button type="button" onClick={() => { setOpenMealMenu(null); onChange(reorderArray(meals, mealIndex, -1)); }} disabled={mealIndex === 0} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4] disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Mover ${meal.name || "refeicao"} para cima`} title="Mover refeicao para cima">
                    <ChevronUp className="h-4 w-4" />
                    Mover para cima
                  </button>
                  <button type="button" onClick={() => { setOpenMealMenu(null); onChange(reorderArray(meals, mealIndex, 1)); }} disabled={mealIndex === meals.length - 1} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4] disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Mover ${meal.name || "refeicao"} para baixo`} title="Mover refeicao para baixo">
                    <ChevronDown className="h-4 w-4" />
                    Mover para baixo
                  </button>
                  <button type="button" onClick={() => { setOpenMealMenu(null); onChange(duplicateMealAt(meals, mealIndex)); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4]" aria-label={`Duplicar ${meal.name || "refeicao"}`} title="Duplicar refeicao">
                    <Copy className="h-4 w-4" />
                    Duplicar
                  </button>
                  <button type="button" onClick={() => { setOpenMealMenu(null); setAiModalMealIndex(mealIndex); }} disabled={!aiEnabled || aiLoadingMeal === mealIndex} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#8C5F50] hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-50">
                    <Sparkles className="h-4 w-4" />
                    {aiLoadingMeal === mealIndex ? "Sugerindo..." : "Sugerir com IA"}
                  </button>
                  <button type="button" onClick={() => { setOpenMealMenu(null); openSaveMealAsRecipe(mealIndex); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4]">
                    <Save className="h-4 w-4" />
                    Salvar como receita
                  </button>
                  {clientId && (
                    <button type="button" onClick={() => { setOpenMealMenu(null); setSavedMealDraft({ mealIndex, name: meal.name || "", saving: false, error: "" }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4]">
                      <Star className="h-4 w-4" />
                      Salvar como refeição favorita
                    </button>
                  )}
                  <div className="my-1 h-px bg-[#F0E2D6]" aria-hidden="true" />
                  <button type="button" onClick={() => { setOpenMealMenu(null); onChange(meals.filter((_, index) => index !== mealIndex)); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                    Excluir refeição
                  </button>
                </div>
              )}
            </div>}
          </div>
          {!readOnly && (
            <div className="border-b border-[#EDE1D6] bg-white px-3 py-3">
              <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
                <label className="text-xs font-semibold text-[#75675E]">Tipo da refeição
                  <select
                    value={meal.meal_structure ?? "SIMPLE"}
                    onChange={(event) => {
                      const meal_structure = event.target.value as "SIMPLE" | "OPTIONS" | "COMBINATION";
                      updateMeal(mealIndex, {
                        meal_structure,
                        options: meal_structure === "OPTIONS" && !(meal.options?.length) ? [{ label: "Opção 1", items: [{ food: "", quantity: "", unit: "", notes: "" }] }] : meal.options,
                        choice_groups: meal_structure === "COMBINATION" && !(meal.choice_groups?.length) ? [{ title: "Grupo 1", min_selections: 1, max_selections: 1, items: [{ food: "", quantity: "", unit: "", notes: "" }] }] : meal.choice_groups,
                      });
                    }}
                    className="brand-input mt-1"
                  >
                    <option value="SIMPLE">Simples</option>
                    <option value="OPTIONS">Opções</option>
                    <option value="COMBINATION">Monte sua refeição</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-[#75675E]">Instrução para a paciente
                  <input value={meal.patient_instruction ?? ""} onChange={(event) => updateMeal(mealIndex, { patient_instruction: event.target.value })} className="brand-input mt-1" placeholder="Ex.: Escolha uma opção." />
                </label>
              </div>
              {meal.meal_structure === "OPTIONS" && <div className="mt-3 space-y-2">
                {(meal.options ?? []).map((option, optionIndex) => <Fragment key={optionIndex}>
                {/* R6.5.2 (seção 30-31) — divisor "OU" leve entre alternativas; puramente visual, não altera options/aria-label. */}
                {optionIndex > 0 && (
                  <div className="flex items-center gap-2 py-0.5" aria-hidden="true">
                    <span className="h-px flex-1 bg-[#EAD8C2]" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9A6F5E]">ou</span>
                    <span className="h-px flex-1 bg-[#EAD8C2]" />
                  </div>
                )}
                <div className="rounded-lg border-l-2 border-[#D9E4D3] bg-[#FBF7F1] p-2">
                  <div className="flex gap-2">
                    <input value={option.label} onChange={(event) => updateMeal(mealIndex, { options: (meal.options ?? []).map((value, index) => index === optionIndex ? { ...value, label: event.target.value } : value) })} className="brand-input" aria-label={`Nome da opção ${optionIndex + 1}`} />
                    <button type="button" onClick={() => updateMeal(mealIndex, { options: duplicateMealOptionAt(meal.options ?? [], optionIndex) })} className="brand-btn-secondary shrink-0" aria-label={`Duplicar ${option.label || `opção ${optionIndex + 1}`}`}>Duplicar</button>
                    <button type="button" onClick={() => updateMeal(mealIndex, { options: (meal.options ?? []).filter((_, index) => index !== optionIndex) })} className="brand-btn-secondary shrink-0 text-red-600" aria-label={`Excluir ${option.label || `opção ${optionIndex + 1}`}`}>Excluir</button>
                  </div>
                  <div className="mt-2 grid gap-1.5 md:grid-cols-[minmax(0,1fr)_76px_76px]">
                    {option.items.map((item, itemIndex) => <div key={itemIndex} className="contents">
                      <input value={item.food} onChange={(event) => updateMeal(mealIndex, { options: (meal.options ?? []).map((value, index) => index === optionIndex ? { ...value, items: value.items.map((candidate, candidateIndex) => candidateIndex === itemIndex ? { ...candidate, food: event.target.value } : candidate) } : value) })} className="brand-input" placeholder="Alimento da opção" aria-label={`Alimento ${itemIndex + 1} da opção ${optionIndex + 1}`} />
                      <input value={item.quantity ?? ""} onChange={(event) => updateMeal(mealIndex, { options: (meal.options ?? []).map((value, index) => index === optionIndex ? { ...value, items: value.items.map((candidate, candidateIndex) => candidateIndex === itemIndex ? { ...candidate, quantity: event.target.value } : candidate) } : value) })} className="brand-input" placeholder="Qtd." aria-label={`Quantidade ${itemIndex + 1} da opção ${optionIndex + 1}`} />
                      <input value={item.unit ?? ""} onChange={(event) => updateMeal(mealIndex, { options: (meal.options ?? []).map((value, index) => index === optionIndex ? { ...value, items: value.items.map((candidate, candidateIndex) => candidateIndex === itemIndex ? { ...candidate, unit: event.target.value } : candidate) } : value) })} className="brand-input" placeholder="Un." aria-label={`Unidade ${itemIndex + 1} da opção ${optionIndex + 1}`} />
                    </div>)}
                  </div>
                  <button type="button" onClick={() => updateMeal(mealIndex, { options: (meal.options ?? []).map((value, index) => index === optionIndex ? { ...value, items: [...value.items, { food: "", quantity: "", unit: "", notes: "" }] } : value) })} className="mt-2 text-xs font-semibold text-[#607A56]">+ Alimento nesta opção</button>
                </div>
                </Fragment>)}
                <button type="button" onClick={() => updateMeal(mealIndex, { options: [...(meal.options ?? []), { label: `Opção ${(meal.options?.length ?? 0) + 1}`, items: [{ food: "", quantity: "", unit: "", notes: "" }] }] })} className="brand-btn-secondary">Adicionar opção</button>
              </div>}
              {meal.meal_structure === "COMBINATION" && <div className="mt-3 space-y-2">
                {(meal.choice_groups ?? []).map((group, groupIndex) => <div key={groupIndex} className="rounded-lg bg-[#FBF7F1] p-2">
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_90px_90px_auto]">
                    <input value={group.title} onChange={(event) => updateMeal(mealIndex, { choice_groups: (meal.choice_groups ?? []).map((value, index) => index === groupIndex ? { ...value, title: event.target.value } : value) })} className="brand-input" aria-label={`Nome do grupo ${groupIndex + 1}`} placeholder="Ex.: Escolha 1 proteína" />
                    <input type="number" min="1" value={group.min_selections} onChange={(event) => updateMeal(mealIndex, { choice_groups: (meal.choice_groups ?? []).map((value, index) => index === groupIndex ? { ...value, min_selections: Number(event.target.value) } : value) })} className="brand-input" aria-label="Mínimo de escolhas" title="Mínimo" />
                    <input type="number" min="1" value={group.max_selections} onChange={(event) => updateMeal(mealIndex, { choice_groups: (meal.choice_groups ?? []).map((value, index) => index === groupIndex ? { ...value, max_selections: Number(event.target.value) } : value) })} className="brand-input" aria-label="Máximo de escolhas" title="Máximo" />
                    <button type="button" onClick={() => updateMeal(mealIndex, { choice_groups: (meal.choice_groups ?? []).filter((_, index) => index !== groupIndex) })} className="brand-btn-secondary text-red-600">Excluir</button>
                  </div>
                  <p className="mt-1 text-[11px] text-[#75675E]">Escolha de {group.min_selections} a {group.max_selections} item(ns)</p>
                  <div className="mt-2 grid gap-1.5 md:grid-cols-[minmax(0,1fr)_76px_76px]">
                    {group.items.map((item, itemIndex) => <div key={itemIndex} className="contents">
                      <input value={item.food} onChange={(event) => updateMeal(mealIndex, { choice_groups: (meal.choice_groups ?? []).map((value, index) => index === groupIndex ? { ...value, items: value.items.map((candidate, candidateIndex) => candidateIndex === itemIndex ? { ...candidate, food: event.target.value } : candidate) } : value) })} className="brand-input" placeholder="Alimento do grupo" aria-label={`Alimento ${itemIndex + 1} do grupo ${groupIndex + 1}`} />
                      <input value={item.quantity ?? ""} onChange={(event) => updateMeal(mealIndex, { choice_groups: (meal.choice_groups ?? []).map((value, index) => index === groupIndex ? { ...value, items: value.items.map((candidate, candidateIndex) => candidateIndex === itemIndex ? { ...candidate, quantity: event.target.value } : candidate) } : value) })} className="brand-input" placeholder="Qtd." aria-label={`Quantidade ${itemIndex + 1} do grupo ${groupIndex + 1}`} />
                      <input value={item.unit ?? ""} onChange={(event) => updateMeal(mealIndex, { choice_groups: (meal.choice_groups ?? []).map((value, index) => index === groupIndex ? { ...value, items: value.items.map((candidate, candidateIndex) => candidateIndex === itemIndex ? { ...candidate, unit: event.target.value } : candidate) } : value) })} className="brand-input" placeholder="Un." aria-label={`Unidade ${itemIndex + 1} do grupo ${groupIndex + 1}`} />
                    </div>)}
                  </div>
                  <button type="button" onClick={() => updateMeal(mealIndex, { choice_groups: (meal.choice_groups ?? []).map((value, index) => index === groupIndex ? { ...value, items: [...value.items, { food: "", quantity: "", unit: "", notes: "" }] } : value) })} className="mt-2 text-xs font-semibold text-[#607A56]">+ Alimento no grupo</button>
                </div>)}
                <button type="button" onClick={() => updateMeal(mealIndex, { choice_groups: [...(meal.choice_groups ?? []), { title: `Grupo ${(meal.choice_groups?.length ?? 0) + 1}`, min_selections: 1, max_selections: 1, items: [{ food: "", quantity: "", unit: "", notes: "" }] }] })} className="brand-btn-secondary">Adicionar grupo de escolha</button>
              </div>}
            </div>
          )}
          <div className="p-3">
            {readOnly ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#75675E]">
                {meal.suggested_time && <span className="rounded-full bg-[#FAF7F2] px-2 py-1 font-semibold">{meal.suggested_time}</span>}
                {meal.notes && <span className="min-w-0 flex-1">{meal.notes}</span>}
              </div>
            ) : (
              <>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_118px]">
                  <label className="sr-only" htmlFor={`meal-name-${mealIndex}`}>Nome da refeição</label>
                  <input id={`meal-name-${mealIndex}`} value={meal.name} onChange={(event) => updateMeal(mealIndex, { name: event.target.value })} className="brand-input h-10" placeholder="Nome da refeicao" />
                  <label className="sr-only" htmlFor={`meal-time-${mealIndex}`}>Horário</label>
                  <input id={`meal-time-${mealIndex}`} value={meal.suggested_time ?? ""} onChange={(event) => updateMeal(mealIndex, { suggested_time: event.target.value })} className="brand-input h-10" placeholder="Horario" />
                </div>
                <label className="sr-only" htmlFor={`meal-notes-${mealIndex}`}>Observações da refeição</label>
                <textarea id={`meal-notes-${mealIndex}`} value={meal.notes ?? ""} onChange={(event) => updateMeal(mealIndex, { notes: event.target.value })} className="brand-input mt-2 min-h-14 resize-y" placeholder="Observacoes da refeicao" />
              </>
            )}
            {/* R6.5.2B (seções 22-24) — rótulo "Itens fixos" só quando há grupos de escolha
                (COMBINATION), pra diferenciar visualmente da seção "Escolha X" abaixo. Não
                reordena nem filtra meal.items — mesma lista, mesmos índices/handlers de sempre. */}
            {shouldShowFixedItemsLabel(meal) && (
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8C6E52]">Itens fixos</p>
            )}
            <div className="mt-2 space-y-1.5">
              {meal.items.map((item, itemIndex) => {
                const key = `${mealIndex}:${itemIndex}`;
                const foodInputId = `meal-food-${mealIndex}-${itemIndex}`;
                const quantityInputId = `meal-quantity-${mealIndex}-${itemIndex}`;
                const measureInputId = `meal-measure-${mealIndex}-${itemIndex}`;
                const grams = itemResolutions[key]?.quantity.grams;
                const rawSuggestions = foodSuggestions[key] ?? [];
                const searchResults = multiSourceResults[key] ?? [];
                // FASE 8.5 (item 6) — dentro de um slot, nunca deixa um
                // alimento de outro grupo (ex.: arroz num slot PROTEIN)
                // aparecer primeiro so por relevancia textual. Nunca EXCLUI
                // nenhuma opcao — so reordena (sort estavel: preserva a
                // ordem de relevancia original dentro de cada grupo).
                const suggestions = item.slot_food_group
                  ? [...rawSuggestions].sort((a, b) => Number(isSuggestionCompatibleWithSlot(item, b)) - Number(isSuggestionCompatibleWithSlot(item, a)))
                  : rawSuggestions;
                const dropdownOpen = activeFoodField === key && searchResults.length > 0;
                const slotGroupLabel = item.slot_nutritional_role && item.slot_nutritional_role in CLINICAL_ROLE_LABELS
                  ? CLINICAL_ROLE_LABELS[item.slot_nutritional_role as TemplateClinicalRole]
                  : item.slot_food_group && item.slot_food_group in FOOD_GROUP_LABELS
                    ? FOOD_GROUP_LABELS[item.slot_food_group as FoodGroup]
                    : null;
                const slotIncompatible = Boolean(slotGroupLabel) && !isItemCompatibleWithSlot(item);
                const slotWarningKey = `${key}:${item.food}`;
                const showSlotWarning = slotIncompatible && !dismissedSlotWarnings[slotWarningKey];
                const showEmptyState = activeFoodField === key && !dropdownOpen && searchLoadingKey !== key && item.food.trim().length >= 2;
                const showLoading = activeFoodField === key && searchLoadingKey === key;
                const listboxId = `food-suggestions-${key}`;
                const itemSubstitutions = (substitutions ?? []).filter((sub) =>
                  item.food_ref_id && item.food_source
                    ? sub.base_food_source === item.food_source && sub.base_food_ref_id === item.food_ref_id
                    : sub.base_food === item.food
                );
                const exchangeEntry = [...exchangeGroups].reverse().find(
                  (e) => e.group.primary_food_source === item.food_source && e.group.primary_food_ref_id === item.food_ref_id
                );
                const visibleExchangeAlternatives = exchangeEntry?.alternatives.filter((alternative) => alternative.state !== "REJECTED") ?? [];
                const approvedAlternativeCount = itemSubstitutions.filter((sub) => sub.approved_by_professional !== false).length + visibleExchangeAlternatives.filter((alternative) => alternative.state === "APPROVED").length;
                const pendingAlternativeCount = itemSubstitutions.filter((sub) => sub.approved_by_professional === false).length + visibleExchangeAlternatives.filter((alternative) => alternative.state === "SUGGESTED" || alternative.state === "EDITED").length;
                const exchangesStale = Boolean(exchangeEntry && typeof grams === "number" && Number.isFinite(grams) && Math.abs((exchangeEntry.group.primary_quantity_grams ?? grams) - grams) >= 0.1);
                const alternativeSummary = mealPlanExchangeSummary(approvedAlternativeCount, pendingAlternativeCount, exchangesStale);
                const editingItem = !readOnly && (editingItemKey === key || !item.food.trim());
                if (!editingItem) {
                  return (
                    <div key={itemIndex} className="group relative grid min-w-0 gap-2 rounded-lg border border-[#EDE1D6] bg-white px-3 py-2 md:grid-cols-[minmax(0,150px)_minmax(0,1fr)_120px_minmax(140px,190px)_auto] md:items-center">
                      <div className="min-w-0">
                        {slotGroupLabel ? (
                          <span className="block truncate text-[11px] font-bold uppercase tracking-[0.08em] text-[#607A56]">{slotGroupLabel}</span>
                        ) : (
                          <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-[#9A8B80]">Alimento</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#3A3028]" title={item.food}>{item.food || "Alimento sem nome"}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {slotIncompatible && <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF3E9] px-2 py-0.5 text-[10px] font-semibold text-[#9A6B28]"><AlertTriangle className="h-3 w-3" /> revisar grupo</span>}
                          {item.ai_suggested && <span className="rounded-full bg-[#FFF7F3] px-2 py-0.5 text-[10px] font-semibold text-[#8C5F50]">IA</span>}
                          {item.quantity_locked && <span className="rounded-full bg-[#FAF7F2] px-2 py-0.5 text-[10px] font-semibold text-[#75675E]">quantidade fixa</span>}
                          {item.is_optional && <span className="rounded-full bg-[#FFF3E9] px-2 py-0.5 text-[10px] font-semibold text-[#9A6B28]">opcional</span>}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-[#3A3028]">{mealPlanItemDisplayQuantity(item)}</div>
                      {!readOnly && <input aria-label="Quantidade" tabIndex={-1} readOnly value={item.quantity ?? ""} className="hidden" />}
                      <div className="flex min-w-0 items-center md:justify-end">
                        {clientId ? (
                          <button
                            type="button"
                            onClick={(event) => openExchangeDrawer(key, event.currentTarget)}
                            className="inline-flex h-9 min-w-0 items-center gap-2 rounded-lg border border-[#DDE8D6] bg-[#F8FBF5] px-2.5 text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4]"
                            aria-haspopup="dialog"
                            aria-label={`Revisar trocas de ${item.food || "alimento"}`}
                            title="Revisar trocas"
                          >
                            <Sparkles className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{alternativeSummary}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-[#9A8B80]">Sem trocas</span>
                        )}
                      </div>
                      <div className="relative flex items-center justify-end">
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => setOpenItemMenu((current) => current === key ? "" : key)}
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] text-[#75675E] transition-opacity hover:bg-[#FBF7F1] md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100 ${openItemMenu === key ? "" : "md:opacity-0"}`}
                            aria-label="Mais ações do alimento"
                            title="Mais ações"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        )}
                        {!readOnly && openItemMenu === key && (
                          <div className="absolute right-0 top-[calc(100%+4px)] z-20 w-60 rounded-xl border border-[#EAD8C2] bg-white p-1 shadow-[0_16px_40px_rgba(58,48,40,0.14)]">
                            <button type="button" onClick={() => { setOpenItemMenu(""); setEditingItemKey(key); window.requestAnimationFrame(() => focusFoodField(mealIndex, itemIndex)); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4]">
                              <Pencil className="h-4 w-4" />
                              Editar
                            </button>
                            <button type="button" onClick={() => { setOpenItemMenu(""); updateMealItem(mealIndex, itemIndex, { quantity_locked: !item.quantity_locked }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1]">
                              {item.quantity_locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                              {item.quantity_locked ? "Desbloquear quantidade" : "Bloquear quantidade"}
                            </button>
                            {clientId && (
                              <button type="button" onClick={() => { setOpenItemMenu(""); updateMealItem(mealIndex, itemIndex, { substitutions_locked: !item.substitutions_locked }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1]">
                                {item.substitutions_locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                                {item.substitutions_locked ? "Permitir sugestões" : "Pausar sugestões"}
                              </button>
                            )}
                            <button type="button" onClick={() => { setOpenItemMenu(""); updateMeal(mealIndex, { items: reorderArray(meal.items, itemIndex, -1) }); }} disabled={itemIndex === 0} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-40">
                              <ChevronUp className="h-4 w-4" />
                              Mover para cima
                            </button>
                            <button type="button" onClick={() => { setOpenItemMenu(""); updateMeal(mealIndex, { items: reorderArray(meal.items, itemIndex, 1) }); }} disabled={itemIndex === meal.items.length - 1} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-40">
                              <ChevronDown className="h-4 w-4" />
                              Mover para baixo
                            </button>
                            <button type="button" onClick={() => { setOpenItemMenu(""); updateMeal(mealIndex, { items: duplicateItemAt(meal.items, itemIndex) }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4]">
                              <Copy className="h-4 w-4" />
                              Duplicar
                            </button>
                            <button type="button" onClick={() => { setOpenItemMenu(""); updateMeal(mealIndex, { items: meal.items.filter((_, index) => index !== itemIndex) }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
                              Excluir
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                <div key={itemIndex} className="relative grid min-w-0 gap-1.5 rounded-lg border border-transparent bg-white/70 p-1.5 md:grid-cols-[minmax(240px,1fr)_190px] md:items-start xl:grid-cols-[minmax(260px,1fr)_190px_180px_auto]">
                  <div className="relative min-w-0">
                    {slotGroupLabel && (
                      <span className="mb-1 block w-fit rounded-full bg-[#EEF3EA] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#607A56]">
                        {slotGroupLabel}
                      </span>
                    )}
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
                        if (activeFoodField !== key || !searchResults.length) return;
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setHighlightedIndex((current) => (current + 1) % searchResults.length);
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setHighlightedIndex((current) => (current - 1 + searchResults.length) % searchResults.length);
                        } else if (event.key === "Enter") {
                          const result = searchResults[highlightedIndex];
                          if (result) {
                            event.preventDefault();
                            selectMultiSourceResult(mealIndex, itemIndex, result);
                          }
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          setActiveFoodField("");
                        }
                      }}
                      className="brand-input"
                      placeholder={slotGroupLabel ? `Buscar ${slotGroupLabel.toLowerCase()}...` : "Buscar alimento..."}
                      title={item.food || undefined}
                    />
                    {showSlotWarning && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-[#FFF3E9] px-2 py-1.5 text-[11px] text-[#9A6B28]">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>Este alimento não corresponde ao grupo esperado deste slot ({slotGroupLabel}).</span>
                        <button type="button" onClick={() => setDismissedSlotWarnings((current) => ({ ...current, [slotWarningKey]: true }))} className="font-semibold underline decoration-dotted underline-offset-2 hover:text-[#7A5420]">
                          Manter mesmo assim
                        </button>
                        <button type="button" onClick={() => focusFoodField(mealIndex, itemIndex)} className="font-semibold underline decoration-dotted underline-offset-2 hover:text-[#7A5420]">
                          Escolher outro
                        </button>
                      </div>
                    )}
                    {item.ai_suggested && (
                      <span className="mt-1 inline-flex rounded-full bg-[#FFF7F3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8C5F50]">
                        sugerido por IA
                      </span>
                    )}
                    <label className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#75675E]">
                      <input type="checkbox" checked={Boolean(item.is_optional)} onChange={(event) => updateMealItem(mealIndex, itemIndex, { is_optional: event.target.checked })} />
                      Item opcional
                    </label>
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
                      <div id={listboxId} role="listbox" aria-label="Sugestoes de alimentos" className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-64 w-full min-w-[280px] max-w-[min(92vw,480px)] overflow-y-auto rounded-xl border border-[#EAD8C2] bg-white p-1 shadow-[0_18px_44px_rgba(58,48,40,0.16)] sm:min-w-[340px]">
                        {searchResults.map((result, suggestionIndex) => (
                          <button
                            key={`${result.sourceCode}:${result.sourceFoodId}`}
                            type="button"
                            id={`${listboxId}-option-${suggestionIndex}`}
                            role="option"
                            aria-selected={suggestionIndex === highlightedIndex}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setHighlightedIndex(suggestionIndex)}
                            onClick={() => selectMultiSourceResult(mealIndex, itemIndex, result)}
                            className={`block w-full rounded-lg px-3 py-2 text-left transition-colors ${suggestionIndex === highlightedIndex ? "bg-[#FAF7F2]" : "hover:bg-[#FAF7F2]"}`}
                          >
                            <span className="block text-sm font-medium text-[#3A3028]">{result.displayName}</span>
                            <span className="mt-0.5 block text-[10px] uppercase tracking-[0.08em] text-[#8C6E52]">{result.preparation ?? result.group ?? "Alimento"} · {result.sourceName}</span>
                            <span className="mt-1 block text-xs text-[#75675E]">{result.defaultPortion.label} = {result.defaultPortion.gramWeight ?? "—"} g · kcal {result.nutrientsPreview.energyKcal ?? "—"} · P {result.nutrientsPreview.proteinG ?? "—"} · C {result.nutrientsPreview.carbohydrateG ?? "—"} · G {result.nutrientsPreview.fatG ?? "—"}</span>
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
                      <input id={quantityInputId} aria-label="Quantidade" value={item.quantity ?? ""} onChange={(event) => {
                        const measure = (item.food_source === "TBCA" || item.food_source === "IBGE_POF") ? measureOptionsFor(item).find((candidate) => candidate.id === item.household_measure_id) ?? null : null;
                        updateMealItem(mealIndex, itemIndex, { quantity: event.target.value, ...snapshotForMeasure(event.target.value, measure) });
                      }} className="brand-input h-10" placeholder="Qtd." />
                      {item.food_ref_id ? (
                        <>
                          <label className="sr-only" htmlFor={measureInputId}>Medida</label>
                          <select
                            id={measureInputId}
                            aria-label="Medida"
                            value={item.household_measure_id ?? "__grams__"}
                            onChange={(event) => {
                              const value = event.target.value;
                              const measure = measureOptionsFor(item).find((candidate) => candidate.id === value) ?? null;
                              updateMealItem(mealIndex, itemIndex, value === "__grams__"
                                ? { household_measure_id: null, unit: "g", resolved_grams_snapshot: null, quantity_resolution_snapshot: null }
                                : { household_measure_id: value, unit: null, ...snapshotForMeasure(item.quantity, measure) });
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
                  <div className="flex min-w-0 items-center justify-between gap-2 md:col-span-2 xl:col-span-1 xl:justify-end">
                    {clientId ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          openExchangeDrawer(key, event.currentTarget);
                          setOpenSubstitutionsKey("");
                          setOpenExchangeKey("");
                        }}
                        className="inline-flex h-9 min-w-0 items-center gap-2 rounded-lg border border-[#DDE8D6] bg-[#F8FBF5] px-2.5 text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4]"
                        aria-haspopup="dialog"
                        aria-expanded={exchangeDrawerKey === key}
                        aria-label="Trocas"
                        title="Ver trocas deste alimento"
                      >
                        <Sparkles className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{alternativeSummary}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-[#9A8B80]">Sem trocas</span>
                    )}
                  </div>
                  <div className="relative flex items-center justify-end gap-1">
                    <button type="button" onClick={() => setEditingItemKey("")} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#D9E4D3] bg-[#F8FBF5] text-[#607A56] hover:bg-[#EAF0E4]" aria-label="Concluir edição" title="Concluir edição">
                      <Check className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setEditingItemKey("")} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] text-[#75675E] hover:bg-[#FBF7F1]" aria-label="Fechar edição" title="Fechar edição">
                      <X className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setOpenItemMenu((current) => current === key ? "" : key)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] text-[#75675E] hover:bg-[#FBF7F1]" aria-label="Mais ações do alimento" title="Mais ações">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {openItemMenu === key && (
                      <div className="absolute right-0 top-[calc(100%+4px)] z-20 w-60 rounded-xl border border-[#EAD8C2] bg-white p-1 shadow-[0_16px_40px_rgba(58,48,40,0.14)]">
                        <button type="button" onClick={() => { setOpenItemMenu(""); focusFoodField(mealIndex, itemIndex); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4]">
                          <RefreshCw className="h-4 w-4" />
                          Editar alimento
                        </button>
                        <button type="button" onClick={() => { setOpenItemMenu(""); updateMealItem(mealIndex, itemIndex, { quantity_locked: !item.quantity_locked }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1]">
                          {item.quantity_locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                          {item.quantity_locked ? "Desbloquear quantidade" : "Bloquear quantidade"}
                        </button>
                        {clientId && (
                          <button type="button" onClick={() => { setOpenItemMenu(""); updateMealItem(mealIndex, itemIndex, { substitutions_locked: !item.substitutions_locked }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1]">
                            {item.substitutions_locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                            {item.substitutions_locked ? "Permitir sugestões" : "Pausar sugestões"}
                          </button>
                        )}
                        <button type="button" onClick={() => { setOpenItemMenu(""); updateMeal(mealIndex, { items: reorderArray(meal.items, itemIndex, -1) }); }} disabled={itemIndex === 0} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-40">
                          <ChevronUp className="h-4 w-4" />
                          Mover para cima
                        </button>
                        <button type="button" onClick={() => { setOpenItemMenu(""); updateMeal(mealIndex, { items: reorderArray(meal.items, itemIndex, 1) }); }} disabled={itemIndex === meal.items.length - 1} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-40">
                          <ChevronDown className="h-4 w-4" />
                          Mover para baixo
                        </button>
                        <button type="button" onClick={() => { setOpenItemMenu(""); updateMeal(mealIndex, { items: duplicateItemAt(meal.items, itemIndex) }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#607A56] hover:bg-[#EAF0E4]">
                          <Copy className="h-4 w-4" />
                          Duplicar
                        </button>
                        <button type="button" onClick={() => { setOpenItemMenu(""); updateMeal(mealIndex, { items: meal.items.filter((_, index) => index !== itemIndex) }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                  {clientId && openSubstitutionsKey === key && (
                    <div className="col-span-full">
                      <ItemSubstitutionsPanel
                        clientId={clientId}
                        itemFood={item.food}
                        // FASE 6.5 (item 13) — substituicoes continuam so pro catalogo
                        // legado; um item TBCA/IBGE_POF aparece aqui como se nao tivesse
                        // fonte estruturada (mesmo fallback de "nao fazer ainda").
                        itemFoodSource={item.food_source === "TBCA" || item.food_source === "IBGE_POF" || item.food_source === "RECIPE" ? null : item.food_source}
                        itemFoodRefId={item.food_source === "TBCA" || item.food_source === "IBGE_POF" || item.food_source === "RECIPE" ? null : item.food_ref_id}
                        itemGrams={typeof grams === "number" && Number.isFinite(grams) ? grams : null}
                        substitutionsLocked={Boolean(item.substitutions_locked)}
                        currentMeals={meals}
                        substitutions={itemSubstitutions}
                        onAdd={(sub) => onSubstitutionsChange?.([...(substitutions ?? []), sub])}
                        onApprove={(indexInFiltered) => {
                          const list = substitutions ?? [];
                          const target = itemSubstitutions[indexInFiltered];
                          onSubstitutionsChange?.(list.map((sub) => sub === target ? { ...sub, approved_by_professional: true } : sub));
                        }}
                        onRemove={(indexInFiltered) => {
                          const list = substitutions ?? [];
                          const target = itemSubstitutions[indexInFiltered];
                          onSubstitutionsChange?.(list.filter((sub) => sub !== target));
                        }}
                      />
                    </div>
                  )}
                  {clientId && mealPlanId && openExchangeKey === key && (
                      <div className="col-span-full">
                        <ExchangeGroupPanel
                          clientId={clientId}
                          mealPlanId={mealPlanId}
                          mealPlanItemId={item.id ?? null}
                          mealName={meal.name}
                          primaryFoodName={item.food}
                          // R6 — item de RECEITA não é um alimento de catálogo; nunca abre o motor de troca/equivalência (seção 40).
                          primaryFoodSource={item.food_source === "RECIPE" ? null : item.food_source}
                          primaryFoodRefId={item.food_source === "RECIPE" ? null : item.food_ref_id}
                          primaryCanonicalFoodId={item.canonical_food_id}
                          primaryGrams={typeof grams === "number" && Number.isFinite(grams) ? grams : null}
                          group={exchangeEntry?.group ?? null}
                          alternatives={exchangeEntry?.alternatives ?? []}
                          onResolved={(identity) => updateMealItem(mealIndex, itemIndex, identity)}
                          onRefresh={loadExchangeGroups}
                          allMeals={meals}
                          mealIndex={mealIndex}
                          itemIndex={itemIndex}
                        />
                      </div>
                  )}
                </div>
                );
              })}
              <button type="button" onClick={() => addItemForEditing(mealIndex)} className="text-xs font-semibold text-[#607A56]">
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

      {portalReady && exchangeDrawerContext && createPortal(
        <div role="dialog" aria-modal="true" aria-labelledby="meal-exchange-drawer-title" className="fixed inset-0 z-50 overflow-hidden bg-black/30 backdrop-blur-sm">
          <button type="button" className="absolute inset-0 h-full w-full cursor-default" aria-hidden="true" tabIndex={-1} onClick={closeExchangeDrawer} />
          {/* R2.2 (seção 40) — mobile: bottom sheet de altura fixa; a partir de
              sm: drawer lateral direito, altura cheia, como antes. */}
          <aside
            ref={(node) => { exchangeDrawerRef.current = node; }}
            className="absolute inset-x-0 bottom-0 top-auto flex h-[85vh] flex-col rounded-t-2xl border-t border-[#EAD8C2] bg-[#FFFDFC] shadow-[0_-16px_60px_rgba(58,48,40,0.28)] sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:h-full sm:w-full sm:max-w-[520px] sm:rounded-t-none sm:rounded-none sm:border-l sm:border-t-0 sm:shadow-[0_24px_80px_rgba(58,48,40,0.28)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EDE1D6] px-4 py-4">
              <div className="min-w-0">
                <p className="brand-kicker">Trocas</p>
                <h2 id="meal-exchange-drawer-title" className="truncate font-serif text-xl font-semibold text-[#3A3028]">{exchangeDrawerContext.item.food || "Alimento"}</h2>
                <p className="mt-1 text-xs text-[#75675E]">
                  {exchangeDrawerContext.meal.name || "Refeicao"} - {mealPlanItemDisplayQuantity(exchangeDrawerContext.item)}
                </p>
              </div>
              <button type="button" onClick={closeExchangeDrawer} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#75675E] hover:bg-[#FBF7F1]" aria-label="Fechar trocas" title="Fechar">
                <PanelRightClose className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {readOnly ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-[#EDE1D6] bg-[#FAF7F2]/60 p-4">
                    <p className="text-sm font-semibold text-[#3A3028]">Plano ativo publicado</p>
                    <p className="mt-1 text-xs leading-5 text-[#75675E]">As trocas ficam disponíveis para consulta. Para alterar, edite uma cópia em rascunho.</p>
                  </div>
                  {exchangeDrawerContext.exchangeEntry?.alternatives.length ? (
                    exchangeDrawerContext.exchangeEntry.alternatives
                      .filter((alternative) => alternative.state !== "REJECTED")
                      .map((alternative) => (
                        <div key={alternative.id} className="rounded-lg border border-[#EDE1D6] bg-white p-3">
                          <p className="text-sm font-semibold text-[#3A3028]">{alternative.food_name}</p>
                          <p className="mt-1 text-xs text-[#75675E]">{Math.round(alternative.quantity_grams * 10) / 10} g</p>
                        </div>
                      ))
                  ) : (
                    <p className="rounded-lg border border-[#EDE1D6] bg-white p-3 text-sm text-[#75675E]">Nenhuma troca aprovada para este alimento.</p>
                  )}
                </div>
              ) : !exchangeDrawerContext.item.food_source || !exchangeDrawerContext.item.food_ref_id ? (
                <div className="rounded-xl border border-[#F0D4B8] bg-[#FFF8F0] p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#9A6B28]" />
                    <div>
                      <p className="text-sm font-semibold text-[#7A5420]">Confirme este alimento antes de gerar trocas.</p>
                      <p className="mt-1 text-xs leading-5 text-[#8C6E52]">Escolha um alimento da busca para que o sistema calcule trocas.</p>
                    </div>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        const { mealIndex, itemIndex } = exchangeDrawerContext;
                        const key = `${mealIndex}:${itemIndex}`;
                        setExchangeDrawerKey("");
                        setEditingItemKey(key);
                        window.requestAnimationFrame(() => focusFoodField(mealIndex, itemIndex));
                      }}
                      className="brand-btn-secondary mt-3"
                    >
                      <Pencil className="h-4 w-4" />
                      Corrigir alimento
                    </button>
                  )}
                </div>
              ) : clientId && mealPlanId ? (
                <ExchangeGroupPanel
                  clientId={clientId}
                  mealPlanId={mealPlanId}
                  mealPlanItemId={exchangeDrawerContext.item.id ?? null}
                  mealName={exchangeDrawerContext.meal.name}
                  primaryFoodName={exchangeDrawerContext.item.food}
                  primaryFoodSource={exchangeDrawerContext.item.food_source === "RECIPE" ? null : exchangeDrawerContext.item.food_source}
                  primaryFoodRefId={exchangeDrawerContext.item.food_source === "RECIPE" ? null : exchangeDrawerContext.item.food_ref_id}
                  primaryCanonicalFoodId={exchangeDrawerContext.item.canonical_food_id}
                  primaryGrams={typeof exchangeDrawerContext.grams === "number" && Number.isFinite(exchangeDrawerContext.grams) ? exchangeDrawerContext.grams : null}
                  group={exchangeDrawerContext.exchangeEntry?.group ?? null}
                  alternatives={exchangeDrawerContext.exchangeEntry?.alternatives ?? []}
                  onResolved={(identity) => updateMealItem(exchangeDrawerContext.mealIndex, exchangeDrawerContext.itemIndex, identity)}
                  onRefresh={loadExchangeGroups}
                  allMeals={meals}
                  mealIndex={exchangeDrawerContext.mealIndex}
                  itemIndex={exchangeDrawerContext.itemIndex}
                />
              ) : (
                <ItemSubstitutionsPanel
                  clientId={clientId ?? ""}
                  itemFood={exchangeDrawerContext.item.food}
                  itemFoodSource={exchangeDrawerContext.item.food_source === "TBCA" || exchangeDrawerContext.item.food_source === "IBGE_POF" || exchangeDrawerContext.item.food_source === "RECIPE" ? null : exchangeDrawerContext.item.food_source}
                  itemFoodRefId={exchangeDrawerContext.item.food_source === "TBCA" || exchangeDrawerContext.item.food_source === "IBGE_POF" || exchangeDrawerContext.item.food_source === "RECIPE" ? null : exchangeDrawerContext.item.food_ref_id}
                  itemGrams={typeof exchangeDrawerContext.grams === "number" && Number.isFinite(exchangeDrawerContext.grams) ? exchangeDrawerContext.grams : null}
                  substitutionsLocked={Boolean(exchangeDrawerContext.item.substitutions_locked)}
                  currentMeals={meals}
                  substitutions={exchangeDrawerContext.itemSubstitutions}
                  onAdd={(sub) => onSubstitutionsChange?.([...(substitutions ?? []), sub])}
                  onApprove={(indexInFiltered) => {
                    const list = substitutions ?? [];
                    const target = exchangeDrawerContext.itemSubstitutions[indexInFiltered];
                    onSubstitutionsChange?.(list.map((sub) => sub === target ? { ...sub, approved_by_professional: true } : sub));
                  }}
                  onRemove={(indexInFiltered) => {
                    const list = substitutions ?? [];
                    const target = exchangeDrawerContext.itemSubstitutions[indexInFiltered];
                    onSubstitutionsChange?.(list.filter((sub) => sub !== target));
                  }}
                />
              )}
            </div>
          </aside>
        </div>,
        document.body
      )}

      {portalReady && recipeSelectorOpen && createPortal(
        <div role="dialog" aria-modal="true" aria-labelledby="insert-recipe-title" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
          <section ref={recipeSelectorRef} className="flex h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)] sm:h-auto sm:max-h-[calc(100dvh-3rem)]">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EDE1D6] px-5 py-4">
              <div>
                <p className="brand-kicker">Biblioteca de receitas</p>
                <h2 id="insert-recipe-title" className="font-serif text-2xl font-semibold text-[#3A3028]">Inserir receita</h2>
              </div>
              {/* R6.5.3 — era o literal "x" (texto), não um ícone; agora consistente com todo o resto do app. */}
              <button type="button" onClick={() => setRecipeSelectorOpen(false)} className="rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" aria-label="Fechar" title="Fechar">
                <X className="h-4 w-4" />
              </button>
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

      {reuseLibraryOpen && clientId && (
        <ReuseLibraryDrawer
          clientId={clientId}
          currentPlanId={mealPlanId}
          onInsertMeal={(meal) => {
            const mealIndex = meals.length;
            onChange([...meals, meal as Meal]);
            setEditingItemKey(`${mealIndex}:0`);
          }}
          onClose={() => {
            setReuseLibraryOpen(false);
            reuseLibraryTriggerRef.current?.focus();
          }}
        />
      )}

      {portalReady && savedMealDraft && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Salvar refeição favorita" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
          <section className="w-full max-w-md overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)]">
            <div className="border-b border-[#EDE1D6] px-5 py-4">
              <p className="brand-kicker">Biblioteca de reuso</p>
              <h2 className="font-serif text-xl font-semibold text-[#3A3028]">Salvar refeição favorita</h2>
              <p className="mt-1 text-xs leading-5 text-[#75675E]">Guarda a estrutura desta refeição (nunca a nutrição congelada) para reutilizar em qualquer plano futuro.</p>
            </div>
            <div className="space-y-3 p-5">
              <label className="brand-label" htmlFor="saved-meal-name">Nome</label>
              <input id="saved-meal-name" value={savedMealDraft.name} onChange={(event) => setSavedMealDraft({ ...savedMealDraft, name: event.target.value })} className="brand-input" autoFocus />
              {savedMealDraft.error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{savedMealDraft.error}</p>}
            </div>
            <div className="grid gap-3 border-t border-[#EDE1D6] px-5 py-3 sm:flex sm:justify-end">
              <button type="button" onClick={() => setSavedMealDraft(null)} className="brand-btn-secondary w-full sm:w-auto">Cancelar</button>
              <button
                type="button"
                disabled={savedMealDraft.saving || !savedMealDraft.name.trim()}
                onClick={() => void (async () => {
                  setSavedMealDraft({ ...savedMealDraft, saving: true, error: "" });
                  try {
                    const meal = meals[savedMealDraft.mealIndex];
                    const response = await fetch("/api/admin/saved-meals", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: savedMealDraft.name.trim(), meal }),
                    });
                    if (!response.ok) {
                      const data = await response.json().catch(() => ({}));
                      throw new Error(data.message ?? "Não foi possível salvar.");
                    }
                    setSavedMealDraft(null);
                    onMessage?.("Refeição salva na biblioteca de reuso.");
                  } catch (cause) {
                    setSavedMealDraft((current) => current ? { ...current, saving: false, error: cause instanceof Error ? cause.message : "Não foi possível salvar." } : current);
                  }
                })()}
                className="brand-btn-primary w-full sm:w-auto"
              >
                <Save className="h-4 w-4" />
                {savedMealDraft.saving ? "Salvando..." : "Salvar"}
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
