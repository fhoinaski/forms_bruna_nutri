import { normalize } from "@/lib/nutrition/normalize";

/**
 * Normalização lexical para busca de alimentos (Food Resolver V2, seção 2 do
 * pedido) — usada SÓ por lib/nutrition/food-catalog.ts#scoreText, nunca
 * espalhada por outros callers de `normalize()` (recibos, unidades, etc.
 * continuam usando o normalize() puro, sem abreviação/stopword). Duas
 * responsabilidades pequenas e testáveis, nunca uma reescrita da busca:
 *
 * 1. expandir abreviações reais do TACO ("s/ pele" = "sem pele", "c/ óleo" =
 *    "com óleo") — sem isso, "peito de frango grelhado" nunca batia com
 *    "Frango, peito, cozido, s/ pele, s/ sal" mesmo quando a query cobria
 *    exatamente o mesmo alimento.
 * 2. remover preposições (nunca palavras com significado nutricional) da
 *    lista de TOKENS usada no match "todos os tokens presentes" (rank 4) —
 *    "peito DE frango grelhado" falhava porque "de" nunca aparece no nome
 *    técnico, não porque o alimento não existisse.
 */
const ABBREVIATION_EXPANSIONS: [RegExp, string][] = [
  [/\bs\/\s*/gi, "sem "],
  [/\bc\/\s*/gi, "com "],
];

export function normalizeFoodText(text: string): string {
  let expanded = text;
  for (const [pattern, replacement] of ABBREVIATION_EXPANSIONS) expanded = expanded.replace(pattern, replacement);
  return normalize(expanded);
}

/**
 * Preposições/artigos puros — NUNCA um modificador nutricional real
 * ("sem", "integral", "light", "zero" ficam de fora de propósito, seção 11
 * do pedido: esses mudam composição e não podem ser descartados).
 */
const FOOD_QUERY_STOPWORDS = new Set(["de", "da", "do", "das", "dos"]);

export function tokenizeFoodQuery(text: string): string[] {
  return normalizeFoodText(text)
    .split(" ")
    .filter((token) => token && !FOOD_QUERY_STOPWORDS.has(token));
}
