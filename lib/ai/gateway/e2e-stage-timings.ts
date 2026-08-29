/**
 * Test-only stage-timing registry (Clinical Copilot R1.2.6, seção 42-56).
 *
 * Mede as três etapas do pré-plano flexível SEPARADAMENTE — geração
 * (chamada estruturada/fixture + validação), resolução (canonical food
 * resolver) e nutrição (calculateDraftNutrition) — sem introduzir uma
 * segunda calculadora nem mudar o contrato de produção: fora de
 * E2E_TEST_MODE=1, record() é um no-op e take() sempre devolve undefined,
 * então a resposta HTTP real nunca ganha o campo `stageTimingsMs`.
 *
 * Mesmo padrão de e2e-fixtures.ts: registry em globalThis (não um Map
 * module-scoped) porque rotas podem ser emitidas em bundles separados do
 * servidor Next.
 */

export type StageTimingsMs = {
  generationMs?: number;
  resolutionMs?: number;
  nutritionMs?: number;
};

const REGISTRY_KEY = "__brunaNutriE2EStageTimingRegistry_v1__";

function registry(): Map<string, StageTimingsMs> {
  const global = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Map<string, StageTimingsMs> };
  if (!global[REGISTRY_KEY]) global[REGISTRY_KEY] = new Map();
  return global[REGISTRY_KEY]!;
}

export function isE2EStageTimingEnabled(): boolean {
  return process.env.E2E_TEST_MODE === "1";
}

/** Acumula timings parciais sob `key` (normalmente o clientId da requisição). */
export function recordStageTiming(key: string, patch: StageTimingsMs): void {
  if (!isE2EStageTimingEnabled()) return;
  const current = registry().get(key) ?? {};
  registry().set(key, { ...current, ...patch });
}

/** Lê e consome (remove) os timings acumulados — one-shot, como as fixtures. */
export function takeStageTimings(key: string): StageTimingsMs | undefined {
  if (!isE2EStageTimingEnabled()) return undefined;
  const value = registry().get(key);
  registry().delete(key);
  return value;
}
