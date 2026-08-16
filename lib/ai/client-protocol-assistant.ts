import { z } from "zod";
import type { ClientProtocol } from "@/lib/repositories/client-protocols";
import { CLINICAL_PROPOSAL_DISCLAIMER } from "@/lib/ai/prompts/shared";
import { redactPii } from "@/lib/ai/privacy/pii";
import { truncateForToolOutput } from "@/lib/ai/privacy/sanitize-context";

export const PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME = "proposeClientProtocolNotes";

export const proposeClientProtocolNotesInputSchema = z.object({
  clientProtocolId: z.string().min(1),
  professionalNotes: z.string().min(1).max(5000),
}).strict();

export type ProposeClientProtocolNotesInput = z.infer<typeof proposeClientProtocolNotesInputSchema>;

export function buildClientProtocolsContext(protocols: ClientProtocol[]): string {
  if (!protocols.length) return "O cliente ainda nao tem nenhum protocolo atribuido — nao ha o que atualizar por aqui.";
  const list = protocols
    .map((protocol) => {
      // FASE 2B: redige PII (ja existia) + trunca defensivamente (novo) —
      // professional_notes pode chegar a 5000 chars (proposeClientProtocolNotesInputSchema).
      const notes = protocol.professional_notes ? truncateForToolOutput(redactPii(protocol.professional_notes).text).text : null;
      return `- id "${protocol.id}": ${protocol.protocol_title ?? "Protocolo"} (status: ${protocol.status})${notes ? ` — notas atuais: ${notes}` : ""}`;
    })
    .join("\n");
  return `Protocolos atribuidos a este cliente (use o id exato, entre aspas, ao chamar a ferramenta):\n${list}`;
}

export const CLIENT_PROTOCOL_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode ajudar a atualizar as notas profissionais de um protocolo ja atribuido a este cliente.
Quando a nutricionista descrever uma evolucao, ajuste de conduta ou pedir para atualizar as notas de um protocolo, use a ferramenta ${PROPOSE_CLIENT_PROTOCOL_NOTES_TOOL_NAME}, informando o id exato do protocolo (da lista de protocolos do cliente, fornecida no contexto) e o texto completo atualizado das notas.
Regras importantes:
- So use essa ferramenta se houver pelo menos um protocolo listado no contexto. Se houver mais de um e nao ficar claro qual pela conversa, pergunte antes de propor.
- O texto de professionalNotes deve ser o conteudo completo (inclua o que deve ser mantido das notas atuais junto com o que for novo, ja que ele substitui o valor anterior).
- ${CLINICAL_PROPOSAL_DISCLAIMER}
- Escreva em portugues, tom clinico e objetivo.
`.trim();
