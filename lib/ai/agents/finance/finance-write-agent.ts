import { z } from "zod";
import { getPaymentById } from "@/lib/repositories/payments";
import { PROPOSAL_DISCLAIMER } from "@/lib/ai/prompts/shared";

/**
 * FASE 3 (safe writes operacionais) — proposta de marcar um pagamento
 * manual como recebido. Financeiro continua 100% registro manual (sem
 * gateway) — esta tool NUNCA cria cobranca, NUNCA altera valor, NUNCA
 * exclui um pagamento (fora do escopo desta fase).
 */

export const PROPOSE_MARK_PAYMENT_RECEIVED_TOOL_NAME = "proposeMarkPaymentReceived";

export const proposeMarkPaymentReceivedInputSchema = z.object({
  paymentId: z.string().min(1).max(120),
  /** Data em que foi recebido, DD/MM/AAAA — quando ausente, usa hoje. */
  paidAtDisplay: z.string().max(10).optional(),
  notes: z.string().max(300).optional(),
}).strict();
export type ProposeMarkPaymentReceivedInput = z.infer<typeof proposeMarkPaymentReceivedInputSchema>;

export type ProposeMarkPaymentReceivedOutput =
  | { error: string }
  | {
      paymentId: string;
      clientId: string | null;
      clientName: string | null;
      description: string;
      amountFormatted: string;
      previousStatus: string;
      paidAtDisplay: string | null;
      notes: string | null;
    };

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export async function executeProposeMarkPaymentReceived(
  input: ProposeMarkPaymentReceivedInput
): Promise<ProposeMarkPaymentReceivedOutput> {
  const payment = await getPaymentById(input.paymentId);
  if (!payment) return { error: "Pagamento não encontrado. Peça para reler os pagamentos pendentes/atrasados." };
  if (payment.status === "pago") return { error: "Esse pagamento já está marcado como recebido." };
  return {
    paymentId: payment.id,
    clientId: payment.client_id,
    clientName: payment.client_name,
    description: payment.description,
    amountFormatted: formatBRL(payment.amount_cents),
    previousStatus: payment.status,
    paidAtDisplay: input.paidAtDisplay?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

export const FINANCE_WRITE_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode marcar um pagamento manual como recebido — sempre como PROPOSTA, nunca aplicada sozinha. Isto e um sistema so de REGISTRO manual, sem gateway de pagamento.
Como fazer isso:
- Primeiro identifique o pagamento certo: use ${"getOverduePayments"}/${"getPendingPayments"}/${"getPaymentDetails"} para achar o paymentId real — nunca invente um id.
- Se houver mais de um pagamento pendente/atrasado para a mesma pessoa, liste os valores/vencimentos e pergunte qual — nunca escolha sozinha.
- Use ${PROPOSE_MARK_PAYMENT_RECEIVED_TOOL_NAME}. Se a nutricionista mencionar quando foi recebido (ex.: "recebi ontem", "pago dia 10"), calcule a data (DD/MM/AAAA) a partir da referencia atual e informe em paidAtDisplay — sem informar, o sistema usa a data de hoje.
- NUNCA use esta ferramenta para "cobrar", "enviar link de pagamento" ou registrar um pagamento novo — ela so marca um pagamento JÁ EXISTENTE como recebido. NUNCA altere o valor do pagamento (não existe campo de valor nesta ferramenta) nem exclua um pagamento.
- Se a ferramenta devolver "error" (pagamento não encontrado ou já recebido), explique o problema em texto simples.
- ${PROPOSAL_DISCLAIMER}
`.trim();
