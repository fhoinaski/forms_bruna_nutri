import { createHash } from "node:crypto";
import { resolveFoodCandidate, type FoodResolution } from "@/lib/nutrition/food-resolver";
import { normalize } from "@/lib/nutrition/macros";
import { resolveCanonicalFood, type CanonicalFoodResolution, type CanonicalResolutionStatus } from "@/lib/nutrition/canonical-food-resolver";
import { resolveQueryPreparation, type CanonicalDbExecutor } from "@/lib/nutrition/canonical-food-search";
import { extractConfidenceFeatures, type MatchClass, type QueryRisk } from "@/lib/nutrition/canonical-confidence-features";
import { canAutoResolveCanonicalV2 } from "@/lib/nutrition/canonical-confidence-v2";
import { getCanonicalFoodResolverModeForScope, type CanonicalFoodResolverMode, type CanonicalFoodResolverScope } from "@/lib/nutrition/canonical-food-resolver-flag";
import type { PatientClinicalMarker } from "@/lib/repositories/patient-clinical-markers";
import { logger } from "@/lib/observability/logger";

/**
 * FASE 4 — ponte de runtime controlada pelo feature flag
 * CANONICAL_FOOD_RESOLVER_MODE. NUNCA substitui lib/nutrition/food-resolver.ts
 * (o resolver ativo) — so envolve ele.
 *
 * FASE 5 (item 1): agora chamada pelos pontos de producao reais que antes
 * chamavam resolveFoodCandidate(s) direto (app/api/.../substitutions/suggest,
 * lib/ai/agents/nutrition/meal-plan-draft-agent.ts,
 * lib/ai/nutrition/substitution-command-router.ts) — seguro porque, com o
 * flag em "off" (o valor real em producao, ja que CANONICAL_FOOD_RESOLVER_MODE
 * so e setada em .env.local nesta fase), o comportamento e IDENTICO a
 * chamar resolveFoodCandidate direto (delega sem rodar nada do canonico,
 * linha "if (mode === 'off') return resolveFoodCandidate(...)" abaixo).
 * Em modo shadow, o valor devolvido ao chamador continua SEMPRE o do
 * resolver atual — o canonico so roda em paralelo e so alimenta telemetria.
 *
 * off             → so roda o resolver atual, ZERO overhead (nem importa o canonico).
 * shadow          → roda os dois, retorna SEMPRE o atual, so registra diferenca.
 * prefer_canonical → tenta o canonico; so "usa" quando ele aponta pra um
 *                     alimento TACO que o resolver atual TAMBEM reconhece
 *                     (reresolvido pelo MESMO resolveFoodCandidate, nunca
 *                     por um caminho de dado novo).
 *
 * FASE 6 (item 1/2): a decisao de auto-aceitacao pra prefer_canonical
 * agora vem EXCLUSIVAMENTE de canAutoResolveCanonicalV2 (policy V2,
 * lib/nutrition/canonical-confidence-v2.ts) — canUseCanonical (V1) continua
 * existindo e sendo CALCULADA em toda chamada (mesmo em modo "shadow"),
 * mas so pra telemetria/comparacao, nunca mais decide comportamento
 * clinico. O modo agora e por ESCOPO (getCanonicalFoodResolverModeForScope) —
 * cada chamador passa seu proprio `scope` (admin_food_search/substitutions/
 * meal_plan_ai), nunca uma flag global unica.
 */

export interface CanonicalConfidencePolicyInput {
  status: CanonicalResolutionStatus;
  score: number;
  gapToSecond: number | null; // null quando so ha 1 candidato relevante
  preparationConflict: boolean;
}

// FASE 4 (item 8) — policy documentada e testada, NUNCA ativada como
// substituicao automatica de dado nesta fase (so decide se prefer_canonical
// tenta re-resolver via o resolver atual; nunca decide sozinha o valor
// final entregue ao usuario).
export const CANONICAL_CONFIDENCE_SCORE_THRESHOLD = 90;
export const CANONICAL_CONFIDENCE_GAP_THRESHOLD = 8;

export function canUseCanonical(input: CanonicalConfidencePolicyInput): boolean {
  if (input.status !== "EXACT" && input.status !== "RESOLVED") return false;
  if (input.score < CANONICAL_CONFIDENCE_SCORE_THRESHOLD) return false;
  if (input.gapToSecond !== null && input.gapToSecond < CANONICAL_CONFIDENCE_GAP_THRESHOLD) return false;
  if (input.preparationConflict) return false;
  return true;
}

function gapToSecondFor(resolution: CanonicalFoodResolution): number | null {
  const pool = resolution.selected ? [resolution.selected, ...resolution.candidates] : resolution.candidates;
  if (pool.length < 2) return null;
  return pool[0].score - pool[1].score;
}

