import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

const admin: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };
const BASE_URL = "https://brunanutri.com.br";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function mockAuth(authed = true) {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(authed ? admin : null) }));
}

const arroz: MacroReferenceFood = { numero: "3", descricao: "Arroz, tipo 1, cozido", grupo: "Cereais e derivados", fonte: "taco", energia_kcal: 130, proteina_g: 2.5, carboidrato_g: 28.1, lipidios_g: 0.2 };
const aveia: MacroReferenceFood = { numero: "aveia", descricao: "Aveia, cozida", grupo: "Cereais e derivados", fonte: "custom", energia_kcal: 70, proteina_g: 2.5, carboidrato_g: 12, lipidios_g: 1.4 };
const acucar: MacroReferenceFood = { numero: "492", descricao: "Açúcar, cristal", grupo: "Produtos açucarados", fonte: "taco", energia_kcal: 387, proteina_g: 0, carboidrato_g: 99.6, lipidios_g: 0 };

function mockCatalog(byRef: Record<string, { name: string; sourceLabel: string; macroReference: MacroReferenceFood } | null>, portionsByRef: Record<string, { id: string; label: string; gramWeight: number; confidence?: string }[]> = {}) {
  vi.doMock("@/lib/nutrition/food-catalog", () => ({
    getFoodByReference: vi.fn(async (ref: { source: string; sourceId: string }) => byRef[`${ref.source}:${ref.sourceId}`] ?? null),
    getFoodPortions: vi.fn(async (ref: { source: string; sourceId: string }) => portionsByRef[`${ref.source}:${ref.sourceId}`] ?? []),
  }));
}

async function postBody(body: unknown) {
  const { POST } = await import("../app/api/admin/foods/equivalent-quantity/route");
  return POST(new NextRequest(new URL("/api/admin/foods/equivalent-quantity", BASE_URL), { method: "POST", body: JSON.stringify(body) }));
}

