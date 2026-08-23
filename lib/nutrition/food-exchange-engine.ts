import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import type { FoodReference } from "@/lib/nutrition/food-catalog";
import {
  findFoodSubstitutes,
  type EquivalenceMode,
  type SubstitutionQuality,
  type NutrientSnapshot,
} from "@/lib/nutrition/substitution-engine";
import {
  classifyCulinaryRole,
  classifyFoodExchangeGroup,
  contextualExchangeEligibility,
  isCompatibleForExchange,
  normalizeMealContext,
  type CulinaryRole,
  type FoodClassification,
  type FoodForm,
  type MealContext,
} from "@/lib/nutrition/food-exchange-hierarchy";
import { calculateItemNutrients } from "@/lib/nutrition/nutrients";

/**
 * FASE 7 (item 4) — motor determinístico de GRUPOS DE TROCA. Evolui o
 * Substitution Engine já existente (lib/nutrition/substitution-engine.ts,
 * intocado — reaproveitado por completo pra quantidade/score/qualidade),
 * adicionando a camada que faltava: GRUPO ALIMENTAR COMO PRIMEIRO FILTRO
 * (nunca busca candidatos globalmente só por kcal), e ELIMINAÇÃO (nunca
 * só penalização) de candidatos incompatíveis por restrição/grupo.
 *
 * Fluxo obrigatório do pedido (item 4), implementado EXATAMENTE nesta
 * ordem:
 * 1-2. classifica grupo/subgrupo do alimento principal (classifyFoodExchangeGroup)
 * 3.   papel nutricional (idem, incluso na classificação)
 * 4.   exclui candidatos de grupo/subgrupo incompatível (isCompatibleForExchange)
 * 5.   aplica restrições do paciente (isRestricted — ELIMINA, nunca penaliza)
 * 6.   preparo compatível — delegado ao chamador via `candidates` já filtrados
 * 7.   só então compara nutrientes (findFoodSubstitutes)
 * 8.   ajusta quantidade (idem, dentro de findFoodSubstitutes)
 * 9.   ranqueia (idem)
 */

export interface ExchangeGroupCandidate {
  food: MacroReferenceFood;
  ref: FoodReference;
}

export type ExchangeRelationCategory = "DIRECT_EXCHANGE" | "SAME_SUBGROUP" | "SAME_GROUP" | "COMPATIBLE_ROLE" | "CROSS_GROUP";
export type ExchangeDisplayQuality = "HIGH" | "MEDIUM" | "LOW";
export type ExchangeCandidateOrigin = "CURATED_TEMPLATE_LIST" | "CURATED_CONTEXT_LIST" | "AUTOMATIC_ENGINE" | "AI_REVIEWED";

/**
 * CORREÇÃO P0 (item 6/13) — no máximo 1 alternativa por família (ex.: só UM
 * representante de "mozarela", nunca mozarela E muçarela juntos) no top N
 * final. A família aqui já é mais estreita que foodSubgroup (é o tipo
 * específico do alimento, ex. "minas" vs "prato" vs "mozarela" — todos
 * CHEESE), então cap=1 ainda permite vários queijos DIFERENTES no top 5
 * (exatamente o exemplo aceitável do pedido: Ricota, Cottage, Muçarela,
 * Prato, Minas — 5 famílias distintas), só nunca duas variações do MESMO
 * queijo.
 */
const MAX_ALTERNATIVES_PER_FAMILY = 1;

export interface GenerateExchangeAlternativesOptions {
  primaryFood: MacroReferenceFood;
  primaryRef: FoodReference;
  primaryGrams: number;
  candidates: ExchangeGroupCandidate[];
  candidateOrigins?: Map<MacroReferenceFood, ExchangeCandidateOrigin>;
  /** item 18 — false por padrão: só troca dentro do MESMO subgrupo. true permite o mesmo GRUPO (nunca grupos diferentes, mesmo assim). */
  allowCrossGroup?: boolean;
  /** item 17 — restrição do paciente (alergia/vegetarianismo/rejeitado/etc). true = ELIMINA o candidato, nunca penaliza. */
  isRestricted?: (candidate: ExchangeGroupCandidate) => boolean;
  mode?: EquivalenceMode;
  /** item 10 — até 5 por padrão. */
  limit?: number;
  maxAlternativesPerFamily?: number;
  mealName?: string | null;
  mealContext?: MealContext;
}

