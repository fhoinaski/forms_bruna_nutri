import { d1Query } from "@/lib/d1/client";
import { decryptJsonValue, encryptJsonValue } from "@/lib/security/encrypted-fields";
import { IntakeSessionStateSchema } from "@/lib/ai/agents/patient/intake/intake-schema";
import { createInitialState } from "@/lib/ai/agents/patient/intake/intake-rules";
import type { IntakeSessionState } from "@/lib/ai/agents/patient/intake/intake-types";

/**
 * Persistência das sessões de intake. `state_json` é criptografado (dados de
 * saúde). Toda escrita usa `UPDATE ... WHERE version = ? RETURNING` para
 * proteção otimista contra duas mensagens simultâneas alterando a mesma
 * sessão.
 */

export interface PatientIntakeSessionRow {
  id: string;
  status: string;
  state_json: string;
  provider: string | null;
  model: string | null;
  turn_count: number;
  completed_submission_id: string | null;
  version: number;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export const INTAKE_SESSION_TTL_MS = 60 * 60 * 1000; // 60 minutos

/**
 * Teto do payload `state_json` serializado (antes da criptografia). Impede
 * crescimento ilimitado da sessão mesmo com respostas longas. Campos
 * individuais já possuem teto em intake-rules.ts; este é o teto agregado.
 */
export const MAX_STATE_JSON_BYTES = 64 * 1024;

export interface CreateIntakeSessionInput {
  provider?: string | null;
  model?: string | null;
}

export async function createIntakeSession(input: CreateIntakeSessionInput = {}): Promise<IntakeSessionState> {
  const id = crypto.randomUUID();
  const state = createInitialState(id);
  const now = new Date();
  await d1Query(
    `INSERT INTO patient_intake_sessions
       (id, status, state_json, provider, model, turn_count, completed_submission_id, version, expires_at, created_at, updated_at)
     VALUES (?1, 'active', ?2, ?3, ?4, 0, NULL, 1, ?5, ?6, ?7)`,
    [id, encryptJsonValue(state), input.provider ?? null, input.model ?? null,
      new Date(now.getTime() + INTAKE_SESSION_TTL_MS).toISOString(), now.toISOString(), now.toISOString()]
  );

  // Limpeza best-effort de sessões expiradas (política de retenção): remove
  // qualquer sessão cujo expires_at já passou, evitando acúmulo indefinido.
  await purgeExpiredIntakeSessions().catch(() => null);

  return state;
}

/**
 * Política de limpeza de sessões expiradas. As sessões NÃO são retidas após
 * expirar: o conteúdo clínico temporário (state_json) é removido do banco
 * assim que expira. Executada de forma oportunista a cada nova sessão.
 */
export async function purgeExpiredIntakeSessions(): Promise<void> {
  const now = new Date().toISOString();
  await d1Query(
    "DELETE FROM patient_intake_sessions WHERE expires_at < ?1 AND status != 'completed'",
    [now]
  );
}

export function hydrateSessionState(row: PatientIntakeSessionRow): IntakeSessionState {
  const parsed = decryptJsonValue<unknown>(row.state_json, null);
  const result = IntakeSessionStateSchema.safeParse(parsed);
  if (!result.success) {
    // Estado corrompido/incompatível — nunca devolver dado não validado.
    throw new Error("Estado da sessão de intake inválido.");
  }
  // O schema valida o formato; o elenco para o tipo de domínio é seguro
  // pois `currentSection` já passou pelo enum de seções.
  return result.data as IntakeSessionState;
}

export async function getIntakeSession(id: string): Promise<{
  state: IntakeSessionState;
  row: PatientIntakeSessionRow;
} | null> {
  const rows = await d1Query<PatientIntakeSessionRow>(
    "SELECT * FROM patient_intake_sessions WHERE id = ?1 LIMIT 1",
    [id]
  );
  if (!rows[0]) return null;
  return { state: hydrateSessionState(rows[0]), row: rows[0] };
}

/**
 * Grava o estado usando proteção otimista. Retorna a linha atualizada ou
 * null se a versão não casou (alguém escreveu em paralelo).
 */
export async function updateIntakeSession(
  id: string,
  expectedVersion: number,
  state: IntakeSessionState,
  extra: { status?: string; provider?: string | null; model?: string | null; turnCount?: number }
): Promise<PatientIntakeSessionRow | null> {
  const serialized = encryptJsonValue(state);
  if (Buffer.byteLength(JSON.stringify(state), "utf8") > MAX_STATE_JSON_BYTES) {
    throw new Error("Sessão de intake excedeu o tamanho máximo permitido.");
  }
  const now = new Date().toISOString();
  const rows = await d1Query<PatientIntakeSessionRow>(
    `UPDATE patient_intake_sessions
     SET state_json = ?1,
         status = ?2,
         provider = COALESCE(?3, provider),
         model = COALESCE(?4, model),
         turn_count = ?5,
         version = version + 1,
         updated_at = ?6
     WHERE id = ?7 AND version = ?8
     RETURNING *`,
    [
      serialized,
      extra.status ?? state.status,
      extra.provider ?? null,
      extra.model ?? null,
      extra.turnCount ?? 0,
      now,
      id,
      expectedVersion,
    ]
  );
  return rows[0] ?? null;
}

/**
 * Finaliza a sessão gravando `completed_submission_id` EXATAMENTE UMA vez.
 *
 * A guarda `completed_submission_id IS NULL` impede que uma segunda chamada
 * (concorrente ou repetida) sobrescreva o id da primeira — o que seria um
 * conflito silencioso. Retorna:
 * - `{ row, already: false }` quando esta chamada realizou a transição;
 * - `{ row, already: true }` quando o vínculo já existia com o MESMO id
 *   (idempotência por retry);
 * - `{ row: null, already: false }` quando já existe um vínculo com um id
 *   DIFERENTE (conflito de dados distintos) — o chamador deve tratar como erro.
 */
export async function completeIntakeSessionOnce(
  id: string,
  expectedVersion: number,
  submissionId: string
): Promise<{ row: PatientIntakeSessionRow | null; already: boolean }> {
  const now = new Date().toISOString();
  const updated = await d1Query<PatientIntakeSessionRow>(
    `UPDATE patient_intake_sessions
     SET status = 'completed',
         completed_submission_id = ?1,
         version = version + 1,
         updated_at = ?2
     WHERE id = ?3 AND version = ?4 AND completed_submission_id IS NULL
     RETURNING *`,
    [submissionId, now, id, expectedVersion]
  );
  if (updated[0]) return { row: updated[0], already: false };

  const current = await d1Query<PatientIntakeSessionRow>(
    "SELECT * FROM patient_intake_sessions WHERE id = ?1 LIMIT 1",
    [id]
  );
  if (current[0]?.completed_submission_id === submissionId) {
    return { row: current[0], already: true };
  }
  return { row: null, already: false };
}

export async function markIntakeSessionFallback(id: string, expectedVersion: number): Promise<PatientIntakeSessionRow | null> {
  const now = new Date().toISOString();
  const rows = await d1Query<PatientIntakeSessionRow>(
    `UPDATE patient_intake_sessions
     SET status = 'fallback', version = version + 1, updated_at = ?1
     WHERE id = ?2 AND version = ?3 AND status IN ('active', 'review')
     RETURNING *`,
    [now, id, expectedVersion]
  );
  return rows[0] ?? null;
}