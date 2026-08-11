import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";
import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

/**
 * Testes de corrida entre PROPOSTAS DIFERENTES (proposalIds distintos)
 * disputando o mesmo recurso real do mundo (mesmo horário de agenda, mesmo
 * e-mail de cliente novo) — secoes 13 e 14 da auditoria adversarial.
 *
 * Isolados em arquivo proprio: misturar estes mocks de repositorios de
 * negocio (availability/appointments/clients) no mesmo arquivo que os
 * testes de claim/idempotencia (ai-proposal-adversarial.test.ts) causava
 * poluicao de mock entre testes ao rodar o arquivo inteiro (o teste passava
 * isolado mas falhava dentro da suite completa) — sintoma tipico de
 * `vi.doMock` + import dinamico nao se resetando 100% entre casos quando
 * ha muitos specifiers mockados na mesma suite.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const BASE_URL = "https://brunanutri.com.br";
const owner: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, BASE_URL), { method: "POST" });
}

function mockCommonDeps() {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(owner) }));
  vi.doMock("@/lib/security/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
  vi.doMock("@/lib/security/request", () => ({ getRequestFingerprint: vi.fn().mockReturnValue({ ipHash: "hash" }) }));
}

class FakeProposalsDb {
  private rows = new Map<string, { id: string; admin_id: string; status: string; params_json: string; expires_at: string }>();
  private executions = new Map<string, Record<string, unknown>>();

  seed(row: { id: string; admin_id: string; status?: string; params_json: string; expires_at?: string }) {
    this.rows.set(row.id, {
      id: row.id, admin_id: row.admin_id, status: row.status ?? "pending",
      params_json: row.params_json, expires_at: row.expires_at ?? new Date(Date.now() + 60_000).toISOString(),
    });
  }

  async claim(id: string, adminId: string) {
    const row = this.rows.get(id);
    if (!row) return null;
    if (row.admin_id !== adminId) return null;
    if (row.status !== "pending") return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) return null;
    row.status = "executing";
    return { ...row };
  }

  async get(id: string, adminId: string) {
    const row = this.rows.get(id);
    if (!row || row.admin_id !== adminId) return null;
    return { ...row };
  }

  async getExecution(id: string) {
    const result = this.executions.get(id);
    return result ? { proposal_id: id, kind: "x", result_json: JSON.stringify(result) } : null;
  }

  async recordExecution(id: string, _kind: string, result: Record<string, unknown>) {
    if (!this.executions.has(id)) this.executions.set(id, result);
  }
}

function mockDbBackedRepo(db: FakeProposalsDb) {
  vi.doMock("@/lib/repositories/ai-action-proposals", () => ({
    claimAiActionProposal: (id: string, adminId: string) => db.claim(id, adminId),
    cancelAiActionProposal: vi.fn(),
    finalizeAiActionProposal: vi.fn(),
    getAiActionProposal: (id: string, adminId: string) => db.get(id, adminId),
    markAiActionProposalExpired: vi.fn(),
    isAiActionProposalExpired: () => false,
    getProposalExecution: (id: string) => db.getExecution(id),
    recordProposalExecution: (id: string, kind: string, result: Record<string, unknown>) => db.recordExecution(id, kind, result),
  }));
}

describe("secao 13: duas propostas diferentes (proposalIds distintos) para o MESMO horário", () => {
  it("a proteção por proposalId (claim) não impede a segunda de tentar — quem barra é a revalidação de conflito no handler", async () => {
    mockCommonDeps();
    const appointmentAction: ProposedAction = {
      kind: "new_appointment", clientId: "client-1",
      fields: { title: "Consulta", appointment_type: "consulta", starts_at_display: "13/08/2026 15:00", location: "", notes: "" },
      risk: "sensitive", requiresConfirmation: true,
    };

    const db = new FakeProposalsDb();
    db.seed({ id: "proposal-A", admin_id: "admin-1", params_json: JSON.stringify(appointmentAction) });
    db.seed({ id: "proposal-B", admin_id: "admin-1", params_json: JSON.stringify(appointmentAction) });
    mockDbBackedRepo(db);

    // Primeira confirmacao "cria" o agendamento (conflito nao existe ainda);
    // a partir dai, o slot esta ocupado — a revalidacao da segunda proposta
    // (proposalId diferente!) precisa detectar isso.
    let appointmentCreated = false;
    vi.doMock("@/lib/repositories/clients", () => ({
      getClientById: vi.fn(async (id: string) => (id === "client-1" ? { id: "client-1", name: "Maria Silva" } : null)),
    }));
    vi.doMock("@/lib/repositories/availability", () => ({
      hasAppointmentConflict: vi.fn(async () => appointmentCreated),
      slotEnd: vi.fn((iso: string) => new Date(new Date(iso).getTime() + 60 * 60 * 1000).toISOString()),
    }));
    vi.doMock("@/lib/repositories/appointments", () => ({
      createAppointment: vi.fn(async () => {
        appointmentCreated = true;
        return "appointment-1";
      }),
    }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");

    const firstResponse = await POST(makeRequest("/api/admin/ai/proposals/proposal-A/confirm"), {
      params: Promise.resolve({ id: "proposal-A" }),
    });
    const secondResponse = await POST(makeRequest("/api/admin/ai/proposals/proposal-B/confirm"), {
      params: Promise.resolve({ id: "proposal-B" }),
    });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(409); // barrado pela revalidacao de conflito, nao pelo claim
    const secondBody = await secondResponse.json();
    expect(secondBody.message).toContain("ocupado");
  });
});

describe("secao 14 (corrigido — hardening de producao): duas propostas diferentes de novo cliente com o mesmo e-mail", () => {
  it("a checagem de duplicidade em si e TOCTOU, mas o indice UNIQUE em clients.email_normalized garante exatamente um cliente criado", async () => {
    mockCommonDeps();
    const newClientAction = (email: string): ProposedAction => ({
      kind: "new_client",
      fields: { name: "Maria Silva", email, phone: "", birth_date: "" },
      risk: "sensitive", requiresConfirmation: true,
    });

    const db = new FakeProposalsDb();
    db.seed({ id: "proposal-A", admin_id: "admin-1", params_json: JSON.stringify(newClientAction("Maria@Example.com")) });
    db.seed({ id: "proposal-B", admin_id: "admin-1", params_json: JSON.stringify(newClientAction("maria@example.com")) });
    mockDbBackedRepo(db);

    // Ambas checagens de duplicidade (getClients) rodam ANTES de qualquer
    // create — isso permanece TOCTOU, e por design (e so uma checagem de UX
    // antecipada). A garantia real e simulada aqui como o indice UNIQUE
    // parcial faria no D1 real: so a PRIMEIRA escrita com um dado
    // email_normalized vence; a segunda relanca ClientDuplicateError —
    // exatamente o que createClient (lib/repositories/clients.ts) faz ao
    // capturar "UNIQUE constraint failed: clients.email_normalized".
    const claimedEmails = new Set<string>();
    let nextId = 0;
    const createClient = vi.fn(async (input: { email?: string | null }) => {
      const normalized = input.email?.trim().toLowerCase() ?? null;
      if (normalized && claimedEmails.has(normalized)) {
        const { ClientDuplicateError } = await import("../lib/clinical/client-identity");
        throw new ClientDuplicateError("email");
      }
      if (normalized) claimedEmails.add(normalized);
      nextId += 1;
      return `client-${nextId}`;
    });
    vi.doMock("@/lib/repositories/clients", () => ({
      getClients: vi.fn().mockResolvedValue({ items: [] }), // nenhuma das duas ve duplicidade na checagem antecipada
      createClient,
    }));

    const { POST } = await import("../app/api/admin/ai/proposals/[id]/confirm/route");
    const [a, b] = await Promise.all([
      POST(makeRequest("/api/admin/ai/proposals/proposal-A/confirm"), { params: Promise.resolve({ id: "proposal-A" }) }),
      POST(makeRequest("/api/admin/ai/proposals/proposal-B/confirm"), { params: Promise.resolve({ id: "proposal-B" }) }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(createClient).toHaveBeenCalledTimes(2);

    const failed = a.status === 409 ? a : b;
    const failedBody = await failed.json();
    expect(failedBody.message).toContain("Já existe um paciente cadastrado com esse e-mail");
    expect(failedBody.message).not.toMatch(/SQLITE|UNIQUE constraint|SQL/i);
  });
});
