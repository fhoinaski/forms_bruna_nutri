import { resolveQuantity, type HouseholdMeasureOption, type QuantityResolution } from "@/lib/nutrition/quantity-resolution";

export interface PrescribedQuantityInput {
  quantity?: string | null;
  unit?: string | null;
}

export interface NutritionGramsInput extends PrescribedQuantityInput {
  householdMeasure?: HouseholdMeasureOption | null;
  resolvedGramsSnapshot?: number | null;
  quantityResolutionSnapshot?: string | null;
}

export function getPrescribedQuantity(item: PrescribedQuantityInput): { prescribedQuantity: string | null; prescribedUnit: string | null } {
  return {
    prescribedQuantity: item.quantity ?? null,
    prescribedUnit: item.unit ?? null,
  };
}

export function formatPrescribedQuantity(item: PrescribedQuantityInput): string {
  const raw = (item.quantity ?? "").trim();
  const unit = (item.unit ?? "").trim();
  if (!raw && !unit) return "";
  return [raw, unit].filter(Boolean).join(" ");
}

export function toNutritionGrams(input: NutritionGramsInput): QuantityResolution {
  return resolveQuantity({
    quantity: input.quantity,
    unit: input.unit,
    householdMeasure: input.householdMeasure ?? null,
    resolvedGramsSnapshot: input.resolvedGramsSnapshot ?? null,
    quantityResolutionSnapshot: input.quantityResolutionSnapshot ?? null,
  });
}
