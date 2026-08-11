import { normalize, type MacroReferenceFood } from "@/lib/nutrition/macros";
import { TACO_REFERENCES } from "@/lib/nutrition/taco";

/**
 * Busca unificada de alimentos (secoes 7 e 20 do pedido) — TACO + TBCA
 * complementar + alimentos personalizados, com fonte identificavel e
 * ranking melhorado: exato > comeca-com > contem (antes so tinha
 * exato/contem). Puro e sincrono — quem chama busca os alimentos
 * personalizados no banco e passa prontos (`customFoods`), mantendo este
 * modulo sem dependencia de I/O, igual ao resto de lib/nutrition/.
 */

export type FoodSource = "TACO" | "CUSTOM" | "MANUFACTURER";

export interface FoodSearchResult {
  food: MacroReferenceFood;
  source: FoodSource;
}

function toSource(fonte: MacroReferenceFood["fonte"]): FoodSource {
  if (fonte === "custom") return "CUSTOM";
  if (fonte === "manufacturer") return "MANUFACTURER";
  // "taco" e "complementar" (TBCA) sao dois datasets oficiais/semi-oficiais
  // ja tratados hoje como uma unica fonte publica na UI — mantido assim.
  return "TACO";
}

export interface SearchAllFoodsOptions {
  limit?: number;
  source?: FoodSource;
  customFoods?: MacroReferenceFood[];
}

export function searchAllFoods(query: string, options: SearchAllFoodsOptions = {}): FoodSearchResult[] {
  const { limit = 15, source, customFoods = [] } = options;
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 2) return [];

  const pool = [...TACO_REFERENCES, ...customFoods];

  return pool
    .map((food) => {
      const normalizedDescription = normalize(food.descricao);
      let score: number;
      if (normalizedDescription === normalizedQuery) score = 0;
      else if (normalizedDescription.startsWith(normalizedQuery)) score = 1;
      else if (normalizedDescription.includes(normalizedQuery)) score = 2;
      else return null;
      return {
        food,
        source: toSource(food.fonte),
        score,
        distance: Math.abs(normalizedDescription.length - normalizedQuery.length),
        length: normalizedDescription.length,
      };
    })
    .filter((item): item is { food: MacroReferenceFood; source: FoodSource; score: number; distance: number; length: number } => item !== null)
    .filter((item) => !source || item.source === source)
    .sort((a, b) => a.score - b.score || a.distance - b.distance || a.length - b.length)
    .slice(0, Math.max(1, limit))
    .map(({ food, source: itemSource }) => ({ food, source: itemSource }));
}