function preparationConflictFor(resolution: CanonicalFoodResolution): boolean {
  const top = resolution.selected ?? resolution.candidates[0];
  return (top?.scoreBreakdown.preparationScore ?? 0) < 0;
}

/** sha256 — telemetria NUNCA guarda texto livre de query (achado clinico potencial), so um hash pra agrupar repeticoes. */
function hashQuery(query: string): string {
  return createHash("sha256").update(query.trim().toLowerCase()).digest("hex").slice(0, 16);
}

export type ShadowOutcome =
  | "SAME_TOP"
  | "DIFFERENT_TOP"
  | "CANONICAL_FOUND_MORE"
  | "CANONICAL_FOUND_LESS"
  | "CANONICAL_AMBIGUOUS"
  | "CANONICAL_PREPARATION_REVIEW"
  | "CANONICAL_NOT_FOUND";

export interface CanonicalShadowTelemetryEvent {
  mode: CanonicalFoodResolverMode;
  scope: CanonicalFoodResolverScope;
  queryHash: string;
  currentStatus: FoodResolution["status"];
  canonicalStatus: CanonicalResolutionStatus;
  currentTopSource: string | null;
  canonicalTopSource: string | null;
  canonicalScore: number | null;
  canonicalMatchMethod: string | null;
  /** FASE 5 (item 2) — score_gap: diferenca de score entre o 1o e o 2o candidato canonico (null quando so ha 1 relevante). Mesmo calculo usado por canUseCanonical. */
  scoreGap: number | null;
  /** FASE 5 (item 2) — preparation_conflict: candidato canonico top existe mas rejeita a preparacao pedida (scoreBreakdown.preparationScore < 0). */
  preparationConflict: boolean;
  currentTimeMs: number;
  canonicalTimeMs: number;
  sourceDiffers: boolean;
  preparationDiffers: boolean;
  outcome: ShadowOutcome;
  /** FASE 6 (item 1) — se a resolucao devolvida ao chamador de fato veio do canonico (so possivel em prefer_canonical, e so quando a V2 autorizou). */
  usedCanonical: boolean;
  /** FASE 6 (item 1) — V1 (canUseCanonical) so pra COMPARACAO/telemetria, nunca decide comportamento. */
  v1WouldAutoAccept: boolean;
  /** FASE 6 (item 1) — a UNICA decisao que realmente pode disparar prefer_canonical. */
  v2AutoAccept: boolean;
  v2MatchClass: MatchClass | null;
  v2QueryRisk: QueryRisk | null;
  v2Reason: string | null;
  policyVersion: "V2";
}

/** Exportado pra scripts de auditoria (FASE 5, item 5/6) reaproveitarem a MESMA classificacao — nunca uma copia paralela que poderia divergir da telemetria real. */
export function classifyOutcome(current: FoodResolution, canonical: CanonicalFoodResolution): ShadowOutcome {
  const currentFound = current.status === "RESOLVED";
  const canonicalTop = canonical.selected ?? canonical.candidates[0] ?? null;
  const canonicalFound = Boolean(canonicalTop);
  if (canonical.status === "AMBIGUOUS") return "CANONICAL_AMBIGUOUS";
  if (canonical.status === "PREPARATION_REVIEW") return "CANONICAL_PREPARATION_REVIEW";
  if (canonical.status === "NOT_FOUND") return "CANONICAL_NOT_FOUND";
  if (!currentFound && canonicalFound) return "CANONICAL_FOUND_MORE";
  if (currentFound && !canonicalFound) return "CANONICAL_FOUND_LESS";
  if (currentFound && canonicalFound) {
    const currentSourceId = current.ref?.sourceId ?? null;
    const same = currentSourceId !== null && currentSourceId === canonicalTop!.sourceFoodId && current.ref?.source === canonicalTop!.source;
    return same ? "SAME_TOP" : "DIFFERENT_TOP";
  }
  return "DIFFERENT_TOP";
}

/**
 * FASE 6 (item 1) — a UNICA funcao que decide auto-aceitacao pra
 * prefer_canonical. Extrai features do candidato TOPO a partir de
 * `allCandidates` (lista completa, nunca cortada — ver
 * lib/nutrition/canonical-food-resolver.ts) e devolve o veredito da V2.
 * Calculada SEMPRE (mesmo em modo shadow) so pra telemetria/comparacao —
 * nunca influencia o valor devolvido fora do ramo prefer_canonical.
 *
 * Exportada pra lib/nutrition/canonical-food-admin-search.ts (o piloto de
 * busca administrativa) reaproveitar a MESMA logica, nunca uma copia
 * paralela que poderia divergir.
 */
