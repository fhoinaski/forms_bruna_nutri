import { describe, expect, it } from "vitest";
import { buildNutritionSnapshot, referenceFromSnapshot } from "@/lib/nutrition/food-snapshot";
import { buildItemSnapshot } from "@/lib/nutrition/food-snapshot-server";
import { resolveItemReference, type FoodReferenceLookup } from "@/lib/nutrition/nutrients";
import { getTacoFoodByNumber } from "@/lib/nutrition/taco";

describe("meal plan item snapshot (P1-A)", () => {
  it("buildNutritionSnapshot + referenceFromSnapshot fazem round-trip dos nutrientes", () => {
    const ref = getTacoFoodByNumber("3");
    expect(ref).toBeTruthy();
    const snapshot = buildNutritionSnapshot(ref!);
    const restored = referenceFromSnapshot("Arroz", "Arroz, tipo 1, cozido", snapshot);
    expect(restored).toBeTruthy();
    expect(restored!.descricao).toBe("Arroz, tipo 1, cozido");
    expect(restored!.energia_kcal).toBe(ref!.energia_kcal);
    expect(restored!.proteina_g).toBe(ref!.proteina_g);
    expect(restored!.carboidrato_g).toBe(ref!.carboidrato_g);
    expect(restored!.lipidios_g).toBe(ref!.lipidios_g);
    expect(restored!.fibra_g).toBe(ref!.fibra_g);
  });

  it("resolveItemReference prefere o snapshot ao re-link (integridade historica)", () => {
    const lookup: FoodReferenceLookup = {
      byTacoNumber: () => ({ descricao: "Arroz (base nova)", energia_kcal: 999, proteina_g: 99, carboidrato_g: 99, lipidios_g: 99 }),
      byCustomId: () => null,
      fuzzyMatch: () => null,
    };
    const item = {
      food: "Arroz",
      food_ref_id: "3",
      food_source: "TACO",
      food_name_snapshot: "Arroz, tipo 1, cozido",
      nutrition_snapshot: JSON.stringify({ energia_kcal: 128, proteina_g: 2.5, carboidrato_g: 28.1, lipidios_g: 0.2, fibra_g: 1.6, sodio_mg: null, calcio_mg: null, ferro_mg: null, potassio_mg: null, vitamina_c_mg: null }),
    };
    const resolved = resolveItemReference(item, lookup);
    expect(resolved!.energia_kcal).toBe(128);
    expect(resolved!.descricao).toBe("Arroz, tipo 1, cozido");
  });

  it("resolveItemReference cai no re-link quando nao ha snapshot (item legado)", () => {
    const lookup: FoodReferenceLookup = {
      byTacoNumber: (n) => (n === "3" ? { descricao: "Arroz", energia_kcal: 128, proteina_g: 2.5, carboidrato_g: 28.1, lipidios_g: 0.2 } : null),
      byCustomId: () => null,
      fuzzyMatch: () => null,
    };
    const resolved = resolveItemReference({ food: "Arroz", food_ref_id: "3", food_source: "TACO" }, lookup);
    expect(resolved!.energia_kcal).toBe(128);
  });

  it("buildItemSnapshot resolve um alimento TACO real", async () => {
    const snap = await buildItemSnapshot("TACO", "3");
    expect(snap.food_name_snapshot).toBeTruthy();
    expect(snap.nutrition_snapshot).toContain("energia_kcal");
  });

  it("buildItemSnapshot devolve null sem vinculo", async () => {
    const snap = await buildItemSnapshot(null, null);
    expect(snap.food_name_snapshot).toBeNull();
    expect(snap.nutrition_snapshot).toBeNull();
  });
});