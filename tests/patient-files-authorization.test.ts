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
    vi.doMock("@/lib/storage/patient-files", () => ({ getPatientFilesBucket: () => ({ get: bucketGet }) }));
    const { GET } = await import("@/app/api/portal/files/[fileId]/download/route");
    const response = await GET(new Request("http://localhost/api/portal/files/file-b/download") as never, { params: Promise.resolve({ fileId: "file-b" }) });
    expect(response.status).toBe(404);
    expect(getPatientPortalFile).toHaveBeenCalledWith("patient-a", "file-b");
    expect(bucketGet).not.toHaveBeenCalled();
  });
});
