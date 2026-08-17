import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

/**
 * FASE 6 (writes clínicos controlados) — marcadores clínicos estruturados
 * (clinical_marker_upsert / resolve_clinical_marker). Cobre: schema fechado
 * (ambiguidade MILK/LACTOSE, WHEAT/GLUTEN estruturalmente impossível),
 * builder (clientId nunca vem do modelo), handlers (add/resolve/duplicidade/
 * stale/unauthorized/replay), e auditoria (via patient_clinical_markers,
 * nunca uma tabela paralela).
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const ctx = { adminId: "admin-1" };

describe("proposeClinicalMarkerUpsertInputSchema / proposeResolveClinicalMarkerInputSchema — vocabulário fechado", () => {
  it("MILK e LACTOSE são códigos distintos e ambos válidos — nunca inferidos um a partir do outro", async () => {
    const { proposeClinicalMarkerUpsertInputSchema } = await import("../lib/ai/agents/clinical/clinical-markers-agent");
    expect(proposeClinicalMarkerUpsertInputSchema.safeParse({ markerType: "ALLERGY", code: "MILK" }).success).toBe(true);
    expect(proposeClinicalMarkerUpsertInputSchema.safeParse({ markerType: "INTOLERANCE", code: "LACTOSE" }).success).toBe(true);
  });

  it("WHEAT e GLUTEN são códigos distintos e ambos válidos", async () => {
    const { proposeClinicalMarkerUpsertInputSchema } = await import("../lib/ai/agents/clinical/clinical-markers-agent");
    expect(proposeClinicalMarkerUpsertInputSchema.safeParse({ markerType: "ALLERGY", code: "WHEAT" }).success).toBe(true);
    expect(proposeClinicalMarkerUpsertInputSchema.safeParse({ markerType: "DIETARY_RESTRICTION", code: "GLUTEN" }).success).toBe(true);
  });

  it("rejeita qualquer código fora do vocabulário fechado (nunca texto livre/inventado)", async () => {
    const { proposeClinicalMarkerUpsertInputSchema } = await import("../lib/ai/agents/clinical/clinical-markers-agent");
    const result = proposeClinicalMarkerUpsertInputSchema.safeParse({ markerType: "ALLERGY", code: "LEITE" });
    expect(result.success).toBe(false);
  });

  it("rejeita clientId como campo de input — nunca vem do modelo (.strict() sem essa chave)", async () => {
    const { proposeClinicalMarkerUpsertInputSchema } = await import("../lib/ai/agents/clinical/clinical-markers-agent");
    const result = proposeClinicalMarkerUpsertInputSchema.safeParse({ markerType: "ALLERGY", code: "PEANUT", clientId: "client-1" });
    expect(result.success).toBe(false);
  });
});

describe("buildProposedAction — clinical_marker_upsert / resolve_clinical_marker", () => {
  it("clientId sempre vem do contexto ambiente (ctx), nunca do input do modelo", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const proposal = buildProposedAction(
      "proposeClinicalMarkerUpsert",
      { markerType: "ALLERGY", code: "PEANUT", severity: "severe" },
      { clientId: "client-real" }
    );
    expect(proposal).toMatchObject({ kind: "clinical_marker_upsert", clientId: "client-real", code: "PEANUT", risk: "clinical", requiresConfirmation: true });
  });

  it("sem cliente no contexto (nenhuma tela de paciente aberta), não monta proposta nenhuma", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const proposal = buildProposedAction("proposeClinicalMarkerUpsert", { markerType: "ALLERGY", code: "PEANUT" }, {});
    expect(proposal).toBeNull();
  });

  it("severity/status usam default (unknown/ACTIVE) quando a nutricionista não especificou", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const proposal = buildProposedAction("proposeClinicalMarkerUpsert", { markerType: "ALLERGY", code: "PEANUT" }, { clientId: "client-1" });
    expect(proposal).toMatchObject({ severity: "unknown", status: "ACTIVE" });
  });

  it("resolve_clinical_marker também sempre usa o clientId do contexto", async () => {
    const { buildProposedAction } = await import("../lib/ai/tools/proposal-builders");
    const proposal = buildProposedAction("proposeResolveClinicalMarker", { markerType: "ALLERGY", code: "PEANUT" }, { clientId: "client-1" });
    expect(proposal).toMatchObject({ kind: "resolve_clinical_marker", clientId: "client-1" });
  });
});

function markerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "marker-1", client_id: "client-1", type: "ALLERGY", normalized_code: "PEANUT",
    label: "Amendoim", severity: "severe", status: "ACTIVE", source: "manual",
    evidence_text: null, created_by_admin_id: null, updated_by_admin_id: null,
    resolved_by_admin_id: null, resolved_at: null, created_at: "now", updated_at: "now",
    ...overrides,
  };
}

describe("executeProposedAction — clinical_marker_upsert (add)", () => {
  const baseAction: ProposedAction = {
    kind: "clinical_marker_upsert", clientId: "client-1", markerType: "ALLERGY", code: "PEANUT",
    severity: "severe", status: "ACTIVE", evidenceText: "relatou inchaço após ingerir amendoim",
    risk: "clinical", requiresConfirmation: true,
  };

  it("cria o marcador quando não há duplicidade ativa, com source ai_suggestion_confirmed e o admin confirmando como autor", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const createPatientClinicalMarker = vi.fn().mockResolvedValue(markerRow());
    vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({
      listPatientClinicalMarkers: vi.fn().mockResolvedValue([]),
      createPatientClinicalMarker,
      updatePatientClinicalMarker: vi.fn(),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const result = await executeProposedAction(baseAction, ctx);
    expect(result.data).toEqual({ markerId: "marker-1", type: "ALLERGY", code: "PEANUT", status: "ACTIVE" });
    expect(createPatientClinicalMarker).toHaveBeenCalledWith(expect.objectContaining({
      clientId: "client-1", type: "ALLERGY", normalizedCode: "PEANUT", severity: "severe",
      status: "ACTIVE", source: "ai_suggestion_confirmed", adminId: "admin-1",
    }));
  });

  it("duplicidade: já existe um marcador ativo do mesmo tipo+código → 409, nunca cria um segundo (anti-replay)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const createPatientClinicalMarker = vi.fn();
    vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({
      listPatientClinicalMarkers: vi.fn().mockResolvedValue([markerRow()]),
      createPatientClinicalMarker,
      updatePatientClinicalMarker: vi.fn(),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
    expect(createPatientClinicalMarker).not.toHaveBeenCalled();
  });

  it("paciente não encontrado (unauthorized/inexistente) → 404", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({
      listPatientClinicalMarkers: vi.fn(), createPatientClinicalMarker: vi.fn(), updatePatientClinicalMarker: vi.fn(),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 404 });
  });

  it("duplicidade só compara com marcadores ATIVOS do MESMO cliente — outro paciente com o mesmo alérgeno não bloqueia", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const listPatientClinicalMarkers = vi.fn().mockResolvedValue([]);
    const createPatientClinicalMarker = vi.fn().mockResolvedValue(markerRow());
    vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({
      listPatientClinicalMarkers, createPatientClinicalMarker, updatePatientClinicalMarker: vi.fn(),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await executeProposedAction(baseAction, ctx);
    expect(listPatientClinicalMarkers).toHaveBeenCalledWith("client-1", { includeResolved: false });
  });
});

describe("executeProposedAction — resolve_clinical_marker", () => {
  const baseAction: ProposedAction = {
    kind: "resolve_clinical_marker", clientId: "client-1", markerType: "ALLERGY", code: "PEANUT",
    risk: "clinical", requiresConfirmation: true,
  };

  it("resolve o marcador ativo encontrado por tipo+código (nunca por id vindo do modelo)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const updatePatientClinicalMarker = vi.fn().mockResolvedValue(markerRow({ status: "RESOLVED" }));
    vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({
      listPatientClinicalMarkers: vi.fn().mockResolvedValue([markerRow()]),
      createPatientClinicalMarker: vi.fn(),
      updatePatientClinicalMarker,
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const result = await executeProposedAction(baseAction, ctx);
    expect(result.data).toEqual({ markerId: "marker-1", type: "ALLERGY", code: "PEANUT", status: "RESOLVED" });
    expect(updatePatientClinicalMarker).toHaveBeenCalledWith("client-1", "marker-1", { status: "RESOLVED", adminId: "admin-1" });
  });

  it("replay/stale: nenhum marcador ativo encontrado (já resolvido antes) → 409, nunca resolve duas vezes", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const updatePatientClinicalMarker = vi.fn();
    vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({
      listPatientClinicalMarkers: vi.fn().mockResolvedValue([]),
      createPatientClinicalMarker: vi.fn(),
      updatePatientClinicalMarker,
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
    expect(updatePatientClinicalMarker).not.toHaveBeenCalled();
  });

  it("ambiguidade real (mais de um marcador ativo do mesmo tipo+código) → 409, nunca escolhe sozinho", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({
      listPatientClinicalMarkers: vi.fn().mockResolvedValue([markerRow({ id: "marker-1" }), markerRow({ id: "marker-2" })]),
      createPatientClinicalMarker: vi.fn(),
      updatePatientClinicalMarker: vi.fn(),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
  });

  it("paciente não encontrado → 404", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/repositories/patient-clinical-markers", () => ({
      listPatientClinicalMarkers: vi.fn(), createPatientClinicalMarker: vi.fn(), updatePatientClinicalMarker: vi.fn(),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 404 });
  });
});

describe("FASE 6 — autorização das tools de marcador clínico", () => {
  it("proposeClinicalMarkerUpsert/proposeResolveClinicalMarker: risk clinical, perfil ADMIN apenas, nunca reachable pelo paciente", async () => {
    const { listRegisteredTools } = await import("../lib/ai/tools/registry");
    const { PROPOSE_CLINICAL_MARKER_UPSERT_TOOL_NAME, PROPOSE_RESOLVE_CLINICAL_MARKER_TOOL_NAME } = await import("../lib/ai/agents/clinical/clinical-markers-agent");
    const tools = listRegisteredTools().filter((t) => [PROPOSE_CLINICAL_MARKER_UPSERT_TOOL_NAME, PROPOSE_RESOLVE_CLINICAL_MARKER_TOOL_NAME].includes(t.name));
    expect(tools).toHaveLength(2);
    for (const tool of tools) {
      expect(tool.risk).toBe("clinical");
      expect(tool.dataSensitivity).toBe("clinical");
      expect(tool.profiles).toEqual(["ADMIN_ASSISTANT"]);
      expect(tool.profiles).not.toContain("PATIENT_ASSISTANT");
    }
  });
});
