import { afterEach, describe, expect, it, vi } from "vitest";
import { buildToolSet, getToolDefinition } from "../lib/ai/tools/registry";
import {
  GET_TODAY_APPOINTMENTS_TOOL_NAME,
  GET_NEXT_APPOINTMENT_TOOL_NAME,
  GET_APPOINTMENT_DETAILS_TOOL_NAME,
  GET_UPCOMING_APPOINTMENTS_TOOL_NAME,
} from "../lib/ai/agents/appointments/appointment-lookup-agent";
import {
  GET_DASHBOARD_ACTION_ITEMS_TOOL_NAME,
  GET_URGENT_ITEMS_TOOL_NAME,
  GET_RECENT_ACTIVITY_TOOL_NAME,
} from "../lib/ai/agents/dashboard/dashboard-agent";
import {
  GET_PATIENT_REQUEST_DETAILS_TOOL_NAME,
  GET_PENDING_AI_PROPOSALS_TOOL_NAME,
} from "../lib/ai/agents/clients/patient-requests-agent";
import {
  GET_PAYMENT_DETAILS_TOOL_NAME,
  GET_OVERDUE_PAYMENTS_TOOL_NAME,
  GET_PENDING_PAYMENTS_TOOL_NAME,
  GET_FINANCIAL_SUMMARY_TOOL_NAME,
} from "../lib/ai/agents/finance/finance-lookup-agent";

/**
 * FASE 1B — confirma que as 12 tools novas ficam genuinamente alcancaveis
 * pelo LLM num turno real (mesmo mecanismo `buildToolSet` que o
 * orquestrador usa), e testa uma cadeia real entre dois domínios
 * (finance + appointments) sem depender de LLM real.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const FASE1B_TOOL_NAMES = [
  GET_TODAY_APPOINTMENTS_TOOL_NAME,
  GET_NEXT_APPOINTMENT_TOOL_NAME,
  GET_APPOINTMENT_DETAILS_TOOL_NAME,
  GET_UPCOMING_APPOINTMENTS_TOOL_NAME,
  GET_DASHBOARD_ACTION_ITEMS_TOOL_NAME,
  GET_URGENT_ITEMS_TOOL_NAME,
  GET_RECENT_ACTIVITY_TOOL_NAME,
  GET_PATIENT_REQUEST_DETAILS_TOOL_NAME,
  GET_PENDING_AI_PROPOSALS_TOOL_NAME,
  GET_PAYMENT_DETAILS_TOOL_NAME,
  GET_OVERDUE_PAYMENTS_TOOL_NAME,
  GET_PENDING_PAYMENTS_TOOL_NAME,
  GET_FINANCIAL_SUMMARY_TOOL_NAME,
];

describe("Fase 1B — tools sempre ativas, mesmo sem cliente pre-selecionado", () => {
  it("todas registradas com contextRequirement 'none' e risk 'read'", () => {
    for (const name of FASE1B_TOOL_NAMES) {
      const tool = getToolDefinition(name);
      expect(tool, `tool ${name} deveria estar registrada`).toBeDefined();
      expect(tool!.contextRequirement).toBe("none");
      expect(tool!.risk).toBe("read");
    }
  });

  it("buildToolSet devolve todas para ADMIN_ASSISTANT", () => {
    const tools = buildToolSet(FASE1B_TOOL_NAMES, "ADMIN_ASSISTANT");
    for (const name of FASE1B_TOOL_NAMES) {
      expect(Object.keys(tools)).toContain(name);
    }
  });

  it("nenhuma delas fica disponivel para PATIENT_ASSISTANT — financeiro/agenda administrativa nunca vaza ao portal do paciente", () => {
    const tools = buildToolSet(FASE1B_TOOL_NAMES, "PATIENT_ASSISTANT");
    expect(Object.keys(tools)).toHaveLength(0);
  });
});

describe("tool chaining real entre dominios — 'quem esta devendo e tem consulta essa semana?'", () => {
  it("intersecao de clientId entre getOverduePayments e getUpcomingAppointments", async () => {
    vi.doMock("@/lib/utils/timezone", async () => {
      const actual = await vi.importActual<typeof import("../lib/utils/timezone")>("../lib/utils/timezone");
      return { ...actual, getSaoPauloDateKey: () => "2026-08-16" };
    });
    vi.doMock("@/lib/repositories/payments", () => ({
      getPayments: vi.fn().mockResolvedValue([
        { id: "pay-1", client_id: "client-1", client_name: "Maria", client_email: null, description: "Consulta", amount_cents: 20000, due_date: "2026-01-01", paid_at: null, status: "vencido", payment_method: null, invoice_number: null, payment_link: null, receipt_url: null, installment_number: null, installment_total: null, category: null, notes: null, overdue_notified_at: null, created_at: "now", updated_at: "now" },
        { id: "pay-2", client_id: "client-2", client_name: "Joana", client_email: null, description: "Consulta", amount_cents: 15000, due_date: "2026-01-01", paid_at: null, status: "vencido", payment_method: null, invoice_number: null, payment_link: null, receipt_url: null, installment_number: null, installment_total: null, category: null, notes: null, overdue_notified_at: null, created_at: "now", updated_at: "now" },
      ]),
    }));
    const { executeGetOverduePayments } = await import("../lib/ai/agents/finance/finance-lookup-agent");
    const overdue = await executeGetOverduePayments({});
    const overdueClientIds = new Set(overdue.payments.map((p) => p.clientId));
    expect(overdueClientIds).toEqual(new Set(["client-1", "client-2"]));

    vi.doMock("@/lib/repositories/appointments", () => ({
      getAppointments: vi.fn().mockResolvedValue([
        { id: "apt-1", client_id: "client-1", client_name: "Maria", client_phone: null, client_email: null, title: "Retorno", appointment_type: "retorno", starts_at: "2026-08-18T13:00:00.000Z", ends_at: null, status: "agendado", location: null, notes: null, portal_visible: 1, client_confirmed_at: null, cancellation_reason: null, created_at: "now", updated_at: "now" },
      ]),
    }));
    const { executeGetUpcomingAppointments } = await import("../lib/ai/agents/appointments/appointment-lookup-agent");
    const upcoming = await executeGetUpcomingAppointments({ days: 7 });
    const upcomingClientIds = new Set(upcoming.appointments.map((a) => a.clientId));

    const both = [...overdueClientIds].filter((id) => upcomingClientIds.has(id));
    expect(both).toEqual(["client-1"]);
  });
});
