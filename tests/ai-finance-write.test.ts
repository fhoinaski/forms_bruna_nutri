import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FASE 3 (safe writes operacionais) — tool layer de marcar pagamento como
 * recebido (lib/ai/agents/finance/finance-write-agent.ts). Nunca cria
 * cobrança, nunca altera valor, nunca exclui um pagamento.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1", client_id: "client-1", client_name: "Maria", client_email: null, description: "Consulta de retorno",
    amount_cents: 20000, due_date: "2026-08-01", paid_at: null, status: "vencido", payment_method: null,
    invoice_number: null, payment_link: null, receipt_url: null, installment_number: null, installment_total: null,
    category: null, notes: null, overdue_notified_at: null, created_at: "now", updated_at: "now",
    ...overrides,
  };
}

describe("executeProposeMarkPaymentReceived", () => {
  it("monta o snapshot da proposta a partir do estado real do pagamento", async () => {
    vi.doMock("@/lib/repositories/payments", () => ({ getPaymentById: vi.fn().mockResolvedValue(paymentRow()) }));
    const { executeProposeMarkPaymentReceived } = await import("../lib/ai/agents/finance/finance-write-agent");
    const result = await executeProposeMarkPaymentReceived({ paymentId: "pay-1", paidAtDisplay: "10/08/2026", notes: "Pago via Pix." });
    expect(result).toEqual({
      paymentId: "pay-1", clientId: "client-1", clientName: "Maria", description: "Consulta de retorno",
      amountFormatted: expect.stringMatching(/^R\$\s*200,00$/), previousStatus: "vencido",
      paidAtDisplay: "10/08/2026", notes: "Pago via Pix.",
    });
  });

  it("pagamento inexistente devolve error", async () => {
    vi.doMock("@/lib/repositories/payments", () => ({ getPaymentById: vi.fn().mockResolvedValue(null) }));
    const { executeProposeMarkPaymentReceived } = await import("../lib/ai/agents/finance/finance-write-agent");
    const result = await executeProposeMarkPaymentReceived({ paymentId: "does-not-exist" });
    expect(result).toEqual({ error: expect.stringContaining("não encontrado") });
  });

  it("pagamento já recebido devolve error, nunca propõe marcar de novo", async () => {
    vi.doMock("@/lib/repositories/payments", () => ({ getPaymentById: vi.fn().mockResolvedValue(paymentRow({ status: "pago" })) }));
    const { executeProposeMarkPaymentReceived } = await import("../lib/ai/agents/finance/finance-write-agent");
    const result = await executeProposeMarkPaymentReceived({ paymentId: "pay-1" });
    expect(result).toEqual({ error: expect.stringContaining("já está marcado") });
  });

  it("a ferramenta nunca aceita um campo de valor — impossível alterar o valor do pagamento por aqui", async () => {
    const { proposeMarkPaymentReceivedInputSchema } = await import("../lib/ai/agents/finance/finance-write-agent");
    const result = proposeMarkPaymentReceivedInputSchema.safeParse({ paymentId: "pay-1", amountCents: 1 });
    expect(result.success).toBe(false);
  });

  it("buildProposedAction produz uma proposta 'sensitive' com confirmação obrigatória", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const action = buildProposedAction("proposeMarkPaymentReceived", {}, {}, {
      paymentId: "pay-1", clientId: "client-1", clientName: "Maria", description: "Consulta",
      amountFormatted: "R$ 200,00", previousStatus: "vencido", paidAtDisplay: null, notes: null,
    });
    expect(action).toMatchObject({ kind: "mark_payment_received", risk: "sensitive", requiresConfirmation: true });
  });
});