export interface ExchangeGroupAlternative {
  ref: FoodReference;
  food: MacroReferenceFood;
  quantityGrams: number;
  nutrition: NutrientSnapshot;
  score: number;
  quality: SubstitutionQuality;
  displayQuality: ExchangeDisplayQuality;
  relationCategory: ExchangeRelationCategory;
  familyKey: string;
  foodForm: FoodForm;
  culinaryRole: CulinaryRole;
  contextAppropriate: boolean;
  sameSubgroup: boolean;
  sameGroup: boolean;
  /** item 13 — toda alternativa nasce SUGGESTED, nunca aprovada automaticamente (nem pela IA). */
  state: "SUGGESTED";
  candidateOrigin: ExchangeCandidateOrigin;
}

export interface GenerateExchangeAlternativesResult {
  primaryClassification: FoodClassification;
  alternatives: ExchangeGroupAlternative[];
  /** Quantos candidatos foram eliminados por grupo/subgrupo incompatível (item 9: score explicável — auditável em debug, nunca mostrado ao paciente). */
  excludedByGroup: number;
  /** Quantos foram eliminados por restrição do paciente. */
  excludedByRestriction: number;
}

export interface GenerateHybridExchangeAlternativesOptions extends Omit<GenerateExchangeAlternativesOptions, "candidates" | "candidateOrigins"> {
  curatedCandidates: ExchangeGroupCandidate[];
  automaticCandidates: ExchangeGroupCandidate[];
  curatedOrigin: Extract<ExchangeCandidateOrigin, "CURATED_TEMPLATE_LIST" | "CURATED_CONTEXT_LIST">;
}

export interface GenerateCuratedGlobalRankExchangeAlternativesOptions extends GenerateHybridExchangeAlternativesOptions {
  curatedEvidenceBonus?: number;
}

function sameFoodRef(a: FoodReference, b: FoodReference): boolean {
  return a.source === b.source && a.sourceId === b.sourceId;
}

/**
 * CORREÇÃO P0 (item 5/6/12/13) — bug real observado em produção: "Queijo
 * minas frescal" gerava "Queijo minas meia cura — 40g" E "Queijo minas
 * meia cura — 45g" como DUAS alternativas — não porque a engine de score
 * (substitution-engine.ts) usa similaridade de nome (ela nunca usou —
 * auditado, 100% baseada em nutrientes), mas porque TACO_REFERENCES
 * combina dois arquivos de dados (taco.json + taco-complementar.json) que
 * têm, cada um, sua PRÓPRIA linha pro mesmo alimento real (numero 462 e
 * 1043, macros ligeiramente diferentes) — a engine, corretamente, tratava
 * as duas como candidatos distintos e ambas pontuavam bem.
 *
 * Alias de grafia — SÓ pro caso real encontrado na auditoria (mozarela /
 * muçarela / mussarela são a mesma palavra com 3 grafias diferentes no
 * dataset combinado) — nunca uma tentativa de normalização genérica de
 * todo o vocabulário (isso arriscaria fundir alimentos genuinamente
 * diferentes).
 */
const FOOD_SPELLING_ALIASES: Array<[RegExp, string]> = [
  [/\bmucarela\b/g, "mozarela"],
  [/\bmussarela\b/g, "mozarela"],
];

/** Remove anotações entre parênteses ("(média de amostras)", "(mussarela)") — normalmente ruído de proveniência do dado, não parte da identidade do alimento. */
function stripParentheticals(text: string): string {
  return text.replace(/\([^)]*\)/g, " ");
}

function normalizeFoodIdentity(descricao: string): string {
  let text = stripParentheticals(descricao)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of FOOD_SPELLING_ALIASES) text = text.replace(pattern, replacement);
  return text;
}

