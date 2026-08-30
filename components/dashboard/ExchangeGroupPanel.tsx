"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, Plus, RefreshCw, Search, Sparkles, Trash2, X } from "lucide-react";
import { useMealPlanNutritionData, type SummaryItem, type SummaryMeal } from "@/components/nutrition/MealPlanNutritionSummary";
import { EQUIVALENT_QUANTITY_CRITERIA, CRITERION_LABEL, type EquivalentQuantityCriterion, type EquivalentQuantityStatus } from "@/lib/nutrition/equivalent-quantity";

const NO_TARGET = { energyKcal: null, proteinG: null, carbohydrateG: null, fatG: null };

/** R2.2 — comparação usa exatamente os mesmos códigos de nutriente já
 * expostos por /api/admin/foods/nutrients (Nutrition Engine); nunca uma
 * fórmula própria (seção 19 do pedido). */
type PreviewNutrients = { energyKcal: number | null; proteinG: number | null; carbohydrateG: number | null; fatG: number | null; fiberG: number | null };
const PREVIEW_NUTRIENT_CODES: { key: keyof PreviewNutrients; code: string; label: string; unit: string }[] = [
  { key: "energyKcal", code: "ENERGY_KCAL", label: "Energia", unit: "kcal" },
  { key: "carbohydrateG", code: "CARBOHYDRATE", label: "Carboidrato", unit: "g" },
  { key: "proteinG", code: "PROTEIN", label: "Proteína", unit: "g" },
  { key: "fatG", code: "TOTAL_FAT", label: "Gordura", unit: "g" },
  { key: "fiberG", code: "FIBER", label: "Fibra", unit: "g" },
];

export interface ExchangeAlternativeView {
  id: string;
  food_name: string;
  quantity_grams: number;
  energy_kcal: number | null;
  protein_g: number | null;
  carbohydrate_g: number | null;
  fat_g: number | null;
  quality: string | null;
  same_subgroup: number;
  same_group: number;
  state: "SUGGESTED" | "APPROVED" | "EDITED" | "REJECTED";
}

export interface ExchangeGroupView {
  id: string;
  food_group: string;
  food_subgroup: string;
  primary_food_name: string;
  primary_quantity_grams?: number | null;
  exchange_list_id?: string | null;
  exchange_generation_mode?: string | null;
}

type FoodSearchItem = {
  ref?: { source: "TACO" | "COMPLEMENTARY" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF"; sourceId: string; canonicalId?: string | null };
  descricao?: string;
  displayName?: string;
  name?: string;
  sourceLabel?: string;
  grupo?: string;
};

/** Fontes aceitas por `/api/admin/foods/equivalent-quantity` (seção 1 do
 * pedido — não criar novo drawer, só conectar ao contrato real do
 * endpoint). TBCA/IBGE_POF ainda não têm identidade canônica consumível
 * pela Nutrition Engine (mesma restrição de `resolveItemReference`), então
 * simplesmente não recebem anotação de equivalência — nunca um número
 * inventado pra essas fontes. */
const EQUIVALENT_QUANTITY_SOURCES = new Set(["TACO", "CUSTOM", "MANUFACTURER", "USDA"]);

interface HouseholdPortionMatchView {
  portionId: string;
  label: string;
  gramWeight: number;
  approxCount: number;
  toleranceRatio: number;
}

interface EquivalentQuantityResultView {
  criterion: EquivalentQuantityCriterion;
  status: EquivalentQuantityStatus;
  practicalCandidateQuantityGrams: number | null;
  rawCandidateQuantityGrams: number | null;
  targetDelta: number | null;
  percentDifference: number | null;
  nutritionDelta: Partial<Record<"energyKcal" | "proteinG" | "carbohydrateG" | "fatG" | "fiberG", number | null>> | null;
}

interface EquivalentBatchItem {
  ref: { source: string; refId: string };
  name: string | null;
  sourceLabel: string | null;
  sameCategory: boolean;
  result: EquivalentQuantityResultView | null;
  householdPortion: HouseholdPortionMatchView | null;
}

function friendlyFoodName(technicalName: string) {
  const parts = technicalName.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.join(" ") : technicalName.trim();
}

function gramsLabel(value: number) {
  return `${Math.round(value * 10) / 10} g`;
}

function exchangeQualityLabel(value: string) {
  return ({ EXCELLENT: "equivalência alta", GOOD: "boa equivalência", REVIEW: "revisar", UNSUITABLE: "revisar" } as Record<string, string>)[value] ?? value;
}

function clinicalErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/NEEDS_FOOD_CONFIRMATION|confirme/i.test(message)) return "Confirme este alimento antes de gerar trocas.";
  if (/dados nutricionais|fonte sem cálculo|calcular/i.test(message)) return "Este alimento ainda não possui dados suficientes para calcular trocas.";
  return "Não foi possível gerar sugestões adequadas.";
}

