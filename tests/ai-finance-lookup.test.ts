import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FASE 1B — tools de leitura financeira (lib/ai/agents/finance/finance-lookup-agent.ts).
 * Financeiro e 100% registro manual (sem gateway) — esta fase e SOMENTE
 * LEITURA, nada aqui registra pagamento nem marca como pago.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1", client_id: "client-1", client_name: "Maria Silva", client_email: null,
    description: "Consulta de retorno", amount_cents: 20000, due_date: "2026-01-01", paid_at: null,
    status: "vencido", payment_method: null, invoice_number: null, payment_link: null, receipt_url: null,
    installment_number: null, installment_total: null, category: null, notes: null,
    overdue_notified_at: null, created_at: "now", updated_at: "now",
    ...overrides,
  };
}

describe("executeGetPaymentDetails", () => {
  it("found:false para id inexistente", async () => {
    vi.doMock("@/lib/repositories/payments", () => ({ getPaymentById: vi.fn().mockResolvedValue(null) }));
    const { executeGetPaymentDetails } = await import("../lib/ai/agents/finance/finance-lookup-agent");
    const result = await executeGetPaymentDetails({ paymentId: "does-not-exist" });
    expect(result).toEqual({ found: false });
  });

  it("devolve o detalhe completo com valor formatado", async () => {
    vi.doMock("@/lib/repositories/payments", () => ({ getPaymentById: vi.fn().mockResolvedValue(payment()) }));
    const { executeGetPaymentDetails } = await import("../lib/ai/agents/finance/finance-lookup-agent");
    const result = await executeGetPaymentDetails({ paymentId: "pay-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.payment.amountFormatted).toMatch(/^R\$\s*200,00$/);
    expect(result.payment.clientName).toBe("Maria Silva");
  });
});

describe("executeGetOverduePayments", () => {
  it("inclui status 'vencido' e 'pendente' com vencimento no passado, exclui pendente futuro", async () => {
    vi.doMock("@/lib/utils/timezone", () => ({ getSaoPauloDateKey: () => "2026-08-16" }));
    vi.doMock("@/lib/repositories/payments", () => ({
      getPayments: vi.fn().mockResolvedValue([
        payment({ id: "p-vencido", status: "vencido" }),
        payment({ id: "p-pendente-passado", status: "pendente", due_date: "2026-01-01" }),
        payment({ id: "p-pendente-futuro", status: "pendente", due_date: "2099-01-01" }),
        payment({ id: "p-pago", status: "pago" }),
      ]),
    }));
    const { executeGetOverduePayments } = await import("../lib/ai/agents/finance/finance-lookup-agent");
    const result = await executeGetOverduePayments({});
    expect(result.payments.map((p) => p.id).sort()).toEqual(["p-pendente-passado", "p-vencido"]);
  });

  it("filtra por clientId quando informado", async () => {
    vi.doMock("@/lib/utils/timezone", () => ({ getSaoPauloDateKey: () => "2026-08-16" }));
    const getPayments = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/repositories/payments", () => ({ getPayments }));
    const { executeGetOverduePayments } = await import("../lib/ai/agents/finance/finance-lookup-agent");
    await executeGetOverduePayments({ clientId: "client-1" });
    expect(getPayments).toHaveBeenCalledWith(expect.objectContaining({ clientId: "client-1" }));
  });
});

describe("executeGetPendingPayments", () => {
  it("filtra so status pendente (com ou sem vencimento passado)", async () => {
    const getPayments = vi.fn().mockResolvedValue([payment({ id: "p1", status: "pendente" })]);
    vi.doMock("@/lib/repositories/payments", () => ({ getPayments }));
    const { executeGetPendingPayments } = await import("../lib/ai/agents/finance/finance-lookup-agent");
    const result = await executeGetPendingPayments({ clientId: "client-1" });
    expect(getPayments).toHaveBeenCalledWith({ clientId: "client-1", status: "pendente" });
    expect(result.payments).toHaveLength(1);
  });
});

describe("executeGetFinancialSummary", () => {
  it("devolve os totais reais formatados — nunca soma nada de cabeca", async () => {
    vi.doMock("@/lib/repositories/payments", () => ({
      getPaymentMetrics: vi.fn().mockResolvedValue({
        receivedMonthCents: 50000, openCents: 30000, overdueCents: 20000,
        receivedCount: 2, openCount: 1, overdueCount: 1,
      }),
    }));
    const { executeGetFinancialSummary } = await import("../lib/ai/agents/finance/finance-lookup-agent");
    const result = await executeGetFinancialSummary();
    expect(result.receivedThisMonth.formatted).toMatch(/^R\$\s*500,00$/);
    expect(result.overdue.formatted).toMatch(/^R\$\s*200,00$/);
    expect(result.overdue.count).toBe(1);
  });
});