const IDENTITY_STOPWORDS = new Set(["de", "da", "do", "com", "sem", "e", "media", "amostras", "preparos"]);

// A convenção da TACO nomeia "Palavra genérica, variedade, preparo". Pra
// palavras como "banana"/"arroz"/"frango"/"tilápia" o primeiro token JÁ é
// a identidade específica — variedades depois dele (cultivar, corte,
// preparo) são a MESMA família (item 11: "não 5 cultivares de banana").
// Mas pra categorias amplas como "queijo"/"leite"/"carne" o primeiro token
// sozinho é genérico demais (agruparia queijo minas com queijo prato) —
// aqui o SEGUNDO token é que identifica o produto específico.
const BROAD_CATEGORY_FIRST_WORDS = new Set(["queijo", "leite", "carne", "iogurte", "pao", "biscoito", "bolo", "suco", "doce", "molho", "creme", "sopa", "salada", "farinha", "oleo"]);

/**
 * Chave de "família" (item 6/13) — mais granular que foodSubgroup: dois
 * queijos diferentes (minas vs prato) ficam em famílias diferentes mesmo
 * sendo ambos CHEESE, mas duas variações do MESMO queijo (mozarela vs
 * muçarela) caem na mesma família via o alias de grafia acima, e todos os
 * cultivares de banana caem na mesma família ("banana" sozinho).
 */
function foodFamilyKey(descricao: string): string {
  const tokens = normalizeFoodIdentity(descricao).split(" ").filter((token) => token.length > 2 && !IDENTITY_STOPWORDS.has(token));
  if (!tokens.length) return normalizeFoodIdentity(descricao);
  const tokenCount = BROAD_CATEGORY_FIRST_WORDS.has(tokens[0]) ? 2 : 1;
  return tokens.slice(0, tokenCount).join(" ");
}

/**
 * Deduplicação semântica (item 5/12) — candidatos cujo nome normalizado
 * (após remover parênteses/pontuação/grafia alternativa) é IDÊNTICO
 * representam o mesmo alimento real vindo de duas linhas de dado
 * diferentes. Mantém só um representante — o de `numero` mais baixo
 * (heurística determinística e estável: entradas mais antigas/"clássicas"
 * do dataset TACO tendem a vir primeiro). Nunca funde os nutrientes dos
 * dois — a linha descartada simplesmente não vira candidato.
 */
function deduplicateCandidatesByIdentity(candidates: ExchangeGroupCandidate[]): ExchangeGroupCandidate[] {
  const bestByIdentity = new Map<string, ExchangeGroupCandidate>();
  for (const candidate of candidates) {
    const key = normalizeFoodIdentity(candidate.food.descricao);
    const current = bestByIdentity.get(key);
    if (!current) {
      bestByIdentity.set(key, candidate);
      continue;
    }
    const currentNumero = typeof current.food.numero === "number" ? current.food.numero : Number.POSITIVE_INFINITY;
    const candidateNumero = typeof candidate.food.numero === "number" ? candidate.food.numero : Number.POSITIVE_INFINITY;
    if (candidateNumero < currentNumero) bestByIdentity.set(key, candidate);
  }
  return candidates.filter((candidate) => bestByIdentity.get(normalizeFoodIdentity(candidate.food.descricao)) === candidate);
}

/**
 * Diversidade controlada por família (item 6/13) — nunca deixa uma família
 * (ex.: variações de mozarela) monopolizar o top N. Preserva a ordem de
 * score dentro do que sobrevive ao cap. Se não houver famílias boas
 * suficientes, retorna menos opções: qualidade vem antes de completar top N.
 */
function applyFamilyDiversityCap<T extends { food: MacroReferenceFood }>(results: T[], maxPerFamily: number, limit: number): T[] {
  const counts = new Map<string, number>();
  const accepted: T[] = [];
  for (const result of results) {
    const family = foodFamilyKey(result.food.descricao);
    const count = counts.get(family) ?? 0;
    if (count < maxPerFamily) {
      counts.set(family, count + 1);
      accepted.push(result);
    }
    if (accepted.length >= limit) break;
  }
  return accepted.slice(0, limit);
}

