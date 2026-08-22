"use client";

import { useEffect, useMemo, useState } from "react";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import { calculatePlanNutrients, roundedNutrients, type FoodReferenceLookup, type NutrientKey } from "@/lib/nutrition/nutrients";
import { compareTargetVsPrescribed, type NutrientTarget } from "@/lib/nutrition/targets";
import type { HouseholdMeasureOption } from "@/lib/nutrition/quantity-resolution";
import type { FoodPortion } from "@/lib/repositories/food-portions";

type SummaryItem = {
  food: string;
  quantity?: string | null;
  unit?: string | null;
  // FASE 6.5 (item 5) — TBCA/IBGE_POF aceitos no tipo (identidade
  // transportada), mas o filtro abaixo (linha ~110) so reconhece
  // TACO/CUSTOM/MANUFACTURER de proposito — item com essas 2 fontes cai
  // como "nao reconhecido", igual USDA ja caia antes desta fase (item 8).
  food_source?: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF" | null;
  food_ref_id?: string | null;
  household_measure_id?: string | null;
  resolved_grams_snapshot?: number | null;
  quantity_resolution_snapshot?: string | null;
};
type SummaryMeal = { id?: string; name: string; items: SummaryItem[] };

const NUTRIENT_LABELS: Partial<Record<NutrientKey, string>> = {
  energyKcal: "Energia",
  proteinG: "Proteína",
  carbohydrateG: "Carboidrato",
  fatG: "Gordura",
  fiberG: "Fibras",
  sodiumMg: "Sódio",
  calciumMg: "Cálcio",
  ironMg: "Ferro",
  potassiumMg: "Potássio",
  vitaminCMg: "Vitamina C",
};
const NUTRIENT_UNITS: Partial<Record<NutrientKey, string>> = {
  energyKcal: "kcal",
  proteinG: "g",
  carbohydrateG: "g",
  fatG: "g",
  fiberG: "g",
  sodiumMg: "mg",
  calciumMg: "mg",
  ironMg: "mg",
  potassiumMg: "mg",
  vitaminCMg: "mg",
};
const MICRONUTRIENTS: NutrientKey[] = ["fiberG", "sodiumMg", "calciumMg", "ironMg", "potassiumMg", "vitaminCMg"];
const PRIMARY_NUTRIENTS: NutrientKey[] = ["energyKcal", "proteinG", "carbohydrateG", "fatG", "fiberG"];

/**
 * Meta x prescrito x diferenca (secoes 13-19 do pedido) — a UNICA coisa que
 * este componente adiciona alem do que o editor ja mostra (macros em tempo
 * real no rodape do MealItemsEditor, kcal por refeicao no cabecalho de cada
 * refeicao). Nao duplica isso aqui para nao virar "dashboard poluido".
 * Calculo 100% deterministico via lib/nutrition/nutrients.ts+targets.ts —
 * nunca IA. Resolve alimentos pelo mesmo endpoint de busca ja usado pelo
 * autocomplete do editor (mesma limitacao pratica: so conhece, no cliente,
 * os alimentos ja pesquisados nesta sessao — por isso a cobertura por
 * nutriente e mostrada, nunca falsa precisao).
 */
