import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FASE 3 (safe writes operacionais) — tool layer de reagendar/cancelar
 * consulta (lib/ai/agents/appointments/appointment-write-agent.ts): busca
 * e valida o estado ATUAL antes de montar o snapshot da proposta. A escrita
 * real (e a revalidação obrigatória) fica em proposal-handlers.ts, testado
 * em tests/ai-proposal-handlers.test.ts.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "apt-1", client_id: "client-1", client_name: "Maria", client_phone: null, client_email: null,
    title: "Retorno", appointment_type: "retorno", starts_at: "2026-08-13T15:00:00.000Z", ends_at: null,
    status: "agendado", location: null, notes: null, portal_visible: 1, client_confirmed_at: null,
    cancellation_reason: null, created_at: "now", updated_at: "now",
    ...overrides,
  };
}

describe("executeProposeRescheduleAppointment", () => {
  it("monta o snapshot da proposta a partir do estado real da consulta", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(appointmentRow()) }));
    const { executeProposeRescheduleAppointment } = await import("../lib/ai/agents/appointments/appointment-write-agent");
    const result = await executeProposeRescheduleAppointment({ appointmentId: "apt-1", newStartsAtDisplay: "14/08/2026 16:00" });
    expect(result).toEqual({
      appointmentId: "apt-1", clientId: "client-1", clientName: "Maria", title: "Retorno",
      previousStartsAtIso: "2026-08-13T15:00:00.000Z", newStartsAtDisplay: "14/08/2026 16:00",
    });
  });

  it("consulta inexistente devolve error, nunca monta proposta", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(null) }));
    const { executeProposeRescheduleAppointment } = await import("../lib/ai/agents/appointments/appointment-write-agent");
    const result = await executeProposeRescheduleAppointment({ appointmentId: "does-not-exist", newStartsAtDisplay: "14/08/2026 16:00" });
    expect(result).toEqual({ error: expect.stringContaining("não encontrada") });
  });

  it("consulta já cancelada devolve error, nunca propõe reagendar", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(appointmentRow({ status: "cancelado" })) }));
    const { executeProposeRescheduleAppointment } = await import("../lib/ai/agents/appointments/appointment-write-agent");
    const result = await executeProposeRescheduleAppointment({ appointmentId: "apt-1", newStartsAtDisplay: "14/08/2026 16:00" });
    expect(result).toEqual({ error: expect.stringContaining("cancelada") });
  });

  it("consulta sem paciente vinculado devolve error (buildProposedAction também rejeita)", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(appointmentRow({ client_id: null })) }));
    const { executeProposeRescheduleAppointment } = await import("../lib/ai/agents/appointments/appointment-write-agent");
    const result = await executeProposeRescheduleAppointment({ appointmentId: "apt-1", newStartsAtDisplay: "14/08/2026 16:00" });
    expect(result).toEqual({ error: expect.stringContaining("não está vinculada") });
  });

  it("buildProposedAction produz uma proposta 'sensitive' com confirmação obrigatória", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const action = buildProposedAction("proposeRescheduleAppointment", {}, {}, {
      appointmentId: "apt-1", clientId: "client-1", clientName: "Maria", title: "Retorno",
      previousStartsAtIso: "2026-08-13T15:00:00.000Z", newStartsAtDisplay: "14/08/2026 16:00",
    });
    expect(action).toMatchObject({ kind: "reschedule_appointment", risk: "sensitive", requiresConfirmation: true, appointmentId: "apt-1" });
  });

  it("buildProposedAction devolve null quando a tool devolveu error", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const action = buildProposedAction("proposeRescheduleAppointment", {}, {}, { error: "x" });
    expect(action).toBeNull();
  });
});

describe("executeProposeCancelAppointment", () => {
  it("monta o snapshot da proposta com o status/motivo atuais", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(appointmentRow()) }));
    const { executeProposeCancelAppointment } = await import("../lib/ai/agents/appointments/appointment-write-agent");
    const result = await executeProposeCancelAppointment({ appointmentId: "apt-1", cancellationReason: "Vai remarcar." });
    expect(result).toEqual({
      appointmentId: "apt-1", clientId: "client-1", clientName: "Maria", title: "Retorno",
      startsAtIso: "2026-08-13T15:00:00.000Z", previousStatus: "agendado", cancellationReason: "Vai remarcar.",
    });
  });

  it("consulta já cancelada devolve error", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(appointmentRow({ status: "cancelado" })) }));
    const { executeProposeCancelAppointment } = await import("../lib/ai/agents/appointments/appointment-write-agent");
    const result = await executeProposeCancelAppointment({ appointmentId: "apt-1" });
    expect(result).toEqual({ error: expect.stringContaining("já está cancelada") });
  });

  it("buildProposedAction produz uma proposta 'sensitive'", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const action = buildProposedAction("proposeCancelAppointment", {}, {}, {
      appointmentId: "apt-1", clientId: "client-1", clientName: "Maria", title: "Retorno",
      startsAtIso: "2026-08-13T15:00:00.000Z", previousStatus: "agendado", cancellationReason: null,
    });
    expect(action).toMatchObject({ kind: "cancel_appointment", risk: "sensitive", requiresConfirmation: true });
  });
});