function applyFoodFormDiversityCap<T extends { foodForm: FoodForm }>(results: T[], limit: number): T[] {
  const counts = new Map<FoodForm, number>();
  const accepted: T[] = [];
  for (const result of results) {
    const maxForForm = result.foodForm === "BREAD" ? 2 : 3;
    const count = counts.get(result.foodForm) ?? 0;
    if (count < maxForForm) {
      counts.set(result.foodForm, count + 1);
      accepted.push(result);
    }
    if (accepted.length >= limit) break;
  }
  return accepted;
}

function relationCategoryFor(input: {
  primaryFood: MacroReferenceFood;
  candidateFood: MacroReferenceFood;
  primaryClassification: FoodClassification;
  candidateClassification: FoodClassification;
  primaryFamily: string;
  candidateFamily: string;
  sameSubgroup: boolean;
  sameGroup: boolean;
}): ExchangeRelationCategory {
  const primaryIdentity = normalizeFoodIdentity(input.primaryFood.descricao);
  const candidateIdentity = normalizeFoodIdentity(input.candidateFood.descricao);
  const primaryTokens = new Set(primaryIdentity.split(" "));
  const candidateTokens = new Set(candidateIdentity.split(" "));
  const bothBread = primaryTokens.has("pao") && candidateTokens.has("pao");
  const bothBreadForm = bothBread && primaryTokens.has("forma") && candidateTokens.has("forma");
  const broadBreadMismatch = bothBread && primaryTokens.has("forma") !== candidateTokens.has("forma");
  if (input.sameSubgroup && bothBreadForm) return "DIRECT_EXCHANGE";
  if (input.sameSubgroup && input.primaryFamily === input.candidateFamily && !broadBreadMismatch) return "DIRECT_EXCHANGE";
  if (input.sameSubgroup) return "SAME_SUBGROUP";
  if (input.sameGroup) return "SAME_GROUP";
  if (input.primaryClassification.nutritionalRole === input.candidateClassification.nutritionalRole) return "COMPATIBLE_ROLE";
  return "CROSS_GROUP";
}

function displayQualityFor(quality: SubstitutionQuality): ExchangeDisplayQuality {
  if (quality === "EXCELLENT" || quality === "GOOD") return "HIGH";
  if (quality === "REVIEW") return "MEDIUM";
  return "LOW";
}

const RELATION_PRIORITY: Record<ExchangeRelationCategory, number> = {
  DIRECT_EXCHANGE: 0,
  SAME_SUBGROUP: 1,
  SAME_GROUP: 2,
  COMPATIBLE_ROLE: 3,
  CROSS_GROUP: 4,
};

const DISPLAY_QUALITY_PRIORITY: Record<ExchangeDisplayQuality, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

function rankAlternatives(alternatives: ExchangeGroupAlternative[]): ExchangeGroupAlternative[] {
  return [...alternatives].sort((a, b) =>
    Number(b.contextAppropriate) - Number(a.contextAppropriate)
    || DISPLAY_QUALITY_PRIORITY[a.displayQuality] - DISPLAY_QUALITY_PRIORITY[b.displayQuality]
    || b.score - a.score
    || RELATION_PRIORITY[a.relationCategory] - RELATION_PRIORITY[b.relationCategory]
    || a.food.descricao.localeCompare(b.food.descricao, "pt-BR")
  );
}

/**
 * item 4/9 — ponto de entrada único. Nunca chamado pela IA diretamente
 * (item 12: a IA só INTERPRETA intenção, este motor sempre calcula) — ver
 * lib/nutrition/food-exchange-ai-assist.ts pra como a IA alimenta as
 * opções aqui (allowCrossGroup/isRestricted), nunca o resultado numérico.
 */
