import {
  getConversationSummary,
  upsertConversationSummary,
} from "@/lib/repositories/ai-conversation-summaries";

/**
 * Memoria de conversa em dois niveis (secao 10 do pedido de arquitetura):
 * curto prazo continua no frontend (AiChatWidget), sem mudanca; este modulo
 * e o resumo persistente, compacto, isolado por (admin_id, client_id).
 * Nunca grava raciocinio do modelo — so fatos deterministicos que o proprio
 * orquestrador ja conhece (topico, proposta gerada, navegacao).
 */
export interface ConversationTurnOutcome {
  topic: string;
  proposalKind?: string;
  navigatedTo?: string;
}

const MAX_SUMMARY_CHARS = 2000;
const MAX_LINES = 20;

export async function getClientConversationMemory(adminId: string, clientId: string | null): Promise<string | null> {
  const record = await getConversationSummary(adminId, clientId);
  return record?.summary ?? null;
}

export async function recordConversationTurn(
  adminId: string,
  clientId: string | null,
  outcome: ConversationTurnOutcome
): Promise<void> {
  try {
    const existing = await getConversationSummary(adminId, clientId);
    const line = [
      new Date().toISOString().slice(0, 16).replace("T", " "),
      outcome.topic,
      outcome.proposalKind ? `proposta: ${outcome.proposalKind}` : "",
      outcome.navigatedTo ? `navegou: ${outcome.navigatedTo}` : "",
    ].filter(Boolean).join(" — ");

    const previousLines = existing?.summary ? existing.summary.split("\n") : [];
    const nextLines = [...previousLines, line].slice(-MAX_LINES);
    const nextSummary = nextLines.join("\n").slice(-MAX_SUMMARY_CHARS);

    await upsertConversationSummary(adminId, clientId, nextSummary);
  } catch (error) {
    // Memoria e um reforco de UX, nunca deve derrubar a resposta do chat.
    console.error("[conversation-summary] Falha ao gravar memoria de conversa:", error);
  }
}
