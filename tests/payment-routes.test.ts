import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * PATCH/DELETE /api/admin/payments/[id] — cobre autenticacao obrigatoria,
 * validacao de payload e o contrato de "linha afetada": ambos os metodos
 * devem retornar 404 quando o id nao corresponde a nenhuma cobranca (bug
 * encontrado na auditoria: o handler antigo respondia 200 {ok:true} mesmo
 * sem nenhuma linha alterada).
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const admin: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };
const BASE_URL = "https://brunanutri.com.br";

function mockAuth(authed = true) {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(authed ? admin : null) }));
}

describe("PATCH /api/admin/payments/[id]", () => {
  it("401 sem sessao de admin", async () => {
    mockAuth(false);
    vi.doMock("@/lib/repositories/payments", () => ({
      updatePayment: vi.fn(),
      deletePayment: vi.fn(),
    }));
    const { PATCH } = await import("../app/api/admin/payments/[id]/route");
    const response = await PATCH(
      new NextRequest(new URL("/api/admin/payments/p1", BASE_URL), { method: "PATCH", body: JSON.stringify({ status: "pago" }) }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(response.status).toBe(401);
  });

  it("400 com payload invalido (corpo vazio)", async () => {
    mockAuth();
    vi.doMock("@/lib/repositories/payments", () => ({
      updatePayment: vi.fn(),
      deletePayment: vi.fn(),
    }));
    const { PATCH } = await import("../app/api/admin/payments/[id]/route");
    const response = await PATCH(
      new NextRequest(new URL("/api/admin/payments/p1", BASE_URL), { method: "PATCH", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(response.status).toBe(400);
  });

  it("404 quando a cobranca nao existe", async () => {
    mockAuth();
    const updatePayment = vi.fn().mockResolvedValue(false);
    vi.doMock("@/lib/repositories/payments", () => ({
      updatePayment,
      deletePayment: vi.fn(),
    }));
    const { PATCH } = await import("../app/api/admin/payments/[id]/route");
    const response = await PATCH(
      new NextRequest(new URL("/api/admin/payments/does-not-exist", BASE_URL), { method: "PATCH", body: JSON.stringify({ status: "pago" }) }),
      { params: Promise.resolve({ id: "does-not-exist" }) }
    );
    expect(response.status).toBe(404);
    expect(updatePayment).toHaveBeenCalledWith("does-not-exist", { status: "pago" });
  });

  it("200 quando a cobranca existe e e atualizada", async () => {
    mockAuth();
    const updatePayment = vi.fn().mockResolvedValue(true);
    vi.doMock("@/lib/repositories/payments", () => ({
      updatePayment,
      deletePayment: vi.fn(),
    }));
    const { PATCH } = await import("../app/api/admin/payments/[id]/route");
    const response = await PATCH(
      new NextRequest(new URL("/api/admin/payments/p1", BASE_URL), { method: "PATCH", body: JSON.stringify({ status: "pago" }) }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});

describe("DELETE /api/admin/payments/[id]", () => {
  it("401 sem sessao de admin", async () => {
    mockAuth(false);
    vi.doMock("@/lib/repositories/payments", () => ({
      updatePayment: vi.fn(),
      deletePayment: vi.fn(),
    }));
    const { DELETE } = await import("../app/api/admin/payments/[id]/route");
    const response = await DELETE(
      new NextRequest(new URL("/api/admin/payments/p1", BASE_URL), { method: "DELETE" }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(response.status).toBe(401);
  });

  it("404 quando a cobranca nao existe", async () => {
    mockAuth();
    const deletePayment = vi.fn().mockResolvedValue(false);
    vi.doMock("@/lib/repositories/payments", () => ({
      updatePayment: vi.fn(),
      deletePayment,
    }));
    const { DELETE } = await import("../app/api/admin/payments/[id]/route");
    const response = await DELETE(
      new NextRequest(new URL("/api/admin/payments/does-not-exist", BASE_URL), { method: "DELETE" }),
      { params: Promise.resolve({ id: "does-not-exist" }) }
    );
    expect(response.status).toBe(404);
    expect(deletePayment).toHaveBeenCalledWith("does-not-exist");
  });

  it("200 quando a cobranca existe e e removida", async () => {
    mockAuth();
    const deletePayment = vi.fn().mockResolvedValue(true);
    vi.doMock("@/lib/repositories/payments", () => ({
      updatePayment: vi.fn(),
      deletePayment,
    }));
    const { DELETE } = await import("../app/api/admin/payments/[id]/route");
    const response = await DELETE(
      new NextRequest(new URL("/api/admin/payments/p1", BASE_URL), { method: "DELETE" }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});