export function computeV2Verdict(query: string, canonical: CanonicalFoodResolution): ReturnType<typeof canAutoResolveCanonicalV2> | null {
  if (!canonical.allCandidates.length) return null;
  const queryPreparation = resolveQueryPreparation({ query, preparation: canonical.preparation });
  const features = extractConfidenceFeatures(query, canonical.allCandidates, queryPreparation);
  if (!features) return null;
  return canAutoResolveCanonicalV2(features);
}

/** Mesma extracao acima, mas devolvendo as FEATURES completas (nao so o veredito) — usado quando o chamador precisa de matchClass/preparationEvidence/sourceAgreement pra provenance (FASE 6, item 5). */
export function computeV2Features(query: string, canonical: CanonicalFoodResolution): ReturnType<typeof extractConfidenceFeatures> {
  if (!canonical.allCandidates.length) return null;
  const queryPreparation = resolveQueryPreparation({ query, preparation: canonical.preparation });
  return extractConfidenceFeatures(query, canonical.allCandidates, queryPreparation);
}

function buildTelemetry(
  mode: CanonicalFoodResolverMode,
  scope: CanonicalFoodResolverScope,
  query: string,
  current: FoodResolution,
  canonical: CanonicalFoodResolution,
  currentTimeMs: number,
  canonicalTimeMs: number,
  usedCanonical: boolean,
  v2Verdict: ReturnType<typeof canAutoResolveCanonicalV2> | null
): CanonicalShadowTelemetryEvent {
  const canonicalTop = canonical.selected ?? canonical.candidates[0] ?? null;
  const v1WouldAutoAccept = canUseCanonical({
    status: canonical.status,
    score: canonicalTop?.score ?? 0,
    gapToSecond: gapToSecondFor(canonical),
    preparationConflict: preparationConflictFor(canonical),
  });
  return {
    mode,
    scope,
    queryHash: hashQuery(query),
    currentStatus: current.status,
    canonicalStatus: canonical.status,
    currentTopSource: current.ref?.source ?? null,
    canonicalTopSource: canonicalTop?.source ?? null,
    canonicalScore: canonicalTop?.score ?? null,
    canonicalMatchMethod: canonicalTop?.matchMethod ?? null,
    scoreGap: gapToSecondFor(canonical),
    preparationConflict: preparationConflictFor(canonical),
    currentTimeMs: Math.round(currentTimeMs * 100) / 100,
    canonicalTimeMs: Math.round(canonicalTimeMs * 100) / 100,
    sourceDiffers: (current.ref?.source ?? null) !== (canonicalTop?.source ?? null),
    preparationDiffers: preparationConflictFor(canonical),
    outcome: classifyOutcome(current, canonical),
    usedCanonical,
    v1WouldAutoAccept,
    v2AutoAccept: v2Verdict?.autoAccept ?? false,
    v2MatchClass: v2Verdict?.matchClass ?? null,
    v2QueryRisk: v2Verdict?.queryRisk ?? null,
    v2Reason: v2Verdict?.reason ?? null,
    policyVersion: "V2",
  };
}

function logTelemetry(event: CanonicalShadowTelemetryEvent): void {
  logger.info("canonical_food_shadow_comparison", event as unknown as Record<string, unknown>);
}

function emitTelemetry(context: CanonicalShadowContext, event: CanonicalShadowTelemetryEvent): void {
  logTelemetry(event);
  context.onTelemetry?.(event);
}

/**
 * FASE 4 (item 6) — wrapper de runtime. Assinatura identica a
 * resolveFoodCandidate (mesmo contrato de retorno, FoodResolution) — nunca
 * quebra nenhum chamador que optar por trocar o import no futuro.
 */
export interface CanonicalShadowContext {
  /** So pra testes/benchmarks — injeta o executor SQLite local no lugar do d1Query real. Nunca usado em producao. */
  db?: CanonicalDbExecutor;
  /** So pra scripts de agregacao (ex.: runtime-shadow-dataset.ts) — recebe o MESMO evento que vai pro logger, sem precisar reprocessar logs. Nunca usado em producao. */
  onTelemetry?: (event: CanonicalShadowTelemetryEvent) => void;
}

