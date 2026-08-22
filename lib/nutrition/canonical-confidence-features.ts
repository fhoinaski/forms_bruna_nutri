import { tokenizeFoodQuery, normalizeFoodText } from "@/lib/nutrition/food-terminology";
import type { PreparationCode } from "@/lib/nutrition/food-preparation";
import type { CanonicalFoodSearchResult } from "@/lib/nutrition/canonical-food-search";
import type { CanonicalFoodSource } from "@/lib/nutrition-import/types";

/**
 * FASE 5.5 (itens 2-8) — camada de FEATURES pra calibrar a confidence
 * policy, ISOLADA do ranking de busca (lib/nutrition/canonical-food-search.ts,
 * intocado). Nunca decide sozinha — so descreve sinais objetivos sobre o
 * TOPO de uma busca ja rankeada, pra lib/nutrition/canonical-confidence-v2.ts
 * usar. Todos os calculos aqui sao determinísticos e reaproveitam o MESMO
 * scoreBreakdown/tokenizador ja usados pelo ranking real — nunca uma
 * segunda logica de score paralela que poderia divergir.
 */

export type MatchClass =
  | "EXACT_ALIAS"
  | "EXACT_NAME_AND_PREPARATION"
  | "EXACT_NAME"
  | "STRONG_TOKEN_MATCH"
  | "FTS_PARTIAL"
  | "GENERIC_SHORT_QUERY";

export type QueryRisk = "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK";

/**
 * item 5 — camada de evidencia de preparo, SEPARADA do score numerico.
 * Achado real da Fase 5: so a IBGE_POF tem preparation_code estruturado
 * (100%); TBCA/TACO tem 0% (preparo so no texto do nome). Nunca tratar
 * TEXT_INFERRED como STRUCTURED_EXACT.
 *
 * - NONE: a query nao pediu preparo nenhum.
 * - STRUCTURED_EXACT: a FONTE tem um campo de preparo estruturado (nao
 *   inferido do nome) e ele bate com o preparo pedido.
 * - TEXT_EXACT: sem campo estruturado utilizavel, mas o radical exato do
 *   preparo pedido aparece no texto do nome do candidato (ex.: "cozido" em
 *   "Arroz, integral, cozido").
 * - TEXT_INFERRED: preparo pedido, sem campo estruturado E sem o radical
 *   exato no nome — o ranking so nao penalizou (score neutro), nunca uma
 *   confirmacao real. O MAIS FRACO dos sinais positivos-ou-neutros.
 * - CONFLICT: ha evidencia (estruturada ou textual) de um preparo
 *   DIFERENTE do pedido.
 */
export type PreparationEvidence = "STRUCTURED_EXACT" | "TEXT_EXACT" | "TEXT_INFERRED" | "NONE" | "CONFLICT";

export interface ConfidenceFeatures {
  totalScore: number;
  gapToSecond: number | null;
  matchMethod: CanonicalFoodSearchResult["matchMethod"];
  matchClass: MatchClass;
  exactName: boolean;
  aliasExact: boolean;
  tokenCoverage: number; // 0-1: fracao dos tokens da QUERY presentes no nome do candidato
  extraTokenPenalty: number;
  simplicityScore: number;
  preparationEvidence: PreparationEvidence;
  preparationExact: boolean; // STRUCTURED_EXACT ou TEXT_EXACT
  preparationConflict: boolean; // CONFLICT
  source: CanonicalFoodSource;
  sourceTieBreakUsed: boolean;
  classificationGroup: string | null;
  classificationFoodType: string | null;
  queryTokenCount: number;
  candidateTokenCount: number;
  sourceRichness: number; // quantas fontes DISTINTAS aparecem entre os candidatos proximos (item 8: sourceAgreementCount)
  sourceAgreementCount: number; // alias explicito do item 8 (mesmo valor de sourceRichness — nomes diferentes pedidos em partes diferentes do pedido)
  sourceAgreementStrength: number; // 0-1: fracao dos candidatos proximos que concordam com o NOME NUCLEO do topo
  numberOfCloseCandidates: number; // candidatos com score >= top.score - CLOSE_CANDIDATE_MARGIN, excluindo o proprio topo
  varietyRequired: boolean; // item 7
  simpleVsCompositeConflict: boolean; // item 6
  presenceOfCultivarSignal: boolean;
  presenceOfPreparationSignal: boolean;
  presenceOfBrandSignal: boolean;
  presenceOfCompositeClassification: boolean;
}

const CLOSE_CANDIDATE_MARGIN = 15;
/** Tolerancia de token extra pra ainda considerar duas variantes "da mesma familia" de alimento (nunca dois alimentos totalmente diferentes). */
const VARIETY_EXTRA_TOKEN_MAX = 3;

function coreTokens(name: string): string[] {
  const idx = name.indexOf("(");
  return tokenizeFoodQuery(idx === -1 ? name : name.slice(0, idx));
}

function isCompositeClassification(foodType: string | null): boolean {
  return Boolean(foodType && foodType.startsWith("D"));
}