export function ExchangeGroupPanel({
  clientId,
  mealPlanId,
  primaryFoodSource,
  primaryFoodRefId,
  primaryCanonicalFoodId,
  primaryFoodName,
  mealName,
  mealPlanItemId,
  primaryGrams,
  group,
  alternatives,
  onRefresh,
  onResolved,
  allMeals,
  mealIndex,
  itemIndex,
}: {
  clientId: string;
  mealPlanId: string;
  mealPlanItemId?: string | null;
  primaryFoodName?: string | null;
  mealName?: string | null;
  /** R2.3 — plano inteiro + posição do item, pra simular o candidato no
   * lugar dele e recalcular refeição/dia SEM persistir (seções 2-4/10-11). */
  allMeals?: SummaryMeal[];
  mealIndex?: number;
  itemIndex?: number;
  primaryFoodSource: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF" | null | undefined;
  primaryFoodRefId: string | null | undefined;
  primaryCanonicalFoodId?: string | null;
  primaryGrams: number | null | undefined;
  group: ExchangeGroupView | null;
  alternatives: ExchangeAlternativeView[];
  onRefresh: () => void;
  onResolved?: (identity: { food_source: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF"; food_ref_id: string; canonical_food_id: string | null }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [specificOpen, setSpecificOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [specificQuery, setSpecificQuery] = useState("");
  const [manualResults, setManualResults] = useState<FoodSearchItem[]>([]);
  const [manualSearchError, setManualSearchError] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // R2.2 — preview + comparação nutricional antes de adicionar (nunca
  // adiciona direto no clique do resultado de busca). `previewQuantity`
  // nasce igual à quantidade do alimento principal (nunca uma quantidade
  // "equivalente" calculada — isso é escopo da R3); a nutricionista pode
  // editar antes de confirmar.
  const [previewItem, setPreviewItem] = useState<FoodSearchItem | null>(null);
  const [previewQuantity, setPreviewQuantity] = useState("");
  const [previewCandidate, setPreviewCandidate] = useState<PreviewNutrients | null>(null);
  const [previewReference, setPreviewReference] = useState<PreviewNutrients | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // R3 — critério de equivalência (energia/proteína/carboidrato/gordura,
  // seção 2). ENERGY é só o default operacional/visual (seção 3), nunca
  // uma recomendação clínica. `previewQuantityEditedRef` marca quando a
  // nutricionista editou a quantidade manualmente — a partir daí, trocar
  // de critério nunca sobrescreve o que ela digitou (seção 4/32: recalcula
  // a sugestão, mas respeita edição manual já feita).
  const [criterion, setCriterion] = useState<EquivalentQuantityCriterion>("ENERGY");
  const [equivalentByKey, setEquivalentByKey] = useState<Map<string, EquivalentBatchItem>>(new Map());
  const [equivalentLoading, setEquivalentLoading] = useState(false);
  const [equivalentError, setEquivalentError] = useState(false);
  const equivalentRequestRef = useRef(0);
  const previewQuantityEditedRef = useRef(false);

  const hasStructuredIdentity = Boolean(primaryFoodSource && primaryFoodRefId);
  const canTryResolve = Boolean(mealPlanItemId && primaryFoodName?.trim());
  const hasGrams = Number.isFinite(primaryGrams) && (primaryGrams ?? 0) > 0;
  const isStale = Boolean(group && hasGrams && typeof group.primary_quantity_grams === "number" && Math.abs(group.primary_quantity_grams - (primaryGrams ?? 0)) >= 0.1);
  const canGenerate = hasGrams && (hasStructuredIdentity || canTryResolve);

  const visible = alternatives.filter((a) => a.state !== "REJECTED");
  const approved = visible.filter((a) => a.state === "APPROVED");
  const suggestions = visible.filter((a) => a.state === "SUGGESTED" || a.state === "EDITED");
  const visibleSuggestions = expanded ? suggestions.slice(0, 8) : suggestions.slice(0, 3);
  const hiddenSuggestionCount = Math.max(0, suggestions.length - visibleSuggestions.length);
  const selectedVisible = Array.from(selected).filter((id) => suggestions.some((alt) => alt.id === id));
  const primaryLabel = `${primaryFoodName ? friendlyFoodName(primaryFoodName) : "Alimento principal"}${hasGrams ? ` - ${gramsLabel(primaryGrams ?? 0)}` : ""}`;

  const manualSearchLabel = useMemo(() => {
    if (!manualOpen) return "";
    if (!manualQuery.trim()) return "Digite para pesquisar no catálogo.";
    if (!manualResults.length) return "Nenhum alimento encontrado.";
    return `${manualResults.length} resultado(s)`;
  }, [manualOpen, manualQuery, manualResults.length]);

  useEffect(() => {
    if (!manualOpen || manualQuery.trim().length < 2) {
      setManualResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => void runManualSearch(controller), 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualOpen, manualQuery]);

  async function runManualSearch(controller?: AbortController) {
    setManualSearchError(false);
    try {
      const response = await fetch(`/api/admin/foods/search?q=${encodeURIComponent(manualQuery.trim())}&limit=8`, { cache: "no-store", signal: controller?.signal });
      if (!response.ok) {
        // Falha da busca nunca fecha o drawer (seção 46) — mantém o
        // resultado anterior e mostra retry, em vez de "nenhum encontrado".
        setManualSearchError(true);
        return;
      }
      const data = await response.json() as { items?: FoodSearchItem[] };
      setManualResults(data.items ?? []);
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError")) setManualSearchError(true);
    }
  }

  useEffect(() => {
    if (manualOpen) window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [manualOpen]);

  /**
   * R3 — UMA chamada em lote pra todos os candidatos da busca atual
   * (seção 5/6/7: nunca 1 request por candidato, até 30 por vez, mesmo
   * limite do endpoint). Segurança contra resposta obsoleta (seção 9):
   * um contador de geração garante que só a resposta da chamada MAIS
   * recente (troca de critério, nova busca, novo alimento de referência)
   * atualiza o estado — uma resposta atrasada de uma chamada anterior é
   * descartada silenciosamente.
   */
  async function runEquivalentBatch(candidateRefs: { source: string; refId: string }[]) {
    const requestId = ++equivalentRequestRef.current;
    if (!hasStructuredIdentity || !hasGrams || !candidateRefs.length) {
      setEquivalentByKey(new Map());
      setEquivalentError(false);
      return;
    }
    setEquivalentLoading(true);
    setEquivalentError(false);
    try {
      const response = await fetch("/api/admin/foods/equivalent-quantity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceFood: { source: primaryFoodSource, refId: primaryFoodRefId },
          referenceGrams: primaryGrams,
          criterion,
          candidates: candidateRefs.slice(0, 30),
        }),
      });
      if (requestId !== equivalentRequestRef.current) return;
      if (!response.ok) {
        setEquivalentError(true);
        return;
      }
      const data = await response.json() as { items?: EquivalentBatchItem[] };
      if (requestId !== equivalentRequestRef.current) return;
      setEquivalentByKey(new Map((data.items ?? []).map((item) => [`${item.ref.source}:${item.ref.refId}`, item])));
    } catch (cause) {
      if (requestId === equivalentRequestRef.current && !(cause instanceof Error && cause.name === "AbortError")) setEquivalentError(true);
    } finally {
      if (requestId === equivalentRequestRef.current) setEquivalentLoading(false);
    }
  }

  useEffect(() => {
    // Nunca sugere o próprio alimento principal como substituição (seção 43).
    const candidateRefs = manualResults
      .filter((item) => item.ref && EQUIVALENT_QUANTITY_SOURCES.has(item.ref.source))
      .filter((item) => !(item.ref!.source === primaryFoodSource && item.ref!.sourceId === primaryFoodRefId))
      .map((item) => ({ source: item.ref!.source, refId: item.ref!.sourceId }));
    void runEquivalentBatch(candidateRefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualResults, criterion, hasStructuredIdentity, hasGrams, primaryFoodSource, primaryFoodRefId, primaryGrams]);

  /**
   * Ao trocar de critério (ou assim que o lote termina de calcular), a
   * quantidade sugerida no preview acompanha o novo critério — MAS só
   * enquanto a nutricionista não editou a quantidade manualmente (seção
   * 32: recalcula a sugestão; nunca sobrescreve uma edição deliberada).
   */
  useEffect(() => {
    if (!previewItem?.ref || previewQuantityEditedRef.current) return;
    const entry = equivalentByKey.get(`${previewItem.ref.source}:${previewItem.ref.sourceId}`);
    if (entry?.result?.status === "CALCULATED" && entry.result.practicalCandidateQuantityGrams != null) {
      setPreviewQuantity(String(entry.result.practicalCandidateQuantityGrams));
    }
  }, [criterion, equivalentByKey, previewItem]);

  async function fetchPreviewNutrients(ref: { source: string; sourceId: string }, grams: number, signal?: AbortSignal): Promise<PreviewNutrients | null> {
    const params = new URLSearchParams({ source: ref.source, sourceId: ref.sourceId, quantity: String(grams), unit: "g" });
    const response = await fetch(`/api/admin/foods/nutrients?${params}`, { cache: "no-store", signal });
    if (!response.ok) return null;
    const data = await response.json() as { nutrients: { code: string; value: number | null }[] };
    const byCode = new Map(data.nutrients.map((entry) => [entry.code, entry.value]));
    return {
      energyKcal: byCode.get("ENERGY_KCAL") ?? null,
      proteinG: byCode.get("PROTEIN") ?? null,
      carbohydrateG: byCode.get("CARBOHYDRATE") ?? null,
      fatG: byCode.get("TOTAL_FAT") ?? null,
      fiberG: byCode.get("FIBER") ?? null,
    };
  }

  function openPreview(item: FoodSearchItem) {
    previewQuantityEditedRef.current = false;
    setPreviewItem(item);
    const entry = item.ref ? equivalentByKey.get(`${item.ref.source}:${item.ref.sourceId}`) : undefined;
    const suggested = entry?.result?.status === "CALCULATED" ? entry.result.practicalCandidateQuantityGrams : null;
    setPreviewQuantity(suggested != null ? String(suggested) : hasGrams ? String(Math.round((primaryGrams ?? 0) * 10) / 10) : "100");
    setPreviewCandidate(null);
    setPreviewReference(null);
    setPreviewError("");
  }

  function closePreview() {
    setPreviewItem(null);
    setPreviewCandidate(null);
    setPreviewReference(null);
    setPreviewError("");
  }

  function handlePreviewQuantityChange(value: string) {
    previewQuantityEditedRef.current = true;
    setPreviewQuantity(value);
  }

  useEffect(() => {
    if (!previewItem?.ref) return;
    const quantityNumber = Number(previewQuantity.replace(",", "."));
    if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const candidatePromise = fetchPreviewNutrients({ source: previewItem.ref!.source, sourceId: previewItem.ref!.sourceId }, quantityNumber, controller.signal);
        const referencePromise = hasStructuredIdentity && hasGrams
          ? fetchPreviewNutrients({ source: primaryFoodSource!, sourceId: primaryFoodRefId! }, primaryGrams ?? 0, controller.signal)
          : Promise.resolve(null);
        const [candidate, reference] = await Promise.all([candidatePromise, referencePromise]);
        if (controller.signal.aborted) return;
        if (!candidate) {
          setPreviewError("Este alimento ainda não possui dados nutricionais suficientes para comparar.");
          setPreviewCandidate(null);
        } else {
          setPreviewCandidate(candidate);
        }
        setPreviewReference(reference);
      } catch (cause) {
        if (!(cause instanceof Error && cause.name === "AbortError")) setPreviewError("Não foi possível calcular a comparação nutricional agora.");
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewItem, previewQuantity]);

  async function generate() {
    if (!canGenerate) {
      setError(!hasGrams ? "Este alimento ainda não possui dados suficientes para calcular trocas." : "Confirme este alimento antes de gerar trocas.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/exchange-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealPlanId,
          ...(hasStructuredIdentity
            ? {
                primaryFoodSource,
                primaryFoodRefId,
                primaryCanonicalFoodId: primaryCanonicalFoodId ?? null,
                ...(mealPlanItemId ? { mealPlanItemId } : {}),
              }
            : {
                mealPlanItemId,
                primaryFoodName,
              }),
          primaryQuantityGrams: primaryGrams,
          mealName: mealName ?? null,
          limit: 5,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code || data.message || "generation_failed");
      if (data.resolvedItem?.status === "RESOLVED") {
        onResolved?.({
          food_source: data.resolvedItem.food_source,
          food_ref_id: data.resolvedItem.food_ref_id,
          canonical_food_id: data.resolvedItem.canonical_food_id ?? null,
        });
      }
      setSelected(new Set());
      await onRefresh();
    } catch (cause) {
      setError(clinicalErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function patchGroup(body: Record<string, unknown>) {
    if (!group) return null;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/exchange-groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível atualizar trocas.");
      await onRefresh();
      return data;
    } catch (cause) {
      setError(clinicalErrorMessage(cause));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function approveSelected() {
    if (!selectedVisible.length) return;
    await patchGroup({ action: "approve", alternativeIds: selectedVisible });
    setSelected(new Set());
  }

  async function removeOrReject(alternativeId: string) {
    await patchGroup({ action: "reject", alternativeId });
    setSelected((current) => {
      const next = new Set(current);
      next.delete(alternativeId);
      return next;
    });
  }

  /**
   * `quantityGrams` é SEMPRE explícito aqui (a quantidade mostrada/editada
   * no preview) — nunca omitido, pra nunca cair no cálculo automático de
   * "quantidade equivalente" que a rota também sabe fazer (isso é escopo
   * da R3; na R2 a quantidade nunca é ajustada sozinha só pra parecer
   * equivalente — seção 49 do pedido).
   */
  async function addManual(item: FoodSearchItem, quantityGrams: number) {
    if (!item.ref || !group) return;
    const data = await patchGroup({
      action: "add_manual",
      source: item.ref.source,
      sourceId: item.ref.sourceId,
      canonicalId: item.ref.canonicalId ?? null,
      quantityGrams,
    });
    if (data) {
      setManualOpen(false);
      setManualQuery("");
      setManualResults([]);
      closePreview();
      // O item recém-adicionado entra como a última sugestão (sort_order) —
      // expande a lista pra ele ficar visível imediatamente, sem exigir um
      // clique extra em "Ver mais" (seção 34: "adicionar -> drawer atualiza").
      setExpanded(true);
    }
  }

  async function confirmAddPreview() {
    if (!previewItem) return;
    const quantityNumber = Number(previewQuantity.replace(",", "."));
    if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
      setPreviewError("Informe uma quantidade válida.");
      return;
    }
    await addManual(previewItem, quantityNumber);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#EAD8C2] bg-[#FFFDFC] p-4">
        <p className="brand-kicker">Trocas</p>
        <h3 className="mt-1 font-serif text-xl font-semibold text-[#3A3028]">Alimento principal</h3>
        <p className="mt-1 text-sm font-semibold text-[#3A3028]">{primaryLabel}</p>
        {mealName && <p className="mt-0.5 text-xs text-[#75675E]">{mealName}</p>}
      </section>

      {isStale && (
        <section className="rounded-xl border border-[#F0D4B8] bg-[#FFF8F0] p-4">
          <p className="text-sm font-semibold text-[#7A5420]">Trocas precisam ser atualizadas.</p>
          <p className="mt-1 text-xs leading-5 text-[#8C6E52]">A prescrição do alimento principal mudou desde o último cálculo.</p>
          <button type="button" onClick={generate} disabled={loading || !canGenerate} className="brand-btn-secondary mt-3">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar trocas
          </button>
        </section>
      )}

      {error && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={generate} disabled={loading || !canGenerate} className="brand-btn-secondary">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Tentar novamente
            </button>
            {group && (
              <button type="button" onClick={() => setManualOpen(true)} className="brand-btn-secondary">
                <Plus className="h-4 w-4" />
                Adicionar manualmente
              </button>
            )}
          </div>
        </section>
      )}

      {!group && !error && (
        <section className="rounded-xl border border-[#EDE1D6] bg-white p-4">
          <p className="text-sm font-semibold text-[#3A3028]">Nenhuma troca cadastrada.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={generate} disabled={loading || !canGenerate} className="brand-btn-primary">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Gerar sugestões
            </button>
            <button type="button" onClick={() => setManualOpen(true)} disabled={!group} className="brand-btn-secondary">
              <Plus className="h-4 w-4" />
              Adicionar manualmente
            </button>
          </div>
        </section>
      )}

      {group && (
        <>
          <ExchangeListSection
            title="Aprovadas"
            emptyText="Nenhuma troca aprovada."
            alternatives={approved}
            loading={loading}
            mode="approved"
            selected={selected}
            onToggle={toggle}
            onRemove={removeOrReject}
          />

          <ExchangeListSection
            title="Sugestões"
            emptyText="Nenhuma sugestão para revisar."
            alternatives={visibleSuggestions}
            loading={loading}
            mode="suggested"
            selected={selected}
            onToggle={toggle}
            onRemove={removeOrReject}
          />

          {hiddenSuggestionCount > 0 && (
            <button type="button" onClick={() => setExpanded(true)} className="text-xs font-semibold text-[#607A56] hover:underline">
              Ver mais
            </button>
          )}
          {expanded && suggestions.length > 3 && (
            <button type="button" onClick={() => setExpanded(false)} className="ml-3 text-xs font-semibold text-[#607A56] hover:underline">
              Ver menos
            </button>
          )}

          {selectedVisible.length > 0 && (
            <button type="button" onClick={approveSelected} disabled={loading} className="brand-btn-primary">
              <Check className="h-4 w-4" />
              Aprovar selecionadas
            </button>
          )}

          <div className="space-y-3 border-t border-[#EDE1D6] pt-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setManualOpen((current) => !current)} className="brand-btn-secondary">
                <Plus className="h-4 w-4" />
                Adicionar outra
              </button>
              <button type="button" onClick={generate} disabled={loading || !canGenerate} className="brand-btn-secondary">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Gerar outras sugestões
              </button>
              <button type="button" onClick={() => setSpecificOpen((current) => !current)} className="inline-flex min-h-10 items-center justify-center rounded-full px-3 text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1]">
                Pedir sugestão específica
              </button>
            </div>

            {manualOpen && hasStructuredIdentity && hasGrams && (
              <CriterionSelector value={criterion} onChange={setCriterion} />
            )}

            {manualOpen && !previewItem && (
              <div className="rounded-xl border border-[#EDE1D6] bg-[#FAF7F2]/60 p-3">
                <label className="brand-label" htmlFor="exchange-manual-search">Pesquisar alimento</label>
                <div className="mt-1 flex items-center gap-2">
                  <Search className="h-4 w-4 shrink-0 text-[#75675E]" />
                  <input
                    ref={searchInputRef}
                    id="exchange-manual-search"
                    value={manualQuery}
                    onChange={(event) => setManualQuery(event.target.value)}
                    className="brand-input"
                    placeholder="Ex.: mandioca, arroz branco..."
                  />
                </div>
                {manualSearchError ? (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2.5">
                    <p className="text-xs font-semibold text-red-700">Não foi possível pesquisar agora.</p>
                    <button type="button" onClick={() => void runManualSearch()} className="mt-1.5 text-xs font-semibold text-[#607A56] hover:underline">
                      Tentar novamente
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[#75675E]">{manualSearchLabel}</p>
                )}
                {manualResults.length > 0 && (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[#EAD8C2] bg-white p-1">
                    {manualResults.map((item, index) => {
                      const label = item.displayName ?? item.name ?? item.descricao ?? "Alimento";
                      const entry = item.ref ? equivalentByKey.get(`${item.ref.source}:${item.ref.sourceId}`) : undefined;
                      return (
                        <button
                          key={`${item.ref?.source ?? "food"}:${item.ref?.sourceId ?? index}`}
                          type="button"
                          onClick={() => openPreview(item)}
                          disabled={loading || !item.ref}
                          className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#FAF7F2] disabled:opacity-50"
                        >
                          <span className="block text-sm font-semibold text-[#3A3028]">{label}</span>
                          <span className="mt-0.5 block text-[10px] uppercase tracking-[0.08em] text-[#8C6E52]">{item.sourceLabel ?? item.grupo ?? "Catálogo"}</span>
                          <EquivalentQuantitySummary entry={entry} loading={equivalentLoading && !entry} criterion={criterion} />
                        </button>
                      );
                    })}
                  </div>
                )}
                {equivalentError && (
                  <p className="mt-2 text-xs font-semibold text-red-700">
                    Não foi possível calcular a equivalência agora.{" "}
                    <button
                      type="button"
                      onClick={() => void runEquivalentBatch(manualResults.filter((item) => item.ref && EQUIVALENT_QUANTITY_SOURCES.has(item.ref.source)).map((item) => ({ source: item.ref!.source, refId: item.ref!.sourceId })))}
                      className="underline"
                    >
                      Tentar novamente
                    </button>
                  </p>
                )}
              </div>
            )}

            {manualOpen && previewItem && (
              <FoodPreviewCard
                item={previewItem}
                quantity={previewQuantity}
                onQuantityChange={handlePreviewQuantityChange}
                candidate={previewCandidate}
                reference={previewReference}
                loading={previewLoading}
                error={previewError}
                addDisabled={loading || !previewCandidate}
                onCancel={closePreview}
                onConfirm={() => void confirmAddPreview()}
                equivalentEntry={previewItem.ref ? equivalentByKey.get(`${previewItem.ref.source}:${previewItem.ref.sourceId}`) : undefined}
                criterion={criterion}
                impactProps={
                  allMeals && typeof mealIndex === "number" && typeof itemIndex === "number" && previewItem.ref
                    ? { allMeals, mealIndex, itemIndex, candidateRef: previewItem.ref, quantity: previewQuantity }
                    : null
                }
              />
            )}

            {specificOpen && (
              <div className="rounded-xl border border-[#EDE1D6] bg-white p-3">
                <label className="brand-label" htmlFor="exchange-specific-request">Sugestão específica</label>
                <input
                  id="exchange-specific-request"
                  value={specificQuery}
                  onChange={(event) => setSpecificQuery(event.target.value)}
                  className="brand-input mt-1"
                  placeholder="Ex.: quero uma opção sem glúten"
                />
                <p className="mt-2 text-xs leading-5 text-[#75675E]">A busca usa o catálogo real; a quantidade continua sendo calculada pelo sistema.</p>
                <button
                  type="button"
                  disabled={!specificQuery.trim()}
                  onClick={() => {
                    setManualOpen(true);
                    setManualQuery(specificQuery);
                  }}
                  className="brand-btn-secondary mt-3"
                >
                  <Search className="h-4 w-4" />
                  Buscar opções
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function formatDeltaValue(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded} ${unit}`;
}

const SPOKEN_UNIT: Record<string, string> = { kcal: "quilocalorias", g: "gramas", mg: "miligramas" };

/**
 * Texto para leitor de tela (seção 27) — nunca só a cor/sinal visual.
 * Diferença objetiva, sem qualificação clínica de bom/ruim (seção 28).
 */
export function accessibleDeltaPhrase(value: number, unit: string, label: string): string {
  const rounded = Math.abs(Math.round(value * 10) / 10);
  const spokenUnit = SPOKEN_UNIT[unit] ?? unit;
  if (rounded === 0) return `${label}: sem alteração`;
  return `${label}: ${rounded} ${spokenUnit} a ${value > 0 ? "mais" : "menos"}`;
}

const CRITERION_ORDER: EquivalentQuantityCriterion[] = EQUIVALENT_QUANTITY_CRITERIA;

const NOT_CALCULABLE_MESSAGE: Record<Exclude<EquivalentQuantityStatus, "CALCULATED">, string> = {
  NOT_CALCULABLE: "Não foi possível calcular equivalência para este critério.",
  MISSING_TARGET_NUTRIENT: "Não foi possível calcular equivalência para este critério.",
  ZERO_TARGET_NUTRIENT: "Não foi possível calcular equivalência para este critério.",
  INVALID_QUANTITY: "Não foi possível calcular equivalência para este critério.",
};

/**
 * Seletor de critério de equivalência (seção 2/3): ENERGY é só o default
 * visual/operacional inicial — nunca apresentado como recomendação
 * clínica (nenhum rótulo de "melhor" aqui). Botões nativos com
 * `aria-pressed` já cobrem navegação por teclado (Tab + Enter/Espaço)
 * sem precisar de um padrão de tabs mais complexo (seção 44).
 */
function CriterionSelector({ value, onChange }: { value: EquivalentQuantityCriterion; onChange: (criterion: EquivalentQuantityCriterion) => void }) {
  return (
    <div className="rounded-xl border border-[#EDE1D6] bg-white p-2.5">
      <p className="brand-label" id="exchange-criterion-label">Equivalência por</p>
      <div role="group" aria-labelledby="exchange-criterion-label" className="mt-1.5 flex flex-wrap gap-1.5">
        {CRITERION_ORDER.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`min-h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${
              value === option ? "border-[#607A56] bg-[#607A56] text-white" : "border-[#EAD8C2] bg-white text-[#75675E] hover:bg-[#FAF7F2]"
            }`}
          >
            {CRITERION_LABEL[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Linha compacta usada dentro de cada resultado de busca (seção 10, versão resumida — o detalhe completo por macro fica no card de preview ao selecionar). */
function EquivalentQuantitySummary({ entry, loading, criterion }: { entry: EquivalentBatchItem | undefined; loading: boolean; criterion: EquivalentQuantityCriterion }) {
  if (loading) return <span className="mt-1 flex items-center gap-1 text-[10px] text-[#8C6E52]"><Loader2 className="h-3 w-3 animate-spin" /> Calculando equivalência...</span>;
  if (!entry?.result) return null;
  if (entry.result.status !== "CALCULATED") {
    return <span className="mt-1 block text-[10px] text-[#8C6E52]">{NOT_CALCULABLE_MESSAGE[entry.result.status]}</span>;
  }
  const grams = entry.result.practicalCandidateQuantityGrams;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-[#8C6E52]">
      <span className="font-semibold text-[#3A3028]">{grams} g</span>
      {entry.householdPortion && <span>≈ {entry.householdPortion.approxCount} {entry.householdPortion.label}</span>}
      {entry.result.percentDifference !== null && (
        <span>{Math.abs(Math.round(entry.result.percentDifference * 10) / 10)}% de diferença em {CRITERION_LABEL[criterion].toLowerCase()}</span>
      )}
    </span>
  );
}

/** Detalhe da equivalência dentro do card de preview (seção 11-17): quantidade prática em destaque, bruta só como detalhe opcional, medida caseira só quando real. */
function EquivalentQuantityDetail({ entry, criterion }: { entry: EquivalentBatchItem | undefined; criterion: EquivalentQuantityCriterion }) {
  if (!entry?.result) return null;
  if (entry.result.status !== "CALCULATED") {
    return <p className="mt-1.5 text-xs text-[#8C6E52]">{NOT_CALCULABLE_MESSAGE[entry.result.status]}</p>;
  }
  const { practicalCandidateQuantityGrams, rawCandidateQuantityGrams, percentDifference } = entry.result;
  return (
    <p className="mt-1.5 text-xs text-[#75675E]">
      Quantidade equivalente ({CRITERION_LABEL[criterion].toLowerCase()}):{" "}
      <span
        className="font-semibold text-[#3A3028]"
        title={rawCandidateQuantityGrams !== null ? `Quantidade matemática: ${Math.round(rawCandidateQuantityGrams * 100) / 100} g` : undefined}
      >
        {practicalCandidateQuantityGrams} g
      </span>
      {entry.householdPortion && <> · ≈ {entry.householdPortion.approxCount} {entry.householdPortion.label}</>}
      {percentDifference !== null && (
        <span className="text-[#8C6E52]"> ({Math.abs(Math.round(percentDifference * 10) / 10)}% de diferença)</span>
      )}
    </p>
  );
}

/**
 * Preview + comparação nutricional (seções 15-22 do pedido) antes de
 * confirmar a adição. Nunca calcula nada por conta própria — os valores de
 * candidato e referência já vêm prontos de /api/admin/foods/nutrients
 * (mesma Nutrition Engine); esta função só faz a subtração (delta).
 * Ausência de dado (missing) é sempre "—", nunca 0.
 */
function FoodPreviewCard({
  item,
  quantity,
  onQuantityChange,
  candidate,
  reference,
  loading,
  error,
  addDisabled,
  onCancel,
  onConfirm,
  equivalentEntry,
  criterion,
  impactProps,
}: {
  item: FoodSearchItem;
  quantity: string;
  onQuantityChange: (value: string) => void;
  candidate: PreviewNutrients | null;
  reference: PreviewNutrients | null;
  loading: boolean;
  error: string;
  addDisabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  equivalentEntry?: EquivalentBatchItem;
  criterion: EquivalentQuantityCriterion;
  impactProps: { allMeals: SummaryMeal[]; mealIndex: number; itemIndex: number; candidateRef: { source: string; sourceId: string; canonicalId?: string | null }; quantity: string } | null;
}) {
  const label = item.displayName ?? item.name ?? item.descricao ?? "Alimento";
  return (
    <div className="rounded-xl border border-[#EDE1D6] bg-white p-3">
      <button type="button" onClick={onCancel} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[#75675E] hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar à busca
      </button>

      <p className="text-sm font-semibold text-[#3A3028]">{friendlyFoodName(label)} · {item.sourceLabel ?? "Catálogo"}</p>

      <EquivalentQuantityDetail entry={equivalentEntry} criterion={criterion} />

      <div className="mt-2">
        <label className="brand-label" htmlFor="exchange-preview-quantity">Quantidade (g)</label>
        <input
          id="exchange-preview-quantity"
          inputMode="decimal"
          value={quantity}
          onChange={(event) => onQuantityChange(event.target.value)}
          className="brand-input mt-1 w-28"
        />
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>}

      {loading && !candidate ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-[#75675E]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando comparação...</p>
      ) : candidate ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-[#EAD8C2]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#FAF7F2] text-left text-[#75675E]">
                <th className="px-2 py-1.5 font-semibold">Nutriente</th>
                <th className="px-2 py-1.5 text-right font-semibold">Candidato</th>
                <th className="px-2 py-1.5 text-right font-semibold">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {PREVIEW_NUTRIENT_CODES.map(({ key, label: nutrientLabel, unit }) => {
                const candidateValue = candidate[key];
                const referenceValue = reference?.[key] ?? null;
                const hasDelta = candidateValue !== null && referenceValue !== null;
                return (
                  <tr key={key} className="border-t border-[#EDE1D6]">
                    <td className="px-2 py-1.5 text-[#3A3028]">{nutrientLabel}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-[#3A3028]">{candidateValue === null ? "—" : `${Math.round(candidateValue * 10) / 10} ${unit}`}</td>
                    <td className="px-2 py-1.5 text-right text-[#75675E]">
                      {hasDelta ? (
                        <span aria-label={accessibleDeltaPhrase(candidateValue - referenceValue, unit, nutrientLabel)}>
                          {formatDeltaValue(candidateValue - referenceValue, unit)}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-[#EDE1D6] bg-[#FAF7F2]/60 px-2 py-1.5 text-[10px] text-[#8C6E52]">Comparando por energia (kcal) · diferença = candidato − alimento principal</p>
        </div>
      ) : null}

      {impactProps && candidate && <MealDayImpactPreview {...impactProps} />}

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onConfirm} disabled={addDisabled} className="brand-btn-primary">
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
        <button type="button" onClick={onCancel} className="brand-btn-secondary">
          Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * R2.3 (seções 10-19) — impacto na refeição e no dia, SEM persistir nada:
 * substitui o item simulado num clone de `allMeals` em memória e recalcula
 * pela MESMA Nutrition Engine (calculateFlexiblePlanNutrients, via
 * useMealPlanNutritionData) usada pela sidebar real — nunca uma fórmula
 * paralela. Respeita range (OPTIONS/COMBINATION) automaticamente porque é
 * o motor de verdade que decide como combinar os valores, não este
 * componente.
 */
function MealDayImpactPreview({
  allMeals,
  mealIndex,
  itemIndex,
  candidateRef,
  quantity,
}: {
  allMeals: SummaryMeal[];
  mealIndex: number;
  itemIndex: number;
  candidateRef: { source: string; sourceId: string; canonicalId?: string | null };
  quantity: string;
}) {
  const quantityNumber = Number(quantity.replace(",", "."));
  const previewMeals = useMemo(() => {
    if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) return allMeals;
    const targetMeal = allMeals[mealIndex];
    if (!targetMeal) return allMeals;
    return allMeals.map((meal, index) => index !== mealIndex ? meal : {
      ...meal,
      items: meal.items.map((item, index2) => index2 !== itemIndex ? item : {
        ...item,
        food_source: candidateRef.source as SummaryItem["food_source"],
        food_ref_id: candidateRef.sourceId,
        quantity: String(quantityNumber),
        unit: "g",
        household_measure_id: null,
        resolved_grams_snapshot: null,
        quantity_resolution_snapshot: null,
        // Um item prescrito pode ter nutrition_snapshot congelado
        // (lib/nutrition/food-snapshot.ts#referenceFromSnapshot é
        // verificado ANTES de food_source/food_ref_id) — sem limpar aqui,
        // o preview simulado recalculava com o snapshot do alimento
        // ORIGINAL, mostrando "sem diferença" mesmo trocando de alimento.
        food_name_snapshot: null,
        nutrition_snapshot: null,
      } as SummaryItem),
    });
  }, [allMeals, mealIndex, itemIndex, candidateRef.source, candidateRef.sourceId, quantityNumber]);

  const currentDay = useMealPlanNutritionData({ meals: allMeals, target: NO_TARGET });
  const previewDay = useMealPlanNutritionData({ meals: previewMeals, target: NO_TARGET });
  const currentMealOnly = useMemo(() => (allMeals[mealIndex] ? [allMeals[mealIndex]] : []), [allMeals, mealIndex]);
  const previewMealOnly = useMemo(() => (previewMeals[mealIndex] ? [previewMeals[mealIndex]] : []), [previewMeals, mealIndex]);
  const currentMeal = useMealPlanNutritionData({ meals: currentMealOnly, target: NO_TARGET });
  const previewMeal = useMealPlanNutritionData({ meals: previewMealOnly, target: NO_TARGET });

  if (previewMeals === allMeals) return null;

  function renderRow(scopeLabel: string, current: ReturnType<typeof useMealPlanNutritionData>, preview: ReturnType<typeof useMealPlanNutritionData>) {
    const round = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);
    const currentMin = round(current.flexibleResult.total.min.energyKcal);
    const currentMax = round(current.flexibleResult.total.max.energyKcal);
    const previewMin = round(preview.flexibleResult.total.min.energyKcal);
    const previewMax = round(preview.flexibleResult.total.max.energyKcal);
    const currentText = currentMin === null && currentMax === null ? "—" : current.flexibleResult.total.varies ? `${currentMin ?? "?"}–${currentMax ?? "?"} kcal` : `${currentMin ?? currentMax} kcal`;
    const previewText = previewMin === null && previewMax === null ? "—" : preview.flexibleResult.total.varies ? `${previewMin ?? "?"}–${previewMax ?? "?"} kcal` : `${previewMin ?? previewMax} kcal`;
    const hasDelta = currentMin !== null && previewMin !== null;
    const deltaText = hasDelta ? formatDeltaValue((previewMin as number) - (currentMin as number), "kcal") : "—";
    return (
      <div className="rounded-lg border border-[#EDE1D6] bg-[#FAF7F2]/60 p-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#607A56]">{scopeLabel}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-1.5 text-sm">
          <span className="text-[#75675E]">{currentText}</span>
          <span aria-hidden="true">→</span>
          <span className="font-semibold text-[#3A3028]">{previewText}</span>
          <span
            className="font-semibold text-[#607A56]"
            aria-label={hasDelta ? accessibleDeltaPhrase((previewMin as number) - (currentMin as number), "kcal", `Impacto na ${scopeLabel.toLowerCase()}`) : undefined}
          >
            {deltaText}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8C6E52]">Impacto (nunca salvo automaticamente)</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {renderRow("Refeição", currentMeal, previewMeal)}
        {renderRow("Dia", currentDay, previewDay)}
      </div>
    </div>
  );
}

function ExchangeListSection({
  title,
  emptyText,
  alternatives,
  loading,
  mode,
  selected,
  onToggle,
  onRemove,
}: {
  title: string;
  emptyText: string;
  alternatives: ExchangeAlternativeView[];
  loading: boolean;
  mode: "approved" | "suggested";
  selected: Set<string>;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-[#EDE1D6] bg-white p-4">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#607A56]">{title}</h4>
      {alternatives.length ? (
        <ul className="mt-2 space-y-1.5">
          {alternatives.map((alt) => (
            <li key={alt.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-[#FAF7F2]/70 px-3 py-2.5">
              {mode === "suggested" ? (
                <label className="flex min-w-0 items-center gap-2">
                  <input type="checkbox" checked={selected.has(alt.id)} onChange={() => onToggle(alt.id)} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#3A3028]">{friendlyFoodName(alt.food_name)}</span><span className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-medium text-[#75675E]"><span>{alt.energy_kcal === null ? "Energia —" : `${Math.round(alt.energy_kcal)} kcal`}</span><span>{alt.protein_g === null ? "Proteína —" : `${Math.round(alt.protein_g * 10) / 10} g proteína`}</span>{alt.quality && <span className="rounded-full bg-[#EAF0E4] px-1.5 py-0.5 font-semibold text-[#4F7D45]">{exchangeQualityLabel(alt.quality)}</span>}</span></span>
                </label>
              ) : (
                <span className="flex min-w-0 items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-[#607A56]" aria-hidden="true" />
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#3A3028]">{friendlyFoodName(alt.food_name)}</span><span className="mt-1 block text-[10px] text-[#75675E]">{alt.energy_kcal === null ? "Energia não disponível" : `${Math.round(alt.energy_kcal)} kcal`} · {alt.protein_g === null ? "proteína —" : `${Math.round(alt.protein_g * 10) / 10} g proteína`}</span></span>
                </span>
              )}
              <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[#3A3028]">
                {gramsLabel(alt.quantity_grams)}
                <button
                  type="button"
                  onClick={() => onRemove(alt.id)}
                  disabled={loading}
                  className="inline-flex h-8 items-center justify-center rounded-lg px-2 text-[11px] font-semibold text-[#8C5F50] hover:bg-[#FFF3E9] disabled:opacity-50"
                  aria-label={mode === "approved" ? `Remover ${friendlyFoodName(alt.food_name)}` : `Rejeitar ${friendlyFoodName(alt.food_name)}`}
                >
                  {mode === "approved" ? "Remover" : <><Trash2 className="h-3.5 w-3.5" /><span className="sr-only">Rejeitar</span></>}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-[#75675E]">{emptyText}</p>
      )}
    </section>
  );
}
