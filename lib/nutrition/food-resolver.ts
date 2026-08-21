import { searchFoods, getFoodByReference, type FoodReference, type FoodSearchResult } from "@/lib/nutrition/food-catalog";
import { checkFoodAgainstPatientRestrictions } from "@/lib/clinical/food-safety";
import type { PatientClinicalMarker } from "@/lib/repositories/patient-clinical-markers";
import { normalize } from "@/lib/nutrition/macros";
import { logger } from "@/lib/observability/logger";

/**
 * Resolução rigorosa de um candidato de alimento em texto livre (proposto
 * pela IA ou digitado) contra o catálogo real. Nunca aceita "o primeiro
 * resultado" cegamente — só resolve automaticamente quando a confiança é
 * inequívoca (match exato/alias, ou prefixo sem concorrente igualmente
 * bom). Qualquer outra situação vira AMBIGUOUS: melhor pedir revisão
 * humana do que arriscar "tilápia" virar "merluza" ou "frango" virar
 * silenciosamente uma coxa quando a intenção pode ter sido peito.
 */
export type FoodResolutionStatus = "RESOLVED" | "AMBIGUOUS" | "NOT_FOUND" | "CLINICAL_CONFLICT" | "CLINICAL_UNKNOWN";

export interface FoodResolutionCandidate {
  ref: FoodReference;
  name: string;
  displayName: string;
  sourceLabel: string;
}

export interface FoodResolution {
  status: FoodResolutionStatus;
  query: string;
  ref: FoodReference | null;
  /** Nome tecnico exatamente como vem da fonte (TACO/CUSTOM/...) — nunca alterado, é o que garante a identidade nutricional. */
  name: string | null;
  /** Nome amigável só para exibição — nunca usado para resolver/persistir identidade. */
  displayName: string | null;
  /** Até 5 opções mais prováveis quando o status é AMBIGUOUS, para a nutricionista escolher manualmente. */
  candidates: FoodResolutionCandidate[];
  reason: string;
}

/**
 * Nome amigável para exibição — reordena o formato típico da TACO
 * ("Alimento, atributo1, atributo2" → "Alimento atributo1 atributo2"),
 * nunca um replace ingênuo de vírgula. NUNCA usado para resolver
 * identidade — source/refId/nutrientes continuam vindo do nome técnico
 * original, só a apresentação muda.
 */
export function toDisplayFoodName(technicalName: string): string {
  const parts = technicalName.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return technicalName.trim();
  return parts.join(" ");
}

/**
 * Decide se o melhor resultado pode ser aceito automaticamente, usando o
 * MESMO ranking de lib/nutrition/food-catalog.ts (matchRank: 0=exato,
 * 1=alias, 2=comeca-com, 3=contem, 4=todos os tokens) — nunca reimplementa
 * a lógica de match, só decide o quão confiante aceitar o resultado dela.
 *
 * Critérios de aceitação automática:
 * - rank 0 (exato) ou 1 (alias exato): sempre aceita, mesmo com empate —
 *   texto idêntico/alias conhecido não deixa dúvida real.
 * - rank 2 (prefixo): só aceita se for o ÚNICO candidato nesse nível ou
 *   melhor — dois alimentos que começam igual (ex.: "Frango, peito..." e
 *   "Frango, coxa...") para a query "frango" NUNCA são resolvidos sozinhos.
 * - rank 3/4 (contém/todos os tokens): Food Resolver V2 (seção 5 do pedido)
 *   — aceita SÓ quando é o ÚNICO resultado em TODO o catálogo (results.length
 *   === 1), nunca só "único nesse rank". "Não há absolutamente mais nada
 *   parecido" é um sinal forte de verdade (ex.: "pão de forma integral" só
 *   bate com UM alimento no catálogo inteiro); dois OU MAIS candidatos no
 *   mesmo rank 3/4 continuam sempre AMBIGUOUS — nunca escolhe entre eles.
 */
function classifyMatches(results: FoodSearchResult[]): { accepted: FoodSearchResult | null; candidates: FoodSearchResult[] } {
  if (!results.length) return { accepted: null, candidates: [] };
  const best = results[0];
  const bestRank = best.matchRank ?? 4;

  if (bestRank <= 1) return { accepted: best, candidates: [] };

  if (bestRank === 2) {
    const runnerUp = results[1];
    const runnerUpRank = runnerUp?.matchRank ?? 99;
    if (!runnerUp || runnerUpRank > 2) return { accepted: best, candidates: [] };
  }

  if ((bestRank === 3 || bestRank === 4) && results.length === 1) {
    return { accepted: best, candidates: [] };
  }

  return { accepted: null, candidates: results.slice(0, 5) };
}

