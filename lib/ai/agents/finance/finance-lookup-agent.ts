import { z } from "zod";
import { getPayments, getPaymentById, getPaymentMetrics, type Payment } from "@/lib/repositories/payments";
import { getSaoPauloDateKey } from "@/lib/utils/timezone";

/**
 * Tools de leitura financeira (FASE 1B) — financeiro do sistema e 100%
 * registro manual, sem gateway de pagamento (confirmado na auditoria da
 * FASE 1, docs/AI-OPERATOR-AUDIT-ROADMAP.md). Nesta fase SOMENTE LEITURA —
 * nada aqui registra pagamento, marca como pago ou altera valor.
 */

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function toSummary(payment: Payment) {
  return {
    id: payment.id,
    clientId: payment.client_id,
    clientName: payment.client_name,
    description: payment.description,
    amountCents: payment.amount_cents,
    amountFormatted: formatBRL(payment.amount_cents),
    dueDate: payment.due_date,
    status: payment.status,
    category: payment.category,
  };
}

/** "vencido" (status ja marcado) OU "pendente" com vencimento no passado — mesmo criterio ja usado em getUnnotifiedOverduePayments/dashboard action-items, nunca um segundo criterio novo. */
function isOverdue(payment: Payment, todayKey: string): boolean {
  if (payment.status === "vencido") return true;
  return payment.status === "pendente" && Boolean(payment.due_date) && (payment.due_date as string) < todayKey;
}

// ── get_payment_details (READ) ────────────────────────────────────────────

export const GET_PAYMENT_DETAILS_TOOL_NAME = "getPaymentDetails";
export const getPaymentDetailsInputSchema = z.object({
  paymentId: z.string().min(1).max(120),
}).strict();
export type GetPaymentDetailsInput = z.infer<typeof getPaymentDetailsInputSchema>;

export async function executeGetPaymentDetails(input: GetPaymentDetailsInput) {
  const payment = await getPaymentById(input.paymentId);
  if (!payment) return { found: false as const };
  return {
    found: true as const,
    payment: {
      ...toSummary(payment),
      paidAt: payment.paid_at,
      paymentMethod: payment.payment_method,
      invoiceNumber: payment.invoice_number,
      installmentNumber: payment.installment_number,
      installmentTotal: payment.installment_total,
      notes: payment.notes,
    },
  };
}

// ── get_overdue_payments (READ) ───────────────────────────────────────────

export const GET_OVERDUE_PAYMENTS_TOOL_NAME = "getOverduePayments";
export const getOverduePaymentsInputSchema = z.object({
  clientId: z.string().min(1).max(120).optional(),
}).strict();
export type GetOverduePaymentsInput = z.infer<typeof getOverduePaymentsInputSchema>;

export async function executeGetOverduePayments(input: GetOverduePaymentsInput) {
  const todayKey = getSaoPauloDateKey();
  const payments = (await getPayments({ clientId: input.clientId })).filter((p) => isOverdue(p, todayKey));
  return { payments: payments.map(toSummary), totalFound: payments.length };
}

// ── get_pending_payments (READ) ───────────────────────────────────────────

export const GET_PENDING_PAYMENTS_TOOL_NAME = "getPendingPayments";
export const getPendingPaymentsInputSchema = z.object({
  clientId: z.string().min(1).max(120).optional(),
}).strict();
export type GetPendingPaymentsInput = z.infer<typeof getPendingPaymentsInputSchema>;

export async function executeGetPendingPayments(input: GetPendingPaymentsInput) {
  const payments = await getPayments({ clientId: input.clientId, status: "pendente" });
  return { payments: payments.map(toSummary), totalFound: payments.length };
}

// ── get_financial_summary (READ) ──────────────────────────────────────────

export const GET_FINANCIAL_SUMMARY_TOOL_NAME = "getFinancialSummary";
export const getFinancialSummaryInputSchema = z.object({}).strict();

export async function executeGetFinancialSummary() {
  const metrics = await getPaymentMetrics();
  return {
    receivedThisMonth: { cents: metrics.receivedMonthCents, formatted: formatBRL(metrics.receivedMonthCents), count: metrics.receivedCount },
    open: { cents: metrics.openCents, formatted: formatBRL(metrics.openCents), count: metrics.openCount },
    overdue: { cents: metrics.overdueCents, formatted: formatBRL(metrics.overdueCents), count: metrics.overdueCount },
  };
}

export const FINANCE_LOOKUP_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode consultar o financeiro real (registro manual, sem cobranca automatica) — nunca invente valor ou status, sempre use estas ferramentas.
Como fazer isso:
- Para "quem esta com pagamento atrasado" (todos) ou "o pagamento da Maria esta atrasado" (um paciente), use ${GET_OVERDUE_PAYMENTS_TOOL_NAME}, informando clientId so quando for sobre um paciente especifico.
- Para "quais pagamentos estao pendentes" (inclui os que ainda nao venceram) ou "qual pagamento da Maria esta pendente", use ${GET_PENDING_PAYMENTS_TOOL_NAME}.
- Para detalhe completo de UM pagamento especifico (forma de pagamento, parcela, notas) quando ja tiver o id, use ${GET_PAYMENT_DETAILS_TOOL_NAME}.
- Para "quanto tenho a receber" ou um resumo financeiro geral (recebido no mes, em aberto, vencido), use ${GET_FINANCIAL_SUMMARY_TOOL_NAME}.
- Se houver mais de um pagamento pendente/atrasado para a mesma pessoa, liste todos — nunca escolha um sozinha nem some valores de cabeça, os totais ja vem prontos de ${GET_FINANCIAL_SUMMARY_TOOL_NAME}.
- Este e um sistema so de REGISTRO manual, sem gateway de pagamento — nunca ofereca "cobrar" ou "enviar link de pagamento" a partir daqui, e nunca marque nada como pago (essa acao ainda nao existe nesta fase).
`.trim();
