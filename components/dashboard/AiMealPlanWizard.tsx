"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, Loader2, AlertTriangle, Wand2, RefreshCw, Target, Info, Trash2, Check } from "lucide-react";
import {
  PROTOCOL_TEMPLATE_GROUP_LABELS,
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  type ProtocolTemplateTargetGroup,
} from "@/lib/protocol-templates/constants";
import type { DraftGenerationReadiness } from "@/lib/clinical/meal-plan-copilot";
import type { Meal } from "@/components/dashboard/MealItemsEditor";
import type { ItemSubstitution } from "@/components/dashboard/ItemSubstitutionsPanel";
import { normalizeIngredientForRead, type RecipeIngredient } from "@/lib/nutrition/recipes";
import { computeMealPlanReadiness } from "@/lib/ai/agents/nutrition/meal-plan-readiness";
import { useDialogKeyboard } from "@/hooks/use-dialog-keyboard";
import {
  selectableMealKeys,
  computeMealPlanChangeset,
  mergeChangesetIntoMeals,
  describeMealPlanChangeset,
  type ExistingPlanMeal,
  type MealPlanChangeset,
} from "@/lib/ai/agents/nutrition/meal-plan-changeset";

const MEAL_KEYS = ["cafe_da_manha", "lanche_manha", "almoco", "lanche_tarde", "jantar", "ceia"] as const;
type MealKey = (typeof MEAL_KEYS)[number];
const MEAL_KEY_LABELS: Record<MealKey, string> = {
  cafe_da_manha: "Café da manhã",
  lanche_manha: "Lanche da manhã",
  almoco: "Almoço",
  lanche_tarde: "Lanche da tarde",
  jantar: "Jantar",
  ceia: "Ceia",
};
const NUTRIENT_LABELS: Record<string, string> = { energyKcal: "Energia", proteinG: "Proteína", carbohydrateG: "Carboidrato", fatG: "Gordura" };
const DEFAULT_SELECTED_MEALS: MealKey[] = ["cafe_da_manha", "almoco", "lanche_tarde", "jantar"];
const MAX_REFINE_ITERATIONS = 6;

/** Grupo do Recipe Engine (lib/nutrition/recipe-constants.ts) mais próximo de cada refeição — só pra filtrar quais receitas cadastradas fazem sentido sugerir, nunca restringe o cálculo. */
const MEAL_KEY_TO_RECIPE_GROUP: Record<MealKey, "cafe_da_manha" | "almoco" | "lanche" | "jantar" | "sobremesa" | "bebida"> = {
  cafe_da_manha: "cafe_da_manha",
  lanche_manha: "lanche",
  almoco: "almoco",
  lanche_tarde: "lanche",
  jantar: "jantar",
  ceia: "lanche",
};

/** R6 — aceita o shape novo (food/food_source/food_ref_id, qualquer fonte real) OU o legado (taco_number/food_name/grams), normalizado por normalizeIngredientForRead. */
type RecipeIngredientPayload = RecipeIngredient;

interface RecipeCandidate {
  id: string;
  title: string;
  servings: number;
  preparation_steps: string | null;
  ingredients: RecipeIngredientPayload[];
  per_portion_kcal: number;
  per_portion_protein_g: number;
  per_portion_carbs_g: number;
  per_portion_fat_g: number;
}

/** Estado efêmero (só existe na revisão do wizard, nunca persistido) — SUGGESTED enquanto aqui presente, ACCEPTED quando "Usar receita" aplica e limpa a entrada, REJECTED quando "Manter alimentos" limpa sem aplicar. */
interface MealRecipeSuggestion {
  status: "suggested" | "none";
  recipe: RecipeCandidate | null;
  mealKcalAtSuggestionTime: number | null;
  mealProteinAtSuggestionTime: number | null;
  mealCarbsAtSuggestionTime: number | null;
  mealFatAtSuggestionTime: number | null;
}

interface DraftContext {
  clientName: string;
  ageYears: number | null;
  biologicalSex: string | null;
  weightKg: string | null;
  heightDisplay: string | null;
  bmi: string | null;
  lifeStage: string | null;
  /** Já presente na resposta real de `/draft/context` (MealPlanDraftContext) — só usado aqui pra readiness (R5), nunca exibido nesta etapa. */
  goals: string | null;
  allergies: string | null;
  restrictions: string | null;
  eatingRoutine: string | null;
  clinicalMarkers: { type: string; label: string; severity: string; status: string }[];
  activePlan: { title: string; targetEnergyKcal: number | null } | null;
}

interface DraftMealItem {
  food: string;
  displayName: string;
  quantity: string;
  unit: string;
  food_source: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | null;
  food_ref_id: string | null;
  ai_suggested: true;
  needsSafetyReview?: boolean;
  /** Intenção de preparo comunicada pela IA; metadado transitório do draft. */
  preparation?: string | null;
  /** R5.1 — item opcional dentro de uma refeição COMBINATION (mesmo campo do domínio real do Composer). */
  is_optional?: boolean;
}
interface DraftNeedsReviewCandidate {
  ref: { source: string; sourceId: string; canonicalId?: string | null };
  name: string;
  displayName: string;
  sourceLabel: string;
}
interface DraftNeedsReviewRecipeCandidate {
  id: string;
  title: string;
  servings: number;
}
interface DraftNeedsReview {
  query: string;
  quantity: string;
  unit: string;
  status: "AMBIGUOUS" | "NOT_FOUND" | "CLINICAL_CONFLICT" | "PREPARATION_NEEDS_REVIEW";
  reason: string;
  candidates: DraftNeedsReviewCandidate[];
  preparation?: string | null;
  recipeCandidates?: DraftNeedsReviewRecipeCandidate[];
  /** R5.1 (seção 16) — caminho estável até a posição original nested (ex.: "options[1].items[0]"). */
  path?: string;
}
/** R5.1 — uma alternativa completa de uma refeição OPTIONS. */
interface DraftMealOption {
  id: string;
  label: string;
  description?: string | null;
  items: DraftMealItem[];
  needsReview: DraftNeedsReview[];
}
/** R5.1 — um grupo de escolha de uma refeição COMBINATION. */
interface DraftMealChoiceGroup {
  id: string;
  title: string;
  description?: string | null;
  min_selections: number;
  max_selections: number;
  items: DraftMealItem[];
  needsReview: DraftNeedsReview[];
}
interface OptimizerAdjustment {
  mealIndex: number;
  mealName: string;
  itemIndex: number;
  food: string;
  displayName: string;
  quantityBefore: string;
  quantityAfter: string;
  unit: string;
}
interface OptimizerSummary {
  adjustments: OptimizerAdjustment[];
  scoreBefore: number;
  scoreAfter: number;
  stopReason: string;
}
interface DraftMeal {
  mealKey: MealKey;
  name: string;
  suggested_time: string | null;
  source_recipe_id: string | null;
  /** R5.1 — ausente/null equivale a "SIMPLE" (mesma convenção do Composer). */
  meal_structure?: "SIMPLE" | "OPTIONS" | "COMBINATION" | null;
  items: DraftMealItem[];
  needsReview: DraftNeedsReview[];
  options?: DraftMealOption[];
  choice_groups?: DraftMealChoiceGroup[];
}
interface DraftWarning {
  level: "info" | "warning";
  mealKey?: string;
  message: string;
}
interface NutrientValuesLite {
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG?: number | null;
}
interface TargetComparisonRow {
  nutrient: string;
  target: number;
  prescribed: number | null;
  diff: number | null;
  percentOfTarget: number | null;
}
interface DraftNutrition {
  total: NutrientValuesLite;
  perMeal: NutrientValuesLite[];
  unresolvedCount: number;
  targetComparison: TargetComparisonRow[];
  range?: { min: NutrientValuesLite; max: NutrientValuesLite; varies: boolean };
}
interface CriticFinding {
  severity: "INFO" | "REVIEW" | "WARNING";
  scope: "PLAN" | "MEAL" | "ITEM";
  mealName?: string;
  message: string;
}
interface DraftResult {
  meals: DraftMeal[];
  warnings: DraftWarning[];
  nutrition?: DraftNutrition;
  critic?: CriticFinding[];
}

