import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FASE 1B (operador interno) — tools de leitura de agenda
 * (lib/ai/agents/appointments/appointment-lookup-agent.ts), sempre ativas.
 * Nunca inventa consulta/horario — tudo vem de lib/repositories/appointments.ts.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function appt(overrides: Record<string, unknown> = {}) {
  return {
    id: "apt-1", client_id: "client-1", client_name: "Maria Silva", client_phone: null, client_email: null,
    title: "Retorno", appointment_type: "retorno", starts_at: "2026-08-17T13:00:00.000Z", ends_at: null,
    status: "agendado", location: null, notes: null, portal_visible: 1, client_confirmed_at: null,
    cancellation_reason: null, created_at: "now", updated_at: "now",
    ...overrides,
  };
}

describe("executeGetTodayAppointments", () => {
  it("le as consultas do dia informado, filtrando canceladas", async () => {
    const getAppointments = vi.fn().mockResolvedValue([appt(), appt({ id: "apt-2", status: "cancelado" })]);
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments }));
    const { executeGetTodayAppointments } = await import("../lib/ai/agents/appointments/appointment-lookup-agent");
    const result = await executeGetTodayAppointments({ date: "2026-08-17" });
    expect(result.date).toBe("2026-08-17");
    expect(result.appointments).toHaveLength(1);
    expect(result.appointments[0].id).toBe("apt-1");
  });

  it("sem data informada, usa hoje (nunca deixa o campo vazio sem resolver)", async () => {
    const getAppointments = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments }));
    const { executeGetTodayAppointments } = await import("../lib/ai/agents/appointments/appointment-lookup-agent");
    const result = await executeGetTodayAppointments({});
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("executeGetNextAppointment", () => {
  it("sem clientId, devolve a proxima consulta geral", async () => {
    const getAppointments = vi.fn().mockResolvedValue([appt({ id: "apt-future" })]);
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments }));
    const { executeGetNextAppointment } = await import("../lib/ai/agents/appointments/appointment-lookup-agent");
    const result = await executeGetNextAppointment({});
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.appointment.id).toBe("apt-future");
  });

  it("found:false quando nao ha nenhuma consulta futura — nunca inventa uma", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments: vi.fn().mockResolvedValue([]) }));
    const { executeGetNextAppointment } = await import("../lib/ai/agents/appointments/appointment-lookup-agent");
    const result = await executeGetNextAppointment({});
    expect(result).toEqual({ found: false });
  });

  it("com clientId de paciente inexistente, found:false — nunca vaza consulta de outro paciente", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments: vi.fn() }));
    const { executeGetNextAppointment } = await import("../lib/ai/agents/appointments/appointment-lookup-agent");
    const result = await executeGetNextAppointment({ clientId: "does-not-exist" });
    expect(result).toEqual({ found: false });
  });

  it("com clientId valido, filtra a consulta certa daquele paciente", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const getAppointments = vi.fn().mockResolvedValue([appt({ id: "apt-maria" })]);
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments }));
    const { executeGetNextAppointment } = await import("../lib/ai/agents/appointments/appointment-lookup-agent");
    const result = await executeGetNextAppointment({ clientId: "client-1" });
    expect(getAppointments).toHaveBeenCalledWith(expect.objectContaining({ clientId: "client-1" }));
    expect(result.found && result.appointment.id).toBe("apt-maria");
  });
});

describe("executeGetAppointmentDetails", () => {
  it("found:false para id inexistente", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(null) }));
    const { executeGetAppointmentDetails } = await import("../lib/ai/agents/appointments/appointment-lookup-agent");
    const result = await executeGetAppointmentDetails({ appointmentId: "does-not-exist" });
    expect(result).toEqual({ found: false });
  });

  it("devolve o detalhe completo real da consulta", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(appt({ notes: "Trazer exames" })) }));
    const { executeGetAppointmentDetails } = await import("../lib/ai/agents/appointments/appointment-lookup-agent");
    const result = await executeGetAppointmentDetails({ appointmentId: "apt-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.appointment.notes).toBe("Trazer exames");
    expect(result.appointment.clientName).toBe("Maria Silva");
  });
});

describe("executeGetUpcomingAppointments", () => {
  it("usa 7 dias por padrao e filtra canceladas", async () => {
    const getAppointments = vi.fn().mockResolvedValue([appt(), appt({ id: "apt-2", status: "cancelado" })]);
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments }));
    const { executeGetUpcomingAppointments } = await import("../lib/ai/agents/appointments/appointment-lookup-agent");
    const result = await executeGetUpcomingAppointments({});
    expect(result.days).toBe(7);
    expect(result.appointments).toHaveLength(1);
  });

  it("filtra por clientId quando informado — 'ela tem consulta essa semana?'", async () => {
    const getAppointments = vi.fn().mockResolvedValue([appt()]);
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments }));
    const { executeGetUpcomingAppointments } = await import("../lib/ai/agents/appointments/appointment-lookup-agent");
    await executeGetUpcomingAppointments({ clientId: "client-1", days: 7 });
    expect(getAppointments).toHaveBeenCalledWith(expect.objectContaining({ clientId: "client-1" }));
  });
});

describe("tool chaining — 'qual a proxima consulta e esse paciente tem pendencia?'", () => {
  it("getNextAppointment().appointment.clientId encadeia direto com getPatientSummary", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments: vi.fn().mockResolvedValue([appt({ client_id: "client-9" })]) }));
    const { executeGetNextAppointment } = await import("../lib/ai/agents/appointments/appointment-lookup-agent");
    const next = await executeGetNextAppointment({});
    expect(next.found).toBe(true);
    if (!next.found) return;
    expect(next.appointment.clientId).toBe("client-9");

    vi.resetModules();
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-9", name: "Maria", email: null, phone: null, status: "ativo" }) }));
    vi.doMock("@/lib/repositories/meal-plans", () => ({ getActiveMealPlan: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/repositories/client-protocols", () => ({ getClientProtocols: vi.fn().mockResolvedValue([]) }));
    vi.doMock("@/lib/repositories/client-tasks", () => ({ getClientTasks: vi.fn().mockResolvedValue([{ id: "t1", status: "pendente" }]) }));
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointments: vi.fn().mockResolvedValue([]) }));
    const { executeGetPatientSummary } = await import("../lib/ai/agents/clients/patient-lookup-agent");
    const summary = await executeGetPatientSummary({ clientId: next.appointment.clientId as string });
    expect(summary.found && summary.pendingTasksCount).toBe(1);
  });
});