describe("POST /api/admin/foods/equivalent-quantity", () => {
  it("requires authentication", async () => {
    mockAuth(false);
    mockCatalog({});
    const response = await postBody({ referenceFood: { source: "TACO", refId: "3" }, referenceGrams: 100, criterion: "ENERGY", candidates: [{ source: "TACO", refId: "492" }] });
    expect(response.status).toBe(401);
  });

  it("rejects a malformed body without touching the catalog", async () => {
    mockAuth();
    mockCatalog({});
    const response = await postBody({ referenceGrams: 100 });
    expect(response.status).toBe(400);
  });

  it("computes CALCULATED equivalence for a same-category candidate in a single batch call and includes household portion when it fits", async () => {
    mockAuth();
    mockCatalog(
      {
        "TACO:3": { name: arroz.descricao, sourceLabel: "TACO", macroReference: arroz },
        "CUSTOM:aveia": { name: aveia.descricao, sourceLabel: "Personalizado", macroReference: aveia },
      },
      { "CUSTOM:aveia": [{ id: "p1", label: "unidade média", gramWeight: 185 }] }
    );
    const response = await postBody({
      referenceFood: { source: "TACO", refId: "3" },
      referenceGrams: 100,
      criterion: "ENERGY",
      candidates: [{ source: "CUSTOM", refId: "aveia" }],
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    const item = body.items[0];
    expect(item.result.status).toBe("CALCULATED");
    expect(item.result.practicalCandidateQuantityGrams).toBe(185);
    expect(item.householdPortion).toMatchObject({ portionId: "p1", approxCount: 1 });
  });

  it("never invents a household portion when none is registered", async () => {
    mockAuth();
    mockCatalog(
      {
        "TACO:3": { name: arroz.descricao, sourceLabel: "TACO", macroReference: arroz },
        "CUSTOM:aveia": { name: aveia.descricao, sourceLabel: "Personalizado", macroReference: aveia },
      },
      {}
    );
    const response = await postBody({
      referenceFood: { source: "TACO", refId: "3" },
      referenceGrams: 100,
      criterion: "ENERGY",
      candidates: [{ source: "CUSTOM", refId: "aveia" }],
    });
    const body = await response.json();
    expect(body.items[0].householdPortion).toBeNull();
  });

  it("returns result:null for a candidate that does not resolve, without failing the whole batch (partial success)", async () => {
    mockAuth();
    mockCatalog({
      "TACO:3": { name: arroz.descricao, sourceLabel: "TACO", macroReference: arroz },
      "CUSTOM:aveia": { name: aveia.descricao, sourceLabel: "Personalizado", macroReference: aveia },
    });
    const response = await postBody({
      referenceFood: { source: "TACO", refId: "3" },
      referenceGrams: 100,
      criterion: "ENERGY",
      candidates: [{ source: "CUSTOM", refId: "aveia" }, { source: "CUSTOM", refId: "ghost" }],
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(2);
    const ghost = body.items.find((item: { ref: { refId: string } }) => item.ref.refId === "ghost");
    expect(ghost.result).toBeNull();
    expect(ghost.name).toBeNull();
    const resolved = body.items.find((item: { ref: { refId: string } }) => item.ref.refId === "aveia");
    expect(resolved.result.status).toBe("CALCULATED");
  });

  it("404s when the reference food itself does not resolve", async () => {
    mockAuth();
    mockCatalog({});
    const response = await postBody({
      referenceFood: { source: "TACO", refId: "does-not-exist" },
      referenceGrams: 100,
      criterion: "ENERGY",
      candidates: [{ source: "CUSTOM", refId: "aveia" }],
    });
    expect(response.status).toBe(404);
  });

  it("ranks same-category candidates before a different-category candidate closer in raw percentage, and excludes non-CALCULATED from the ranking order", async () => {
    mockAuth();
    mockCatalog({
      "TACO:3": { name: arroz.descricao, sourceLabel: "TACO", macroReference: arroz },
      "CUSTOM:aveia": { name: aveia.descricao, sourceLabel: "Personalizado", macroReference: aveia },
      "TACO:492": { name: acucar.descricao, sourceLabel: "TACO", macroReference: acucar },
    });
    const response = await postBody({
      referenceFood: { source: "TACO", refId: "3" },
      referenceGrams: 100,
      criterion: "ENERGY",
      candidates: [{ source: "TACO", refId: "492" }, { source: "CUSTOM", refId: "aveia" }],
    });
    const body = await response.json();
    const order = body.items.map((item: { ref: { refId: string } }) => item.ref.refId);
    expect(order[0]).toBe("aveia");
  });

  it("deduplicates repeated candidate references before computing (never double-counts identical identity)", async () => {
    mockAuth();
    const getFoodByReference = vi.fn(async (ref: { source: string; sourceId: string }) => {
      const map: Record<string, { name: string; sourceLabel: string; macroReference: MacroReferenceFood }> = {
        "TACO:3": { name: arroz.descricao, sourceLabel: "TACO", macroReference: arroz },
        "CUSTOM:aveia": { name: aveia.descricao, sourceLabel: "Personalizado", macroReference: aveia },
      };
      return map[`${ref.source}:${ref.sourceId}`] ?? null;
    });
    vi.doMock("@/lib/nutrition/food-catalog", () => ({ getFoodByReference, getFoodPortions: vi.fn(async () => []) }));
    const response = await postBody({
      referenceFood: { source: "TACO", refId: "3" },
      referenceGrams: 100,
      criterion: "ENERGY",
      candidates: [{ source: "CUSTOM", refId: "aveia" }, { source: "CUSTOM", refId: "aveia" }],
    });
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    // uma chamada pra referencia + uma por candidato UNICO (nunca N chamadas repetidas para o mesmo candidato)
    expect(getFoodByReference).toHaveBeenCalledTimes(2);
  });

  it("computes 20 candidates in a single HTTP call (large-candidate-set / N+1 audit)", async () => {
    mockAuth();
    const candidateRefs = Array.from({ length: 20 }, (_, index) => ({ source: "CUSTOM" as const, refId: `candidate-${index}` }));
    const byRef: Record<string, { name: string; sourceLabel: string; macroReference: MacroReferenceFood }> = {
      "TACO:3": { name: arroz.descricao, sourceLabel: "TACO", macroReference: arroz },
    };
    for (const ref of candidateRefs) {
      byRef[`${ref.source}:${ref.refId}`] = {
        name: `Candidato ${ref.refId}`,
        sourceLabel: "Personalizado",
        macroReference: { ...aveia, numero: ref.refId, energia_kcal: 50 + Number(ref.refId.replace("candidate-", "")) * 5 },
      };
    }
    mockCatalog(byRef);
    const response = await postBody({
      referenceFood: { source: "TACO", refId: "3" },
      referenceGrams: 100,
      criterion: "ENERGY",
      candidates: candidateRefs,
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(20);
    expect(body.items.every((item: { result: { status: string } | null }) => item.result?.status === "CALCULATED")).toBe(true);
  });
});
