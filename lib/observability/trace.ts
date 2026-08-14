import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";

/**
 * Camada leve de instrumentacao server-side (performance + correlacao).
 *
 * - Cada request/operacao roda dentro de um contexto AsyncLocalStorage
 *   (runtime Node.js), o que permite acumular metricas de D1 e IA sem
 *   passar parametros extras pelos repositorios.
 * - Nada de PHI/dado clinico entra nos logs: somente nomes de operacao,
 *   tempos, contagens e um requestId opaco.
 *
 * NAO confundir com admin_audit_logs (auditoria de acao): isto aqui e
 * observabilidade de performance, emitida como log estruturado e nunca
 * persistida em tabela clinica/audit.
 */

type TraceContext = {
  requestId: string;
  dbMs: number;
  dbRoundTrips: number;
  dbQueryCount: number;
  dbRowsRead: number;
  aiMs: number;
  startedAt: number;
};

const storage = new AsyncLocalStorage<TraceContext>();

export function getTraceContext(): TraceContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Estabelece o contexto de rastreio para um request/operacao. */
export function runWithTrace<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
  const context: TraceContext = {
    requestId,
    dbMs: 0,
    dbRoundTrips: 0,
    dbQueryCount: 0,
    dbRowsRead: 0,
    aiMs: 0,
    startedAt: Date.now(),
  };
  return storage.run(context, fn);
}

/** Acumula uma ida ao D1 (1 round-trip HTTP com N statements). */
export function addDbRoundTrip(ms: number, rowsRead: number, statementCount: number): void {
  const context = storage.getStore();
  if (!context) return;
  context.dbMs += ms;
  context.dbRowsRead += rowsRead;
  context.dbRoundTrips += 1;
  context.dbQueryCount += statementCount;
}

/** Acumula tempo de chamada de IA. */
export function addAiTiming(ms: number): void {
  const context = storage.getStore();
  if (!context) return;
  context.aiMs += ms;
}

type TraceResult = {
  operation: string;
  durationMs: number;
  dbMs: number;
  d1RoundTrips: number;
  d1Queries: number;
  rowsRead: number;
  aiMs: number;
  requestId?: string;
  status: "ok" | "error";
  error?: string;
};

function snapshot(operation: string, startedAt: number, status: "ok" | "error", error?: string): TraceResult {
  const context = storage.getStore();
  return {
    operation,
    durationMs: Date.now() - startedAt,
    dbMs: context?.dbMs ?? 0,
    d1RoundTrips: context?.dbRoundTrips ?? 0,
    d1Queries: context?.dbQueryCount ?? 0,
    rowsRead: context?.dbRowsRead ?? 0,
    aiMs: context?.aiMs ?? 0,
    requestId: context?.requestId,
    status,
    ...(error ? { error } : {}),
  };
}

/**
 * Mede uma operacao server-side (route/servico/snapshot) e emite log
 * estruturado sem PHI. Pode ser usada dentro de um runWithTrace ou sozinha.
 */
export async function withPerformanceTrace<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    logger.info("performance", { event: "performance", ...snapshot(operation, startedAt, "ok") });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("performance", { event: "performance", ...snapshot(operation, startedAt, "error", message) });
    throw error;
  }
}

/** Gera um requestId opaco (sem dado pessoal) para correlacionar logs. */
export function newRequestId(): string {
  return randomUUID();
}