import { d1Execute, d1Query } from "@/lib/d1/client";

export interface AiConversationSummary {
  id: string;
  admin_id: string;
  client_id: string | null;
  summary: string;
  updated_at: string;
}

/**
 * Isolamento por (admin_id, client_id): client_id NULL representa a
 * conversa geral (sem paciente aberto) do proprio admin — nunca cruza com
 * conversas de outro admin nem com o resumo de outro cliente.
 */
export async function getConversationSummary(adminId: string, clientId: string | null): Promise<AiConversationSummary | null> {
  const rows = clientId
    ? await d1Query<AiConversationSummary>(
        `SELECT * FROM ai_conversation_summaries WHERE admin_id = ?1 AND client_id = ?2 LIMIT 1`,
        [adminId, clientId]
      )
    : await d1Query<AiConversationSummary>(
        `SELECT * FROM ai_conversation_summaries WHERE admin_id = ?1 AND client_id IS NULL LIMIT 1`,
        [adminId]
      );
  return rows[0] ?? null;
}

export async function upsertConversationSummary(adminId: string, clientId: string | null, summary: string): Promise<void> {
  const existing = await getConversationSummary(adminId, clientId);
  if (existing) {
    await d1Execute(
      `UPDATE ai_conversation_summaries SET summary = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2`,
      [summary, existing.id]
    );
    return;
  }
  await d1Execute(
    `INSERT INTO ai_conversation_summaries (id, admin_id, client_id, summary, updated_at)
     VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)`,
    [crypto.randomUUID(), adminId, clientId, summary]
  );
}