/**
 * item 6 — bloqueia auto-aceitacao quando a query e simples (poucos
 * tokens, sem sinal de preparo composto) mas o candidato TOPO e uma
 * preparacao/prato composto, E existe um candidato mais simples plausivel
 * entre os proximos (nunca so "existe outro candidato qualquer" — precisa
 * ser da MESMA familia de nome, senao um "abacate" perto de "banana
 * flambada" bloquearia tudo por coincidencia).
 */
function detectSimpleVsCompositeConflict(queryTokens: string[], top: CanonicalFoodSearchResult, candidates: CanonicalFoodSearchResult[]): boolean {
  const topIsComposite = isCompositeClassification(top.classification?.foodType ?? null) || tokenizeFoodQuery(top.name).length - queryTokens.length > 6;
  if (!topIsComposite) return false;
  const topCore = new Set(coreTokens(top.name));
  return candidates.some((c) => {
    if (c.foodId === top.foodId) return false;
    if (isCompositeClassification(c.classification?.foodType ?? null)) return false;
    const cCore = coreTokens(c.name);
    // "plausivel" = compartilha pelo menos 1 token de nucleo com a query E e bem mais curto que o topo composto.
    const sharesQueryToken = queryTokens.some((t) => cCore.includes(t));
    const muchSimpler = cCore.length <= topCore.size;
    return sharesQueryToken && muchSimpler;
  });
}

/**
 * item 7 — VARIETY_REQUIRED: query curta/generica (<=2 tokens uteis) com
 * 2+ candidatos proximos que sao da MESMA familia de nome (compartilham o
 * primeiro token de nucleo) mas divergem por um qualificador CURTO (1-3
 * tokens extras cada, ex.: "prata"/"nanica"/"da terra"/"tipo 1"/"tipo 2")
 * — nunca dois alimentos totalmente diferentes.
 */
function detectVarietyRequired(queryTokens: string[], top: CanonicalFoodSearchResult, candidates: CanonicalFoodSearchResult[]): boolean {
  if (queryTokens.length > 2) return false; // query ja especifica o suficiente
  const topCore = coreTokens(top.name);
  if (!topCore.length) return false;
  const close = candidates.filter((c) => c.foodId !== top.foodId && c.score >= top.score - CLOSE_CANDIDATE_MARGIN);
  const qualifiers = new Set<string>();
  for (const c of close) {
    const cCore = coreTokens(c.name);
    if (cCore[0] !== topCore[0]) continue; // familia diferente, nao e variedade do mesmo alimento
    const extra = cCore.filter((t) => !queryTokens.includes(t) && !topCore.includes(t));
    if (extra.length >= 1 && extra.length <= VARIETY_EXTRA_TOKEN_MAX) qualifiers.add(extra.join(" "));
  }
  return qualifiers.size >= 1; // ja o topo + 1 variante concreta e suficiente pra exigir escolha explicita
}

function detectPreparationEvidence(
  queryPreparation: PreparationCode | null,
  top: CanonicalFoodSearchResult
): PreparationEvidence {
  if (!queryPreparation) return "NONE";
  const prepScore = top.scoreBreakdown.preparationScore;
  const structuredRaw = top.preparation?.method ?? top.preparation?.name ?? null;
  const hasStructured = Boolean(structuredRaw) && !normalizeFoodText(structuredRaw ?? "").includes("nao se aplica");
  if (prepScore < 0) return "CONFLICT";
  if (hasStructured && prepScore > 0) return "STRUCTURED_EXACT";
  if (prepScore >= 15) return "TEXT_EXACT"; // preparationScoreFor: stem exato no nome, sem campo estruturado
  return "TEXT_INFERRED"; // prepScore neutro (-3..0): nenhuma evidencia real, so ausencia de conflito
}

function detectBrandSignal(name: string, classificationGroup: string | null): boolean {
  // Heuristica conservadora: nome com token totalmente maiusculo (marca) OU
  // classificado como industrializado/produto pela propria fonte.
  const hasAllCapsToken = /\b[A-ZÀ-Ú]{3,}\b/.test(name.replace(/^[A-ZÀ-Ú\s]+,/, ""));
  const industrialized = Boolean(classificationGroup?.toLowerCase().includes("industrializado"));
  return hasAllCapsToken || industrialized;
}

