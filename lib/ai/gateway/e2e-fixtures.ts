/**
 * Provider determinístico de teste para E2E (V3 do fechamento de gaps,
 * FASE 11) — centralizado na fronteira do AI gateway
 * (lib/ai/gateway/ai-gateway.ts#generateStructuredResult), nunca espalhado
 * como `if (process.env.E2E_TEST_MODE)` pelos agentes. Em produção este
 * módulo nunca é consultado de um jeito que muda o resultado: o gateway só
 * olha pra cá quando `E2E_TEST_MODE=1` (setado só pelo
 * e2e/helpers/webserver-entrypoint.mjs), então o caminho real
 * (generateText contra o provider configurado) é o único que roda fora de
 * E2E.
 *
 * Escopo por (agent, key) — key é normalmente o clientId do teste, pra dois
 * workers do Playwright rodando em paralelo contra o MESMO processo
 * `next start` nunca pisarem na fixture um do outro. Uma fixture é
 * consumida uma única vez (one-shot) — a próxima chamada pro mesmo par
 * agent+key sem uma nova fixture registrada cai no comportamento real
 * (útil pra testar "provider ainda não respondeu"/timeout sem precisar de
 * um mecanismo separado).
 */

import { createHash, randomUUID } from "node:crypto";

type FixtureRecord = { data: unknown; hash: string; fixtureId: string };
export type E2EFixtureTrace = {
  event: "registered" | "readback" | "consumed" | "not_found";
  fixtureKey: string; fixtureId?: string; hash?: string; structureType?: string; mealCount?: number;
  registryInstanceId: string; processId: number; timestamp: string; details?: string;
};
type Registry = { fixtures: Map<string, FixtureRecord>; traces: E2EFixtureTrace[]; instanceId: string };
const REGISTRY_KEY = "__brunaNutriE2EFixtureRegistry_v1__";

/** Routes can be emitted in separate Next server bundles. A module-scoped
 * Map therefore splits registration from consumption; this global is scoped
 * to the Node process and is used only under E2E_TEST_MODE. */
function registry(): Registry {
  const global = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Registry };
  if (!global[REGISTRY_KEY]) global[REGISTRY_KEY] = { fixtures: new Map(), traces: [], instanceId: `${process.pid}-${randomUUID()}` };
  return global[REGISTRY_KEY]!;
}

function fixtureKey(agent: string, key: string): string {
  return `${agent}::${key}`;
}

export function isE2EGatewayTestModeEnabled(): boolean {
  return process.env.E2E_TEST_MODE === "1";
}

function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16); }
function summarize(data: unknown) {
  const meals = data && typeof data === "object" && Array.isArray((data as { meals?: unknown[] }).meals) ? (data as { meals: unknown[] }).meals : [];
  const first = meals[0] as { structureType?: unknown } | undefined;
  return { mealCount: meals.length, structureType: typeof first?.structureType === "string" ? first.structureType : undefined };
}
function trace(event: E2EFixtureTrace["event"], key: string, record?: FixtureRecord, details?: string): E2EFixtureTrace {
  const current = registry();
  const entry: E2EFixtureTrace = { event, fixtureKey: key, fixtureId: record?.fixtureId, hash: record?.hash, ...summarize(record?.data), registryInstanceId: current.instanceId, processId: process.pid, timestamp: new Date().toISOString(), details };
  current.traces.push(entry);
  if (current.traces.length > 50) current.traces.shift();
  return entry;
}

/** Chamado só pelas rotas /api/admin/e2e/* (que já retornam 404 fora de E2E_TEST_MODE). */
export function setE2EStructuredFixture(agent: string, key: string, data: unknown): E2EFixtureTrace {
  const record = { data, hash: hash(data), fixtureId: key };
  const k = fixtureKey(agent, key);
  registry().fixtures.set(k, record);
  return trace("registered", k, record);
}

/** Test-only readback; it deliberately does not consume the one-shot fixture. */
export function readE2EStructuredFixture(agent: string, key: string): E2EFixtureTrace {
  const k = fixtureKey(agent, key);
  const record = registry().fixtures.get(k);
  return trace(record ? "readback" : "not_found", k, record);
}

/** Chamado só por generateStructuredResult — consome (remove) a fixture ao ler. */
export function takeE2EStructuredFixture(agent: string, key: string | undefined): unknown | undefined {
  if (!key) { trace("not_found", fixtureKey(agent, ""), undefined, "missing key"); return undefined; }
  const k = fixtureKey(agent, key);
  const record = registry().fixtures.get(k);
  if (!record) { trace("not_found", k); return undefined; }
  registry().fixtures.delete(k);
  trace("consumed", k, record);
  return record.data;
}

export function getE2EFixtureTraces(key?: string): E2EFixtureTrace[] {
  const expected = key ? fixtureKey("meal-plan-draft", key) : undefined;
  return registry().traces.filter((entry) => !expected || entry.fixtureKey === expected);
}
