"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, Loader2, AlertTriangle, Wand2, RefreshCw, Target, Info, Trash2, Check } from "lucide-react";
import {
  PROTOCOL_TEMPLATE_GROUP_LABELS,
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  type ProtocolTemplateTargetGroup,
} from "@/lib/protocol-templates/constants";
import type { Meal } from "@/components/dashboard/MealItemsEditor";
import type { ItemSubstitution } from "@/components/dashboard/ItemSubstitutionsPanel";

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

interface DraftContext {
  clientName: string;
  ageYears: number | null;
  biologicalSex: string | null;
  weightKg: string | null;
  heightDisplay: string | null;
  bmi: string | null;
  lifeStage: string | null;
  allergies: string | null;
  restrictions: string | null;
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
}
interface DraftNeedsReviewCandidate {
  ref: { source: string; sourceId: string; canonicalId?: string | null };
  name: string;
  displayName: string;
  sourceLabel: string;
}
interface DraftNeedsReview {
  query: string;
  quantity: string;
  unit: string;
  status: "AMBIGUOUS" | "NOT_FOUND" | "CLINICAL_CONFLICT";
  reason: string;
  candidates: DraftNeedsReviewCandidate[];
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
  items: DraftMealItem[];
  needsReview: DraftNeedsReview[];
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

type WizardStep = "context" | "goals" | "meals" | "preferences" | "generating" | "review";
const STEP_ORDER: WizardStep[] = ["context", "goals", "meals", "preferences", "generating", "review"];
const STEP_LABELS: Record<WizardStep, string> = {
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

function draftMealToEditorMeal(meal: DraftMeal): Meal {
  return {
    name: meal.name,
    suggested_time: meal.suggested_time,
    notes: null,
    source_recipe_id: meal.source_recipe_id,
    items: meal.items.map((item) => ({
      food: item.food,
      quantity: item.quantity,
      unit: item.unit,
      notes: null,
      ai_suggested: true,
      food_source: item.food_source,
      food_ref_id: item.food_ref_id,
    })),
  };
}

const CRITIC_ICON: Record<CriticFinding["severity"], string> = { INFO: "ℹ", REVIEW: "⚠", WARNING: "⚠" };
const CRITIC_STYLE: Record<CriticFinding["severity"], string> = {
  INFO: "border-[#D9E4D3] bg-[#F5FAF0] text-[#4F7D45]",
  REVIEW: "border-[#F0D4C7] bg-[#FFF7F3] text-[#8C5F50]",
  WARNING: "border-[#F0D4C7] bg-[#FFF1E6] text-[#B5762F]",
};

export function AiMealPlanWizard({
  clientId,
  defaultTargetGroup,
  onClose,
  onApply,
}: {
  clientId: string;
  defaultTargetGroup: ProtocolTemplateTargetGroup;
  onClose: () => void;
  onApply: (targetGroup: ProtocolTemplateTargetGroup, meals: Meal[], substitutions?: ItemSubstitution[]) => Promise<void>;
}) {
  const [step, setStep] = useState<WizardStep>("context");
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  const [context, setContext] = useState<DraftContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState("");

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
  const [useRecipes, setUseRecipes] = useState(true);

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

  // Substituições sugeridas dentro do wizard (seção 2 do pedido de
  // fechamento de gaps) — nunca persistidas aqui; só entram no plano de
  // verdade via "Aplicar ao editor" -> "Salvar", exatamente como o resto do
  // draft. `mealKey` guarda a que refeição pertence (o editor não usa isso,
  // só o wizard pra agrupar a UI); descartado ao montar o payload de onApply.
  const [substitutionSuggestions, setSubstitutionSuggestions] = useState<(ItemSubstitution & { mealKey: MealKey })[]>([]);
  const [suggestingSubstitutionsMealKey, setSuggestingSubstitutionsMealKey] = useState<MealKey | null>(null);
  const [suggestingItemKey, setSuggestingItemKey] = useState<string | null>(null);
  const [substitutionError, setSubstitutionError] = useState("");

  const [applying, setApplying] = useState(false);

  const stepIndex = STEP_ORDER.indexOf(step);
  const requestedMeals = Array.from(selectedMeals).map((key) => ({ key, suggestedTime: mealTimes[key]?.trim() || null }));

  function toggleMeal(key: MealKey) {
    setSelectedMeals((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Objetivo/meta/refeições/horários/preferências ficam no state do
  // próprio componente — um retry (ou o botão "Gerar refeição por
  // refeição") nunca perde esses valores, só repete a chamada (seção 21 do
  // pedido de robustez: "preservar o wizard").
  async function generateDraft(options?: { forceMealByMeal?: boolean }) {
    setStep("generating");
    setGenerateError("");
    setGenerateErrorReason(null);
    try {
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
          forceMealByMeal: options?.forceMealByMeal ?? false,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setGenerateErrorReason(typeof data.reason === "string" ? data.reason : null);
        throw new Error(data.message ?? "Não foi possível gerar o pré-plano.");
      }
      setDraft(data);
      setPreOptimizeDraft(null);
      setOptimizerSummary(null);
      setStep("review");
    } catch (cause) {
      setGenerateError(cause instanceof Error ? cause.message : "Não foi possível gerar o pré-plano.");
      setStep("review");
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

  function pickCandidate(mealIndex: number, reviewIndex: number, candidate: DraftNeedsReviewCandidate) {
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
      ...meal,
      items: [...meal.items, newItem],
      needsReview: meal.needsReview.filter((_, index2) => index2 !== reviewIndex),
    });
    void recalculate(nextMeals);
  }

  function removeNeedsReview(mealIndex: number, reviewIndex: number) {
    if (!draft) return;
    const nextMeals = draft.meals.map((meal, index) => index !== mealIndex ? meal : { ...meal, needsReview: meal.needsReview.filter((_, index2) => index2 !== reviewIndex) });
    void recalculate(nextMeals);
  }

  async function handleApply() {
    if (!draft || !draft.meals.length) return;
    setApplying(true);
    try {
      const approvedSubstitutions = substitutionSuggestions
        .filter((sub) => sub.approved_by_professional)
        .map(({ mealKey: _mealKey, ...rest }) => rest);
      await onApply(objectiveGroup, draft.meals.map(draftMealToEditorMeal), approvedSubstitutions);
      onClose();
    } finally {
      setApplying(false);
    }
  }

  const canGenerate = selectedMeals.size > 0;
  const totalNeedsReview = draft?.meals.reduce((sum, meal) => sum + meal.needsReview.length, 0) ?? 0;
  const hasEnergyTarget = target.targetEnergyKcal !== null;

  const modal = (
    <div role="dialog" aria-modal="true" aria-labelledby="ai-wizard-title" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/35 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <section className="flex h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)] sm:h-auto sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EDE1D6] px-5 py-4">
          <div>
            <p className="brand-kicker flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Assistente guiado</p>
            <h2 id="ai-wizard-title" className="font-serif text-2xl font-semibold text-[#3A3028]">Criar plano com IA</h2>
            <p className="mt-1 text-xs text-[#8C6E52]">Etapa {Math.min(stepIndex + 1, 5)} de 5 · {STEP_LABELS[step]}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
          {step === "context" && (
            <div className="space-y-4">
              <p className="text-sm text-[#75675E]">Vou usar os dados clínicos já cadastrados e perguntar só o que faltar. Confira se o contexto abaixo está correto.</p>
              {contextLoading && <p className="text-sm text-[#8C6E52]">Carregando contexto do paciente...</p>}
              {contextError && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{contextError}</p>}
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
              <p className="brand-label">Quais refeições este plano deve ter?</p>
              <div className="space-y-2">
                {MEAL_KEYS.map((key) => (
                  <div key={key} className="flex items-center gap-3 rounded-xl border border-[#EAD8C2] bg-[#FFFDFC] p-3">
                    <input
                      type="checkbox"
                      id={`meal-toggle-${key}`}
                      checked={selectedMeals.has(key)}
                      onChange={() => toggleMeal(key)}
                      className="h-4 w-4 accent-[#7A9A74]"
                    />
                    <label htmlFor={`meal-toggle-${key}`} className="flex-1 text-sm font-semibold text-[#3A3028]">{MEAL_KEY_LABELS[key]}</label>
                    <input
                      type="time"
                      value={mealTimes[key] ?? ""}
                      onChange={(event) => setMealTimes((current) => ({ ...current, [key]: event.target.value }))}
                      disabled={!selectedMeals.has(key)}
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
                <label htmlFor="wizard-use-recipes" className="text-sm font-semibold text-[#3A3028]">Aproveitar receitas já cadastradas na biblioteca quando fizer sentido</label>
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

                          {meal.needsReview.length > 0 && (
                            <div className="mt-2 space-y-2 rounded-lg border border-[#F0D4C7] bg-[#FFF7F3] p-2.5">
                              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#8C5F50]"><Info className="h-3 w-3" /> Precisa de revisão</p>
                              {meal.needsReview.map((review, reviewIndex) => (
                                <div key={reviewIndex} className="rounded-md bg-white/70 p-2 text-xs">
                                  <p className="font-semibold text-[#3A2B1F]">&ldquo;{review.query}&rdquo; — {review.quantity} {review.unit}</p>
                                  <p className="mt-0.5 text-[#8C5F50]">{review.reason}</p>
                                  {review.status === "AMBIGUOUS" && review.candidates.length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                      {review.candidates.map((candidate, candidateIndex) => (
                                        <button
                                          key={candidateIndex}
                                          type="button"
                                          onClick={() => pickCandidate(mealIndex, reviewIndex, candidate)}
                                          disabled={recalculating}
                                          className="rounded-full border border-[#D9C4B2] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#8C6E52] hover:bg-[#FBF7F1] disabled:opacity-50"
                                        >
                                          {candidate.displayName}
                                        </button>
                                      ))}
                                    </div>
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
            onClick={() => setStep(STEP_ORDER[Math.max(0, stepIndex - 1)])}
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
                onClick={() => step === "preferences" ? void generateDraft() : setStep(STEP_ORDER[stepIndex + 1])}
                disabled={step === "meals" && !canGenerate}
                className="brand-btn-primary w-full sm:w-auto"
              >
                {step === "preferences" ? "Gerar pré-plano" : "Continuar"}
              </button>
            )}
            {step === "review" && draft && draft.meals.length > 0 && (
              <button type="button" onClick={() => void handleApply()} disabled={applying} className="brand-btn-primary w-full sm:w-auto">
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
