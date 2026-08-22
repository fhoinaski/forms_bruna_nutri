/**
 * FASE 4.5 — achado real: o D1 rejeita qualquer padrao LIKE/GLOB com mais
 * de 50 caracteres TOTAIS (incluindo os '%') com "LIKE or GLOB pattern too
 * complex" (SQLITE_ERROR, code 7500). Medido empiricamente via busca
 * binaria direta contra o banco D1 real (nao documentado publicamente pela
 * Cloudflare) — um padrao `%` + 48 chars + `%` (50 total) passa, `%` + 50
 * chars + `%` (52 total) falha. node:sqlite local NAO reproduz o erro nem
 * em 10.000 caracteres — e um limite so da plataforma D1.
 *
 * Nomes tecnicos da TBCA usados como query (Fase 4 shadow dataset)
 * rotineiramente passam de 90 caracteres normalizados, o que quebrava
 * INTEIRAMENTE qualquer busca que construisse um LIKE '%...%'/'...%' com o
 * texto cru (lib/repositories/custom-foods.ts#listCustomFoods,
 * lib/repositories/usda-foods.ts#searchUsdaFoods,
 * lib/nutrition/canonical-food-search.ts#fetchCandidatesByLike).
 *
 * Usado em UM lugar so (aqui) e importado pelos 3 pontos que constroem
 * padrao LIKE contra D1 — nunca duplicado de novo.
 */
export const MAX_LIKE_PATTERN_CONTENT_LENGTH = 40;

/**
 * Corta o texto pro tamanho seguro de conteudo de um padrao LIKE
 * (deixando margem abaixo do limite real medido de 48-49 chars de
 * conteudo). NUNCA usado pra comparacao EXACT ('=') nem pra MATCH de FTS
 * (que nao tem esse limite e processa a query inteira, token a token) —
 * so pro fallback LIKE 'contem'/'prefixo', que de qualquer forma nunca
 * bateria um nome curto contra uma query de 90+ caracteres.
 */
export function capForLikePattern(text: string): string {
  return text.length > MAX_LIKE_PATTERN_CONTENT_LENGTH ? text.slice(0, MAX_LIKE_PATTERN_CONTENT_LENGTH) : text;
}