export function generateExchangeGroupAlternatives(options: GenerateExchangeAlternativesOptions): GenerateExchangeAlternativesResult {
  const { primaryFood, primaryRef, primaryGrams, candidates, allowCrossGroup = false, isRestricted = () => false, mode = "nutritional", limit = 5 } = options;
  const mealContext = options.mealContext ?? normalizeMealContext(options.mealName);

  const primaryClassification = classifyFoodExchangeGroup(primaryFood);
  const primaryFamily = foodFamilyKey(primaryFood.descricao);

  let excludedByGroup = 0;
  let excludedByRestriction = 0;
  const classificationByCandidate = new Map<ExchangeGroupCandidate, { classification: FoodClassification; sameSubgroup: boolean; sameGroup: boolean; contextAppropriate: boolean; culinaryRole: CulinaryRole }>();

  const survivingCandidates = candidates.filter((candidate) => {
    if (sameFoodRef(candidate.ref, primaryRef)) return false; // nunca sugere o proprio alimento principal como alternativa dele mesmo
    const classification = classifyFoodExchangeGroup(candidate.food);
    const compatibility = mealContext === "GENERIC"
      ? { ...isCompatibleForExchange(primaryClassification, classification, allowCrossGroup), contextAppropriate: false }
      : contextualExchangeEligibility({ primary: primaryClassification, candidate: classification, mealContext, allowCrossGroup });
    const { compatible, sameSubgroup, sameGroup, contextAppropriate } = compatibility;
    if (!compatible) {
      excludedByGroup++;
      return false;
    }
    if (isRestricted(candidate)) {
      excludedByRestriction++;
      return false;
    }
    classificationByCandidate.set(candidate, { classification, sameSubgroup, sameGroup, contextAppropriate, culinaryRole: classifyCulinaryRole(classification, mealContext) });
    return true;
  });

  // CORREÇÃO P0 (item 5/12) — deduplicação semântica ANTES de pontuar:
  // TACO_REFERENCES combina duas fontes de dado (taco.json +
  // taco-complementar.json) que às vezes têm uma linha cada pro MESMO
  // alimento real ("Queijo, minas, meia cura" e "Queijo minas, meia
  // cura" eram duas linhas distintas, ambas aprovadas pelo grupo/score, e
  // apareciam como duas "alternativas" diferentes). Sem isso, o passo de
  // diversidade por família abaixo só reagiria ao sintoma.
  const deduplicatedCandidates = deduplicateCandidatesByIdentity(survivingCandidates);

  // Reaproveita 100% o motor de quantidade/score/qualidade ja existente e
  // testado (lib/nutrition/substitution-engine.ts) — nunca uma segunda
  // logica de ajuste de gramatura ou de score. Busca mais candidatos do
  // que `limit` (item 6/13: diversidade de família) pra ter de onde
  // escolher depois de aplicar o cap por família, sem perder opções
  // legitimamente melhores só por causa da ordem de score bruto.
  const foodsOnly = deduplicatedCandidates.map((c) => c.food);
  const overfetchLimit = Math.max(limit * 4, 20);
  const substituteResults = findFoodSubstitutes({
    baseFood: primaryFood,
    baseGrams: primaryGrams,
    candidates: foodsOnly,
    mode,
    limit: overfetchLimit,
  });

  const refByFood = new Map(deduplicatedCandidates.map((c) => [c.food, c.ref]));
  const metaByFood = new Map(deduplicatedCandidates.map((c) => [c.food, classificationByCandidate.get(c)!]));

  const scoredAlternatives: ExchangeGroupAlternative[] = substituteResults.map((result) => {
    const meta = metaByFood.get(result.food)!;
    const familyKey = foodFamilyKey(result.food.descricao);
    const displayQuality = displayQualityFor(result.quality);
    return {
      ref: refByFood.get(result.food)!,
      food: result.food,
      quantityGrams: result.quantityGrams,
      nutrition: result.nutrition,
      score: result.score,
      quality: result.quality,
      displayQuality,
      relationCategory: relationCategoryFor({
        primaryFood,
        candidateFood: result.food,
        primaryClassification,
        candidateClassification: meta.classification,
        primaryFamily,
        candidateFamily: familyKey,
        sameSubgroup: meta.sameSubgroup,
        sameGroup: meta.sameGroup,
      }),
      familyKey,
      foodForm: meta.classification.foodForm,
      culinaryRole: meta.culinaryRole,
      contextAppropriate: meta.contextAppropriate,
      sameSubgroup: meta.sameSubgroup,
      sameGroup: meta.sameGroup,
      state: "SUGGESTED" as const,
      candidateOrigin: options.candidateOrigins?.get(result.food) ?? "AUTOMATIC_ENGINE",
    };
  }).filter((alternative) => alternative.displayQuality !== "LOW");

  // item 6/13 — diversidade controlada: nunca deixa uma família (ex.:
  // variações de mozarela) monopolizar o top N, preservando a ordem de
  // score dentro do que sobrevive ao cap.
  const rankedAlternatives = rankAlternatives(scoredAlternatives);
  const familyLimit = options.maxAlternativesPerFamily ?? MAX_ALTERNATIVES_PER_FAMILY;
  const alternatives = applyFoodFormDiversityCap(applyFamilyDiversityCap(rankedAlternatives, familyLimit, Math.max(limit * 2, limit)), limit);

  return { primaryClassification, alternatives, excludedByGroup, excludedByRestriction };
}

