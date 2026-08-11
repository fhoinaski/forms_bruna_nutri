import { d1Execute, d1Query } from "@/lib/d1/client";

export interface PatientConversationSummary {
  id: string;
  client_id: string;
  summary: string;
  updated_at: string;
}

/**
 * Isolamento por client_id sozinho — tabela PROPRIA do PATIENT_ASSISTANT
 * (nunca ai_conversation_summaries, que e do admin). Um paciente nunca le
 * nem escreve o resumo de outro; a nutricionista nunca compartilha essa
 * memoria com o paciente.
 */
export async function getPatientConversationSummary(clientId: string): Promise<PatientConversationSummary | null> {
  const rows = await d1Query<PatientConversationSummary>(
    `SELECT * FROM patient_conversation_summaries WHERE client_id = ?1 LIMIT 1`,
    [clientId]
  );
  return rows[0] ?? null;
}

export async function upsertPatientConversationSummary(clientId: string, summary: string): Promise<void> {
  const existing = await getPatientConversationSummary(clientId);
  if (existing) {
    await d1Execute(
      `UPDATE patient_conversation_summaries SET summary = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2`,
      [summary, existing.id]
    );
    return;
  }
  await d1Execute(
    `INSERT INTO patient_conversation_summaries (id, client_id, summary, updated_at)
     VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)`,
    [crypto.randomUUID(), clientId, summary]
  );
}