type WizardStep = "source" | "context" | "goals" | "meals" | "preferences" | "generating" | "review";
const STEP_ORDER: WizardStep[] = ["source", "context", "goals", "meals", "preferences", "generating", "review"];
const STEP_LABELS: Record<WizardStep, string> = {
  source: "Novo ou plano anterior",
  context: "Dados do paciente",
  goals: "Objetivo e meta",
  meals: "Refeições e horários",
  preferences: "Preferências",
  generating: "Gerando",
  review: "Revisão",
};

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function fmt(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Nome amigável só pra exibição (reordena "Alimento, atributo" -> "Alimento atributo") — nunca usado pra resolver/persistir identidade. Mesma lógica de lib/nutrition/food-resolver.ts#toDisplayFoodName, reimplementada aqui pra não puxar o módulo do resolver (que importa repositórios server-only) pro bundle do cliente. */
function toFriendlyFoodName(technicalName: string): string {
  const parts = technicalName.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.join(" ") : technicalName.trim();
}

/**
 * Expande os ingredientes REAIS de uma receita (escalados pra 1 porção) em
 * itens calculáveis — reaproveitado tanto pela revisão de preparo composto
 * (Food Preparation Engine V1) quanto pela sugestão de receita opcional
 * (Food-First Meal Plan V1, Fase 4): "Usar receita" SUBSTITUI os itens da
 * refeição pelos ingredientes reais da receita (nunca soma aos itens
 * existentes — evita dupla contagem por construção). A preparação/receita
 * em si nunca fornece kcal; só os ingredientes com source+refId reais.
 */
function expandRecipeIngredientsToItems(recipe: { servings: number; ingredients: RecipeIngredientPayload[] }): DraftMealItem[] {
  const servingCount = Number.isFinite(recipe.servings) && recipe.servings > 0 ? recipe.servings : 1;
  const draftCompatibleSources = new Set(["TACO", "CUSTOM", "MANUFACTURER", "USDA"]);
  return recipe.ingredients
    .map(normalizeIngredientForRead)
    .map((ing) => ({ ...ing, grams: ing.unit === "g" && ing.quantity ? Number(ing.quantity) : null }))
    .filter((ing) => ing.food_ref_id && ing.grams && ing.food_source && draftCompatibleSources.has(ing.food_source))
    .map((ing) => {
      const grams = Math.round(((ing.grams ?? 0) / servingCount) * 10) / 10;
      return {
        food: ing.food,
        displayName: toFriendlyFoodName(ing.food),
        quantity: String(grams),
        unit: "g",
        food_source: ing.food_source as "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA",
        food_ref_id: ing.food_ref_id!,
        ai_suggested: true,
      };
    });
}

function draftItemToEditorItem(item: DraftMealItem): Meal["items"][number] {
  return {
    food: item.food,
    quantity: item.quantity,
    unit: item.unit,
    notes: item.preparation ?? null,
    ai_suggested: true,
    food_source: item.food_source,
    food_ref_id: item.food_ref_id,
    ...(item.is_optional ? { is_optional: true } : {}),
  };
}

/**
 * R5.1 (seções 20/21/38/39) — carrega meal_structure/options/choice_groups
 * intactos pro mesmo shape que o Composer já entende nativamente (nunca
 * achata OPTIONS/COMBINATION pra texto/instructions só pra caber no fluxo
 * anterior). O Composer (MealItemsEditor.tsx) já sabe renderizar/editar/
 * salvar essa estrutura — reaproveitada 100%, nenhum código novo lá.
 */
function draftMealToEditorMeal(meal: DraftMeal): Meal {
  const structure = meal.meal_structure ?? "SIMPLE";
  return {
    name: meal.name,
    suggested_time: meal.suggested_time,
    notes: null,
    source_recipe_id: meal.source_recipe_id,
    meal_structure: structure,
    items: meal.items.map(draftItemToEditorItem),
    ...(structure === "OPTIONS" ? { options: (meal.options ?? []).map((option) => ({ label: option.label, description: option.description ?? null, items: option.items.map(draftItemToEditorItem) })) } : {}),
    ...(structure === "COMBINATION" ? { choice_groups: (meal.choice_groups ?? []).map((group) => ({ title: group.title, description: group.description ?? null, min_selections: group.min_selections, max_selections: group.max_selections, items: group.items.map(draftItemToEditorItem) })) } : {}),
  };
}

/** Insere a escolha humana exatamente no galho que originou a revisão. */
function placeResolvedReviewItem(meal: DraftMeal, review: DraftNeedsReview, item: DraftMealItem): DraftMeal {
  const path = review.path ?? "";
  const option = path.match(/\.options\[(\d+)]\.items/);
  const group = path.match(/\.choiceGroups\[(\d+)]\.items/);
  if (option) {
    const index = Number(option[1]);
    return { ...meal, options: (meal.options ?? []).map((entry, i) => i === index ? { ...entry, items: [...entry.items, item] } : entry) };
  }
  if (group) {
    const index = Number(group[1]);
    return { ...meal, choice_groups: (meal.choice_groups ?? []).map((entry, i) => i === index ? { ...entry, items: [...entry.items, item] } : entry) };
  }
  return { ...meal, items: [...meal.items, item] };
}

const CRITIC_ICON: Record<CriticFinding["severity"], string> = { INFO: "ℹ", REVIEW: "⚠", WARNING: "⚠" };
const CRITIC_STYLE: Record<CriticFinding["severity"], string> = {
  INFO: "border-[#D9E4D3] bg-[#F5FAF0] text-[#4F7D45]",
  REVIEW: "border-[#F0D4C7] bg-[#FFF7F3] text-[#8C5F50]",
  WARNING: "border-[#F0D4C7] bg-[#FFF1E6] text-[#B5762F]",
};

interface PreviousPlanSummary {
  id: string;
  title: string;
  status: string;
  target_group: string | null;
  meals: Meal[];
}

export function AiMealPlanWizard({
  clientId,
  defaultTargetGroup,
  onClose,
  onApply,
  onApplyChangeset,
  previousPlans,
}: {
  clientId: string;
  defaultTargetGroup: ProtocolTemplateTargetGroup;
  onClose: () => void;
  onApply: (targetGroup: ProtocolTemplateTargetGroup, meals: Meal[], substitutions?: ItemSubstitution[]) => Promise<void>;
  /** R5 (seções 23-31) — "Usar plano anterior como base": aplica o resultado já MESCLADO (KEEP/MODIFY/ADD) sobre um clone do plano de origem, nunca o draft do zero. */
  onApplyChangeset?: (sourcePlanId: string, mergedMeals: Meal[]) => Promise<void>;
  /** Planos já existentes do paciente (qualquer status) — usado só pra oferecer "Usar plano anterior como base" quando fizer sentido. */
  previousPlans?: PreviousPlanSummary[];
}) {
  // R5 (seções 23-24) — só planos com pelo menos 1 refeição fazem sentido
  // como base (um plano vazio não tem nada pra manter/alterar).
  const eligiblePreviousPlans = (previousPlans ?? []).filter((item) => item.meals.length > 0);
  const [sourceMode, setSourceMode] = useState<"new" | "previous">("new");
  const [sourcePlanId, setSourcePlanId] = useState<string>(eligiblePreviousPlans[0]?.id ?? "");
  const sourcePlan = eligiblePreviousPlans.find((item) => item.id === sourcePlanId) ?? null;
  const existingPlanMeals: ExistingPlanMeal[] = (sourcePlan?.meals ?? []).map((meal) => ({
    name: meal.name,
    items: meal.items.map((item) => ({ food: item.food, quantity: item.quantity ?? null, food_ref_id: item.food_ref_id ?? null, quantity_locked: item.quantity_locked ?? null, substitutions_locked: item.substitutions_locked ?? null })),
  }));

  const [step, setStep] = useState<WizardStep>(eligiblePreviousPlans.length ? "source" : "context");
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  const [context, setContext] = useState<DraftContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState("");
  const [generationReadiness, setGenerationReadiness] = useState<DraftGenerationReadiness | null>(null);
  const [readinessBlockingLabels, setReadinessBlockingLabels] = useState<string[]>([]);
  const [quickObjective, setQuickObjective] = useState("");
  const [quickRoutine, setQuickRoutine] = useState("");
  const [quickAllergies, setQuickAllergies] = useState("");
  const [quickWeight, setQuickWeight] = useState("");
  const [quickHeight, setQuickHeight] = useState("");
  const [savingQuickFacts, setSavingQuickFacts] = useState(false);
  const [quickFactsError, setQuickFactsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setContextLoading(true);
    fetch(`/api/admin/clients/${clientId}/meal-plans/draft/context`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Não foi possível carregar o contexto do paciente.")))
      .then((data: DraftContext) => { if (!cancelled) setContext(data); })
      .catch((cause) => { if (!cancelled) setContextError(cause instanceof Error ? cause.message : "Falha ao carregar contexto."); })
      .finally(() => { if (!cancelled) setContextLoading(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  // Reutiliza o gate determinístico do Workspace; sem análise carregada,
  // não dispara IA. O editor manual permanece disponível fora deste wizard.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/clients/${clientId}/meal-plans/clinical-copilot`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("readiness unavailable")))
      .then((data: { generationReadiness?: DraftGenerationReadiness; blockingFacts?: Array<{ label?: string }> }) => {
        if (cancelled) return;
        setGenerationReadiness(data.generationReadiness ?? "NOT_READY");
        setReadinessBlockingLabels((data.blockingFacts ?? []).map((fact) => fact.label).filter((label): label is string => Boolean(label)));
      })
      .catch(() => { if (!cancelled) setGenerationReadiness("NOT_READY"); });
    return () => { cancelled = true; };
  }, [clientId]);

  const requiresQuickFact = (label: string) => readinessBlockingLabels.includes(label);
  const canSaveQuickFacts = (!requiresQuickFact("Objetivo") || Boolean(quickObjective.trim()))
    && (!requiresQuickFact("Rotina") || Boolean(quickRoutine.trim()))
    && (!requiresQuickFact("Alergias") || Boolean(quickAllergies.trim()))
    && (!requiresQuickFact("Peso atual") || Boolean(quickWeight.trim()))
    && (!requiresQuickFact("Altura") || Boolean(quickHeight.trim()));

  async function saveQuickFacts() {
    if (!canSaveQuickFacts) return;
    setSavingQuickFacts(true);
    setQuickFactsError("");
    try {
      const recordResponse = await fetch(`/api/admin/clients/${clientId}/nutrition-record`, { cache: "no-store" });
      const record = await recordResponse.json();
      if (!recordResponse.ok) throw new Error(record.message ?? "Não foi possível abrir o prontuário.");
      const patch: Record<string, unknown> = { expectedVersion: record.version, reason: "Informações essenciais preenchidas no assistente de plano alimentar" };
      if (requiresQuickFact("Objetivo")) patch.goals = quickObjective.trim();
      if (requiresQuickFact("Rotina")) patch.eating_routine = quickRoutine.trim();
      if (requiresQuickFact("Alergias")) patch.allergies = quickAllergies.trim();
      if (requiresQuickFact("Peso atual")) patch.current_weight_kg = quickWeight.trim();
      if (requiresQuickFact("Altura")) patch.height_cm = quickHeight.trim();
      const response = await fetch(`/api/admin/clients/${clientId}/nutrition-record`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível salvar as informações.");
      const [nextContextResponse, readinessResponse] = await Promise.all([fetch(`/api/admin/clients/${clientId}/meal-plans/draft/context`, { cache: "no-store" }), fetch(`/api/admin/clients/${clientId}/meal-plans/clinical-copilot`, { cache: "no-store" })]);
      if (nextContextResponse.ok) setContext(await nextContextResponse.json());
      if (readinessResponse.ok) {
        const readiness = await readinessResponse.json();
        setGenerationReadiness(readiness.generationReadiness ?? "NOT_READY");
        setReadinessBlockingLabels((readiness.blockingFacts ?? []).map((fact: { label?: string }) => fact.label).filter((label: unknown): label is string => typeof label === "string"));
      }
    } catch (cause) {
      setQuickFactsError(cause instanceof Error ? cause.message : "Não foi possível salvar as informações.");
    } finally {
      setSavingQuickFacts(false);
    }
  }

  const [objectiveGroup, setObjectiveGroup] = useState<ProtocolTemplateTargetGroup>(defaultTargetGroup);
  const [targetEnergyKcal, setTargetEnergyKcal] = useState("");
  const [targetProteinG, setTargetProteinG] = useState("");
  const [targetCarbohydrateG, setTargetCarbohydrateG] = useState("");
  const [targetFatG, setTargetFatG] = useState("");

  useEffect(() => {
    if (context?.activePlan?.targetEnergyKcal) setTargetEnergyKcal(String(context.activePlan.targetEnergyKcal));
  }, [context]);

  const target = {
    targetEnergyKcal: parseOptionalNumber(targetEnergyKcal),
    targetProteinG: parseOptionalNumber(targetProteinG),
    targetCarbohydrateG: parseOptionalNumber(targetCarbohydrateG),
    targetFatG: parseOptionalNumber(targetFatG),
  };

  const [selectedMeals, setSelectedMeals] = useState<Set<MealKey>>(new Set(DEFAULT_SELECTED_MEALS));
  const [mealTimes, setMealTimes] = useState<Record<MealKey, string>>({} as Record<MealKey, string>);

  const [prioritizeFoods, setPrioritizeFoods] = useState("");
  const [avoidFoods, setAvoidFoods] = useState("");
  // Food-First Meal Plan V1: refeições simples (alimentos individuais) são
  // o padrão — receita é um recurso opcional que a nutricionista liga
  // deliberadamente, nunca o comportamento automático do gerador.
  const [useRecipes, setUseRecipes] = useState(false);
  /** R5.1 (seção 4) — opt-in explícito: sem marcar, o Copilot continua gerando só SIMPLE (comportamento anterior, sem regressão). */
  const [allowFlexibleStructure, setAllowFlexibleStructure] = useState(false);

  const [generateError, setGenerateError] = useState("");
  const [generateErrorReason, setGenerateErrorReason] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftResult | null>(null);

  const [refineInput, setRefineInput] = useState("");
  const [refineCount, setRefineCount] = useState(0);
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState("");

  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState("");
  const [optimizerSummary, setOptimizerSummary] = useState<OptimizerSummary | null>(null);
  const [showAdjustments, setShowAdjustments] = useState(false);
  // Snapshot pra "Desfazer otimização" (seção 24) — só o draft/nutrition/critic de ANTES da última chamada ao optimizer.
  const [preOptimizeDraft, setPreOptimizeDraft] = useState<DraftResult | null>(null);
  const [optimizingMealKey, setOptimizingMealKey] = useState<MealKey | null>(null);
  const [regeneratingMealKey, setRegeneratingMealKey] = useState<MealKey | null>(null);
  const [regenerateError, setRegenerateError] = useState("");
  const [recalculating, setRecalculating] = useState(false);
  const [applyingRecipeId, setApplyingRecipeId] = useState<string | null>(null);

  // Substituições sugeridas dentro do wizard (seção 2 do pedido de
  // fechamento de gaps) — nunca persistidas aqui; só entram no plano de
  // verdade via "Aplicar ao editor" -> "Salvar", exatamente como o resto do
  // draft. `mealKey` guarda a que refeição pertence (o editor não usa isso,
  // só o wizard pra agrupar a UI); descartado ao montar o payload de onApply.
  const [substitutionSuggestions, setSubstitutionSuggestions] = useState<(ItemSubstitution & { mealKey: MealKey })[]>([]);
  const [suggestingSubstitutionsMealKey, setSuggestingSubstitutionsMealKey] = useState<MealKey | null>(null);
  const [suggestingItemKey, setSuggestingItemKey] = useState<string | null>(null);
  const [substitutionError, setSubstitutionError] = useState("");

  // Food-First Meal Plan V1, Fase 2/3 — sugestão de receita OPCIONAL por
  // refeição. Nunca altera os alimentos sozinha: só populada por
  // suggestRecipeForMeal, só some ao aceitar/rejeitar explicitamente. Chave
  // é mealKey — no máximo uma sugestão pendente por refeição por vez.
  const [recipeSuggestions, setRecipeSuggestions] = useState<Record<string, MealRecipeSuggestion>>({});
  const [suggestingRecipeMealKey, setSuggestingRecipeMealKey] = useState<MealKey | null>(null);
  const [recipeDetailsOpen, setRecipeDetailsOpen] = useState<Record<string, boolean>>({});

  const [applying, setApplying] = useState(false);

  // "source" só existe de verdade quando há plano anterior elegível — sem
  // isso, o wizard nunca mostra/reserva espaço pra uma etapa vazia.
  const activeStepOrder = eligiblePreviousPlans.length ? STEP_ORDER : STEP_ORDER.filter((entry) => entry !== "source");
  const stepIndex = activeStepOrder.indexOf(step);
  const requestedMeals = Array.from(selectedMeals).map((key) => ({ key, suggestedTime: mealTimes[key]?.trim() || null }));

  // R5 (seção 27) — refeições da fonte atual (nova ou plano anterior) que o
  // Copilot pode oferecer pra seleção; bloqueadas nunca aparecem marcáveis.
  const mealKeyOptions = selectableMealKeys(sourceMode === "previous" ? existingPlanMeals : [], [...MEAL_KEYS]);

  function toggleMeal(key: MealKey) {
    // R5 (seção 27) — nunca permite marcar uma refeição bloqueada pra
    // regeneração, mesmo por um clique direto no checkbox (defesa em
    // profundidade além do atributo `disabled`).
    if (sourceMode === "previous" && mealKeyOptions.find((option) => option.key === key)?.locked) return;
    setSelectedMeals((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // R5 — ao entrar em "modo plano anterior", nunca deixa uma refeição
  // bloqueada pré-selecionada (mesmo que estivesse nos padrões de "criar
  // novo"): garante a exclusão real, não só visual.
  useEffect(() => {
    if (sourceMode !== "previous") return;
    setSelectedMeals((current) => {
      const lockedKeys = new Set(mealKeyOptions.filter((option) => option.locked).map((option) => option.key));
      if (![...current].some((key) => lockedKeys.has(key))) return current;
      const next = new Set(current);
      lockedKeys.forEach((key) => next.delete(key));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode, sourcePlanId]);

  // R5 (seções 42/43) — idempotência/segurança contra resposta obsoleta:
  // um contador de geração garante que (a) um duplo clique nunca dispara
  // duas chamadas simultâneas de verdade, e (b) se o wizard for fechado e
  // reaberto (ou o paciente/rascunho mudar) antes de uma geração em
  // andamento terminar, a resposta antiga nunca sobrescreve o estado mais
  // novo — só o resultado da chamada MAIS recente é aplicado.
  const generationRequestRef = useRef(0);
  const generationInFlightRef = useRef(false);
  // R6.5.3 (seção 89) — o wizard não tinha nenhum tratamento de teclado antes
  // desta fase (só fechava pelo botão "x"/"Cancelar"); Escape + Tab-trap
  // agora reaproveitam o mesmo hook já usado pelo drawer de trocas e pela
  // biblioteca de reuso.
  const wizardContainerRef = useRef<HTMLElement | null>(null);
  useDialogKeyboard(wizardContainerRef, onClose, true);

  // Objetivo/meta/refeições/horários/preferências ficam no state do
  // próprio componente — um retry (ou o botão "Gerar refeição por
  // refeição") nunca perde esses valores, só repete a chamada (seção 21 do
  // pedido de robustez: "preservar o wizard").
  async function generateDraft(options?: { forceMealByMeal?: boolean }) {
    if (generationInFlightRef.current) return;
    generationInFlightRef.current = true;
    const requestId = ++generationRequestRef.current;
    setStep("generating");
    setGenerateError("");
    setGenerateErrorReason(null);
    try {
      // R5 (seção 24) — em "modo plano anterior", as refeições NÃO
      // selecionadas (mantidas como estão) entram como contexto de
      // variedade pro Copilot, igual ao que `regenerateMealInDraft` já faz
      // internamente — nunca usadas pra decidir o que persistir, só pra
      // evitar repetir os mesmos alimentos.
      const otherMealsContext = sourceMode === "previous"
        ? existingPlanMeals
            .filter((meal) => !selectableMealKeys(existingPlanMeals, [...MEAL_KEYS]).some((option) => option.existingName === meal.name && selectedMeals.has(option.key)))
            .map((meal) => ({
              mealKey: "ceia" as MealKey, // placeholder — só o texto (nome/itens) importa pro prompt de variedade, nunca usado pra casar identidade
              name: meal.name,
              suggested_time: null,
              source_recipe_id: null,
              items: meal.items.map((item) => ({ food: item.food, displayName: item.food, quantity: item.quantity ?? "", unit: "g", food_source: null, food_ref_id: item.food_ref_id ?? null, ai_suggested: true as const })),
              needsReview: [],
            }))
        : undefined;

      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectiveLabel: PROTOCOL_TEMPLATE_GROUP_LABELS[objectiveGroup],
          ...target,
          requestedMeals,
          prioritizeFoods: prioritizeFoods.trim() || null,
          avoidFoods: avoidFoods.trim() || null,
          useRecipes,
          allowFlexibleStructure,
          forceMealByMeal: options?.forceMealByMeal ?? false,
          ...(otherMealsContext?.length ? { otherMealsContext } : {}),
        }),
      });
      const data = await response.json();
      if (requestId !== generationRequestRef.current) return; // resposta obsoleta — descartada silenciosamente
      if (!response.ok) {
        setGenerateErrorReason(typeof data.reason === "string" ? data.reason : null);
        throw new Error(data.message ?? "Não foi possível gerar o pré-plano.");
      }
      setDraft(data);
      setPreOptimizeDraft(null);
      setOptimizerSummary(null);
      setStep("review");
    } catch (cause) {
      if (requestId !== generationRequestRef.current) return;
      setGenerateError(cause instanceof Error ? cause.message : "Não foi possível gerar o pré-plano.");
      setStep("review");
    } finally {
      if (requestId === generationRequestRef.current) generationInFlightRef.current = false;
    }
  }

  async function applyRefinement() {
    if (!draft || !refineInput.trim() || refineCount >= MAX_REFINE_ITERATIONS) return;
    setRefining(true);
    setRefineError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/draft/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: refineInput.trim(), currentMeals: draft.meals, ...target }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível aplicar o ajuste.");
      setDraft(data);
      setPreOptimizeDraft(null);
      setOptimizerSummary(null);
      setRefineCount((count) => count + 1);
      setRefineInput("");
    } catch (cause) {
      setRefineError(cause instanceof Error ? cause.message : "Não foi possível aplicar o ajuste.");
    } finally {
      setRefining(false);
    }
  }

  async function runOptimizer(body: Record<string, unknown>) {
    const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/draft/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "Não foi possível aproximar das metas.");
    return data as { meals: DraftMeal[]; nutrition?: DraftNutrition; critic?: CriticFinding[]; optimizer: { scoreBefore: number; scoreAfter: number; stopReason: string; adjustments: OptimizerAdjustment[] } };
  }

  async function optimizeToTargets() {
    if (!draft) return;
    setOptimizing(true);
    setOptimizeError("");
    try {
      const data = await runOptimizer({ currentMeals: draft.meals, ...target });
      setPreOptimizeDraft(draft);
      setDraft({ meals: data.meals, warnings: draft.warnings, nutrition: data.nutrition, critic: data.critic });
      setOptimizerSummary({ adjustments: data.optimizer.adjustments, scoreBefore: data.optimizer.scoreBefore, scoreAfter: data.optimizer.scoreAfter, stopReason: data.optimizer.stopReason });
      setShowAdjustments(false);
    } catch (cause) {
      setOptimizeError(cause instanceof Error ? cause.message : "Não foi possível aproximar das metas.");
    } finally {
      setOptimizing(false);
    }
  }

  // "Ajustar esta refeição" (seção 26) — reaproveita o MESMO endpoint,
  // bloqueando todas as outras refeições (lockedMealKeys) pra que só a
  // refeição-alvo mude. Usa a meta global (não inventa uma meta por
  // refeição sem a nutricionista configurar distribuição em algum momento).
  async function optimizeMeal(mealKey: MealKey) {
    if (!draft) return;
    setOptimizingMealKey(mealKey);
    setOptimizeError("");
    try {
      const otherMealKeys = draft.meals.map((m) => m.mealKey).filter((k) => k !== mealKey);
      const data = await runOptimizer({ currentMeals: draft.meals, ...target, lockedMealKeys: otherMealKeys });
      setPreOptimizeDraft(draft);
      setDraft({ meals: data.meals, warnings: draft.warnings, nutrition: data.nutrition, critic: data.critic });
      setOptimizerSummary({ adjustments: data.optimizer.adjustments, scoreBefore: data.optimizer.scoreBefore, scoreAfter: data.optimizer.scoreAfter, stopReason: data.optimizer.stopReason });
      setShowAdjustments(false);
    } catch (cause) {
      setOptimizeError(cause instanceof Error ? cause.message : "Não foi possível ajustar esta refeição.");
    } finally {
      setOptimizingMealKey(null);
    }
  }

  function undoOptimize() {
    if (!preOptimizeDraft) return;
    setDraft(preOptimizeDraft);
    setPreOptimizeDraft(null);
    setOptimizerSummary(null);
    setShowAdjustments(false);
  }

  async function regenerateMeal(mealKey: MealKey) {
    if (!draft) return;
    setRegeneratingMealKey(mealKey);
    setRegenerateError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/draft/regenerate-meal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealKey,
          objectiveLabel: PROTOCOL_TEMPLATE_GROUP_LABELS[objectiveGroup],
          requestedMeals,
          prioritizeFoods: prioritizeFoods.trim() || null,
          avoidFoods: avoidFoods.trim() || null,
          useRecipes,
          currentMeals: draft.meals,
          ...target,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível regenerar a refeição.");
      setDraft(data);
      setPreOptimizeDraft(null);
      setOptimizerSummary(null);
    } catch (cause) {
      setRegenerateError(cause instanceof Error ? cause.message : "Não foi possível regenerar a refeição.");
    } finally {
      setRegeneratingMealKey(null);
    }
  }

  // "✨ Sugerir substituições" por refeição (seção 2/3 do pedido de
  // fechamento de gaps) — ação EXPLÍCITA da nutricionista, nunca automática
  // pra todos os alimentos. Fluxo obrigatório por item resolvido: IA sugere
  // nomes (suggest-ai) → resolver identifica source+refId → substitution
  // engine calcula quantidade + score (suggest, mesmo endpoint do editor
  // manual — nunca uma segunda lógica) → some como sugestão PENDENTE aqui,
  // nunca persistida, até a nutricionista aprovar e aplicar ao editor.
  async function suggestSubstitutionsForItems(mealKey: MealKey, items: DraftMealItem[], label: string) {
    if (!draft) return;
    const collected: (ItemSubstitution & { mealKey: MealKey })[] = [];
    for (const item of items) {
      // Nunca sugere pra item sem identidade real, nem pra item com
      // segurança clínica não confirmada (mesma regra do optimizer V2).
      if (!item.food_source || !item.food_ref_id || item.needsSafetyReview) continue;
      const baseGrams = Number(item.quantity.replace(",", "."));
      if (!Number.isFinite(baseGrams) || baseGrams <= 0) continue;

      const aiResponse = await fetch(`/api/admin/clients/${clientId}/meal-plans/substitutions/suggest-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseFoodName: item.displayName }),
      });
      const aiData = await aiResponse.json();
      if (!aiResponse.ok || !Array.isArray(aiData.candidates) || !aiData.candidates.length) continue;

      const suggestResponse = await fetch(`/api/admin/clients/${clientId}/meal-plans/substitutions/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseFoodSource: item.food_source, baseFoodRefId: item.food_ref_id, baseQuantity: baseGrams, mode: "nutritional", candidateQueries: aiData.candidates }),
      });
      const suggestData = await suggestResponse.json();
      if (!suggestResponse.ok) continue;

      for (const result of (suggestData.results ?? []).slice(0, 2)) {
        collected.push({
          mealKey,
          base_food: item.food,
          option_food: result.displayName,
          quantity: String(result.quantityGrams),
          unit: "g",
          base_food_source: item.food_source,
          base_food_ref_id: item.food_ref_id,
          option_food_source: result.foodSource,
          option_food_ref_id: result.foodRefId,
          option_nutrition_snapshot: JSON.stringify(result.nutrition),
          equivalence_mode: result.mode,
          equivalence_score: result.score,
          equivalence_quality: result.quality,
          approved_by_professional: false,
          ai_suggested: true,
        });
      }
    }
    setSubstitutionSuggestions((current) => [...current, ...collected]);
    if (!collected.length) setSubstitutionError(`Nenhuma sugestão de substituição encontrada para "${label}".`);
  }

  async function suggestSubstitutionsForMeal(mealKey: MealKey) {
    if (!draft) return;
    const meal = draft.meals.find((m) => m.mealKey === mealKey);
    if (!meal) return;
    setSuggestingSubstitutionsMealKey(mealKey);
    setSubstitutionError("");
    try {
      await suggestSubstitutionsForItems(mealKey, meal.items, meal.name);
    } catch (cause) {
      setSubstitutionError(cause instanceof Error ? cause.message : "Não foi possível gerar sugestões de substituição.");
    } finally {
      setSuggestingSubstitutionsMealKey(null);
    }
  }

  /** Mesma lógica, mas pra UM alimento só (seção 2 do pedido de fechamento de gaps: "não obrigar geração por refeição inteira"). */
  async function suggestSubstitutionsForItem(mealKey: MealKey, item: DraftMealItem) {
    if (!draft) return;
    const itemKey = `${mealKey}:${item.food_source ?? ""}:${item.food_ref_id ?? ""}`;
    setSuggestingItemKey(itemKey);
    setSubstitutionError("");
    try {
      await suggestSubstitutionsForItems(mealKey, [item], item.displayName);
    } catch (cause) {
      setSubstitutionError(cause instanceof Error ? cause.message : "Não foi possível gerar sugestões de substituição.");
    } finally {
      setSuggestingItemKey(null);
    }
  }

  function approveSubstitutionSuggestion(index: number) {
    setSubstitutionSuggestions((current) => current.map((sub, i) => i === index ? { ...sub, approved_by_professional: true } : sub));
  }

  function rejectSubstitutionSuggestion(index: number) {
    setSubstitutionSuggestions((current) => current.filter((_, i) => i !== index));
  }

  /**
   * Food-First Meal Plan V1, Fase 2 — "✨ Sugerir receita": procura PRIMEIRO
   * (e só) receitas reais cadastradas no Recipe Engine pro grupo da
   * refeição, nunca inventa recipeId. Ranqueia pela mais próxima
   * nutricionalmente da refeição atual (kcal já calculada pela engine real,
   * nunca um número da IA) — só a mais próxima é sugerida, pra não poluir a
   * revisão com opções ruins. Se não houver nenhuma receita cadastrada pro
   * grupo, marca "none" (nunca finge que existe).
   */
  async function suggestRecipeForMeal(mealIndex: number) {
    if (!draft) return;
    const meal = draft.meals[mealIndex];
    setSuggestingRecipeMealKey(meal.mealKey);
    try {
      const group = MEAL_KEY_TO_RECIPE_GROUP[meal.mealKey];
      const response = await fetch(`/api/admin/recipes?meal_group=${group}`);
      if (!response.ok) return;
      const { items } = (await response.json()) as { items: RecipeCandidate[] };
      const mealNutrition = draft.nutrition?.perMeal[mealIndex];
      const targetKcal = mealNutrition?.energyKcal ?? null;
      const ranked = targetKcal !== null
        ? [...items].sort((a, b) => Math.abs(a.per_portion_kcal - targetKcal) - Math.abs(b.per_portion_kcal - targetKcal))
        : items;
      setRecipeSuggestions((current) => ({
        ...current,
        [meal.mealKey]: {
          status: ranked.length ? "suggested" : "none",
          recipe: ranked[0] ?? null,
          mealKcalAtSuggestionTime: mealNutrition?.energyKcal ?? null,
          mealProteinAtSuggestionTime: mealNutrition?.proteinG ?? null,
          mealCarbsAtSuggestionTime: mealNutrition?.carbohydrateG ?? null,
          mealFatAtSuggestionTime: mealNutrition?.fatG ?? null,
        },
      }));
    } finally {
      setSuggestingRecipeMealKey(null);
    }
  }

  /**
   * "Usar receita" (Fase 4) — semântica escolhida: SUBSTITUI os itens atuais
   * da refeição pelos ingredientes reais da receita (escalados a 1 porção)
   * e vinculam meal.source_recipe_id — nunca soma aos itens existentes
   * (elimina dupla contagem por construção, nunca por checagem a
   * posteriori). Ação explícita só desta refeição; nenhuma outra refeição é
   * tocada. Nutrição recalculada pela MESMA engine de sempre.
   */
  function applyRecipeToMeal(mealIndex: number) {
    if (!draft) return;
    const meal = draft.meals[mealIndex];
    const suggestion = recipeSuggestions[meal.mealKey];
    if (!suggestion?.recipe) return;
    const newItems = expandRecipeIngredientsToItems(suggestion.recipe);
    if (!newItems.length) return;
    const nextMeals = draft.meals.map((m, index) => index !== mealIndex ? m : { ...m, items: newItems, source_recipe_id: suggestion.recipe!.id });
    void recalculate(nextMeals);
    setRecipeSuggestions((current) => {
      const next = { ...current };
      delete next[meal.mealKey];
      return next;
    });
    setRecipeDetailsOpen((current) => ({ ...current, [meal.mealKey]: false }));
  }

  /** "Manter alimentos" — descarta a sugestão sem tocar em nada da refeição (REJECTED). */
  function dismissRecipeSuggestion(mealKey: MealKey) {
    setRecipeSuggestions((current) => {
      const next = { ...current };
      delete next[mealKey];
      return next;
    });
    setRecipeDetailsOpen((current) => ({ ...current, [mealKey]: false }));
  }

  function toggleRecipeDetails(mealKey: MealKey) {
    setRecipeDetailsOpen((current) => ({ ...current, [mealKey]: !current[mealKey] }));
  }

  async function recalculate(nextMeals: DraftMeal[]) {
    if (!draft) return;
    setRecalculating(true);
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/draft/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentMeals: nextMeals, ...target }),
      });
      const data = await response.json();
      if (response.ok) setDraft({ meals: nextMeals, warnings: draft.warnings, nutrition: data.nutrition, critic: data.critic });
      else setDraft({ ...draft, meals: nextMeals });
    } finally {
      setRecalculating(false);
    }
  }

  function pickCandidate(mealIndex: number, reviewIndex: number, candidate: DraftNeedsReviewCandidate, remember = false) {
    if (!draft) return;
    const review = draft.meals[mealIndex].needsReview[reviewIndex];
    const newItem: DraftMealItem = {
      food: candidate.name,
      displayName: candidate.displayName,
      quantity: review.quantity,
      unit: review.unit,
      food_source: candidate.ref.source === "CUSTOM" || candidate.ref.source === "MANUFACTURER" || candidate.ref.source === "USDA" ? candidate.ref.source : "TACO",
      food_ref_id: candidate.ref.sourceId,
      ai_suggested: true,
    };
    const nextMeals = draft.meals.map((meal, index) => index !== mealIndex ? meal : {
      ...placeResolvedReviewItem(meal, review, newItem),
      needsReview: meal.needsReview.filter((_, index2) => index2 !== reviewIndex),
    });
    void recalculate(nextMeals);
    // "Selecionar e lembrar" (Food Terminology V1, seção 8) — preferência
    // pessoal da nutricionista, nunca um alias global; falha aqui não deve
    // travar a escolha já aplicada acima (best-effort, não bloqueante).
    if (remember) {
      void fetch("/api/admin/food-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: review.query,
          foodSource: candidate.ref.source,
          foodRefId: candidate.ref.sourceId,
          foodNameSnapshot: candidate.displayName,
        }),
      }).catch(() => undefined);
    }
  }

  /**
   * Food Preparation Engine V1 (seção 7/19) — expande os ingredientes REAIS
   * de uma receita cadastrada no lugar de um preparo composto sem
   * referência direta (ex.: "ovo mexido"). Nunca calcula nada aqui: busca a
   * receita real (mesma API do Recipe Engine), escala pra 1 porção (mesmo
   * helper já usado pelo draft agent pra refeições baseadas em receita) e
   * deixa a nutrition engine recalcular a partir dos ingredientes com
   * source+refId reais — a preparação em si nunca fornece kcal.
   */
  async function pickPreparationRecipe(mealIndex: number, reviewIndex: number, recipeCandidate: DraftNeedsReviewRecipeCandidate) {
    if (!draft) return;
    setApplyingRecipeId(recipeCandidate.id);
    try {
      const response = await fetch(`/api/admin/recipes/${recipeCandidate.id}`);
      if (!response.ok) return;
      const recipe = (await response.json()) as { servings: number; ingredients: RecipeIngredientPayload[] };
      const newItems = expandRecipeIngredientsToItems(recipe);
      if (!newItems.length) return;
      const nextMeals = draft.meals.map((meal, index) => index !== mealIndex ? meal : {
        ...meal,
        items: [...meal.items, ...newItems],
        needsReview: meal.needsReview.filter((_, index2) => index2 !== reviewIndex),
      });
      void recalculate(nextMeals);
    } finally {
      setApplyingRecipeId(null);
    }
  }

  function removeNeedsReview(mealIndex: number, reviewIndex: number) {
    if (!draft) return;
    const nextMeals = draft.meals.map((meal, index) => index !== mealIndex ? meal : { ...meal, needsReview: meal.needsReview.filter((_, index2) => index2 !== reviewIndex) });
    void recalculate(nextMeals);
  }

  /**
   * R5.1 (seção 18) — resolve/remove um item de revisão ANINHADO (dentro de
   * uma option de OPTIONS ou de um choice_group de COMBINATION) substituindo
   * só a entrada exata correspondente — nunca reconstrói a refeição inteira
   * nem afeta as outras options/grupos.
   */
  function nestedScopeItems(meal: DraftMeal, scope: "options" | "choice_groups", scopeIndex: number): { items: DraftMealItem[]; needsReview: DraftNeedsReview[] } {
    const entry = scope === "options" ? meal.options?.[scopeIndex] : meal.choice_groups?.[scopeIndex];
    return { items: entry?.items ?? [], needsReview: entry?.needsReview ?? [] };
  }

  function replaceNestedScope(meal: DraftMeal, scope: "options" | "choice_groups", scopeIndex: number, next: { items: DraftMealItem[]; needsReview: DraftNeedsReview[] }): DraftMeal {
    if (scope === "options") {
      return { ...meal, options: (meal.options ?? []).map((option, index) => index !== scopeIndex ? option : { ...option, ...next }) };
    }
    return { ...meal, choice_groups: (meal.choice_groups ?? []).map((group, index) => index !== scopeIndex ? group : { ...group, ...next }) };
  }

  function pickCandidateNested(mealIndex: number, scope: "options" | "choice_groups", scopeIndex: number, reviewIndex: number, candidate: DraftNeedsReviewCandidate, remember = false) {
    if (!draft) return;
    const meal = draft.meals[mealIndex];
    const { items, needsReview } = nestedScopeItems(meal, scope, scopeIndex);
    const review = needsReview[reviewIndex];
    if (!review) return;
    const newItem: DraftMealItem = {
      food: candidate.name,
      displayName: candidate.displayName,
      quantity: review.quantity,
      unit: review.unit,
      food_source: candidate.ref.source === "CUSTOM" || candidate.ref.source === "MANUFACTURER" || candidate.ref.source === "USDA" ? candidate.ref.source : "TACO",
      food_ref_id: candidate.ref.sourceId,
      ai_suggested: true,
    };
    const nextMeals = draft.meals.map((m, index) => index !== mealIndex ? m : replaceNestedScope(m, scope, scopeIndex, {
      items: [...items, newItem],
      needsReview: needsReview.filter((_, index2) => index2 !== reviewIndex),
    }));
    void recalculate(nextMeals);
    if (remember) {
      void fetch("/api/admin/food-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: review.query, foodSource: candidate.ref.source, foodRefId: candidate.ref.sourceId, foodNameSnapshot: candidate.displayName }),
      }).catch(() => undefined);
    }
  }

  function removeNeedsReviewNested(mealIndex: number, scope: "options" | "choice_groups", scopeIndex: number, reviewIndex: number) {
    if (!draft) return;
    const meal = draft.meals[mealIndex];
    const { items, needsReview } = nestedScopeItems(meal, scope, scopeIndex);
    const nextMeals = draft.meals.map((m, index) => index !== mealIndex ? m : replaceNestedScope(m, scope, scopeIndex, { items, needsReview: needsReview.filter((_, index2) => index2 !== reviewIndex) }));
    void recalculate(nextMeals);
  }

  async function handleApply() {
    if (!draft || !draft.meals.length || totalNeedsReview > 0) return;
    setApplying(true);
    try {
      const approvedSubstitutions = substitutionSuggestions
        .filter((sub) => sub.approved_by_professional)
        .map(({ mealKey: _mealKey, ...rest }) => rest);
      if (sourceMode === "previous" && sourcePlan && onApplyChangeset) {
        // R5 (seções 24/30) — nunca troca o plano inteiro: mescla só as
        // refeições regeneradas sobre um clone do plano de origem.
        const regeneratedKeys = draft.meals.map((meal) => meal.mealKey);
        const merged = mergeChangesetIntoMeals<Meal, DraftMeal, Meal>(
          sourcePlan.meals,
          draft.meals,
          regeneratedKeys,
          draftMealToEditorMeal,
          (meal) => meal
        );
        await onApplyChangeset(sourcePlan.id, merged);
      } else {
        await onApply(objectiveGroup, draft.meals.map(draftMealToEditorMeal), approvedSubstitutions);
      }
      onClose();
    } finally {
      setApplying(false);
    }
  }

  // "meals" só exige ter escolhido ao menos uma refeição — a pendência
  // clínica (generationReadiness) só pode bloquear a GERAÇÃO em si
  // (step "preferences"), nunca a navegação de etapas antes dela; senão um
  // paciente com dados incompletos nunca alcança a etapa que explica o que
  // falta ("Completar informações").
  const canProceedFromMeals = selectedMeals.size > 0;
  const canGenerate = canProceedFromMeals && generationReadiness !== "NOT_READY";
  // R5 (seções 25/26/29) — changeset SÓ pra exibição/preview: nunca decide
  // sozinho o que aplicar, só resume o que o Copilot está propondo em cima
  // do plano de origem antes da nutricionista confirmar.
  const changeset: MealPlanChangeset | null = sourceMode === "previous" && draft
    ? computeMealPlanChangeset(existingPlanMeals, draft.meals, draft.meals.map((meal) => meal.mealKey))
    : null;
  // R5.1 (seção 30) — contadores incluem itens nested (dentro de OPTIONS/COMBINATION), nunca só o nível de refeição.
  const totalNeedsReview = draft?.meals.reduce((sum, meal) => sum
    + meal.needsReview.length
    + (meal.options ?? []).reduce((s, option) => s + option.needsReview.length, 0)
    + (meal.choice_groups ?? []).reduce((s, group) => s + group.needsReview.length, 0), 0) ?? 0;
  // R6.5.4 (seção 59) — chips de resumo da revisão, usando contadores REAIS já
  // computados (totalNeedsReview, unresolvedCount) — nenhuma telemetria nova.
  const totalItemsInDraft = draft?.meals.reduce((sum, meal) => sum
    + meal.items.length
    + (meal.options ?? []).reduce((s, option) => s + option.items.length, 0)
    + (meal.choice_groups ?? []).reduce((s, group) => s + group.items.length, 0), 0) ?? 0;
  const unresolvedCount = draft?.nutrition?.unresolvedCount ?? 0;
  // needsReview vive numa lista SEPARADA (nunca dentro de .items — só vira item
  // de verdade depois de resolvido manualmente), então totalItemsInDraft já
  // exclui esses; só precisa descontar unresolved (que ENTRA em .items, sem
  // cálculo, ver texto "item(ns) sem correspondência entram como quantidade
  // sem cálculo" logo abaixo).
  const resolvedCount = Math.max(0, totalItemsInDraft - unresolvedCount);
  const hasEnergyTarget = target.targetEnergyKcal !== null;

  const modal = (
    <div role="dialog" aria-modal="true" aria-labelledby="ai-wizard-title" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <section ref={wizardContainerRef} className="flex h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)] sm:h-auto sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EDE1D6] px-5 py-4">
          <div>
            <p className="brand-kicker flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Assistente guiado</p>
            <h2 id="ai-wizard-title" className="font-serif text-2xl font-semibold text-[#3A3028]">Criar plano com IA</h2>
            <p className="mt-1 text-xs text-[#8C6E52]">Etapa {Math.min(stepIndex + 1, activeStepOrder.length - 1)} de {activeStepOrder.length - 1} · {STEP_LABELS[step]}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
          {step === "source" && (
            <div className="space-y-4">
              <p className="text-sm text-[#75675E]">Este paciente já tem plano(s) cadastrado(s). Como você quer começar?</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSourceMode("new")}
                  className={`rounded-xl border p-4 text-left transition ${sourceMode === "new" ? "border-[#7A9A74] bg-[#F5FAF0]" : "border-[#EAD8C2] bg-[#FFFDFC] hover:bg-[#FBF7F1]"}`}
                >
                  <p className="text-sm font-semibold text-[#3A3028]">Criar novo</p>
                  <p className="mt-1 text-xs text-[#75675E]">O Copilot propõe uma estrutura do zero.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode("previous")}
                  className={`rounded-xl border p-4 text-left transition ${sourceMode === "previous" ? "border-[#7A9A74] bg-[#F5FAF0]" : "border-[#EAD8C2] bg-[#FFFDFC] hover:bg-[#FBF7F1]"}`}
                >
                  <p className="text-sm font-semibold text-[#3A3028]">Usar plano anterior como base</p>
                  <p className="mt-1 text-xs text-[#75675E]">O Copilot propõe mudanças sobre um plano já existente — refeições bloqueadas nunca são alteradas.</p>
                </button>
              </div>
              {sourceMode === "previous" && (
                <div>
                  <label className="brand-label" htmlFor="wizard-source-plan">Qual plano usar como base?</label>
                  <select id="wizard-source-plan" value={sourcePlanId} onChange={(event) => setSourcePlanId(event.target.value)} className="brand-input">
                    {eligiblePreviousPlans.map((item) => (
                      <option key={item.id} value={item.id}>{item.title} ({item.status === "active" ? "Ativo" : "Rascunho"})</option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-[#8C6E52]">O plano original nunca é alterado — a proposta vira um novo rascunho independente.</p>
                </div>
              )}
            </div>
          )}

          {step === "context" && (
            <div className="space-y-4">
              <p className="text-sm text-[#75675E]">Vou usar os dados clínicos já cadastrados e perguntar só o que faltar. Confira se o contexto abaixo está correto.</p>
              {contextLoading && <p className="text-sm text-[#8C6E52]">Carregando contexto do paciente...</p>}
              {contextError && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{contextError}</p>}
              {context && !contextLoading && (() => {
                const readiness = computeMealPlanReadiness({
                  ageYears: context.ageYears,
                  weightKg: context.weightKg,
                  heightDisplay: context.heightDisplay,
                  goals: context.goals,
                  allergies: context.allergies,
                  restrictions: context.restrictions,
                });
                // R6.5.4 (seções 56-57) — badge de prontidão com texto+ícone (nunca só cor)
                // pros 3 estados reais do motor; antes desta fase o estado READY não mostrava
                // NADA (early-return null), sem confirmação visual nenhuma.
                const isBlocking = readiness.status === "NOT_READY";
                const readinessBadge = readiness.status === "READY"
                  ? { text: "Pronto", className: "border-[#D9E4D3] bg-[#F5FAF0] text-[#4F7D45]", Icon: Check }
                  : readiness.status === "READY_WITH_REVIEW"
                    ? { text: "Pronto com revisão", className: "border-[#F0D4C7] bg-[#FFF7F3] text-[#8C5F50]", Icon: AlertTriangle }
                    : { text: "Faltam informações", className: "border-red-200 bg-red-50 text-red-700", Icon: AlertTriangle };
                return (
                  <div className="space-y-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${readinessBadge.className}`}>
                      <readinessBadge.Icon className="h-3.5 w-3.5" /> {readinessBadge.text}
                    </span>
                    {readiness.status !== "READY" && (
                      <div className={`rounded-xl border p-3 text-xs leading-5 ${isBlocking ? "border-red-200 bg-red-50 text-red-700" : "border-[#F0D4C7] bg-[#FFF7F3] text-[#8C5F50]"}`}>
                        <p className="font-semibold">{readiness.reasons[0]}</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                          {readiness.reasons.slice(isBlocking ? 1 : 0).map((reason, index) => <li key={index}>{reason}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
              {context && (
                <div className="rounded-xl border border-[#EAD8C2] bg-[#FAF7F2] p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[#A8927D]">Dados considerados</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                    <ContextField label="Idade" value={context.ageYears !== null ? `${context.ageYears} anos` : null} />
                    <ContextField label="Sexo biológico" value={context.biologicalSex} />
                    <ContextField label="Peso" value={context.weightKg ? `${context.weightKg} kg` : null} />
                    <ContextField label="Altura" value={context.heightDisplay} />
                    <ContextField label="IMC" value={context.bmi} />
                    <ContextField label="Fase do cuidado" value={context.lifeStage} />
                  </div>
                  {(context.allergies || context.restrictions) && (
                    <div className="mt-3 rounded-lg border border-[#F0D4C7] bg-[#FFF7F3] p-3 text-xs text-[#8C5F50]">
                      {context.allergies && <p><strong>Alergias:</strong> {context.allergies}</p>}
                      {context.restrictions && <p><strong>Restrições:</strong> {context.restrictions}</p>}
                    </div>
                  )}
                  {context.clinicalMarkers.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-[#A8927D]">Marcadores clínicos ativos</p>
                      <div className="flex flex-wrap gap-1.5">
                        {context.clinicalMarkers.map((marker, index) => (
                          <span key={index} className="rounded-full bg-[#EAD8C2] px-2.5 py-1 text-[10px] font-semibold text-[#8C6E52]">{marker.label}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!context.weightKg && !context.heightDisplay && !context.lifeStage && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-[#B5762F]"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Nenhum dado antropométrico cadastrado — o pré-plano será proposto sem essa referência.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === "goals" && (
            <div className="space-y-4">
              <div>
                <label className="brand-label">Qual objetivo deste plano?</label>
                <select value={objectiveGroup} onChange={(event) => setObjectiveGroup(event.target.value as ProtocolTemplateTargetGroup)} className="brand-input">
                  {PROTOCOL_TEMPLATE_TARGET_GROUPS.map((group) => <option key={group} value={group}>{PROTOCOL_TEMPLATE_GROUP_LABELS[group]}</option>)}
                </select>
              </div>
              <div>
                <p className="brand-label mb-2">Meta nutricional (opcional — o sistema não calcula TDEE sozinho; se não informar, a IA propõe uma estrutura equilibrada sem se ancorar em um número)</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <TargetInput id="wizard-target-kcal" label="Energia (kcal)" value={targetEnergyKcal} onChange={setTargetEnergyKcal} />
                  <TargetInput id="wizard-target-protein" label="Proteína (g)" value={targetProteinG} onChange={setTargetProteinG} />
                  <TargetInput id="wizard-target-carb" label="Carboidrato (g)" value={targetCarbohydrateG} onChange={setTargetCarbohydrateG} />
                  <TargetInput id="wizard-target-fat" label="Gordura (g)" value={targetFatG} onChange={setTargetFatG} />
                </div>
                {!targetEnergyKcal && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-[#B5762F]"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Meta energética ainda não definida — você pode prosseguir sem ela ou definir agora.</p>
                )}
              </div>
            </div>
          )}

          {step === "meals" && (
            <div className="space-y-4">
              <p className="brand-label">{sourceMode === "previous" ? "Quais refeições o Copilot deve (re)propor?" : "Quais refeições este plano deve ter?"}</p>
              {sourceMode === "previous" && <p className="text-xs text-[#8C6E52]">Refeições bloqueadas (🔒) já têm um item com quantidade ou trocas travadas no plano de origem — o Copilot nunca altera essas.</p>}
              <div className="space-y-2">
                {mealKeyOptions.map(({ key, locked, existingName }) => (
                  <div key={key} className={`flex items-center gap-3 rounded-xl border p-3 ${locked ? "border-[#EAD8C2] bg-[#FAF7F2] opacity-60" : "border-[#EAD8C2] bg-[#FFFDFC]"}`}>
                    <input
                      type="checkbox"
                      id={`meal-toggle-${key}`}
                      checked={selectedMeals.has(key)}
                      onChange={() => toggleMeal(key)}
                      disabled={locked}
                      className="h-4 w-4 accent-[#7A9A74]"
                    />
                    <label htmlFor={`meal-toggle-${key}`} className="flex-1 text-sm font-semibold text-[#3A3028]">
                      {MEAL_KEY_LABELS[key]}
                      {existingName && existingName !== MEAL_KEY_LABELS[key] && <span className="ml-1.5 font-normal text-[#8C6E52]">({existingName})</span>}
                      {locked && <span className="ml-1.5" aria-label="Bloqueada pelo profissional" title="Bloqueada pelo profissional">🔒</span>}
                    </label>
                    <input
                      type="time"
                      value={mealTimes[key] ?? ""}
                      onChange={(event) => setMealTimes((current) => ({ ...current, [key]: event.target.value }))}
                      disabled={!selectedMeals.has(key) || locked}
                      className="brand-input h-9 w-28 disabled:opacity-40"
                      aria-label={`Horário de ${MEAL_KEY_LABELS[key]}`}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#8C6E52]">Horário é opcional — deixe em branco se não quiser definir agora.</p>
            </div>
          )}

          {step === "preferences" && (
            <div className="space-y-4">
              {generationReadiness === "NOT_READY" && (
                <div className="rounded-xl border border-[#F0D4C7] bg-[#FFF7F3] p-3 text-sm text-[#8C5F50]">
                  <p className="font-semibold">Complete as informações essenciais antes de gerar o rascunho.</p>
                  {readinessBlockingLabels.length > 0 && <p className="mt-1 text-xs">Pendências: {readinessBlockingLabels.join(", ")}.</p>}
                </div>
              )}
              {generationReadiness === "NOT_READY" && (
                <section className="rounded-xl border border-[#EAD8C2] bg-[#FFFDFC] p-4">
                  <div><p className="brand-kicker">Completar agora</p><h3 className="mt-1 font-semibold text-[#3A3028]">Dados mínimos para uma proposta segura</h3><p className="mt-1 text-xs leading-5 text-[#75675E]">Essas informações serão registradas no prontuário e usadas somente depois da sua confirmação.</p></div>
                  <div className="mt-4 space-y-3">
                    {(requiresQuickFact("Peso atual") || requiresQuickFact("Altura")) && <div className="grid gap-3 sm:grid-cols-2">{requiresQuickFact("Peso atual") && <label className="block text-xs font-semibold text-[#75675E]">Peso atual (kg)<input value={quickWeight} onChange={(event) => setQuickWeight(event.target.value)} inputMode="decimal" className="brand-input mt-1" placeholder="Ex.: 68,5" /></label>}{requiresQuickFact("Altura") && <label className="block text-xs font-semibold text-[#75675E]">Altura (cm)<input value={quickHeight} onChange={(event) => setQuickHeight(event.target.value)} inputMode="decimal" className="brand-input mt-1" placeholder="Ex.: 165" /></label>}</div>}
                    {requiresQuickFact("Objetivo") && <label className="block text-xs font-semibold text-[#75675E]">Objetivo principal<textarea value={quickObjective} onChange={(event) => setQuickObjective(event.target.value)} className="brand-input mt-1 min-h-20 resize-y" placeholder="Ex.: reduzir gordura corporal, melhorar disposição e organizar a rotina alimentar." /></label>}
                    {requiresQuickFact("Rotina") && <label className="block text-xs font-semibold text-[#75675E]">Rotina alimentar e horários<textarea value={quickRoutine} onChange={(event) => setQuickRoutine(event.target.value)} className="brand-input mt-1 min-h-20 resize-y" placeholder="Ex.: acorda às 7h, almoça às 12h, treina no fim da tarde..." /></label>}
                    {requiresQuickFact("Alergias") && <div><label className="block text-xs font-semibold text-[#75675E]" htmlFor="wizard-quick-allergies">Alergias alimentares</label><div className="mt-1 flex flex-col gap-2 sm:flex-row"><input id="wizard-quick-allergies" value={quickAllergies} onChange={(event) => setQuickAllergies(event.target.value)} className="brand-input" placeholder="Descreva as alergias conhecidas" /><button type="button" onClick={() => setQuickAllergies("Sem alergias alimentares conhecidas.")} className="brand-btn-secondary w-full shrink-0 sm:w-auto">Sem alergias</button></div></div>}
                  </div>
                  {quickFactsError && <p className="mt-3 text-xs font-semibold text-red-700">{quickFactsError}</p>}
                </section>
              )}
              {generationReadiness === "READY_WITH_REVIEW" && (
                <div className="rounded-xl border border-[#F0D4C7] bg-[#FFF7F3] p-3 text-sm text-[#8C5F50]">Há dados conflitantes para revisar. O rascunho será uma proposta e exigirá revisão humana.</div>
              )}
              <div>
                <label className="brand-label" htmlFor="wizard-prioritize">Alimentos para priorizar (opcional)</label>
                <input id="wizard-prioritize" value={prioritizeFoods} onChange={(event) => setPrioritizeFoods(event.target.value)} className="brand-input" placeholder="Ex.: arroz, feijão, frango, ovos" />
              </div>
              <div>
                <label className="brand-label" htmlFor="wizard-avoid">Alimentos que a paciente prefere evitar (opcional)</label>
                <input id="wizard-avoid" value={avoidFoods} onChange={(event) => setAvoidFoods(event.target.value)} className="brand-input" placeholder="Ex.: não gosta de peixe" />
                <p className="mt-1 text-xs text-[#8C6E52]">Isso complementa — nunca substitui — restrições clínicas reais já cadastradas.</p>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-[#EAD8C2] bg-[#FFFDFC] p-3">
                <input type="checkbox" id="wizard-use-recipes" checked={useRecipes} onChange={(event) => setUseRecipes(event.target.checked)} className="h-4 w-4 accent-[#7A9A74]" />
                <div>
                  <label htmlFor="wizard-use-recipes" className="text-sm font-semibold text-[#3A3028]">Permitir substituir uma refeição inteira por uma receita cadastrada</label>
                  <p className="mt-0.5 text-xs text-[#8C6E52]">Desligado por padrão — o gerador prioriza alimentos individuais simples (ex.: &ldquo;2 ovos, pão integral, mamão&rdquo;), não pratos elaborados.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-[#EAD8C2] bg-[#FFFDFC] p-3">
                <input type="checkbox" id="wizard-allow-flexible" checked={allowFlexibleStructure} onChange={(event) => setAllowFlexibleStructure(event.target.checked)} className="h-4 w-4 accent-[#7A9A74]" />
                <div>
                  <label htmlFor="wizard-allow-flexible" className="text-sm font-semibold text-[#3A3028]">Permitir estrutura flexível (opções/combinação)</label>
                  <p className="mt-0.5 text-xs text-[#8C6E52]">Desligado por padrão. Quando ligado, o Copilot também pode propor refeições com alternativas completas (ex.: &ldquo;ovos OU iogurte&rdquo;) ou com grupo de escolha (ex.: arroz fixo + escolha de 1 proteína) — a soma nutricional nunca soma alternativas, mostra uma faixa min/máx.</p>
                </div>
              </div>
            </div>
          )}

          {step === "generating" && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#7A9A74]" />
              <p className="text-sm text-[#75675E]">Montando a estrutura do pré-plano com os dados considerados...</p>
              <p className="text-xs text-[#8C6E52]">Pode levar até 1 minuto para planos com várias refeições.</p>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              {generateError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <p>Não conseguimos estruturar o pré-plano nesta tentativa.</p>
                  <p className="mt-1 text-xs text-red-600">Nenhuma alteração foi salva — seus dados (objetivo, meta, refeições, horários, preferências) continuam preenchidos.</p>
                  {process.env.NODE_ENV !== "production" && generateErrorReason && (
                    <p className="mt-1 text-xs text-red-600/70">dev: {generateErrorReason}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void generateDraft()} className="brand-btn-secondary">Tentar novamente</button>
                    <button type="button" onClick={() => void generateDraft({ forceMealByMeal: true })} className="brand-btn-secondary">Gerar refeição por refeição</button>
                    <button type="button" onClick={onClose} className="brand-btn-secondary">Continuar manualmente</button>
                  </div>
                </div>
              )}

              {draft && (
                <>
                  {/* R6.5.4 (seções 58-60) — resumo compacto de revisão com contadores reais. */}
                  {draft.meals.length > 0 && (
                    <div className="flex flex-wrap gap-2" role="status" aria-label="Resumo da revisão">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F5FAF0] px-2.5 py-1 text-xs font-semibold text-[#4F7D45]">
                        <Check className="h-3 w-3" /> {resolvedCount} resolvido{resolvedCount === 1 ? "" : "s"}
                      </span>
                      {totalNeedsReview > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF7F3] px-2.5 py-1 text-xs font-semibold text-[#B5762F]">
                          <AlertTriangle className="h-3 w-3" /> {totalNeedsReview} pra revisar
                        </span>
                      )}
                      {unresolvedCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                          <AlertTriangle className="h-3 w-3" /> {unresolvedCount} não encontrado{unresolvedCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  )}

                  {changeset && (
                    <div className="rounded-xl border border-[#D9E4D3] bg-[#F5FAF0] p-4">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#4F7D45]">Alterações propostas sobre &ldquo;{sourcePlan?.title}&rdquo;</p>
                      <p className="text-sm text-[#3A3028]">{describeMealPlanChangeset(changeset)}</p>
                      {(changeset.modify.length > 0 || changeset.add.length > 0) && (
                        <ul className="mt-2 space-y-0.5 text-xs text-[#4F7D45]">
                          {changeset.modify.map((name) => <li key={`modify-${name}`}>✎ Alterada: {name}</li>)}
                          {changeset.add.map((name) => <li key={`add-${name}`}>+ Adicionada: {name}</li>)}
                        </ul>
                      )}
                      <p className="mt-2 text-xs text-[#4F7D45]">O plano original nunca é alterado — esta proposta vira um novo rascunho independente ao aplicar.</p>
                    </div>
                  )}
                  {/* Resumo nutricional + meta — calculado pela MESMA engine do editor, ANTES de aplicar */}
                  {draft.nutrition && (
                    <div className="rounded-xl border border-[#EAD8C2] bg-[#FAF7F2] p-4">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#A8927D]"><Target className="h-3.5 w-3.5" /> Pré-plano nutricional</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <NutrientSummary label="Energia" value={draft.nutrition.total.energyKcal} unit="kcal" target={target.targetEnergyKcal} />
                        <NutrientSummary label="Proteína" value={draft.nutrition.total.proteinG} unit="g" target={target.targetProteinG} decimals={1} />
                        <NutrientSummary label="Carboidrato" value={draft.nutrition.total.carbohydrateG} unit="g" target={target.targetCarbohydrateG} decimals={1} />
                        <NutrientSummary label="Gordura" value={draft.nutrition.total.fatG} unit="g" target={target.targetFatG} decimals={1} />
                      </div>
                      {draft.nutrition.targetComparison.length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-[#A8927D]">
                                <th className="pb-1 font-semibold">Nutriente</th>
                                <th className="pb-1 text-right font-semibold">Pré-plano</th>
                                <th className="pb-1 text-right font-semibold">Meta</th>
                                <th className="pb-1 text-right font-semibold">Diferença</th>
                                <th className="pb-1 text-right font-semibold">Aderência</th>
                              </tr>
                            </thead>
                            <tbody>
                              {draft.nutrition.targetComparison.map((row) => (
                                <tr key={row.nutrient} className="border-t border-[#EDE1D6]">
                                  <td className="py-1">{NUTRIENT_LABELS[row.nutrient] ?? row.nutrient}</td>
                                  <td className="py-1 text-right font-semibold">{fmt(row.prescribed, row.nutrient === "energyKcal" ? 0 : 1)}</td>
                                  <td className="py-1 text-right">{fmt(row.target)}</td>
                                  <td className="py-1 text-right">{row.diff === null ? "—" : `${row.diff > 0 ? "+" : ""}${fmt(row.diff, 1)}`}</td>
                                  <td className="py-1 text-right">{row.percentOfTarget === null ? "—" : `${fmt(row.percentOfTarget, 0)}%`}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {draft.nutrition.unresolvedCount > 0 && (
                        <p className="mt-2 text-xs text-[#B5762F]">{draft.nutrition.unresolvedCount} item(ns) sem correspondência entram como quantidade sem cálculo — veja &ldquo;precisa de revisão&rdquo; abaixo.</p>
                      )}
                      {hasEnergyTarget && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void optimizeToTargets()}
                            disabled={optimizing}
                            title="Ajusta apenas quantidades dos alimentos já resolvidos. Nenhum alimento será trocado."
                            className="brand-btn-secondary"
                          >
                            <Wand2 className="h-4 w-4" />
                            {optimizing ? "Aproximando das metas..." : "✨ Aproximar das metas nutricionais"}
                          </button>
                          {preOptimizeDraft && (
                            <button type="button" onClick={undoOptimize} className="brand-btn-secondary">Desfazer ajuste</button>
                          )}
                        </div>
                      )}
                      {optimizeError && <p className="mt-1 text-xs text-red-700">{optimizeError}</p>}
                      {optimizerSummary && (
                        <div className="mt-2 rounded-lg bg-[#EAF0E4] p-2.5 text-xs text-[#4F7D45]">
                          <p>
                            {optimizerSummary.adjustments.length > 0
                              ? `O sistema ajustou ${optimizerSummary.adjustments.length} quantidade(s) para aproximar o plano das metas informadas.`
                              : "Nenhum ajuste foi necessário ou possível dentro dos limites técnicos."}
                          </p>
                          {optimizerSummary.adjustments.length > 0 && (
                            <button type="button" onClick={() => setShowAdjustments((v) => !v)} className="mt-1 font-semibold underline">
                              {showAdjustments ? "Ocultar ajustes" : "Ver ajustes"}
                            </button>
                          )}
                          {showAdjustments && (
                            <ul className="mt-1.5 space-y-0.5">
                              {optimizerSummary.adjustments.map((adj, index) => (
                                <li key={index}>{adj.mealName} — {adj.displayName}: {adj.quantityBefore} → {adj.quantityAfter} {adj.unit}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Critic — nunca altera o draft sozinho, só sinaliza */}
                  {draft.critic && draft.critic.length > 0 && (
                    <div className="space-y-1.5">
                      {draft.critic.map((finding, index) => (
                        <div key={index} className={`flex items-start gap-1.5 rounded-lg border px-3 py-2 text-xs ${CRITIC_STYLE[finding.severity]}`}>
                          <span aria-hidden>{CRITIC_ICON[finding.severity]}</span>
                          <span>{finding.message}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {draft.warnings.length > 0 && (
                    <div className="rounded-xl border border-[#F0D4C7] bg-[#FFF7F3] p-3 text-xs leading-5 text-[#8C5F50]">
                      {draft.warnings.map((warning, index) => (
                        <p key={index} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {warning.message}</p>
                      ))}
                    </div>
                  )}

                  {regenerateError && <p className="text-xs text-red-700">{regenerateError}</p>}
                  {substitutionError && <p className="text-xs text-red-700">{substitutionError}</p>}

                  <div className="space-y-2">
                    {draft.meals.map((meal, mealIndex) => {
                      const mealNutrition = draft.nutrition?.perMeal[mealIndex];
                      return (
                        <div key={mealIndex} className="rounded-xl border border-[#EAD8C2] bg-[#FFFDFC] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-[#3A3028]">{meal.suggested_time ? `${meal.suggested_time} — ` : ""}{meal.name}</p>
                              {meal.source_recipe_id && <span className="mt-0.5 inline-block rounded-full bg-[#EAF0E4] px-2 py-0.5 text-[10px] font-semibold text-[#607A56]">receita · 1 porção</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              {mealNutrition?.energyKcal !== null && mealNutrition?.energyKcal !== undefined && (
                                <span className="rounded-full bg-[#EAF0E4] px-2.5 py-1 text-xs font-bold text-[#607A56]">{fmt(mealNutrition.energyKcal)} kcal</span>
                              )}
                              {hasEnergyTarget && meal.items.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => void optimizeMeal(meal.mealKey)}
                                  disabled={optimizingMealKey !== null}
                                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#EAD8C2] px-2 text-[11px] font-semibold text-[#8C6E52] hover:bg-[#FBF7F1] disabled:opacity-50"
                                  title={`Ajustar só ${meal.name} — não mexe nas demais refeições`}
                                >
                                  <Wand2 className={`h-3.5 w-3.5 ${optimizingMealKey === meal.mealKey ? "animate-pulse" : ""}`} />
                                  Ajustar
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void regenerateMeal(meal.mealKey)}
                                disabled={regeneratingMealKey !== null}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#EAD8C2] px-2 text-[11px] font-semibold text-[#8C6E52] hover:bg-[#FBF7F1] disabled:opacity-50"
                                title={`Regenerar ${meal.name}`}
                              >
                                <RefreshCw className={`h-3.5 w-3.5 ${regeneratingMealKey === meal.mealKey ? "animate-spin" : ""}`} />
                                Regenerar
                              </button>
                              {meal.items.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => void suggestSubstitutionsForMeal(meal.mealKey)}
                                  disabled={suggestingSubstitutionsMealKey !== null}
                                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#EAD8C2] px-2 text-[11px] font-semibold text-[#8C6E52] hover:bg-[#FBF7F1] disabled:opacity-50"
                                  title={`Sugerir substituições para ${meal.name}`}
                                >
                                  <Sparkles className={`h-3.5 w-3.5 ${suggestingSubstitutionsMealKey === meal.mealKey ? "animate-pulse" : ""}`} />
                                  Sugerir substituições
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void suggestRecipeForMeal(mealIndex)}
                                disabled={suggestingRecipeMealKey !== null}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#EAD8C2] px-2 text-[11px] font-semibold text-[#8C6E52] hover:bg-[#FBF7F1] disabled:opacity-50"
                                title={`Sugerir receita para ${meal.name} — opcional, nunca substitui os alimentos sozinha`}
                              >
                                <Sparkles className={`h-3.5 w-3.5 ${suggestingRecipeMealKey === meal.mealKey ? "animate-pulse" : ""}`} />
                                Sugerir receita
                              </button>
                            </div>
                          </div>

                          {meal.items.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5 text-xs text-[#75675E]">
                              {meal.items.map((item, itemIndex) => {
                                const itemKey = `${meal.mealKey}:${item.food_source ?? ""}:${item.food_ref_id ?? ""}`;
                                const canSuggestItem = Boolean(item.food_source && item.food_ref_id && !item.needsSafetyReview);
                                return (
                                  <li key={itemIndex} className="flex items-center justify-between gap-2">
                                    <span>{item.displayName}{item.needsSafetyReview && <span className="ml-1.5 text-[#B5762F]" title="Segurança clínica não confirmada">⚠</span>}</span>
                                    <span className="flex items-center gap-1.5">
                                      {item.quantity} {item.unit}
                                      {canSuggestItem && (
                                        <button
                                          type="button"
                                          onClick={() => void suggestSubstitutionsForItem(meal.mealKey, item)}
                                          disabled={suggestingItemKey !== null}
                                          className="rounded-full p-1 text-[#8C6E52] hover:bg-[#EAF0E4]"
                                          aria-label={`Sugerir substituições para ${item.displayName}`}
                                          title={`✨ Sugerir substituições para ${item.displayName}`}
                                        >
                                          <Sparkles className={`h-3 w-3 ${suggestingItemKey === itemKey ? "animate-pulse" : ""}`} />
                                        </button>
                                      )}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                          {/* R5.1 (seções 20/21) — exibe OPTIONS/COMBINATION por inteiro, nunca achatado em texto. */}
                          {meal.meal_structure === "OPTIONS" && (meal.options?.length ?? 0) > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {meal.options!.map((option) => (
                                <div key={option.id} className="rounded-lg border border-[#EAD8C2] bg-white/60 p-2">
                                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#8C6E52]">{option.label}</p>
                                  {option.items.length > 0 && (
                                    <ul className="mt-1 space-y-0.5 text-xs text-[#75675E]">
                                      {option.items.map((item, itemIndex) => (
                                        <li key={itemIndex} className="flex items-center justify-between gap-2">
                                          <span>{item.displayName}</span>
                                          <span>{item.quantity} {item.unit}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              ))}
                              <p className="text-[11px] italic text-[#8C6E52]">Alternativas mutuamente exclusivas — nunca somadas no cálculo nutricional (mostra faixa mín./máx.).</p>
                            </div>
                          )}
                          {meal.meal_structure === "COMBINATION" && (meal.choice_groups?.length ?? 0) > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {meal.choice_groups!.map((group) => (
                                <div key={group.id} className="rounded-lg border border-[#EAD8C2] bg-white/60 p-2">
                                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#8C6E52]">
                                    {group.title} <span className="font-normal normal-case text-[#B08A63]">(escolha {group.min_selections === group.max_selections ? group.min_selections : `${group.min_selections}–${group.max_selections}`})</span>
                                  </p>
                                  {group.items.length > 0 && (
                                    <ul className="mt-1 space-y-0.5 text-xs text-[#75675E]">
                                      {group.items.map((item, itemIndex) => (
                                        <li key={itemIndex} className="flex items-center justify-between gap-2">
                                          <span>{item.displayName}</span>
                                          <span>{item.quantity} {item.unit}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {substitutionSuggestions.some((sub) => sub.mealKey === meal.mealKey) && (
                            <div className="mt-2 space-y-1.5 rounded-lg border border-[#EAD8C2] bg-[#FAF7F2] p-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#8C6E52]">Sugestões de substituição</p>
                              {substitutionSuggestions.map((sub, subIndex) => sub.mealKey !== meal.mealKey ? null : (
                                <div key={subIndex} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="text-[#3A2B1F]">
                                    {sub.base_food} → {sub.option_food} ({sub.quantity} {sub.unit})
                                    {sub.approved_by_professional && <span className="ml-1.5 text-[#4F7D45]">✓ aprovada</span>}
                                  </span>
                                  {!sub.approved_by_professional && (
                                    <div className="flex shrink-0 items-center gap-1">
                                      <button type="button" onClick={() => approveSubstitutionSuggestion(subIndex)} className="rounded-full bg-[#EAF0E4] p-1 text-[#4F7D45] hover:bg-[#DCE9D4]" aria-label="Aprovar substituição" title="Aprovar">
                                        <Check className="h-3.5 w-3.5" />
                                      </button>
                                      <button type="button" onClick={() => rejectSubstitutionSuggestion(subIndex)} className="rounded-full bg-red-50 p-1 text-red-600 hover:bg-red-100" aria-label="Rejeitar substituição" title="Rejeitar">
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {mealNutrition && (mealNutrition.proteinG !== null || mealNutrition.carbohydrateG !== null) && (
                            <p className="mt-1.5 text-[11px] text-[#8C6E52]">
                              P {fmt(mealNutrition.proteinG, 1)}g · C {fmt(mealNutrition.carbohydrateG, 1)}g · G {fmt(mealNutrition.fatG, 1)}g{mealNutrition.fiberG !== undefined ? ` · Fibra ${fmt(mealNutrition.fiberG, 1)}g` : ""}
                            </p>
                          )}

                          {recipeSuggestions[meal.mealKey]?.status === "none" && (
                            <p className="mt-1.5 text-[11px] italic text-[#8C6E52]">Nenhuma receita cadastrada pra esse grupo de refeição.</p>
                          )}

                          {recipeSuggestions[meal.mealKey]?.status === "suggested" && recipeSuggestions[meal.mealKey]?.recipe && (() => {
                            const suggestion = recipeSuggestions[meal.mealKey]!;
                            const recipe = suggestion.recipe!;
                            const deltaKcal = recipe.per_portion_kcal - (suggestion.mealKcalAtSuggestionTime ?? 0);
                            const deltaProtein = recipe.per_portion_protein_g - (suggestion.mealProteinAtSuggestionTime ?? 0);
                            const deltaCarbs = recipe.per_portion_carbs_g - (suggestion.mealCarbsAtSuggestionTime ?? 0);
                            const deltaFat = recipe.per_portion_fat_g - (suggestion.mealFatAtSuggestionTime ?? 0);
                            const signed = (value: number, decimals = 0) => `${value > 0 ? "+" : ""}${fmt(value, decimals)}`;
                            const detailsOpen = Boolean(recipeDetailsOpen[meal.mealKey]);
                            return (
                              <div className="mt-2 space-y-2 rounded-lg border border-[#D9C4B2] bg-[#FBF7F1] p-2.5 text-xs">
                                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#8C6E52]"><Sparkles className="h-3 w-3" /> Sugestão de receita (opcional)</p>
                                <p className="font-semibold text-[#3A2B1F]">{recipe.title}</p>
                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                  <div className="rounded-md bg-white/70 p-1.5">
                                    <p className="font-semibold text-[#75675E]">Refeição atual</p>
                                    <p className="text-[#3A2B1F]">{fmt(suggestion.mealKcalAtSuggestionTime)} kcal</p>
                                    <p className="text-[#8C6E52]">P {fmt(suggestion.mealProteinAtSuggestionTime, 1)}g · C {fmt(suggestion.mealCarbsAtSuggestionTime, 1)}g · G {fmt(suggestion.mealFatAtSuggestionTime, 1)}g</p>
                                  </div>
                                  <div className="rounded-md bg-white/70 p-1.5">
                                    <p className="font-semibold text-[#75675E]">Receita sugerida</p>
                                    <p className="text-[#3A2B1F]">{fmt(recipe.per_portion_kcal)} kcal</p>
                                    <p className="text-[#8C6E52]">P {fmt(recipe.per_portion_protein_g, 1)}g · C {fmt(recipe.per_portion_carbs_g, 1)}g · G {fmt(recipe.per_portion_fat_g, 1)}g</p>
                                  </div>
                                </div>
                                <p className="text-[#8C6E52]">Diferença: {signed(deltaKcal)} kcal · {signed(deltaProtein, 1)}g proteína · {signed(deltaCarbs, 1)}g carboidrato · {signed(deltaFat, 1)}g gordura</p>
                                {detailsOpen && (
                                  <div className="rounded-md bg-white/70 p-1.5 text-[#3A2B1F]">
                                    <p className="font-semibold">Ingredientes:</p>
                                    <ul className="ml-3 list-disc">
                                      {recipe.ingredients.map(normalizeIngredientForRead).filter((ing) => ing.food_ref_id && ing.unit === "g" && ing.quantity).map((ing, ingIndex) => (
                                        <li key={ingIndex}>{toFriendlyFoodName(ing.food)} — {ing.quantity}g{recipe.servings > 1 ? ` (receita completa; escalado a 1 porção ao aplicar)` : ""}</li>
                                      ))}
                                    </ul>
                                    {recipe.preparation_steps && <p className="mt-1.5 whitespace-pre-line">{recipe.preparation_steps}</p>}
                                  </div>
                                )}
                                <div className="flex flex-wrap gap-1.5">
                                  <button type="button" onClick={() => applyRecipeToMeal(mealIndex)} disabled={recalculating} className="rounded-full bg-[#8C6E52] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#7A5D45] disabled:opacity-50">Usar receita</button>
                                  <button type="button" onClick={() => dismissRecipeSuggestion(meal.mealKey)} className="rounded-full border border-[#D9C4B2] px-2.5 py-1 text-[11px] font-semibold text-[#8C6E52] hover:bg-[#FBF7F1]">Manter alimentos</button>
                                  <button type="button" onClick={() => toggleRecipeDetails(meal.mealKey)} className="rounded-full border border-[#D9C4B2] px-2.5 py-1 text-[11px] font-semibold text-[#8C6E52] hover:bg-[#FBF7F1]">{detailsOpen ? "Ocultar detalhes" : "Ver detalhes"}</button>
                                </div>
                              </div>
                            );
                          })()}

                          {meal.needsReview.length > 0 && (
                            <div className="mt-2 space-y-2 rounded-lg border border-[#F0D4C7] bg-[#FFF7F3] p-2.5">
                              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#8C5F50]"><Info className="h-3 w-3" /> Precisa de revisão</p>
                              {meal.needsReview.map((review, reviewIndex) => (
                                <div key={reviewIndex} className="rounded-md bg-white/70 p-2 text-xs">
                                  <p className="font-semibold text-[#3A2B1F]">&ldquo;{review.query}&rdquo; — {review.quantity} {review.unit}</p>
                                  <p className="mt-0.5 text-[#8C5F50]">{review.reason}</p>
                                  {review.status === "AMBIGUOUS" && review.candidates.length > 0 && (
                                    <div className="mt-1.5 space-y-1">
                                      {review.candidates.map((candidate, candidateIndex) => (
                                        <div key={candidateIndex} className="flex flex-wrap items-center gap-1.5 rounded-md border border-[#D9C4B2] bg-white px-2 py-1.5">
                                          <span className="mr-auto text-[11px] font-semibold text-[#3A2B1F]">
                                            {candidate.displayName}
                                            <span className="ml-1 font-normal text-[#8C6E52]">· {candidate.sourceLabel}</span>
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => pickCandidate(mealIndex, reviewIndex, candidate)}
                                            disabled={recalculating}
                                            className="rounded-full border border-[#D9C4B2] px-2.5 py-1 text-[11px] font-semibold text-[#8C6E52] hover:bg-[#FBF7F1] disabled:opacity-50"
                                          >
                                            Selecionar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => pickCandidate(mealIndex, reviewIndex, candidate, true)}
                                            disabled={recalculating}
                                            title="Salva esta escolha só para você — da próxima vez que este alimento aparecer ambíguo, você pode reaplicá-la com um clique."
                                            className="rounded-full bg-[#8C6E52] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#7A5D45] disabled:opacity-50"
                                          >
                                            Selecionar e lembrar
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {review.status === "PREPARATION_NEEDS_REVIEW" && (review.recipeCandidates?.length ?? 0) > 0 && (
                                    <div className="mt-1.5 space-y-1">
                                      {review.recipeCandidates!.map((recipe) => (
                                        <div key={recipe.id} className="flex flex-wrap items-center gap-1.5 rounded-md border border-[#D9C4B2] bg-white px-2 py-1.5">
                                          <span className="mr-auto text-[11px] font-semibold text-[#3A2B1F]">{recipe.title}</span>
                                          <button
                                            type="button"
                                            onClick={() => pickPreparationRecipe(mealIndex, reviewIndex, recipe)}
                                            disabled={recalculating || applyingRecipeId === recipe.id}
                                            className="rounded-full bg-[#8C6E52] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#7A5D45] disabled:opacity-50"
                                          >
                                            {applyingRecipeId === recipe.id ? "Aplicando…" : "Usar receita"}
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {review.status === "PREPARATION_NEEDS_REVIEW" && !(review.recipeCandidates?.length) && (
                                    <p className="mt-1.5 text-[11px] italic text-[#8C6E52]">Nenhuma receita cadastrada pra esse preparo — edite manualmente depois de aplicar, ou remova.</p>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeNeedsReview(mealIndex, reviewIndex)}
                                    disabled={recalculating}
                                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:underline disabled:opacity-50"
                                  >
                                    <Trash2 className="h-3 w-3" /> Remover
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* R5.1 (seções 14-18) — revisão ANINHADA: mesmo tratamento (AMBIGUOUS/NOT_FOUND/CLINICAL_CONFLICT), mas com breadcrumb até a posição exata e resolução que só afeta aquele item nested. */}
                          {(["options", "choice_groups"] as const).flatMap((scope) => {
                            const entries = scope === "options" ? (meal.options ?? []) : (meal.choice_groups ?? []);
                            return entries.map((entry, scopeIndex) => entry.needsReview.length > 0 ? (
                              <div key={`${scope}-${scopeIndex}`} className="mt-2 space-y-2 rounded-lg border border-[#F0D4C7] bg-[#FFF7F3] p-2.5">
                                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#8C5F50]">
                                  <Info className="h-3 w-3" /> Precisa de revisão — {meal.name} → {scope === "options" ? (entry as DraftMealOption).label : (entry as DraftMealChoiceGroup).title}
                                </p>
                                {entry.needsReview.map((review, reviewIndex) => (
                                  <div key={reviewIndex} className="rounded-md bg-white/70 p-2 text-xs">
                                    <p className="font-semibold text-[#3A2B1F]">&ldquo;{review.query}&rdquo; — {review.quantity} {review.unit}</p>
                                    <p className="mt-0.5 text-[#8C5F50]">{review.reason}</p>
                                    {review.status === "AMBIGUOUS" && review.candidates.length > 0 && (
                                      <div className="mt-1.5 space-y-1">
                                        {review.candidates.map((candidate, candidateIndex) => (
                                          <div key={candidateIndex} className="flex flex-wrap items-center gap-1.5 rounded-md border border-[#D9C4B2] bg-white px-2 py-1.5">
                                            <span className="mr-auto text-[11px] font-semibold text-[#3A2B1F]">
                                              {candidate.displayName}
                                              <span className="ml-1 font-normal text-[#8C6E52]">· {candidate.sourceLabel}</span>
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => pickCandidateNested(mealIndex, scope, scopeIndex, reviewIndex, candidate)}
                                              disabled={recalculating}
                                              className="rounded-full border border-[#D9C4B2] px-2.5 py-1 text-[11px] font-semibold text-[#8C6E52] hover:bg-[#FBF7F1] disabled:opacity-50"
                                            >
                                              Selecionar
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => removeNeedsReviewNested(mealIndex, scope, scopeIndex, reviewIndex)}
                                      disabled={recalculating}
                                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:underline disabled:opacity-50"
                                    >
                                      <Trash2 className="h-3 w-3" /> Remover
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : null);
                          })}
                        </div>
                      );
                    })}
                    {!draft.meals.length && <p className="text-sm text-[#8C6E52]">Nenhuma refeição foi montada.</p>}
                  </div>

                  {totalNeedsReview > 0 && (
                    <p className="text-xs text-[#B5762F]">{totalNeedsReview} item(ns) ainda precisam de revisão e não serão incluídos ao aplicar — adicione manualmente no editor depois, se quiser.</p>
                  )}

                  {draft.meals.length > 0 && (
                    <div className="rounded-xl border border-[#EAD8C2] bg-[#FAF7F2] p-3">
                      <label className="brand-label" htmlFor="wizard-refine">Peça um ajuste (linguagem natural)</label>
                      <div className="flex gap-2">
                        <input
                          id="wizard-refine"
                          value={refineInput}
                          onChange={(event) => setRefineInput(event.target.value)}
                          className="brand-input"
                          placeholder='Ex.: "troque banana por mamão", "tire o lanche da manhã", "aumente a proteína"'
                          disabled={refining || refineCount >= MAX_REFINE_ITERATIONS}
                        />
                        <button
                          type="button"
                          onClick={() => void applyRefinement()}
                          disabled={refining || !refineInput.trim() || refineCount >= MAX_REFINE_ITERATIONS}
                          className="brand-btn-secondary shrink-0"
                        >
                          <Wand2 className="h-4 w-4" />
                          {refining ? "Ajustando..." : "Ajustar"}
                        </button>
                      </div>
                      {refineCount >= MAX_REFINE_ITERATIONS && <p className="mt-1 text-xs text-[#B5762F]">Limite de ajustes por sessão atingido — aplique ao editor e continue ajustando por lá.</p>}
                      {refineError && <p className="mt-1 text-xs text-red-700">{refineError}</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="grid shrink-0 gap-3 border-t border-[#EDE1D6] px-5 py-3 sm:flex sm:justify-between">
          <button
            type="button"
            onClick={() => setStep(activeStepOrder[Math.max(0, stepIndex - 1)])}
            disabled={stepIndex === 0 || step === "generating"}
            className="brand-btn-secondary w-full sm:w-auto"
          >
            Voltar
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onClose} className="brand-btn-secondary w-full sm:w-auto">Cancelar</button>
            {step !== "review" && step !== "generating" && (
              <button
                type="button"
                onClick={() => step === "preferences" ? generationReadiness === "NOT_READY" ? void saveQuickFacts() : void generateDraft() : setStep(activeStepOrder[stepIndex + 1])}
                disabled={(step === "meals" && !canProceedFromMeals) || (step === "preferences" && (generationReadiness === "NOT_READY" ? savingQuickFacts || !canSaveQuickFacts : !canGenerate))}
                className="brand-btn-primary w-full sm:w-auto"
              >
                {step === "preferences" ? generationReadiness === "NOT_READY" ? savingQuickFacts ? "Salvando informações..." : "Salvar e continuar" : generationReadiness === "READY_WITH_REVIEW" ? "Gerar pré-plano — revisar dados" : "Gerar pré-plano" : "Continuar"}
              </button>
            )}
            {step === "review" && draft && draft.meals.length > 0 && (
              <button type="button" onClick={() => void handleApply()} disabled={applying || totalNeedsReview > 0} className="brand-btn-primary w-full sm:w-auto">
                {applying ? "Aplicando..." : "Aplicar ao editor"}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );

  if (!portalReady) return null;
  return createPortal(modal, document.body);
}

function ContextField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-[#A8927D]">{label}</p>
      <p className="font-medium text-[#3A2B1F]">{value ?? "—"}</p>
    </div>
  );
}

function TargetInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="brand-label" htmlFor={id}>{label}</label>
      <input id={id} type="text" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} className="brand-input" placeholder="—" />
    </div>
  );
}

function NutrientSummary({ label, value, unit, target, decimals = 0 }: { label: string; value: number | null; unit: string; target: number | null; decimals?: number }) {
  return (
    <div className="rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-2.5 text-center">
      <p className="text-[9px] uppercase tracking-[0.07em] text-[#A8927D]">{label}</p>
      <p className="text-base font-bold text-[#3A2B1F]">{fmt(value, decimals)} <span className="text-xs font-normal text-[#8C6E52]">{unit}</span></p>
      {target !== null && <p className="text-[10px] text-[#8C6E52]">meta {fmt(target, decimals)} {unit}</p>}
    </div>
  );
}
