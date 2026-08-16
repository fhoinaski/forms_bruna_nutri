import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

const admin: SessionPayload = { sub: "admin-1", email: "bruna@example.com", name: "Bruna", mustChangePassword: false, sessionVersion: 1 };
const BASE_URL = "https://brunanutri.com.br";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function mockAuth(authed = true) {
  vi.doMock("@/lib/auth/session", () => ({ getAdminFromRequest: vi.fn().mockResolvedValue(authed ? admin : null) }));
}

describe("Central de Alimentos", () => {
  it("usa o mesmo endpoint de busca do MealPlanEditor e nao volta para custom-foods como catalogo", () => {
    const central = readFileSync("app/dashboard/alimentos/page.tsx", "utf8");
    const mealPlanEditor = readFileSync("components/dashboard/MealItemsEditor.tsx", "utf8");
    const nutrientAdapter = readFileSync("app/api/admin/foods/nutrients/route.ts", "utf8");

    expect(central).toContain("/api/admin/foods/search");
    expect(mealPlanEditor).toContain("/api/admin/foods/search");
    expect(central).toContain("/api/admin/foods/nutrients");
    expect(nutrientAdapter).toContain("calculateItemNutrients");
    expect(central).not.toContain("/api/admin/custom-foods?");
  });

  it("GET /api/admin/foods/detail resolve detalhe por source/sourceId e preserva null diferente de zero", async () => {
    mockAuth();
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      getFoodByReference: vi.fn(async (ref) => ({
        ref,
        name: "Granola teste",
        brand: null,
        group: null,
        sourceLabel: "Personalizado",
        energyKcal: 410,
        proteinG: 9,
        carbohydrateG: 62,
        fatG: 12,
        fiberG: null,
        macroReference: {
          numero: "custom-1",
          descricao: "Granola teste",
          fonte: "custom",
          energia_kcal: 410,
          proteina_g: 9,
          carboidrato_g: 62,
          lipidios_g: 12,
          fibra_g: null,
          sodio_mg: 0,
        },
      })),
      getFoodPortions: vi.fn(async () => [{ id: "portion-1", label: "1 colher", gramWeight: 20, confidence: "medium", source: "professional" }]),
    }));
    vi.doMock("@/lib/clinical/food-clinical-profile", () => ({
      getFoodClinicalProfileByReference: vi.fn(async () => ({
        foodSource: "CUSTOM",
        foodId: "custom-1",
        traits: [],
        completeness: "unknown",
        reasons: ["food_has_no_persisted_clinical_traits"],
      })),
    }));

    const { GET } = await import("../app/api/admin/foods/detail/route");
    const response = await GET(new NextRequest(new URL("/api/admin/foods/detail?source=CUSTOM&sourceId=custom-1", BASE_URL)));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.food.ref).toEqual({ source: "CUSTOM", sourceId: "custom-1" });
    expect(body.clinical.editable).toBe(true);
    expect(body.portions).toHaveLength(1);
    expect(body.food.nutrients.find((item: { code: string }) => item.code === "FIBER").value).toBeNull();
    expect(body.food.nutrients.find((item: { code: string }) => item.code === "SODIUM").value).toBe(0);
  });

  it("GET /api/admin/foods/detail deixa USDA read-only e sem perfil clinico inventado", async () => {
    mockAuth();
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      getFoodByReference: vi.fn(async (ref) => ({
        ref,
        name: "Rice, white, long-grain, regular, cooked",
        brand: null,
        group: "Cereal Grains and Pasta",
        sourceLabel: "USDA",
        energyKcal: 130,
        proteinG: 2.69,
        carbohydrateG: 28.17,
        fatG: 0.28,
        fiberG: 0.4,
        macroReference: {
          numero: "USDA_SR_LEGACY:169756",
          descricao: "Rice, white, long-grain, regular, cooked",
          fonte: "usda",
          energia_kcal: 130,
          proteina_g: 2.69,
          carboidrato_g: 28.17,
          lipidios_g: 0.28,
          calcio_mg: 10,
        },
      })),
      getFoodPortions: vi.fn(async () => []),
    }));
    vi.doMock("@/lib/clinical/food-clinical-profile", () => ({
      getFoodClinicalProfileByReference: vi.fn(async () => ({
        foodSource: "TACO",
        foodId: "USDA_SR_LEGACY:169756",
        traits: [],
        completeness: "unknown",
        reasons: ["food_source_not_supported_for_clinical_profile"],
      })),
    }));

    const { GET } = await import("../app/api/admin/foods/detail/route");
    const response = await GET(new NextRequest(new URL("/api/admin/foods/detail?source=USDA&sourceId=USDA_SR_LEGACY:169756", BASE_URL)));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.clinical.editable).toBe(false);
    expect(body.clinical.message).toContain("Perfil clinico estruturado");
    expect(body.portions).toEqual([]);
    expect(body.food.nutrients.find((item: { code: string }) => item.code === "CALCIUM").value).toBe(10);
  });

  it("GET /api/admin/foods/nutrients calcula quantidade pela engine central e preserva null diferente de zero", async () => {
    mockAuth();
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      getFoodByReference: vi.fn(async (ref) => ({
        ref,
        name: "Granola teste",
        brand: null,
        group: null,
        sourceLabel: "Personalizado",
        macroReference: {
          numero: "custom-1",
          descricao: "Granola teste",
          fonte: "custom",
          energia_kcal: 410,
          proteina_g: 9,
          carboidrato_g: 62,
          lipidios_g: 12,
          fibra_g: null,
          sodio_mg: 0,
        },
      })),
      getFoodPortions: vi.fn(async () => [{ id: "portion-1", label: "1 colher", gramWeight: 20, confidence: "medium", source: "professional" }]),
    }));

    const { GET } = await import("../app/api/admin/foods/nutrients/route");
    const response = await GET(new NextRequest(new URL("/api/admin/foods/nutrients?source=CUSTOM&sourceId=custom-1&quantity=2&portionId=portion-1", BASE_URL)));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.grams).toBe(40);
    expect(body.resolution.method).toBe("food_household_measure");
    expect(body.nutrients.find((item: { code: string }) => item.code === "ENERGY_KCAL").value).toBe(164);
    expect(body.nutrients.find((item: { code: string }) => item.code === "FIBER").value).toBeNull();
    expect(body.nutrients.find((item: { code: string }) => item.code === "SODIUM").value).toBe(0);
  });

  it("GET /api/admin/foods/nutrients nao inventa porcao inexistente", async () => {
    mockAuth();
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      getFoodByReference: vi.fn(async (ref) => ({
        ref,
        name: "Granola teste",
        brand: null,
        group: null,
        sourceLabel: "Personalizado",
        macroReference: {
          numero: "custom-1",
          descricao: "Granola teste",
          fonte: "custom",
          energia_kcal: 410,
          proteina_g: 9,
          carboidrato_g: 62,
          lipidios_g: 12,
        },
      })),
      getFoodPortions: vi.fn(async () => []),
    }));

    const { GET } = await import("../app/api/admin/foods/nutrients/route");
    const response = await GET(new NextRequest(new URL("/api/admin/foods/nutrients?source=CUSTOM&sourceId=custom-1&quantity=1&portionId=missing", BASE_URL)));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toContain("Medida caseira nao encontrada");
  });
});
