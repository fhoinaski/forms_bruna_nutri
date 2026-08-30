import { describe, expect, it, vi } from "vitest";

describe("patient orientation snapshots", () => {
  it("copies catalog content into the patient publication instead of linking live content", async () => {
    vi.resetModules();
    const d1Execute = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/d1/client", () => ({ d1Execute, d1Query: vi.fn() }));
    const { createEducationPublication } = await import("@/lib/repositories/patient-deliverables");
    await createEducationPublication("patient-a", { id: "card-a", slug: "card", title: "Original", category: "geral", summary: "Resumo original", sections: { body: "Conteúdo original" }, is_active: 1, created_at: "", updated_at: "" }, "admin-a");
    const [, params] = d1Execute.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(expect.arrayContaining(["Original", "geral", "Resumo original", JSON.stringify({ body: "Conteúdo original" })]));
  });
});
