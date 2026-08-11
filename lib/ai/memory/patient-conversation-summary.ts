import {
  getPatientConversationSummary,
  upsertPatientConversationSummary,
} from "@/lib/repositories/patient-conversation-summaries";

/**
 * Memoria de conversa do PATIENT_ASSISTANT — isolada por client_id, NUNCA
 * compartilhada com a memoria administrativa (lib/ai/memory/conversation-summary.ts
 * usa outra tabela inteira). So fatos deterministicos (topico, acao gerada),
 * nunca raciocinio do modelo (secao 25 do pedido).
 */
export interface PatientConversationTurnOutcome {
  topic: string;
  proposalKind?: string;
}

const MAX_SUMMARY_CHARS = 1500;
const MAX_LINES = 15;

export async function getPatientConversationMemory(clientId: string): Promise<string | null> {
  const record = await getPatientConversationSummary(clientId);
  return record?.summary ?? null;
}

export async function recordPatientConversationTurn(
  clientId: string,
  outcome: PatientConversationTurnOutcome
): Promise<void> {
  try {
    const existing = await getPatientConversationSummary(clientId);
    const line = [
      new Date().toISOString().slice(0, 16).replace("T", " "),
      outcome.topic,
      outcome.proposalKind ? `pedido: ${outcome.proposalKind}` : "",
    ].filter(Boolean).join(" — ");

    const previousLines = existing?.summary ? existing.summary.split("\n") : [];
    const nextLines = [...previousLines, line].slice(-MAX_LINES);
    const nextSummary = nextLines.join("\n").slice(-MAX_SUMMARY_CHARS);

    await upsertPatientConversationSummary(clientId, nextSummary);
  } catch (error) {
    console.error("[patient-conversation-summary] Falha ao gravar memoria de conversa:", error);
  }
}
