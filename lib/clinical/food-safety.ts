import { getFoodClinicalProfileFromReference, getTraitForCode } from "@/lib/clinical/food-clinical-profile";
import type { FoodClinicalProfile } from "@/lib/clinical/food-clinical-traits";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import type { PatientClinicalMarker } from "@/lib/repositories/patient-clinical-markers";

export interface RestrictionConflict {
  markerId: string;
  type: PatientClinicalMarker["type"];
  normalizedCode: string;
  label: string;
  severity: PatientClinicalMarker["severity"];
  foodMarker: string;
  relation: "contains" | "may_contain";
}

export type FoodSafetyResult =
  | {
      status: "compatible";
      checks: string[];
    }
  | {
      status: "conflict";
      conflicts: RestrictionConflict[];
    }
  | {
      status: "unknown";
      reasons: string[];
    };

function activeFoodMarkers(markers: PatientClinicalMarker[]): PatientClinicalMarker[] {
  return markers.filter((marker) =>
    marker.status !== "RESOLVED" &&
    ["ALLERGY", "INTOLERANCE", "DIETARY_RESTRICTION", "FOOD_AVOIDANCE"].includes(marker.type)
  );
}

export function checkFoodAgainstPatientRestrictions(input: {
  food: MacroReferenceFood;
  markers: PatientClinicalMarker[];
  profile?: FoodClinicalProfile;
}): FoodSafetyResult {
  const relevantMarkers = activeFoodMarkers(input.markers);
  if (!relevantMarkers.length) return { status: "compatible", checks: ["no_active_structured_food_restrictions"] };

  const suspected = relevantMarkers.filter((marker) => marker.status === "SUSPECTED");
  if (suspected.length) {
    return {
      status: "unknown",
      reasons: suspected.map((marker) => `suspected_restriction:${marker.type}:${marker.normalized_code}`),
    };
  }

  const profile = input.profile ?? getFoodClinicalProfileFromReference(input.food);
  if (profile.completeness === "unknown" && !profile.traits.length) return { status: "unknown", reasons: profile.reasons };

  const unknownReasons: string[] = [];
  const checks: string[] = [];
  const conflicts: RestrictionConflict[] = [];

  for (const marker of relevantMarkers) {
    const trait = getTraitForCode(profile, marker.normalized_code);
    if (!trait) {
      unknownReasons.push(`food_trait_unknown:${marker.type}:${marker.normalized_code}`);
      continue;
    }
    if (trait.relation === "contains" || trait.relation === "may_contain") {
      conflicts.push({
      markerId: marker.id,
      type: marker.type,
      normalizedCode: marker.normalized_code,
      label: marker.label ?? marker.normalized_code,
      severity: marker.severity,
      foodMarker: marker.normalized_code,
        relation: trait.relation,
      });
      continue;
    }
    checks.push(`food_trait_free_from:${marker.normalized_code}`);
  }

  if (conflicts.length) return { status: "conflict", conflicts };
  if (unknownReasons.length) return { status: "unknown", reasons: unknownReasons };
  return { status: "compatible", checks };
}
