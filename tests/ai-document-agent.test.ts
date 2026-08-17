import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * FASE 5 (document/configuration/admin) — domínio "document". Auditoria
 * confirmou que não existe entidade "documento" persistida — as tools aqui
 * cobrem só o que existe de verdade: biblioteca de templates + links reais
 * de impressão. Nunca inventa PDF/documento.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function templateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "template-1", type: "DIETA", target_group: "emagrecimento", title: "Dieta hipocalórica padrão",
    content: "conteúdo", notes: null, is_active: 1, created_at: "now", updated_at: "now",
    ...overrides,
  };
}

describe("executeGetDocumentTemplates — list", () => {
  it("lista os templates reais da biblioteca, filtrando inativos por padrão", async () => {
    const getAllTemplates = vi.fn().mockResolvedValue([templateRow(), templateRow({ id: "template-2", title: "Suplementação padrão", type: "SUPLEMENTACAO" })]);
    vi.doMock("@/lib/repositories/protocol-templates", () => ({ getAllTemplates }));
    const { executeGetDocumentTemplates } = await import("../lib/ai/agents/documents/document-agent");
    const result = await executeGetDocumentTemplates({});
    expect(result.totalFound).toBe(2);
    expect(result.templates[0]).toEqual({ id: "template-1", type: "DIETA", targetGroup: "emagrecimento", title: "Dieta hipocalórica padrão", isActive: true });
    expect(getAllTemplates).toHaveBeenCalledWith({ type: undefined });
  });

  it("nenhum template do tipo pedido devolve lista vazia, nunca inventa um", async () => {
    vi.doMock("@/lib/repositories/protocol-templates", () => ({ getAllTemplates: vi.fn().mockResolvedValue([]) }));
    const { executeGetDocumentTemplates } = await import("../lib/ai/agents/documents/document-agent");
    const result = await executeGetDocumentTemplates({ type: "SUBSTITUICAO" });
    expect(result).toEqual({ templates: [], totalFound: 0 });
  });
});

describe("executeGetPatientDocumentLinks — detail/unauthorized/sensitive", () => {
  it("paciente inexistente devolve found:false, nunca vaza link de outro registro", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(null) }));
    const { executeGetPatientDocumentLinks } = await import("../lib/ai/agents/documents/document-agent");
    const result = await executeGetPatientDocumentLinks({ clientId: "does-not-exist" });
    expect(result).toEqual({ found: false });
  });

  it("paciente com submission de origem devolve os dois links reais", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({
      getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria", source_submission_id: "submission-1" }),
    }));
    const { executeGetPatientDocumentLinks } = await import("../lib/ai/agents/documents/document-agent");
    const result = await executeGetPatientDocumentLinks({ clientId: "client-1" });
    expect(result).toEqual({
      found: true,
      links: [
        { type: "client_record_print", label: "Ficha do paciente (impressão)", path: "/dashboard/clients/client-1/print" },
        { type: "submission_print", label: "Formulário de pré-consulta (impressão)", path: "/dashboard/submissions/submission-1/print" },
      ],
    });
  });

  it("paciente sem submission de origem devolve só o link da ficha (nunca inventa um segundo link)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({
      getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria", source_submission_id: null }),
    }));
    const { executeGetPatientDocumentLinks } = await import("../lib/ai/agents/documents/document-agent");
    const result = await executeGetPatientDocumentLinks({ clientId: "client-1" });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.links).toHaveLength(1);
    expect(result.links[0].type).toBe("client_record_print");
  });

  it("sensibilidade: a tool nunca devolve conteúdo do prontuário, só metadados de link (path/label)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({
      getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria", source_submission_id: null, notes: "conteúdo clínico sigiloso" }),
    }));
    const { executeGetPatientDocumentLinks } = await import("../lib/ai/agents/documents/document-agent");
    const result = await executeGetPatientDocumentLinks({ clientId: "client-1" });
    expect(JSON.stringify(result)).not.toContain("conteúdo clínico sigiloso");
  });
});
