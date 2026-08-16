import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const appointment = {
  id: "appt-1",
  client_id: "client-1",
  client_name: "Ana",
  client_phone: null,
  client_email: null,
  title: "Consulta",
  appointment_type: "consulta",
  starts_at: "2026-08-16T13:00:00.000Z",
  ends_at: null,
  status: "agendado",
  location: null,
  notes: null,
  portal_visible: 1,
  client_confirmed_at: null,
  cancellation_reason: null,
  created_at: "2026-08-16T10:00:00.000Z",
  updated_at: "2026-08-16T10:00:00.000Z",
};

const client = {
  id: "client-1",
  name: "Ana",
  email: null,
  phone: null,
  birth_date: null,
  source_submission_id: null,
  status: "ativo",
  notes: null,
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-01T10:00:00.000Z",
};

const systemData = {
  lastVisit: { date: null, weightKg: null, bmi: null, waistCm: null, bodyFatPercentage: null, progressNotes: null, conductNotes: null },
  evolution: { currentWeightKg: null, previousWeightKg: null, weightDeltaKg: null, weightDeltaPercent: null, waistCm: null, bodyFatPercentage: null, adherenceScore: null, symptoms: null },
  pending: { tasks: [], patientRequests: [], upcomingAppointment: null },
  clinicalMarkers: [],
  recentSubstitutions: [],
  activePlan: { title: null, version: null, status: null, mealCount: 0, macros: null },
  activeProtocol: null,
};

function inputVersion(overrides: { appointment?: typeof appointment; client?: typeof client; systemData?: typeof systemData } = {}) {
  return createHash("sha256").update(JSON.stringify({
    appointment: {
      id: (overrides.appointment ?? appointment).id,
      clientId: (overrides.appointment ?? appointment).client_id,
      startsAt: (overrides.appointment ?? appointment).starts_at,
      endsAt: (overrides.appointment ?? appointment).ends_at,
      status: (overrides.appointment ?? appointment).status,
      updatedAt: (overrides.appointment ?? appointment).updated_at,
    },
    client: { id: (overrides.client ?? client).id, updatedAt: (overrides.client ?? client).updated_at },
    systemData: overrides.systemData ?? systemData,
  })).digest("hex");
}

function mockBase(overrides: {
  appointment?: unknown;
  appointments?: unknown[];
  client?: unknown;
  existing?: unknown;
  aiThrows?: Error;
} = {}) {
  vi.doMock("@/lib/repositories/appointments", () => ({
    getAppointmentById: vi.fn().mockResolvedValue(overrides.appointment ?? appointment),
    getAppointments: vi.fn().mockResolvedValue(overrides.appointments ?? [appointment]),
  }));
  vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(overrides.client ?? client) }));
  vi.doMock("@/lib/ai/agents/clinical/consultation-briefing", () => ({
    buildConsultationSystemData: vi.fn().mockResolvedValue(systemData),
    generateConsultationAiBriefWithMetadata: overrides.aiThrows
      ? vi.fn().mockRejectedValue(overrides.aiThrows)
      : vi.fn().mockResolvedValue({
          brief: { clinicalSummary: "Resumo", changesSinceLastVisit: ["Mudou X"], attentionPoints: [], pendingItems: [], suggestedTopics: ["Perguntar Y"], missingData: [] },
          provider: "openai",
          model: "gpt-4o",
        }),
  }));
  const repo = {
    getAppointmentAiBriefByAppointmentId: vi.fn().mockResolvedValue(overrides.existing ?? null),
    insertGeneratingAppointmentAiBrief: vi.fn().mockResolvedValue({ id: "brief-1", appointment_id: "appt-1", client_id: "client-1", status: "generating" }),
    claimAppointmentAiBriefForGeneration: vi.fn().mockResolvedValue({ id: "brief-1", appointment_id: "appt-1", client_id: "client-1", status: "generating" }),
    markAppointmentAiBriefReady: vi.fn().mockResolvedValue(undefined),
    markAppointmentAiBriefFailed: vi.fn().mockResolvedValue(undefined),
    markAppointmentAiBriefStale: vi.fn().mockResolvedValue(undefined),
  };
  vi.doMock("@/lib/repositories/appointment-ai-briefs", () => repo);
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
  return repo;
}

