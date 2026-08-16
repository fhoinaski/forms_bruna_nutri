import { describe, expect, it } from "vitest";
import { buildDashboardActionItems, type DashboardActionRows } from "@/lib/dashboard/action-items";

const now = new Date("2026-08-16T12:00:00.000Z");

function emptyRows(overrides: Partial<DashboardActionRows> = {}): DashboardActionRows {
  return {
    appointments: [],
    patientRequests: [],
    aiProposals: [],
    payments: [],
    workflows: [],
    substitutions: [],
    ...overrides,
  };
}

describe("buildDashboardActionItems", () => {
  it("mostra consulta em andamento e consulta próxima, mas ignora consulta fora da janela", () => {
    const items = buildDashboardActionItems(emptyRows({
      appointments: [
        {
          id: "appt-now",
          client_id: "client-1",
          client_name: "Ana",
          title: "Retorno",
          appointment_type: "online",
          starts_at: "2026-08-16T11:45:00.000Z",
          ends_at: "2026-08-16T12:45:00.000Z",
          status: "confirmada",
        },
        {
          id: "appt-soon",
          client_id: "client-2",
          client_name: "Bia",
          title: "Primeira consulta",
          appointment_type: "presencial",
          starts_at: "2026-08-16T12:18:00.000Z",
          ends_at: null,
          status: "agendada",
        },
        {
          id: "appt-later",
          client_id: "client-3",
          client_name: "Carla",
          title: "Retorno",
          appointment_type: "online",
          starts_at: "2026-08-16T13:10:00.000Z",
          ends_at: null,
          status: "agendada",
        },
      ],
    }), now);

    expect(items.map((item) => item.id)).toEqual(["appointment-now:appt-now", "appointment-soon:appt-soon"]);
    expect(items[0]).toMatchObject({ type: "APPOINTMENT_NOW", priority: "URGENT", section: "NOW" });
    expect(items[1]).toMatchObject({ type: "APPOINTMENT_SOON", priority: "HIGH", section: "NOW" });
  });

  it("inclui solicitação pendente e ignora solicitação já resolvida", () => {
    const items = buildDashboardActionItems(emptyRows({
      patientRequests: [
        {
          id: "req-pending",
          client_id: "client-1",
          client_name: "Ana",
          request_type: "symptom_or_complaint",
          ai_summary: "Paciente relatou sintoma novo.",
          status: "pending_review",
          created_at: "2026-08-16T11:00:00.000Z",
        },
        {
          id: "req-resolved",
          client_id: "client-1",
          client_name: "Ana",
          request_type: "general_question",
          ai_summary: "Resolvida anteriormente.",
          status: "resolved",
          created_at: "2026-08-16T10:00:00.000Z",
        },
      ],
    }), now);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "patient-request:req-pending",
      priority: "URGENT",
      href: "/dashboard/solicitacoes?request=req-pending",
    });
  });

  it("classifica propostas de IA por estado e não inclui estados finalizados", () => {
    const items = buildDashboardActionItems(emptyRows({
      aiProposals: [
        {
          id: "proposal-pending",
          kind: "new_task",
          status: "pending",
          risk: "sensitive",
          client_id: "client-1",
          client_name: "Ana",
          submission_id: null,
          created_at: "2026-08-16T11:10:00.000Z",
          executing_at: null,
        },
        {
          id: "proposal-review",
          kind: "new_protocol",
          status: "requires_review",
          risk: "clinical",
          client_id: null,
          client_name: null,
          submission_id: "sub-1",
          created_at: "2026-08-16T11:05:00.000Z",
          executing_at: null,
        },
        {
          id: "proposal-completed",
          kind: "new_task",
          status: "completed",
          risk: "sensitive",
          client_id: "client-1",
          client_name: "Ana",
          submission_id: null,
          created_at: "2026-08-16T11:00:00.000Z",
          executing_at: null,
        },
      ],
    }), now);

    expect(items.map((item) => item.id)).toEqual(["ai-proposal:proposal-review", "ai-proposal:proposal-pending"]);
    expect(items[0]).toMatchObject({ type: "AI_PROPOSAL_REVIEW", priority: "HIGH" });
    expect(items[1]).toMatchObject({ type: "AI_PROPOSAL_PENDING", priority: "NORMAL" });
  });

  it("inclui pagamento vencido e ignora cobrança paga", () => {
    const items = buildDashboardActionItems(emptyRows({
      payments: [
        {
          id: "pay-overdue",
          client_id: "client-1",
          client_name: "Ana",
          description: "Consulta agosto",
          amount_cents: 45000,
          due_date: "2026-08-15",
          status: "vencido",
          created_at: "2026-08-01T10:00:00.000Z",
        },
        {
          id: "pay-paid",
          client_id: "client-2",
          client_name: "Bia",
          description: "Consulta paga",
          amount_cents: 30000,
          due_date: "2026-08-15",
          status: "pago",
          created_at: "2026-08-01T10:00:00.000Z",
        },
      ],
    }), now);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "payment-overdue:pay-overdue", section: "BUSINESS", priority: "HIGH" });
    expect(items[0].description).toContain("Consulta agosto");
  });

  it("separa substituição que exige revisão de substituição auto_safe informativa", () => {
    const items = buildDashboardActionItems(emptyRows({
      substitutions: [
        {
          id: "sub-review",
          client_id: "client-1",
          client_name: "Ana",
          target_food_name: "leite",
          policy_decision: "requires_review",
          autonomy_level: "blocked",
          created_at: "2026-08-16T11:55:00.000Z",
        },
        {
          id: "sub-safe",
          client_id: "client-2",
          client_name: "Bia",
          target_food_name: "banana",
          policy_decision: "auto_safe",
          autonomy_level: "level_2",
          created_at: "2026-08-16T11:56:00.000Z",
        },
      ],
    }), now);

    expect(items.map((item) => item.id)).toEqual(["substitution:sub-review", "substitution:sub-safe"]);
    expect(items[0]).toMatchObject({ type: "SUBSTITUTION_REQUIRES_REVIEW", priority: "HIGH", section: "ATTENTION" });
    expect(items[1]).toMatchObject({ type: "SAFE_SUBSTITUTION_OCCURRED", priority: "INFO", section: "RECENT" });
  });

  it("ordena por prioridade antes da data", () => {
    const items = buildDashboardActionItems(emptyRows({
      patientRequests: [
        {
          id: "req-high",
          client_id: "client-1",
          client_name: "Ana",
          request_type: "general_question",
          ai_summary: null,
          status: "pending_review",
          created_at: "2026-08-16T11:50:00.000Z",
        },
      ],
      aiProposals: [
        {
          id: "proposal-normal",
          kind: "new_task",
          status: "pending",
          risk: "sensitive",
          client_id: "client-1",
          client_name: "Ana",
          submission_id: null,
          created_at: "2026-08-16T09:00:00.000Z",
          executing_at: null,
        },
      ],
    }), now);

    expect(items.map((item) => item.priority)).toEqual(["HIGH", "NORMAL"]);
  });
});