/** rank -> rótulo de método pra observabilidade (seção 20 do pedido V5) — nunca o texto da query, só a classificação. */
function resolutionMethodFromRank(rank: number | undefined): string {
  if (rank === 0) return "EXACT";
  if (rank === 1) return "ALIAS";
  if (rank === 2 || rank === 3 || rank === 4) return "RANKED";
  return "UNKNOWN";
}

/**
 * Resolve um candidato completo: busca → classifica confiança → (se
 * aceito) checa segurança clínica. Único ponto de entrada — reaproveitado
 * pela geração inicial, pelo refinamento e por qualquer chamador futuro
 * que precise resolver texto livre em um alimento real.
 */
export async function resolveFoodCandidate(
  query: string,
  markers: PatientClinicalMarker[]
): Promise<FoodResolution> {
  const results = await searchFoods({ query, limit: 5 });
  const { accepted, candidates } = classifyMatches(results);

  // Observabilidade (seção 20 do pedido V5) — nunca o texto da query/nome
  // do alimento (seção 20 pede explicitamente "não logar texto sensível"),
  // só a classificação/fonte/rank/contagem. Só fora de produção —
  // resolveFoodCandidate roda em paralelo pra cada item de um draft
  // inteiro, não é o lugar pra volume de log em produção.
  if (process.env.NODE_ENV !== "production") {
    logger.debug("food_resolver_v2_resolution", {
      resultCount: results.length,
      accepted: Boolean(accepted),
      source: accepted?.ref.source ?? null,
      resolutionMethod: accepted ? resolutionMethodFromRank(accepted.matchRank) : results.length ? "AMBIGUOUS" : "NOT_FOUND",
      candidateCount: candidates.length,
    });
  }

  return resolveFoodCandidateInner(query, markers, results, accepted, candidates);
}

async function resolveFoodCandidateInner(
  query: string,
  markers: PatientClinicalMarker[],
  results: FoodSearchResult[],
  accepted: FoodSearchResult | null,
  candidates: FoodSearchResult[]
): Promise<FoodResolution> {
  if (!results.length) {
    return { status: "NOT_FOUND", query, ref: null, name: null, displayName: null, candidates: [], reason: `"${query}" não encontrado no catálogo de alimentos.` };
  }
  if (!accepted) {
    return {
      status: "AMBIGUOUS",
      query,
      ref: null,
      name: null,
      displayName: null,
      candidates: candidates.map((c) => ({ ref: c.ref, name: c.name, displayName: toDisplayFoodName(c.name), sourceLabel: c.sourceLabel })),
      reason: `"${query}" tem mais de uma correspondência plausível no catálogo — nenhuma foi escolhida automaticamente.`,
    };
  }

  const details = await getFoodByReference(accepted.ref);
  const safety = details ? checkFoodAgainstPatientRestrictions({ food: details.macroReference, markers }) : null;
  const displayName = toDisplayFoodName(accepted.name);

  if (safety?.status === "conflict") {
    return {
      status: "CLINICAL_CONFLICT",
      query,
      ref: accepted.ref,
      name: accepted.name,
      displayName,
      candidates: [],
      reason: `"${accepted.name}" conflita com uma restrição/alergia cadastrada.`,
    };
  }
  if (safety?.status === "unknown") {
    return {
      status: "CLINICAL_UNKNOWN",
      query,
      ref: accepted.ref,
      name: accepted.name,
      displayName,
      candidates: [],
      reason: `Segurança clínica de "${accepted.name}" não pôde ser confirmada.`,
    };
  }

  return { status: "RESOLVED", query, ref: accepted.ref, name: accepted.name, displayName, candidates: [], reason: "" };
}

/**
 * Resolve vários candidatos em paralelo, com cache por (query normalizada)
 * dentro da mesma chamada — "arroz branco cozido" pedido em duas refeições
 * diferentes do mesmo draft só busca no catálogo uma vez (seção 30/31 do
 * pedido: evitar N+1 serializado e resolução duplicada).
 */
export async function resolveFoodCandidates(
  queries: { query: string; key: string }[],
  markers: PatientClinicalMarker[]
): Promise<Map<string, FoodResolution>> {
  const cache = new Map<string, Promise<FoodResolution>>();
  const byKey = new Map<string, FoodResolution>();

  await Promise.all(queries.map(async ({ query, key }) => {
    const cacheKey = normalize(query);
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = resolveFoodCandidate(query, markers);
      cache.set(cacheKey, pending);
    }
    byKey.set(key, await pending);
  }));

  return byKey;
}
