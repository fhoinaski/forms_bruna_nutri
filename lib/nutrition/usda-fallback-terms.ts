import { normalize } from "@/lib/nutrition/normalize";

/**
 * Fallback PT->EN só para o USDA (Food Catalog Coverage Audit — achado "E:
 * fonte existe mas ranking não alcança"). O USDA usa busca full-text contra
 * descrições em INGLÊS (searchUsdaFoods, repositories/usda-foods.ts) — uma
 * query composta em português ("filé de tilápia assado") nunca bate ali,
 * mesmo quando o alimento existe (USDA tem "Fish, tilapia, raw"/"...cooked,
 * dry heat"). Isso NUNCA toca TACO/COMPLEMENTARY/CUSTOM nem a query
 * original — só tenta, ALÉM da busca real, o substantivo técnico em
 * inglês, e o resultado passa pelo MESMO scoreText/classifyMatches de
 * sempre (ainda pode virar AMBIGUOUS se houver mais de um candidato real).
 *
 * Critério de inclusão: só um substantivo SEM AMBIGUIDADE de espécie/
 * identidade (nunca "peixe"->"fish", que é genérico demais e abriria a
 * porta pra qualquer peixe do USDA virar candidato). Cada entrada aqui foi
 * verificada manualmente contra o catálogo USDA real antes de entrar.
 *
 * Limite conhecido (documentado, não escondido): isso só ajuda a query
 * BARE ("tilápia" sozinha) — uma frase composta ("filé de tilápia assado")
 * continua NOT_FOUND, porque o re-scoring final (scoreText contra a query
 * ORIGINAL em português) exige que TODOS os tokens digitados apareçam no
 * texto do candidato, e "filé"/"assado" nunca aparecem em "Fish, tilapia,
 * raw"/"...cooked, dry heat" — traduzir método de preparo (assado/grelhado/
 * cozido -> roasted/grilled/cooked) é uma camada própria, deliberadamente
 * fora de escopo aqui (risco de "assado -> cru" por tradução malfeita).
 */
const USDA_FALLBACK_TERMS: { pattern: RegExp; term: string }[] = [
  // Verificado: USDA tem exatamente "Fish, tilapia, raw" e "Fish, tilapia,
  // cooked, dry heat" — nenhum outro peixe com esse nome, nunca confundível
  // com merluza/outro peixe (auditoria de cobertura de catálogo).
  { pattern: /\btil[aá]pia\b/i, term: "tilapia" },
];

export function usdaFallbackTermFor(query: string): string | null {
  const normalizedQuery = normalize(query);
  for (const { pattern, term } of USDA_FALLBACK_TERMS) {
    if (pattern.test(normalizedQuery)) return term;
  }
  return null;
}