function refKey(ref: FoodReference): string {
  return `${ref.source}:${ref.sourceId}:${ref.canonicalId ?? ""}`;
}

export function generateHybridExchangeAlternatives(options: GenerateHybridExchangeAlternativesOptions): GenerateExchangeAlternativesResult {
  const targetLimit = options.limit ?? 5;
  const curatedOrigins = new Map<MacroReferenceFood, ExchangeCandidateOrigin>();
  for (const candidate of options.curatedCandidates) curatedOrigins.set(candidate.food, options.curatedOrigin);

  const curated = generateExchangeGroupAlternatives({
    ...options,
    candidates: options.curatedCandidates,
    candidateOrigins: curatedOrigins,
  });

  if (curated.alternatives.length >= targetLimit) return curated;

  const usedRefs = new Set(curated.alternatives.map((alternative) => refKey(alternative.ref)));
  const usedPrimary = refKey(options.primaryRef);
  const automaticCandidates = options.automaticCandidates.filter((candidate) => {
    const key = refKey(candidate.ref);
    return key !== usedPrimary && !usedRefs.has(key);
  });

  const automatic = generateExchangeGroupAlternatives({
    ...options,
    candidates: automaticCandidates,
    candidateOrigins: new Map(automaticCandidates.map((candidate) => [candidate.food, "AUTOMATIC_ENGINE" as const])),
    limit: options.limit,
  });

  const mergedCandidates: ExchangeGroupAlternative[] = [];
  const seen = new Set<string>();
  for (const alternative of [...curated.alternatives, ...automatic.alternatives]) {
    const key = refKey(alternative.ref);
    if (seen.has(key)) continue;
    seen.add(key);
    mergedCandidates.push(alternative);
  }
  const merged = applyFoodFormDiversityCap(applyFamilyDiversityCap(mergedCandidates, MAX_ALTERNATIVES_PER_FAMILY, Math.max(targetLimit * 2, targetLimit)), targetLimit);

  return {
    primaryClassification: curated.primaryClassification,
    alternatives: merged,
    excludedByGroup: curated.excludedByGroup + automatic.excludedByGroup,
    excludedByRestriction: curated.excludedByRestriction + automatic.excludedByRestriction,
  };
}

const GLOBAL_RANK_QUALITY_PRIORITY: Record<SubstitutionQuality, number> = {
  EXCELLENT: 0,
  GOOD: 1,
  REVIEW: 2,
  UNSUITABLE: 3,
};

const GLOBAL_RANK_RELATION_PENALTY: Record<ExchangeRelationCategory, number> = {
  DIRECT_EXCHANGE: 0,
  SAME_SUBGROUP: 0.001,
  SAME_GROUP: 0.003,
  COMPATIBLE_ROLE: 0.005,
  CROSS_GROUP: 0.008,
};

