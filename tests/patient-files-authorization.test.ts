import { describe, expect, it, vi } from "vitest";
import type { ClientPortalSession } from "@/lib/auth/client-portal-session";

const sessionA: ClientPortalSession = { sub: "patient-a", type: "client_portal", sessionVersion: 1, sid: "session-a" };

describe("patient file download authorization", () => {
  it("scopes the metadata lookup to the authenticated patient before storage access", async () => {
    vi.resetModules();
    const getPatientPortalFile = vi.fn().mockResolvedValue(null);
    const bucketGet = vi.fn();
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    vi.doMock("@/lib/repositories/patient-deliverables", () => ({ getPatientPortalFile }));
    vi.doMock("@/lib/storage/patient-files", () => ({ getPatientFilesStorage: () => ({ get: bucketGet }) }));
    const { GET } = await import("@/app/api/portal/files/[fileId]/download/route");
    const response = await GET(new Request("http://localhost/api/portal/files/file-b/download") as never, { params: Promise.resolve({ fileId: "file-b" }) });
    expect(response.status).toBe(404);
    expect(getPatientPortalFile).toHaveBeenCalledWith("patient-a", "file-b");
    expect(bucketGet).not.toHaveBeenCalled();
  });

  it("streams only an already-published file resolved for the authenticated patient", async () => {
    vi.resetModules();
    const stream = new ReadableStream<Uint8Array>();
    const getPatientPortalFile = vi.fn().mockResolvedValue({
      id: "file-a", patient_id: "patient-a", object_key: "patients/patient-a/file-a/document.pdf", original_filename: "orientacao.pdf", mime_type: "application/pdf", status: "PUBLISHED",
    });
    const storageGet = vi.fn().mockResolvedValue({ body: stream, httpMetadata: { contentType: "application/pdf" } });
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    vi.doMock("@/lib/repositories/patient-deliverables", () => ({ getPatientPortalFile }));
    vi.doMock("@/lib/storage/patient-files", () => ({ getPatientFilesStorage: () => ({ get: storageGet }) }));
    const { GET } = await import("@/app/api/portal/files/[fileId]/download/route");
    const response = await GET(new Request("http://localhost/api/portal/files/file-a/download") as never, { params: Promise.resolve({ fileId: "file-a" }) });
    expect(response.status).toBe(200);
    expect(getPatientPortalFile).toHaveBeenCalledWith("patient-a", "file-a");
    expect(storageGet).toHaveBeenCalledWith("patients/patient-a/file-a/document.pdf");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("fails closed with a generic response when R2 server configuration is unavailable", async () => {
    vi.resetModules();
    const getPatientPortalFile = vi.fn().mockResolvedValue({ id: "file-a", patient_id: "patient-a", object_key: "opaque", original_filename: "x.pdf", mime_type: "application/pdf", status: "PUBLISHED" });
    vi.doMock("@/lib/auth/client-portal-session", () => ({ getClientPortalSessionFromRequest: vi.fn().mockResolvedValue(sessionA) }));
    vi.doMock("@/lib/repositories/patient-deliverables", () => ({ getPatientPortalFile }));
    vi.doMock("@/lib/storage/patient-files", () => ({ getPatientFilesStorage: () => { throw new Error("R2_SECRET_ACCESS_KEY=test-secret"); } }));
    const { GET } = await import("@/app/api/portal/files/[fileId]/download/route");
    const response = await GET(new Request("http://localhost/api/portal/files/file-a/download") as never, { params: Promise.resolve({ fileId: "file-a" }) });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("test-secret");
  });
});