export async function resolveFoodWithCanonicalShadow(
  query: string,
  markers: PatientClinicalMarker[],
  adminId: string | null | undefined,
  scope: CanonicalFoodResolverScope,
  context: CanonicalShadowContext = {}
): Promise<FoodResolution> {
  const mode = getCanonicalFoodResolverModeForScope(scope);

  if (mode === "off") {
    return resolveFoodCandidate(query, markers, adminId);
  }

  // Os dois cronometrados a partir do MESMO t0 (rodam em paralelo de
  // verdade) — medir via um "canonicalStart" separado depois de disparar
  // currentPromise mediria so o tempo sincrono ate o primeiro await de
  // resolveFoodCandidate, nao a duracao real dele.
  const t0 = performance.now();
  const currentPromise = resolveFoodCandidate(query, markers, adminId).then((result) => ({ result, ms: performance.now() - t0 }));
  const canonicalPromise = resolveCanonicalFood(query, { limit: 8, db: context.db })
    .then((result) => ({ result, ms: performance.now() - t0 }))
    .catch((error) => {
      logger.warn("canonical_food_shadow_error", { message: error instanceof Error ? error.message : String(error) });
      const fallback: CanonicalFoodResolution = { status: "NOT_FOUND", query, candidates: [], allCandidates: [], preparation: null, reason: "shadow_error" };
      return { result: fallback, ms: performance.now() - t0 };
    });

  const [currentTimed, canonicalTimed] = await Promise.all([currentPromise, canonicalPromise]);
  const current = currentTimed.result;
  const canonical = canonicalTimed.result;
  const currentTimeMs = currentTimed.ms;
  const canonicalTimeMs = canonicalTimed.ms;

  // FASE 6 (item 1) — calculado SEMPRE (shadow ou prefer_canonical) so pra
  // telemetria/decisao; V1 (canUseCanonical) continua rodando so dentro de
  // buildTelemetry, exclusivamente pra comparacao, nunca decide nada aqui.
  const v2Verdict = computeV2Verdict(query, canonical);

  if (mode === "shadow") {
    emitTelemetry(context, buildTelemetry(mode, scope, query, current, canonical, currentTimeMs, canonicalTimeMs, false, v2Verdict));
    return current;
  }

  // prefer_canonical (FASE 6, item 1/4): a UNICA decisao de auto-aceitacao
  // vem de v2Verdict.autoAccept (canAutoResolveCanonicalV2) — nunca mais de
  // canUseCanonical (V1). So "usa" quando o canonico aponta pra um alimento
  // TACO que o PROPRIO resolver atual reconhece como match exato ao
  // re-resolver pelo nome exato do candidato canonico — mesma tecnica ja
  // usada em lib/ai/nutrition/substitution-command-router.ts pra
  // "desambiguar re-resolvendo pelo nome exato". Isso garante que o valor
  // final SEMPRE passa pela mesma pipeline de dado/seguranca clinica do
  // resolver atual — zero mudanca de calculo (item "nao fazer ainda"), o
  // canonico so ajuda a decidir SE aceita automaticamente, nunca de onde
  // vem o numero. QUALQUER bloqueio da V2 (NOT_FOUND/AMBIGUOUS/
  // PREPARATION_REVIEW/VARIETY_REQUIRED/conflito de marca/composto/erro D1
  // — ja cobertos por v2Verdict.autoAccept=false ou pelo catch acima) cai
  // automaticamente no fallback abaixo (item 4: fallback obrigatorio).
  const canonicalTop = canonical.selected;

  if (v2Verdict?.autoAccept && canonicalTop && canonicalTop.source === "TACO" && current.status !== "RESOLVED") {
    const reresolved = await resolveFoodCandidate(canonicalTop.name, markers, adminId);
    const sameIdentity = reresolved.status === "RESOLVED" && reresolved.ref?.source === "TACO" && reresolved.ref?.sourceId === canonicalTop.sourceFoodId;
    if (sameIdentity) {
      emitTelemetry(context, buildTelemetry(mode, scope, query, current, canonical, currentTimeMs, canonicalTimeMs, true, v2Verdict));
      return reresolved;
    }
  }

  emitTelemetry(context, buildTelemetry(mode, scope, query, current, canonical, currentTimeMs, canonicalTimeMs, false, v2Verdict));
  return current;
}

/**
 * FASE 5 (item 1) — equivalente em lote a resolveFoodWithCanonicalShadow,
 * MESMO padrao de dedup por query normalizada de resolveFoodCandidates
 * (lib/nutrition/food-resolver.ts) — "arroz branco cozido" pedido em duas
 * refeicoes do mesmo draft continua resolvendo (e comparando com o
 * canonico) uma unica vez, nunca duplicado.
 */
export async function resolveFoodCandidatesWithCanonicalShadow(
  queries: { query: string; key: string }[],
  markers: PatientClinicalMarker[],
  adminId: string | null | undefined,
  scope: CanonicalFoodResolverScope,
  context: CanonicalShadowContext = {}
): Promise<Map<string, FoodResolution>> {
  const cache = new Map<string, Promise<FoodResolution>>();
  const byKey = new Map<string, FoodResolution>();

  await Promise.all(queries.map(async ({ query, key }) => {
    const cacheKey = normalize(query);
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = resolveFoodWithCanonicalShadow(query, markers, adminId, scope, context);
      cache.set(cacheKey, pending);
    }
    byKey.set(key, await pending);
  }));

  return byKey;
}
