import tacoData from "@/lib/nutrition/data/taco.json";
import tacoComplementarData from "@/lib/nutrition/data/taco-complementar.json";
import { estimateFoodMacros, findBestFoodReference, normalize, type MacroReferenceFood, type MacroTotals } from "@/lib/nutrition/macros";

type TacoRow = {
  numero: number | string;
  descricao: string;
  grupo: string;
  energia_kcal: unknown;
  proteina_g: unknown;
  carboidrato_g: unknown;
  lipidios_g: unknown;
  fibra_g?: unknown;
  sodio_mg?: unknown;
  calcio_mg?: unknown;
  ferro_mg?: unknown;
  potassio_mg?: unknown;
  vitamina_c_mg?: unknown;
};

type TacoFile = TacoRow[] | { alimentos?: TacoRow[] };

function tacoRows(dataFile: TacoFile): TacoRow[] {
  const data = dataFile;
  return Array.isArray(data) ? data : data.alimentos ?? [];
}

export function coerceTacoNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "na" || normalized === "tr") return 0;
  const parsed = Number(normalized.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

// Usada apenas nos 6 nutrientes novos da FASE 2 — preserva `null` quando o
// dado nao existe na fonte (NA/ausente), em vez de forcar 0 como
// `coerceTacoNumber` faz para os 4 macros legados. "Tr" (traco) e um valor
// real muito pequeno, nao "sem dado": mantemos como 0 aqui tambem, mas nunca
// confundimos "NA"/ausente com zero.
export function coerceTacoNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "na") return null;
  if (normalized === "tr") return 0;
  const parsed = Number(normalized.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function toReferenceFood(row: TacoRow, fonte: "taco" | "complementar"): MacroReferenceFood {
  return {
    numero: row.numero,
    descricao: row.descricao,
    grupo: row.grupo,
    fonte,
    energia_kcal: coerceTacoNumber(row.energia_kcal),
    proteina_g: coerceTacoNumber(row.proteina_g),
    carboidrato_g: coerceTacoNumber(row.carboidrato_g),
    lipidios_g: coerceTacoNumber(row.lipidios_g),
    fibra_g: coerceTacoNumberOrNull(row.fibra_g),
    sodio_mg: coerceTacoNumberOrNull(row.sodio_mg),
    calcio_mg: coerceTacoNumberOrNull(row.calcio_mg),
    ferro_mg: coerceTacoNumberOrNull(row.ferro_mg),
    potassio_mg: coerceTacoNumberOrNull(row.potassio_mg),
    vitamina_c_mg: coerceTacoNumberOrNull(row.vitamina_c_mg),
  };
}

export const TACO_REFERENCES: MacroReferenceFood[] = [
  ...tacoRows(tacoData as TacoFile).map((row) => toReferenceFood(row, "taco")),
  ...tacoRows(tacoComplementarData as TacoFile).map((row) => toReferenceFood(row, "complementar")),
];

export function searchTacoFoods(query: string, limit = 15): MacroReferenceFood[] {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 2) return [];

  return TACO_REFERENCES
    .map((food) => {
      const normalizedDescription = normalize(food.descricao);
      const exact = normalizedDescription === normalizedQuery;
      const contains = normalizedDescription.includes(normalizedQuery);
      if (!exact && !contains) return null;
      return {
        food,
        score: exact ? 0 : 1,
        distance: Math.abs(normalizedDescription.length - normalizedQuery.length),
        length: normalizedDescription.length,
      };
    })
    .filter((item): item is { food: MacroReferenceFood; score: number; distance: number; length: number } => item !== null)
    .sort((a, b) => a.score - b.score || a.distance - b.distance || a.length - b.length)
    .slice(0, Math.max(1, Math.min(limit, 15)))
    .map((item) => item.food);
}

export function findBestTacoFood(food: string): MacroReferenceFood | null {
  return findBestFoodReference(food, TACO_REFERENCES);
}

export function getTacoFoodByNumber(numero: number | string): MacroReferenceFood | null {
  const normalizedNumber = String(numero);
  return TACO_REFERENCES.find((food) => String(food.numero) === normalizedNumber) ?? null;
}

export function estimateFoodMacrosFromTaco(food: string, quantity?: string | number | null, unit?: string | null): MacroTotals {
  const reference = findBestTacoFood(food);
  return estimateFoodMacros(food, quantity, unit, reference ? [reference] : []);
}
