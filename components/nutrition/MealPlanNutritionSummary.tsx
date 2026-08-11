"use client";

import { useEffect, useMemo, useState } from "react";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import { calculatePlanNutrients, roundedNutrients, type FoodReferenceLookup, type NutrientKey } from "@/lib/nutrition/nutrients";
import { compareTargetVsPrescribed, type NutrientTarget } from "@/lib/nutrition/targets";

type SummaryItem = {
  food: string;
  quantity?: string | null;
  unit?: string | null;
  food_source?: "TACO" | "CUSTOM" | "MANUFACTURER" | null;
  food_ref_id?: string | null;
};
type SummaryMeal = { id?: string; name: string; items: SummaryItem[] };

const NUTRIENT_LABELS: Record<NutrientKey, string> = {
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
const NUTRIENT_UNITS: Record<NutrientKey, string> = {
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
export function MealPlanNutritionSummary({ meals, target }: { meals: SummaryMeal[]; target: NutrientTarget }) {
  const [refByText, setRefByText] = useState<Record<string, MacroReferenceFood>>({});
  const [refById, setRefById] = useState<Record<string, MacroReferenceFood>>({});

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

  const lookup: FoodReferenceLookup = useMemo(
    () => ({
      byTacoNumber: (numero) => refById[numero] ?? null,
      byCustomId: (id) => refById[id] ?? null,
      fuzzyMatch: (food) => refByText[food.trim().toLowerCase()] ?? null,
    }),
    [refById, refByText]
  );

  const result = useMemo(
    () => calculatePlanNutrients({ meals: meals.map((meal) => ({ name: meal.name, items: meal.items })) }, lookup),
    [meals, lookup]
  );

  const prescribed = roundedNutrients(result.total.values);
  const comparisons = useMemo(() => compareTargetVsPrescribed(target, result.total.values), [target, result.total.values]);

  const hasTarget = comparisons.length > 0;
  const totalItems = result.total.coverage.energyKcal.total;

  if (!totalItems) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 sm:p-5">
      <div>
        <p className="brand-kicker mb-1">Resumo nutricional</p>
        <h3 className="font-serif text-lg font-semibold text-[#3A3028]">Meta x prescrito</h3>
      </div>

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
