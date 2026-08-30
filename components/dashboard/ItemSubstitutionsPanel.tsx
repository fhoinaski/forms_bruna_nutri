"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles, Trash2, X } from "lucide-react";

/**
 * Substituições nutricionais equivalentes de UM item do plano (evolução da
 * lista de "grupo de troca" já existente — components/dashboard/MealPlanEditor.tsx
 * SubstitutionsEditor). A IA (quando usada) só propõe NOMES de alimentos;
 * todo número mostrado aqui vem de /substitutions/suggest, que resolve o
 * candidato contra o catálogo real e calcula pela engine nutricional oficial
 * — nunca da IA. Nada é aplicado ao plano até a nutricionista clicar
 * "Aprovar" (que só marca approved_by_professional=true no array local —
 * salvar continua exigindo o botão normal "Salvar", versionado como sempre).
 */

export type ItemSubstitution = {
  id?: string;
  base_food: string;
  option_food: string;
  quantity?: string | null;
  unit?: string | null;
  notes?: string | null;
  base_food_source?: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | null;
  base_food_ref_id?: string | null;
  option_food_source?: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | null;
  option_food_ref_id?: string | null;
  option_household_measure_id?: string | null;
  option_nutrition_snapshot?: string | null;
  equivalence_mode?: "energy" | "nutritional" | null;
  equivalence_score?: number | null;
  equivalence_quality?: "EXCELLENT" | "GOOD" | "REVIEW" | "UNSUITABLE" | null;
  approved_by_professional?: boolean;
  ai_suggested?: boolean;
};

interface SuggestResult {
  foodSource: "TACO" | "CUSTOM" | "MANUFACTURER";
  foodRefId: string;
  displayName: string;
  quantityGrams: number;
  nutrition: { energyKcal: number | null; proteinG: number | null; carbohydrateG: number | null; fatG: number | null; fiberG: number | null };
  mode: "energy" | "nutritional";
  score: number;
  quality: "EXCELLENT" | "GOOD" | "REVIEW" | "UNSUITABLE";
}

type NutrientValues = SuggestResult["nutrition"];

const QUALITY_LABEL: Record<string, string> = {
  EXCELLENT: "Equivalência excelente",
  GOOD: "Equivalência boa",
  REVIEW: "Requer revisão profissional",
  UNSUITABLE: "Não recomendado",
};
const QUALITY_STYLE: Record<string, string> = {
  EXCELLENT: "text-[#4F7D45]",
  GOOD: "text-[#607A56]",
  REVIEW: "text-[#B5762F]",
  UNSUITABLE: "text-red-600",
};

interface SimulationMeal {
  name: string;
  items: { food: string; quantity?: string | null; unit?: string | null; food_source?: string | null; food_ref_id?: string | null }[];
}

interface SimulationResult {
  totalBefore: { energyKcal: number | null; proteinG: number | null; carbohydrateG: number | null; fatG: number | null };
  totalAfter: { energyKcal: number | null; proteinG: number | null; carbohydrateG: number | null; fatG: number | null };
}

