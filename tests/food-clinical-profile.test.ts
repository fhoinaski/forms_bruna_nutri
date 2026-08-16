import { describe, expect, it, vi, afterEach } from "vitest";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const rice: MacroReferenceFood = {
  numero: 3,
  descricao: "Arroz, tipo 1, cozido",
  grupo: "Cereais e derivados",
  fonte: "taco",
  energia_kcal: 128,
  proteina_g: 2.5,
  carboidrato_g: 28,
  lipidios_g: 0.2,
};

const milk: MacroReferenceFood = {
  numero: 458,
  descricao: "Leite de vaca, integral",
  grupo: "Leite e derivados",
  fonte: "taco",
  energia_kcal: 60,
  proteina_g: 3,
  carboidrato_g: 5,
  lipidios_g: 3,
};

function marker(overrides: Record<string, unknown> = {}) {
  return {
    id: "marker-1",
    client_id: "client-1",
    type: "ALLERGY",
    normalized_code: "MILK",
    label: "Leite",
    severity: "severe",
    status: "ACTIVE",
    source: "manual",
    evidence_text: null,
    created_by_admin_id: "admin-1",
    updated_by_admin_id: "admin-1",
    resolved_by_admin_id: null,
    resolved_at: null,
    created_at: "2026-08-16T00:00:00.000Z",
    updated_at: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("food clinical profile — TACO curated", () => {
  it("arroz simples tem perfil curado e livre de lactose explicitamente", async () => {
    const { getFoodClinicalProfileFromReference } = await import("../lib/clinical/food-clinical-profile");
    const profile = getFoodClinicalProfileFromReference(rice);
    expect(profile.completeness).toBe("complete");
    expect(profile.traits).toContainEqual(expect.objectContaining({ code: "LACTOSE", relation: "free_from" }));
  });

  it("leite contem MILK e LACTOSE sem colapsar os conceitos", async () => {
    const { getFoodClinicalProfileFromReference } = await import("../lib/clinical/food-clinical-profile");
    const profile = getFoodClinicalProfileFromReference(milk);
    expect(profile.traits).toContainEqual(expect.objectContaining({ code: "MILK", relation: "contains" }));
    expect(profile.traits).toContainEqual(expect.objectContaining({ code: "LACTOSE", relation: "contains" }));
  });

  it("bolo TACO sem curadoria explicita continua unknown", async () => {
    const { getFoodClinicalProfileFromReference } = await import("../lib/clinical/food-clinical-profile");
    const profile = getFoodClinicalProfileFromReference({
      numero: 16,
      descricao: "Bolo, pronto, chocolate",
      grupo: "Cereais e derivados",
      fonte: "taco",
      energia_kcal: 410,
      proteina_g: 6,
      carboidrato_g: 54,
      lipidios_g: 18,
    });
    expect(profile).toMatchObject({ completeness: "unknown", traits: [], reasons: ["taco_food_not_curated"] });
  });
});

describe("food safety matrix using explicit food profiles", () => {
  it("ALLERGY MILK + contains MILK => conflict", async () => {
    const { checkFoodAgainstPatientRestrictions } = await import("../lib/clinical/food-safety");
    const result = checkFoodAgainstPatientRestrictions({ food: milk, markers: [marker({ type: "ALLERGY", normalized_code: "MILK" }) as never] });
    expect(result.status).toBe("conflict");
  });

  it("INTOLERANCE LACTOSE + free_from LACTOSE => compatible", async () => {
    const { checkFoodAgainstPatientRestrictions } = await import("../lib/clinical/food-safety");
    const result = checkFoodAgainstPatientRestrictions({ food: rice, markers: [marker({ type: "INTOLERANCE", normalized_code: "LACTOSE" }) as never] });
    expect(result).toEqual({ status: "compatible", checks: ["food_trait_free_from:LACTOSE"] });
  });

  it("ALLERGY MILK + sem trait de leite => unknown", async () => {
    const { checkFoodAgainstPatientRestrictions } = await import("../lib/clinical/food-safety");
    const result = checkFoodAgainstPatientRestrictions({
      food: { ...rice, numero: "custom-unknown", fonte: "custom", descricao: "Bolo de chocolate" },
      markers: [marker({ type: "ALLERGY", normalized_code: "MILK" }) as never],
    });
    expect(result.status).toBe("unknown");
  });

  it("ALLERGY SOY + may_contain SOY nao retorna compatible", async () => {
    const { checkFoodAgainstPatientRestrictions } = await import("../lib/clinical/food-safety");
    const result = checkFoodAgainstPatientRestrictions({
      food: { ...rice, numero: "custom-bar", fonte: "custom", descricao: "Barra" },
      markers: [marker({ type: "ALLERGY", normalized_code: "SOY" }) as never],
      profile: {
        foodSource: "CUSTOM",
        foodId: "custom-bar",
        completeness: "partial",
        reasons: [],
        traits: [{ code: "SOY", relation: "may_contain", provenance: "PROFESSIONAL" }],
      },
    });
    expect(result.status).toBe("conflict");
  });
});

describe("food clinical traits repository", () => {
  it("custom sem tags retorna unknown", async () => {
    vi.doMock("@/lib/repositories/custom-foods", () => ({
      getCustomFoodById: vi.fn().mockResolvedValue({ id: "food-1", source: "CUSTOM" }),
    }));
    vi.doMock("@/lib/repositories/food-clinical-traits", () => ({
      listFoodClinicalTraits: vi.fn().mockResolvedValue([]),
    }));
    const { getFoodClinicalProfile } = await import("../lib/clinical/food-clinical-profile");
    const profile = await getFoodClinicalProfile({ foodSource: "CUSTOM", foodId: "food-1" });
    expect(profile).toMatchObject({ completeness: "unknown", reasons: ["food_has_no_persisted_clinical_traits"] });
  });

  it("custom configurado retorna perfil persistido", async () => {
    vi.doMock("@/lib/repositories/custom-foods", () => ({
      getCustomFoodById: vi.fn().mockResolvedValue({ id: "food-1", source: "CUSTOM" }),
    }));
    vi.doMock("@/lib/repositories/food-clinical-traits", () => ({
      listFoodClinicalTraits: vi.fn().mockResolvedValue([{ code: "LACTOSE", relation: "free_from", provenance: "PROFESSIONAL" }]),
    }));
    const { getFoodClinicalProfile } = await import("../lib/clinical/food-clinical-profile");
    const profile = await getFoodClinicalProfile({ foodSource: "CUSTOM", foodId: "food-1" });
    expect(profile.traits).toContainEqual({ code: "LACTOSE", relation: "free_from", provenance: "PROFESSIONAL" });
  });

  it("id de manufacturer acessado como custom fica inacessivel por origem", async () => {
    vi.doMock("@/lib/repositories/custom-foods", () => ({
      getCustomFoodById: vi.fn().mockResolvedValue({ id: "food-1", source: "MANUFACTURER" }),
    }));
    vi.doMock("@/lib/repositories/food-clinical-traits", () => ({
      listFoodClinicalTraits: vi.fn(),
    }));
    const { getFoodClinicalProfile } = await import("../lib/clinical/food-clinical-profile");
    const profile = await getFoodClinicalProfile({ foodSource: "CUSTOM", foodId: "food-1" });
    expect(profile).toMatchObject({ completeness: "unknown", reasons: ["food_not_found_for_source"] });
  });
});

describe("recipe clinical profile", () => {
  it("propaga contains de ingrediente TACO e unknown para ingrediente livre", async () => {
    vi.doMock("@/lib/repositories/recipes", () => ({
      getRecipeById: vi.fn().mockResolvedValue({
        id: "recipe-1",
        ingredients: [
          { taco_number: 458, food_name: "Leite de vaca, integral", grams: 200 },
          { taco_number: null, food_name: "Fermento", free_text: "Fermento" },
        ],
      }),
    }));
    const { getFoodClinicalProfile } = await import("../lib/clinical/food-clinical-profile");
    const profile = await getFoodClinicalProfile({ foodSource: "RECIPE", foodId: "recipe-1" });
    expect(profile.traits).toContainEqual(expect.objectContaining({ code: "MILK", relation: "contains" }));
    expect(profile.reasons).toContain("recipe_has_free_text_ingredient");
    expect(profile.completeness).toBe("partial");
  });
});