function useMealPlanNutritionData({ meals, target }: { meals: SummaryMeal[]; target: NutrientTarget }) {
  const [refByText, setRefByText] = useState<Record<string, MacroReferenceFood>>({});
  const [refById, setRefById] = useState<Record<string, MacroReferenceFood>>({});
  const [measuresById, setMeasuresById] = useState<Record<string, HouseholdMeasureOption>>({});

  useEffect(() => {
    const uniqueFoods = Array.from(
      new Set(meals.flatMap((meal) => meal.items.map((item) => item.food.trim())).filter((food) => food.length >= 2))
    );
    const missing = uniqueFoods.filter((food) => !refByText[food.toLowerCase()]);
    if (!missing.length) return;
    const controller = new AbortController();
    Promise.all(
      missing.map(async (food) => {
        try {
          const response = await fetch(`/api/admin/foods/search?q=${encodeURIComponent(food)}`, { cache: "no-store", signal: controller.signal });
          const data = response.ok ? ((await response.json()) as { items?: MacroReferenceFood[] }) : { items: [] as MacroReferenceFood[] };
          return [food.toLowerCase(), data.items?.[0] ?? null] as const;
        } catch (cause) {
          if (cause instanceof Error && cause.name === "AbortError") return null;
          return [food.toLowerCase(), null] as const;
        }
      })
    ).then((entries) => {
      setRefByText((current) => {
        const next = { ...current };
        for (const entry of entries) {
          if (!entry?.[1]) continue;
          next[entry[0]] = entry[1];
        }
        return next;
      });
      setRefById((current) => {
        const next = { ...current };
        for (const entry of entries) {
          if (!entry?.[1]?.numero) continue;
          next[String(entry[1].numero)] = entry[1];
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
      )
    );
    if (!pairs.length) return;
    const controller = new AbortController();
    Promise.all(
      pairs.map(async (pair) => {
        const [source, refId] = pair.split(":");
        try {
          const response = await fetch(`/api/admin/foods/portions?source=${source}&refId=${encodeURIComponent(refId)}`, { cache: "no-store", signal: controller.signal });
          const data = response.ok ? ((await response.json()) as { items?: FoodPortion[] }) : { items: [] as FoodPortion[] };
          return data.items ?? [];
        } catch (cause) {
          if (cause instanceof Error && cause.name === "AbortError") return [];
          return [];
        }
      })
    ).then((results) => {
      setMeasuresById((current) => {
        const next = { ...current };
        for (const portion of results.flat()) {
          next[portion.id] = { id: portion.id, description: portion.description, gramEquivalent: portion.gram_equivalent, source: portion.source, confidence: portion.confidence };
        }
        return next;
      });
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(meals.map((meal) => meal.items.map((item) => `${item.food_source ?? ""}:${item.food_ref_id ?? ""}`)))]);

  const lookup: FoodReferenceLookup = useMemo(
    () => ({
      byTacoNumber: (numero) => refById[numero] ?? null,
      byCustomId: (id) => refById[id] ?? null,
      byUsdaId: (id) => refById[id] ?? null,
      fuzzyMatch: (food) => refByText[food.trim().toLowerCase()] ?? null,
      byMeasureId: (id) => measuresById[id] ?? null,
    }),
    [refById, refByText, measuresById]
  );

  const result = useMemo(
    () => calculatePlanNutrients({ meals: meals.map((meal) => ({ name: meal.name, items: meal.items })) }, lookup),
    [meals, lookup]
  );

  const prescribed = roundedNutrients(result.total.values);
  const comparisons = useMemo(() => compareTargetVsPrescribed(target, result.total.values), [target, result.total.values]);

  return {
    result,
    prescribed,
    comparisons,
    hasTarget: comparisons.length > 0,
    totalItems: result.total.coverage.energyKcal.total,
  };
}

export function MealPlanNutritionWorkspacePanel({ meals, target }: { meals: SummaryMeal[]; target: NutrientTarget }) {
  const { result, prescribed, totalItems } = useMealPlanNutritionData({ meals, target });

  if (!totalItems) {
    return (
      <div className="rounded-xl border border-[#EDE1D6] bg-[#FFFDFC] p-4">
        <p className="brand-kicker mb-1">Resumo nutricional</p>
        <p className="text-sm text-[#75675E]">Adicione alimentos para acompanhar macros e micronutrientes.</p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-[#EDE1D6] bg-[#FFFDFC] p-3 shadow-[0_10px_32px_rgba(58,48,40,0.05)] lg:p-4" aria-live="polite">
      <details className="group lg:open" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <p className="brand-kicker mb-1">Resumo nutricional</p>
            <h3 className="font-serif text-lg font-semibold text-[#3A3028]">Plano do dia</h3>
          </div>
          <span className="rounded-full border border-[#EAD8C2] px-2.5 py-1 text-[11px] font-semibold text-[#8C6E52] lg:hidden">abrir</span>
        </summary>

        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {PRIMARY_NUTRIENTS.map((key) => {
              const value = prescribed[key];
              return (
                <div key={key} className="rounded-lg border border-[#EDE1D6] bg-[#FAF7F2]/70 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8C6E52]">{NUTRIENT_LABELS[key]}</p>
                  <p className="text-lg font-semibold text-[#3A3028]">{value === null ? "sem dado" : `${value} ${NUTRIENT_UNITS[key]}`}</p>
                </div>
              );
            })}
          </div>

          {result.quality.total > 0 && (
            <p className="rounded-lg bg-[#F5FAF0] px-3 py-2 text-xs leading-5 text-[#607A56]">
              <span className="font-semibold">{result.quality.highConfidence}/{result.quality.total} itens</span> com alta confiança
              {result.quality.estimated > 0 && <span> · {result.quality.estimated} estimado{result.quality.estimated > 1 ? "s" : ""}</span>}
              {result.quality.unresolved > 0 && <span> · {result.quality.unresolved} não calculado{result.quality.unresolved > 1 ? "s" : ""}</span>}
            </p>
          )}

          <details className="rounded-lg border border-[#EDE1D6] bg-white p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.06em] text-[#8C6E52]">Micronutrientes</summary>
            <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-1">
              {MICRONUTRIENTS.map((key) => {
                const coverage = result.total.coverage[key];
                const value = prescribed[key];
                return (
                  <div key={key} className="rounded-lg border border-[#F0E2D6] px-2.5 py-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9A6F5E]">{NUTRIENT_LABELS[key]}</p>
                    <p className="text-sm font-semibold text-[#3A3028]">{value === null ? "sem dado" : `${value} ${NUTRIENT_UNITS[key]}`}</p>
                    {coverage.known < coverage.total && (
                      <p className="text-[10px] text-[#9A978A]">cobertura {Math.round((coverage.known / coverage.total) * 100)}%</p>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      </details>
    </section>
  );
}

export function MealPlanNutritionSummary({ meals, target }: { meals: SummaryMeal[]; target: NutrientTarget }) {
  const { result, prescribed, comparisons, hasTarget, totalItems } = useMealPlanNutritionData({ meals, target });

  if (!totalItems) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 sm:p-5">
      <div>
        <p className="brand-kicker mb-1">Resumo nutricional</p>
        <h3 className="font-serif text-lg font-semibold text-[#3A3028]">Meta x prescrito</h3>
      </div>

      {result.quality.total > 0 && (
        <p className="text-xs leading-5 text-[#75675E]">
          <span className="font-semibold text-[#607A56]">{result.quality.highConfidence}/{result.quality.total} itens</span> calculados com alta confiança
          {result.quality.estimated > 0 && <span> · <span className="font-semibold text-[#9A6B28]">{result.quality.estimated}</span> estimado{result.quality.estimated > 1 ? "s" : ""}</span>}
          {result.quality.unresolved > 0 && <span> · <span className="font-semibold text-[#B4573F]">{result.quality.unresolved}</span> não calculado{result.quality.unresolved > 1 ? "s" : ""}</span>}
        </p>
      )}

      {hasTarget ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#EDE1D6] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8C6E52]">
                <th className="py-1.5 pr-2">Nutriente</th>
                <th className="py-1.5 pr-2 text-right">Meta</th>
                <th className="py-1.5 pr-2 text-right">Prescrito</th>
                <th className="py-1.5 pr-2 text-right">Diferença</th>
                <th className="py-1.5 text-right">% da meta</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((row) => (
                <tr key={row.nutrient} className="border-b border-[#EDE1D6]/60 last:border-0">
                  <td className="py-1.5 pr-2 text-[#3A3028]">{NUTRIENT_LABELS[row.nutrient]}</td>
                  <td className="py-1.5 pr-2 text-right text-[#75675E]">
                    {Math.round(row.target)} {NUTRIENT_UNITS[row.nutrient]}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-semibold text-[#3A3028]">
                    {row.prescribed === null ? "—" : `${Math.round(row.prescribed * 10) / 10} ${NUTRIENT_UNITS[row.nutrient]}`}
                  </td>
                  <td className={`py-1.5 pr-2 text-right ${row.diff !== null && row.diff < 0 ? "text-[#9A6F5E]" : row.diff !== null && row.diff > 0 ? "text-[#C9937B]" : "text-[#75675E]"}`}>
                    {row.diff === null ? "—" : `${row.diff > 0 ? "+" : ""}${Math.round(row.diff * 10) / 10}`}
                  </td>
                  <td className="py-1.5 text-right text-[#75675E]">{row.percentOfTarget === null ? "—" : `${row.percentOfTarget}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[#75675E]">Defina uma meta (energia, proteína, carboidrato ou gordura) para comparar com o que foi prescrito.</p>
      )}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8C6E52]">Micronutrientes do dia (quando disponíveis)</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MICRONUTRIENTS.map((key) => {
            const coverage = result.total.coverage[key];
            const value = prescribed[key];
            return (
              <div key={key} className="rounded-lg border border-[#EDE1D6] bg-white px-2.5 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9A6F5E]">{NUTRIENT_LABELS[key]}</p>
                <p className="text-sm font-semibold text-[#3A3028]">{value === null ? "sem dado" : `${value} ${NUTRIENT_UNITS[key]}`}</p>
                {coverage.known < coverage.total && (
                  <p className="text-[10px] text-[#9A978A]">cobertura {Math.round((coverage.known / coverage.total) * 100)}%</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