export function ItemSubstitutionsPanel({
  clientId,
  itemFood,
  itemFoodSource,
  itemFoodRefId,
  itemGrams,
  substitutionsLocked = false,
  substitutions,
  currentMeals,
  onAdd,
  onApprove,
  onRemove,
}: {
  clientId: string;
  itemFood: string;
  itemFoodSource: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | null | undefined;
  itemFoodRefId: string | null | undefined;
  /** Gramas JÁ resolvidas (medida caseira convertida, se houver) — nunca o `quantity` bruto do item, que pode ser uma contagem de unidades/colheres, não gramas. */
  itemGrams: number | null | undefined;
  /** Item marcado como "não sugerir substituições automaticamente" — geração global/em lote pula este item, mas adicionar manualmente aqui continua permitido (a nutricionista escolheu explicitamente abrir este painel). */
  substitutionsLocked?: boolean;
  substitutions: ItemSubstitution[];
  /** Refeições atuais do plano (não salvas) — só usado pra "Simular" (nunca altera nada, só recalcula uma cópia via engine real no servidor). */
  currentMeals?: SimulationMeal[];
  onAdd: (substitution: ItemSubstitution) => void;
  onApprove: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const [manualQuery, setManualQuery] = useState("");
  const [mode, setMode] = useState<"energy" | "nutritional">("nutritional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestResult[]>([]);
  const [suggestionBaseNutrition, setSuggestionBaseNutrition] = useState<NutrientValues | null>(null);
  const [needsReview, setNeedsReview] = useState<{ query: string; reason: string }[]>([]);
  const [simulating, setSimulating] = useState<number | null>(null);
  const [simulationResult, setSimulationResult] = useState<{ index: number; data: SimulationResult } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  async function simulate(sub: ItemSubstitution, globalIndex: number) {
    if (!currentMeals || !sub.option_food_source || !sub.option_food_ref_id) return;
    setSimulating(globalIndex);
    setSimulationResult(null);
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/substitutions/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentMeals,
          baseFoodSource: itemFoodSource,
          baseFoodRefId: itemFoodRefId,
          optionFoodSource: sub.option_food_source,
          optionFoodRefId: sub.option_food_ref_id,
          optionFoodName: sub.option_food,
          optionQuantity: sub.quantity ?? "0",
          optionUnit: sub.unit ?? "g",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível simular esta troca.");
      setSimulationResult({ index: globalIndex, data });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível simular esta troca.");
    } finally {
      setSimulating(null);
    }
  }

  const baseGrams = itemGrams ?? 0;
  const canSuggest = Boolean(itemFoodSource && itemFoodRefId) && Number.isFinite(baseGrams) && baseGrams > 0;

  async function runSuggest(queries: string[]) {
    if (!canSuggest || !queries.length) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/substitutions/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseFoodSource: itemFoodSource, baseFoodRefId: itemFoodRefId, baseQuantity: baseGrams, mode, candidateQueries: queries }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível buscar substituições.");
      setSuggestions(data.results ?? []);
      setSuggestionBaseNutrition(data.baseFood?.nutrition ?? null);
      setNeedsReview((data.needsReview ?? []).map((r: { query: string; reason: string }) => ({ query: r.query, reason: r.reason })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível buscar substituições.");
    } finally {
      setLoading(false);
    }
  }

  async function suggestWithAi() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/substitutions/suggest-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseFoodName: itemFood }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível gerar sugestões com IA.");
      await runSuggest(data.candidates ?? []);
    } catch (cause) {
      setLoading(false);
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar sugestões com IA.");
    }
  }

  function addSuggestion(result: SuggestResult, approved: boolean) {
    // Identidade = source+refId, nunca só o nome (seção 19: nunca deixa
    // adicionar a mesma opção duas vezes pro mesmo alimento prescrito).
    const duplicate = substitutions.some((sub) => sub.option_food_source === result.foodSource && sub.option_food_ref_id === result.foodRefId);
    if (duplicate) {
      setError(`"${result.displayName}" já está entre as substituições deste alimento.`);
      return;
    }
    onAdd({
      base_food: itemFood,
      option_food: result.displayName,
      quantity: String(result.quantityGrams),
      unit: "g",
      base_food_source: itemFoodSource ?? null,
      base_food_ref_id: itemFoodRefId ?? null,
      option_food_source: result.foodSource,
      option_food_ref_id: result.foodRefId,
      option_nutrition_snapshot: JSON.stringify(result.nutrition),
      equivalence_mode: result.mode,
      equivalence_score: result.score,
      equivalence_quality: result.quality,
      approved_by_professional: approved,
      ai_suggested: !approved,
    });
    setSuggestions((current) => current.filter((r) => r !== result));
  }

  const approved = substitutions.filter((s) => s.approved_by_professional !== false);
  const pending = substitutions.filter((s) => s.approved_by_professional === false);

  return (
    <div className="mt-2 rounded-lg border border-[#EAD8C2] bg-[#FAF7F2] p-3 text-xs">
      {approved.length > 0 && (
        <div className="mb-2 space-y-1">
          {approved.map((sub, index) => {
            const globalIndex = substitutions.indexOf(sub);
            return (
              <div key={index} className="rounded-md bg-white px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#3A2B1F]">
                    {sub.option_food}{sub.quantity ? ` — ${sub.quantity} ${sub.unit ?? "g"}` : ""}
                    {sub.equivalence_quality && <span className={`ml-1.5 ${QUALITY_STYLE[sub.equivalence_quality]}`}>· {QUALITY_LABEL[sub.equivalence_quality]}</span>}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {currentMeals && (
                      <button type="button" onClick={() => void simulate(sub, globalIndex)} disabled={simulating !== null} className="text-[10px] font-semibold text-[#607A56] hover:underline">
                        {simulating === globalIndex ? "Simulando..." : "Simular"}
                      </button>
                    )}
                    <button type="button" onClick={() => onRemove(globalIndex)} className="text-red-600 hover:underline" aria-label="Remover substituição">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {simulationResult?.index === globalIndex && (
                  <SimulationSummary result={simulationResult.data} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-2 space-y-1.5 rounded-md border border-[#F0D4C7] bg-[#FFF7F3] p-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#8C5F50]">Sugestões para revisão</p>
          {pending.map((sub, index) => {
            const globalIndex = substitutions.indexOf(sub);
            return (
              <div key={index} className="flex items-center justify-between gap-2">
                <span className="text-[#3A2B1F]">
                  {sub.option_food}{sub.quantity ? ` — ${sub.quantity} ${sub.unit ?? "g"}` : ""}
                  {sub.equivalence_quality && <span className={`ml-1.5 ${QUALITY_STYLE[sub.equivalence_quality]}`}>· {QUALITY_LABEL[sub.equivalence_quality]}</span>}
                </span>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => onApprove(globalIndex)} className="rounded-full bg-[#EAF0E4] p-1 text-[#4F7D45] hover:bg-[#DCE9D4]" aria-label="Aprovar substituição" title="Aprovar">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => onRemove(globalIndex)} className="rounded-full bg-red-50 p-1 text-red-600 hover:bg-red-100" aria-label="Rejeitar substituição" title="Rejeitar">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!canSuggest && (
        <p className="text-[#8C6E52]">Vincule este alimento a um resultado de busca (com quantidade em gramas) para poder encontrar substituições calculadas.</p>
      )}

      {substitutionsLocked && (
        <p className="mb-2 text-[#8C5F50]">🔒 Sugestão automática/global desativada para este item. Buscar e adicionar manualmente aqui continua funcionando.</p>
      )}

      {canSuggest && !manualOpen && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setManualOpen(true)} className="brand-btn-secondary h-8 px-2 text-[11px]">
            + Adicionar alternativa
          </button>
          <button type="button" onClick={() => { setManualOpen(true); }} className="brand-btn-secondary h-8 px-2 text-[11px]">
            <Sparkles className="h-3.5 w-3.5" />
            Pedir sugestão específica
          </button>
        </div>
      )}

      {canSuggest && manualOpen && (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#8C6E52]">Adicionar alternativa</p>
            <button type="button" onClick={() => setManualOpen(false)} className="text-[11px] font-semibold text-[#607A56] hover:underline">
              Fechar
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={mode} onChange={(event) => setMode(event.target.value as "energy" | "nutritional")} className="brand-input h-8 w-auto text-[11px]" aria-label="Modo de equivalência">
              <option value="nutritional">Equivalência nutricional</option>
              <option value="energy">Equivalência energética</option>
            </select>
            <input
              value={manualQuery}
              onChange={(event) => setManualQuery(event.target.value)}
              placeholder="Nome do alimento (ex.: batata inglesa cozida)"
              className="brand-input h-8 flex-1 min-w-[160px] text-[11px]"
              aria-label="Buscar alimento substituto"
            />
            <button type="button" onClick={() => void runSuggest([manualQuery.trim()].filter(Boolean))} disabled={loading || !manualQuery.trim()} className="brand-btn-secondary h-8 px-2 text-[11px]">
              Buscar
            </button>
            <button type="button" onClick={() => void suggestWithAi()} disabled={loading} className="brand-btn-secondary h-8 px-2 text-[11px]">
              <Sparkles className="h-3.5 w-3.5" />
              Pedir ajuda à IA
            </button>
          </div>

          {loading && <p className="mt-1.5 flex items-center gap-1 text-[#8C6E52]"><Loader2 className="h-3 w-3 animate-spin" /> Calculando...</p>}
          {error && <p className="mt-1.5 text-red-700">{error}</p>}

          {needsReview.length > 0 && (
            <p className="mt-1.5 text-[#B5762F]">{needsReview.map((r) => `"${r.query}": ${r.reason}`).join(" ")}</p>
          )}

          {suggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#8C6E52]">Comparação com a porção prescrita</p>
              {suggestions.map((result, index) => (
                <div key={index} className="rounded-lg border border-[#EDE1D6] bg-white p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate font-semibold text-[#3A2B1F]">{result.displayName}</p><p className="mt-0.5 text-[11px] text-[#75675E]">Porção equivalente: {result.quantityGrams} g <span className={QUALITY_STYLE[result.quality]}>· {QUALITY_LABEL[result.quality]}</span></p></div>
                    <button type="button" onClick={() => addSuggestion(result, true)} className="brand-btn-secondary h-8 shrink-0 px-2 text-[11px]">Adicionar</button>
                  </div>
                  <NutrientDeltas base={suggestionBaseNutrition} option={result.nutrition} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NutrientDeltas({ base, option }: { base: NutrientValues | null; option: NutrientValues }) {
  if (!base) return <p className="mt-2 text-[10px] text-[#8C6E52]">Comparação nutricional indisponível.</p>;
  const fields: Array<{ label: string; base: number | null; option: number | null; unit: string; decimals: number }> = [
    { label: "Energia", base: base.energyKcal, option: option.energyKcal, unit: "kcal", decimals: 0 },
    { label: "Proteína", base: base.proteinG, option: option.proteinG, unit: "g", decimals: 1 },
    { label: "Carboidrato", base: base.carbohydrateG, option: option.carbohydrateG, unit: "g", decimals: 1 },
    { label: "Gordura", base: base.fatG, option: option.fatG, unit: "g", decimals: 1 },
  ];
  return <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">{fields.map((field) => {
    const delta = field.base === null || field.option === null ? null : field.option - field.base;
    const neutral = delta === null || Math.abs(delta) < 0.05;
    const label = delta === null ? "sem dado" : `${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR", { maximumFractionDigits: field.decimals })} ${field.unit}`;
    return <span key={field.label} className={`rounded-md px-2 py-1 text-[10px] font-semibold ${neutral ? "bg-[#F5F1EC] text-[#75675E]" : delta > 0 ? "bg-[#FFF3D8] text-[#9A6B20]" : "bg-[#EAF0E4] text-[#4F7D45]"}`} title={`${field.label}: valor da opção menos a porção prescrita`}>{field.label}: {label}</span>;
  })}</div>;
}

const fmtNum = (v: number | null, decimals = 0) => v === null ? "sem informação" : v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const fmtDelta = (before: number | null, after: number | null, decimals = 0) => {
  if (before === null || after === null) return "sem dado";
  const delta = after - before;
  return `${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR", { maximumFractionDigits: decimals })}`;
};

/** Comparação "total do plano antes / se usar esta alternativa" (seção 3/17/18) — nunca altera o plano, só mostra o resultado de uma simulação já calculada pela engine real no servidor. NULL nunca vira 0. */
function SimulationSummary({ result }: { result: SimulationResult }) {
  return (
    <div className="mt-1.5 rounded-md bg-[#FAF7F2] p-2 text-[11px] text-[#3A2B1F]">
      <p className="font-semibold">Total do plano</p>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-[#8C6E52]">Energia</span>
        <span>{fmtNum(result.totalBefore.energyKcal)} → {fmtNum(result.totalAfter.energyKcal)} kcal <strong className="text-[#607A56]">({fmtDelta(result.totalBefore.energyKcal, result.totalAfter.energyKcal)} kcal)</strong></span>
        <span className="text-[#8C6E52]">Proteína</span>
        <span>{fmtNum(result.totalBefore.proteinG, 1)} → {fmtNum(result.totalAfter.proteinG, 1)} g ({fmtDelta(result.totalBefore.proteinG, result.totalAfter.proteinG, 1)} g)</span>
        <span className="text-[#8C6E52]">Carboidrato</span>
        <span>{fmtNum(result.totalBefore.carbohydrateG, 1)} → {fmtNum(result.totalAfter.carbohydrateG, 1)} g ({fmtDelta(result.totalBefore.carbohydrateG, result.totalAfter.carbohydrateG, 1)} g)</span>
        <span className="text-[#8C6E52]">Gordura</span>
        <span>{fmtNum(result.totalBefore.fatG, 1)} → {fmtNum(result.totalAfter.fatG, 1)} g ({fmtDelta(result.totalBefore.fatG, result.totalAfter.fatG, 1)} g)</span>
      </div>
      <p className="mt-1 text-[10px] text-[#8C6E52]">Simulação apenas — o plano não foi alterado.</p>
    </div>
  );
}