function curatedGlobalFinalScore(alternative: ExchangeGroupAlternative, curatedEvidenceBonus: number): number {
  const curatedEvidence = alternative.candidateOrigin === "CURATED_CONTEXT_LIST" || alternative.candidateOrigin === "CURATED_TEMPLATE_LIST";
  const contextPenalty = alternative.contextAppropriate ? 0 : 0.2;
  const relationPenalty = GLOBAL_RANK_RELATION_PENALTY[alternative.relationCategory] ?? 0.02;
  return alternative.score + contextPenalty + relationPenalty - (curatedEvidence ? curatedEvidenceBonus : 0);
}

function rankCuratedGlobal(alternatives: ExchangeGroupAlternative[], curatedEvidenceBonus: number): ExchangeGroupAlternative[] {
  return [...alternatives].sort((a, b) =>
    GLOBAL_RANK_QUALITY_PRIORITY[a.quality] - GLOBAL_RANK_QUALITY_PRIORITY[b.quality]
    || curatedGlobalFinalScore(a, curatedEvidenceBonus) - curatedGlobalFinalScore(b, curatedEvidenceBonus)
    || Number(b.contextAppropriate) - Number(a.contextAppropriate)
    || a.food.descricao.localeCompare(b.food.descricao, "pt-BR")
  );
}

export function generateCuratedGlobalRankExchangeAlternatives(options: GenerateCuratedGlobalRankExchangeAlternativesOptions): GenerateExchangeAlternativesResult {
  const targetLimit = options.limit ?? 5;
  const curatedOriginByRef = new Map(options.curatedCandidates.map((candidate) => [refKey(candidate.ref), options.curatedOrigin]));
  const mergedCandidatesByRef = new Map<string, ExchangeGroupCandidate>();
  for (const candidate of [...options.curatedCandidates, ...options.automaticCandidates]) {
    const key = refKey(candidate.ref);
    if (key === refKey(options.primaryRef)) continue;
    if (!mergedCandidatesByRef.has(key)) mergedCandidatesByRef.set(key, candidate);
  }

  const mergedCandidates = Array.from(mergedCandidatesByRef.values());
  const candidateOrigins = new Map<MacroReferenceFood, ExchangeCandidateOrigin>();
  for (const candidate of mergedCandidates) {
    candidateOrigins.set(candidate.food, curatedOriginByRef.get(refKey(candidate.ref)) ?? "AUTOMATIC_ENGINE");
  }

  const generated = generateExchangeGroupAlternatives({
    ...options,
    candidates: mergedCandidates,
    candidateOrigins,
    allowCrossGroup: true,
    limit: Math.max(targetLimit * 12, 50),
    maxAlternativesPerFamily: 2,
  });

  const curatedEvidenceBonus = options.curatedEvidenceBonus ?? 0.002;
  const ranked = rankCuratedGlobal(generated.alternatives, curatedEvidenceBonus);
  const alternatives = applyFoodFormDiversityCap(applyFamilyDiversityCap(ranked, 2, Math.max(targetLimit * 2, targetLimit)), targetLimit);

  return {
    primaryClassification: generated.primaryClassification,
    alternatives,
    excludedByGroup: generated.excludedByGroup,
    excludedByRestriction: generated.excludedByRestriction,
  };
}

/**
 * item 20 — simulação: mostra o impacto nutricional de UMA alternativa,
 * a uma quantidade OPCIONALMENTE diferente da já ajustada (ex.: a
 * nutricionista arrasta a quantidade na UI antes de aprovar), SEM alterar
 * o total oficial do plano. Não recebe o plano inteiro de propósito — só
 * o alimento e a quantidade — pra deixar impossível, por assinatura de
 * função, que este cálculo afete o estado do plano (item 21: o total do
 * plano usa exclusivamente primaryFood, nunca alternatives).
 */
export function calculateExchangeOptionNutrition(alternative: ExchangeGroupAlternative, gramsOverride?: number): NutrientSnapshot {
  if (gramsOverride === undefined || gramsOverride === alternative.quantityGrams) return alternative.nutrition;
  const { values } = calculateItemNutrients(String(gramsOverride), "g", alternative.food);
  return { energyKcal: values.energyKcal, proteinG: values.proteinG, carbohydrateG: values.carbohydrateG, fatG: values.fatG, fiberG: values.fiberG ?? null };
}
