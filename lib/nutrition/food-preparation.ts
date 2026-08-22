/**
 * Food Preparation Engine V1 — vocabulário FECHADO e versionado de métodos
 * de preparo, e extração determinística de "alimento base + preparo" a
 * partir de texto livre. Nunca decide composição nutricional (isso
 * continua 100% do resolver + nutrition engine reais) — só CLASSIFICA a
 * query, pra decidir se um preparo pode usar uma referência direta do
 * catálogo (ex.: "Ovo, de galinha, inteiro, cozido/10minutos" já existe) ou
 * se precisa de uma receita/preset real (ex.: "ovo mexido", que a TACO não
 * tem como entrada própria).
 *
 * Vocabulário restrito ao que a matriz de teste desta rodada realmente usa
 * (seção 3 do pedido: "não inventar dezenas de preparos sem uso") — cada
 * código aqui corresponde a pelo menos um caso real auditado contra
 * TACO/USDA.
 */
export type PreparationCode = "RAW" | "COOKED" | "GRILLED" | "ROASTED" | "FRIED" | "SCRAMBLED" | "STEAMED" | "PUREED";

const PREPARATION_WORD_MAP: { pattern: RegExp; code: PreparationCode }[] = [
  { pattern: /\bcru[a]?\b/i, code: "RAW" },
  { pattern: /\bcozid[oa]\b/i, code: "COOKED" },
  { pattern: /\bgrelhad[oa]\b/i, code: "GRILLED" },
  { pattern: /\bassad[oa]\b/i, code: "ROASTED" },
  { pattern: /\bfrit[oa]\b/i, code: "FRIED" },
  { pattern: /\bmexid[oa]\b/i, code: "SCRAMBLED" },
  { pattern: /\b(?:a\s+)?vapor\b/i, code: "STEAMED" },
];

/** "purê de X" é um prato composto, nunca um modificador simples — extraído à parte, sempre com o próprio código PUREED. */
const PUREE_PATTERN = /^pur[eê]\s+de\s+(.+)$/i;

/** "com X" real (adiciona um ingrediente de verdade) — NUNCA "sem X" (que é ausência, já coberto por alias quando aplicável, ex. café coado). */
const ADDED_INGREDIENT_PATTERN = /\bcom\s+(açúcar|acucar|leite|manteiga|azeite|mel|creme(?:\s+de\s+leite)?)\b/i;

export interface ExtractedPreparation {
  /** Texto do alimento base, com a palavra de preparo removida — nunca usado pra resolver sozinho (só pra achar candidatos de receita). */
  baseFoodQuery: string;
  preparation: PreparationCode | null;
  /** Frase de ingrediente adicionado detectada (ex.: "com leite") — null quando não há nenhuma. */
  addedIngredientPhrase: string | null;
}

export function extractPreparation(query: string): ExtractedPreparation {
  const pureeMatch = query.match(PUREE_PATTERN);
  if (pureeMatch) {
    return { baseFoodQuery: pureeMatch[1].trim(), preparation: "PUREED", addedIngredientPhrase: null };
  }

  const addedMatch = query.match(ADDED_INGREDIENT_PATTERN);
  const addedIngredientPhrase = addedMatch ? addedMatch[0].trim() : null;

  for (const { pattern, code } of PREPARATION_WORD_MAP) {
    if (pattern.test(query)) {
      const baseFoodQuery = query.replace(pattern, " ").replace(/\s+/g, " ").trim();
      return { baseFoodQuery: baseFoodQuery || query.trim(), preparation: code, addedIngredientPhrase };
    }
  }

  const baseFoodQuery = addedMatch ? query.replace(ADDED_INGREDIENT_PATTERN, " ").replace(/\s+/g, " ").trim() : query.trim();
  return { baseFoodQuery: baseFoodQuery || query.trim(), preparation: null, addedIngredientPhrase };
}

/** true quando a query descreve uma preparação/composição que o resolver de alimento simples nunca deve tentar adivinhar sozinho. */
export function needsPreparationReview(extracted: ExtractedPreparation): boolean {
  return extracted.preparation !== null || extracted.addedIngredientPhrase !== null;
}
