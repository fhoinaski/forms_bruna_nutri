import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Repository de consultation_sessions — Modo Consulta (FASE 1). Garante:
 * so uma sessao 'in_progress' por paciente (erro de dominio, nunca SQL
 * cru), transicoes de estado corretas (so finaliza/cancela a partir de
 * in_progress), e que notas/brief/summary sao cifrados antes de ir ao
 * banco (nunca texto clinico em claro em params de SQL).
 */

beforeAll(() => {
  process.env.AUTH_SECRET = "test-auth-secret-with-at-least-thirty-two-characters";
  process.env.MFA_ENCRYPTION_KEY = "test-mfa-secret-with-at-least-thirty-two-characters";
});

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

class FakeConsultationSessionsDb {
  rows = new Map<string, Record<string, unknown>>();

  async execute(sql: string, params: unknown[]) {
    if (sql.startsWith("INSERT INTO consultation_sessions")) {
      const [id, clientId, appointmentId, adminId, startedAt, createdAt, updatedAt] = params;
      const hasActive = [...this.rows.values()].some((row) => row.client_id === clientId && row.status === "in_progress");
      if (hasActive) throw new Error("UNIQUE constraint failed: consultation_sessions.client_id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)");
      this.rows.set(id as string, {
        id, client_id: clientId, appointment_id: appointmentId, admin_id: adminId, status: "in_progress",
        started_at: startedAt, ended_at: null, notes: null, ai_brief_json: null, summary_json: null,
        created_at: createdAt, updated_at: updatedAt,
      });
      return;
    }
    if (sql.startsWith("UPDATE consultation_sessions SET notes")) {
      const [notes, updatedAt, id] = params;
      const row = this.rows.get(id as string);
      if (row && row.status === "in_progress") { row.notes = notes; row.updated_at = updatedAt; }
      return;
    }
    if (sql.startsWith("UPDATE consultation_sessions SET ai_brief_json")) {
      const [brief, updatedAt, id] = params;
      const row = this.rows.get(id as string);
      if (row && row.status === "in_progress") { row.ai_brief_json = brief; row.updated_at = updatedAt; }
      return;
    }
    throw new Error(`Unhandled SQL in fake: ${sql}`);
  }

  async query(sql: string, params: unknown[]) {
    if (sql.includes("WHERE client_id = ?1 AND status = 'in_progress'")) {
      const row = [...this.rows.values()].find((r) => r.client_id === params[0] && r.status === "in_progress");
      return row ? [row] : [];
    }
    if (sql.includes("WHERE id = ?1 LIMIT 1")) {
      const row = this.rows.get(params[0] as string);
      return row ? [row] : [];
    }
    if (sql.startsWith("UPDATE consultation_sessions\n     SET status = 'completed'")) {
      const [endedAt, summaryJson, id] = params;
      const row = this.rows.get(id as string);
      if (!row || row.status !== "in_progress") return [];
      row.status = "completed"; row.ended_at = endedAt; row.updated_at = endedAt;
      if (summaryJson !== null) row.summary_json = summaryJson;
      return [row];
    }
    if (sql.startsWith("UPDATE consultation_sessions SET status = 'cancelled'")) {
      const [endedAt, id] = params;
      const row = this.rows.get(id as string);
      if (!row || row.status !== "in_progress") return [];
      row.status = "cancelled"; row.ended_at = endedAt; row.updated_at = endedAt;
      return [row];
    }
    throw new Error(`Unhandled SQL in fake: ${sql}`);
  }
}

function mockD1(db: FakeConsultationSessionsDb) {
  vi.doMock("@/lib/d1/client", () => ({
    d1Execute: (sql: string, params: unknown[] = []) => db.execute(sql, params),
    d1Query: (sql: string, params: unknown[] = []) => db.query(sql, params),
  }));
}

describe("startConsultationSession — uma sessao ativa por paciente", () => {
  it("cria a sessao com notes/brief/summary nulos", async () => {
    const db = new FakeConsultationSessionsDb();
    mockD1(db);
    const { startConsultationSession } = await import("../lib/repositories/consultation-sessions");
    const session = await startConsultationSession({ clientId: "client-1", adminId: "admin-1" });
    expect(session.status).toBe("in_progress");
    expect(session.notes).toBeNull();
    expect(session.ai_brief).toBeNull();
  });

  it("segunda tentativa para o mesmo paciente rejeita com erro de dominio, nunca SQL cru", async () => {
    const db = new FakeConsultationSessionsDb();
    mockD1(db);
    const { startConsultationSession, ConsultationSessionAlreadyActiveError } = await import("../lib/repositories/consultation-sessions");
    await startConsultationSession({ clientId: "client-1", adminId: "admin-1" });
    await expect(startConsultationSession({ clientId: "client-1", adminId: "admin-1" }))
      .rejects.toBeInstanceOf(ConsultationSessionAlreadyActiveError);
  });

  it("pacientes diferentes podem ter sessoes em andamento simultaneamente", async () => {
    const db = new FakeConsultationSessionsDb();
    mockD1(db);
    const { startConsultationSession } = await import("../lib/repositories/consultation-sessions");
    await expect(startConsultationSession({ clientId: "client-1", adminId: "admin-1" })).resolves.toBeTruthy();
    await expect(startConsultationSession({ clientId: "client-2", adminId: "admin-1" })).resolves.toBeTruthy();
  });
});

describe("updateConsultationNotes — cifra antes de gravar", () => {
  it("o valor gravado no banco nunca e o texto em claro", async () => {
    const db = new FakeConsultationSessionsDb();
    mockD1(db);
    const { startConsultationSession, updateConsultationNotes } = await import("../lib/repositories/consultation-sessions");
    const session = await startConsultationSession({ clientId: "client-1", adminId: "admin-1" });
    await updateConsultationNotes(session.id, "Paciente relata fome a noite.");
    const stored = db.rows.get(session.id)?.notes as string;
    expect(stored).not.toContain("fome a noite");
    expect(stored).toMatch(/^enc:v1:/);
  });
});

describe("completeConsultationSession / cancelConsultationSession — so a partir de in_progress", () => {
  it("finaliza uma sessao in_progress e retorna true", async () => {
    const db = new FakeConsultationSessionsDb();
    mockD1(db);
    const { startConsultationSession, completeConsultationSession } = await import("../lib/repositories/consultation-sessions");
    const session = await startConsultationSession({ clientId: "client-1", adminId: "admin-1" });
    await expect(completeConsultationSession(session.id, { resumo: "ok" })).resolves.toBe(true);
    expect(db.rows.get(session.id)?.status).toBe("completed");
  });

  it("nao finaliza duas vezes — segunda chamada retorna false, nunca sobrescreve", async () => {
    const db = new FakeConsultationSessionsDb();
    mockD1(db);
    const { startConsultationSession, completeConsultationSession } = await import("../lib/repositories/consultation-sessions");
    const session = await startConsultationSession({ clientId: "client-1", adminId: "admin-1" });
    await completeConsultationSession(session.id);
    await expect(completeConsultationSession(session.id)).resolves.toBe(false);
  });

  it("cancela uma sessao in_progress e retorna true", async () => {
    const db = new FakeConsultationSessionsDb();
    mockD1(db);
    const { startConsultationSession, cancelConsultationSession } = await import("../lib/repositories/consultation-sessions");
    const session = await startConsultationSession({ clientId: "client-1", adminId: "admin-1" });
    await expect(cancelConsultationSession(session.id)).resolves.toBe(true);
    expect(db.rows.get(session.id)?.status).toBe("cancelled");
  });
});