describe("prepareAppointmentAiBrief", () => {
  it("ELIGIBLE: consulta próxima sem briefing gera e persiste", async () => {
    const repo = mockBase();
    const { prepareAppointmentAiBrief } = await import("@/lib/clinical/appointment-briefing");
    const result = await prepareAppointmentAiBrief("appt-1", { now: new Date("2026-08-16T12:00:00.000Z") });
    expect(result.outcome).toBe("generated");
    expect(repo.insertGeneratingAppointmentAiBrief).toHaveBeenCalled();
    expect(repo.markAppointmentAiBriefReady).toHaveBeenCalledWith(expect.objectContaining({ provider: "openai", model: "gpt-4o" }));
  });

  it("CANCELLED: não gera", async () => {
    const repo = mockBase({ appointment: { ...appointment, status: "cancelado" } });
    const { prepareAppointmentAiBrief } = await import("@/lib/clinical/appointment-briefing");
    const result = await prepareAppointmentAiBrief("appt-1", { now: new Date("2026-08-16T12:00:00.000Z") });
    expect(result).toMatchObject({ outcome: "skipped", reason: "appointment_inactive" });
    expect(repo.insertGeneratingAppointmentAiBrief).not.toHaveBeenCalled();
  });

  it("EXISTING VALID: reutiliza sem chamar IA", async () => {
    const existing = { id: "brief-1", status: "ready", input_version: inputVersion(), generated_at: "x", error_code: null, brief: {} };
    const repo = mockBase({ existing });
    const { generateConsultationAiBriefWithMetadata } = await import("@/lib/ai/agents/clinical/consultation-briefing");
    const { prepareAppointmentAiBrief } = await import("@/lib/clinical/appointment-briefing");
    const result = await prepareAppointmentAiBrief("appt-1", { now: new Date("2026-08-16T12:00:00.000Z") });
    expect(result.outcome).toBe("reused");
    expect(generateConsultationAiBriefWithMetadata).not.toHaveBeenCalled();
    expect(repo.markAppointmentAiBriefReady).not.toHaveBeenCalled();
  });

  it("FAILED PROVIDER: marca failed sem lançar para o appointment", async () => {
    const repo = mockBase({ aiThrows: new Error("provider down") });
    const { prepareAppointmentAiBrief } = await import("@/lib/clinical/appointment-briefing");
    const result = await prepareAppointmentAiBrief("appt-1", { now: new Date("2026-08-16T12:00:00.000Z") });
    expect(result.outcome).toBe("failed");
    expect(repo.markAppointmentAiBriefFailed).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "Error" }));
  });

  it("IDEMPOTENCY: se já está generating, não faz segunda geração", async () => {
    mockBase({ existing: { id: "brief-1", status: "generating", input_version: "old", brief: null } });
    const { generateConsultationAiBriefWithMetadata } = await import("@/lib/ai/agents/clinical/consultation-briefing");
    const { prepareAppointmentAiBrief } = await import("@/lib/clinical/appointment-briefing");
    const result = await prepareAppointmentAiBrief("appt-1", { now: new Date("2026-08-16T12:00:00.000Z") });
    expect(result.outcome).toBe("generating");
    expect(generateConsultationAiBriefWithMetadata).not.toHaveBeenCalled();
  });
});

describe("getAppointmentBriefState", () => {
  it("STALE: mudança crítica no snapshot marca stale", async () => {
    const existing = { id: "brief-1", status: "ready", input_version: "old-version", generated_at: "x", error_code: null, brief: {}, provider: null, model: null };
    const repo = mockBase({ existing });
    const { getAppointmentBriefState } = await import("@/lib/clinical/appointment-briefing");
    const state = await getAppointmentBriefState("appt-1");
    expect(state.stale).toBe(true);
    expect(repo.markAppointmentAiBriefStale).toHaveBeenCalledWith("brief-1");
  });
});

describe("prepareUpcomingConsultationBriefs", () => {
  it("TOO FAR: consulta fora da janela não entra no processamento", async () => {
    const repo = mockBase({ appointments: [] });
    const { prepareUpcomingConsultationBriefs } = await import("@/lib/clinical/appointment-briefing");
    const result = await prepareUpcomingConsultationBriefs({ now: new Date("2026-08-16T12:00:00.000Z") });
    expect(result.processed).toBe(0);
    expect(repo.insertGeneratingAppointmentAiBrief).not.toHaveBeenCalled();
  });
});
