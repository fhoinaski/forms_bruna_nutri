import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("POST /api/admin/clients/[id]/orientations", () => {
  it("accepts a seeded catalog card ID", async () => {
    const getPatientEducationCardById = vi.fn().mockResolvedValue({
      id: "edu-patologia-doenca-celiaca", slug: "doenca-celiaca", title: "Doença Celíaca",
    });
    const createEducationPublication = vi.fn().mockResolvedValue("publication-1");
    vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue({ sub: "admin-1" }) }));
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1" }) }));
    vi.doMock("@/lib/repositories/patient-education-cards", () => ({ getPatientEducationCardById }));
    vi.doMock("@/lib/repositories/patient-deliverables", () => ({ createEducationPublication, listPatientEducationPublications: vi.fn(), setEducationPublicationStatus: vi.fn() }));

    const { POST } = await import("../app/api/admin/clients/[id]/orientations/route");
    const response = await POST(new NextRequest("https://brunanutri.com.br/api/admin/clients/client-1/orientations", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ education_card_id: "edu-patologia-doenca-celiaca" }),
    }), { params: Promise.resolve({ id: "client-1" }) });

    expect(response.status).toBe(201);
    expect(getPatientEducationCardById).toHaveBeenCalledWith("edu-patologia-doenca-celiaca");
    expect(createEducationPublication).toHaveBeenCalledWith("client-1", expect.objectContaining({ id: "edu-patologia-doenca-celiaca" }), "admin-1");
  });
});