export function extractConfidenceFeatures(
  query: string,
  results: CanonicalFoodSearchResult[],
  queryPreparation: PreparationCode | null
): ConfidenceFeatures | null {
  const top = results[0];
  if (!top) return null;
  const second = results[1];
  const queryTokens = tokenizeFoodQuery(query);
  const candidateTokens = tokenizeFoodQuery(top.name);

  const covered = queryTokens.filter((t) => candidateTokens.some((ct) => ct.includes(t) || t.includes(ct)));
  const tokenCoverage = queryTokens.length ? covered.length / queryTokens.length : 0;

  const close = results.filter((r) => r.foodId !== top.foodId && r.score >= top.score - CLOSE_CANDIDATE_MARGIN);
  const closeSources = new Set(close.map((r) => r.source));
  closeSources.add(top.source);
  const topCoreSet = new Set(coreTokens(top.name));
  const agreeing = close.filter((r) => {
    const overlap = coreTokens(r.name).filter((t) => topCoreSet.has(t)).length;
    return overlap >= Math.min(2, topCoreSet.size);
  });

  const preparationEvidence = detectPreparationEvidence(queryPreparation, top);
  const varietyRequired = detectVarietyRequired(queryTokens, top, results);
  const simpleVsCompositeConflict = detectSimpleVsCompositeConflict(queryTokens, top, results);

  return {
    totalScore: top.score,
    gapToSecond: second ? top.score - second.score : null,
    matchMethod: top.matchMethod,
    matchClass: classifyMatch(top, queryTokens, preparationEvidence),
    exactName: top.matchMethod === "EXACT_NAME",
    aliasExact: top.matchMethod === "ALIAS_EXACT",
    tokenCoverage,
    extraTokenPenalty: top.scoreBreakdown.extraTokenPenalty,
    simplicityScore: top.scoreBreakdown.simplicityScore,
    preparationEvidence,
    preparationExact: preparationEvidence === "STRUCTURED_EXACT" || preparationEvidence === "TEXT_EXACT",
    preparationConflict: preparationEvidence === "CONFLICT",
    source: top.source,
    sourceTieBreakUsed: top.scoreBreakdown.sourceTiebreak > 0,
    classificationGroup: top.classification?.group ?? null,
    classificationFoodType: top.classification?.foodType ?? null,
    queryTokenCount: queryTokens.length,
    candidateTokenCount: candidateTokens.length,
    sourceRichness: closeSources.size,
    sourceAgreementCount: closeSources.size,
    sourceAgreementStrength: close.length ? agreeing.length / close.length : 0,
    numberOfCloseCandidates: close.length,
    varietyRequired,
    simpleVsCompositeConflict,
    presenceOfCultivarSignal: varietyRequired,
    presenceOfPreparationSignal: queryPreparation !== null,
    presenceOfBrandSignal: detectBrandSignal(top.name, top.classification?.group ?? null),
    presenceOfCompositeClassification: isCompositeClassification(top.classification?.foodType ?? null),
  };
}

/** item 3 — classe de match, base pra usar uma policy DIFERENTE por classe (nunca a mesma regra pra tudo). */
function classifyMatch(top: CanonicalFoodSearchResult, queryTokens: string[], prepEvidence: PreparationEvidence): MatchClass {
  if (top.matchMethod === "ALIAS_EXACT") return "EXACT_ALIAS";
  if (queryTokens.length <= 1) return "GENERIC_SHORT_QUERY"; // prioridade MAXIMA — nunca vira EXACT_NAME so por bater score
  if (top.matchMethod === "EXACT_NAME") {
    return prepEvidence === "STRUCTURED_EXACT" || prepEvidence === "TEXT_EXACT" ? "EXACT_NAME_AND_PREPARATION" : "EXACT_NAME";
  }
  if (top.matchMethod === "PREFIX" || top.matchMethod === "ALL_TOKENS") return "STRONG_TOKEN_MATCH";
  return "FTS_PARTIAL"; // CONTAINS/FTS
}

/** item 4 — risco da query, considerado pela policy V2 junto da match class. */
export function classifyQueryRisk(features: ConfidenceFeatures): QueryRisk {
  // Um gap quase zero pro 2o colocado e, por si so, o sinal de ambiguidade
  // mais forte que existe (dois candidatos praticamente empatados) —
  // conta como risco alto mesmo com um UNICO candidato proximo, nao so
  // quando ha 2+ (diferente do sinal "numberOfCloseCandidates >= 2" abaixo,
  // que capta o caso de VARIOS candidatos moderadamente proximos).
  const nearTie = features.numberOfCloseCandidates >= 1 && features.gapToSecond !== null && features.gapToSecond < 5;
  const signals = [
    features.matchClass === "GENERIC_SHORT_QUERY",
    features.varietyRequired,
    features.presenceOfPreparationSignal && !features.preparationExact,
    features.numberOfCloseCandidates >= 2,
    features.simpleVsCompositeConflict,
    features.presenceOfBrandSignal,
    nearTie,
  ];
  // achado real da calibracao (item 11 do pedido, ver
  // reports/canonical-confidence-errors.md — caso "Pão de queijo, mistura
  // p/"): um produto industrializado/de marca com nome quase identico a
  // outra variante ("(média de diferentes marcas)" vs sem essa anotacao)
  // e exatamente o tipo de ambiguidade de identidade que produto/marca
  // deveria bloquear (item 4) — nunca depende so da contagem de tokens da
  // query pra contar como risco.
  const highTriggers = [features.matchClass === "GENERIC_SHORT_QUERY", features.varietyRequired, features.simpleVsCompositeConflict, features.preparationConflict, nearTie, features.presenceOfBrandSignal];
  if (highTriggers.some(Boolean)) return "HIGH_RISK";
  const count = signals.filter(Boolean).length;
  if (count >= 2) return "HIGH_RISK";
  if (count === 1) return "MEDIUM_RISK";
  return "LOW_RISK";
}
