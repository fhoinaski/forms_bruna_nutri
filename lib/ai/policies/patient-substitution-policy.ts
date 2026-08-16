import type { NutritionRecord } from "@/lib/repositories/nutrition-records";
import type { MealPlanPayload } from "@/lib/repositories/meal-plans";
import type { FoodSubstitutionResult } from "@/lib/nutrition/food-substitution";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import type { FoodSafetyResult } from "@/lib/clinical/food-safety";
import type { FoodClinicalProfile } from "@/lib/clinical/food-clinical-traits";
import type { PatientClinicalMarker } from "@/lib/repositories/patient-clinical-markers";
import { containsClinicalSignal } from "@/lib/ai/policies/clinical-signal";

export type SubstitutionPolicyResult =
  | {
      decision: "auto_safe";
      autonomyLevel: "SAFE_A";
      reasons: string[];
    }
  | {
      decision: "requires_review";
      autonomyLevel: "SAFE_B" | "REVIEW" | "BLOCKED";
      reasons: string[];
    };

export interface PatientSubstitutionPolicyInput {
  featureEnabled: boolean;
  patientText?: string | null;
  plan: MealPlanPayload | null;
  planVersion?: number | null;
  mealId?: string | null;
  itemId?: string | null;
  sourceFood: MacroReferenceFood | null;
  targetFood: MacroReferenceFood | null;
  substitution: FoodSubstitutionResult | undefined;
  nutritionRecord?: NutritionRecord | null;
  patientClinicalMarkers?: PatientClinicalMarker[];
  targetFoodProfile?: FoodClinicalProfile | null;
  foodSafety?: FoodSafetyResult | null;
}

export const PATIENT_SUBSTITUTION_POLICY_REASONS = {
  FEATURE_DISABLED: "FEATURE_DISABLED",
  ACTIVE_PLAN_NOT_FOUND: "ACTIVE_PLAN_NOT_FOUND",
  PLAN_NOT_ACTIVE: "PLAN_NOT_ACTIVE",
  PLAN_VERSION_NOT_CURRENT: "PLAN_VERSION_NOT_CURRENT",
  MEAL_NOT_LOCATED: "MEAL_NOT_LOCATED",
  SOURCE_ITEM_NOT_LOCATED: "SOURCE_ITEM_NOT_LOCATED",
  SOURCE_FOOD_NOT_TRUSTED: "SOURCE_FOOD_NOT_TRUSTED",
  TARGET_FOOD_NOT_TRUSTED: "TARGET_FOOD_NOT_TRUSTED",
  EQUIVALENCE_NOT_CALCULATED: "EQUIVALENCE_NOT_CALCULATED",
  ENGINE_NOT_SAFE: "ENGINE_NOT_SAFE",
  UNSUPPORTED_EQUIVALENCE_BASIS: "UNSUPPORTED_EQUIVALENCE_BASIS",
  CLINICAL_SIGNAL_PRESENT: "CLINICAL_SIGNAL_PRESENT",
  UNSTRUCTURED_CLINICAL_CONTEXT: "UNSTRUCTURED_CLINICAL_CONTEXT",
  CLINICAL_RESTRICTION_COVERAGE_PARTIAL: "CLINICAL_RESTRICTION_COVERAGE_PARTIAL",
  CLINICAL_RESTRICTION_COVERAGE_UNKNOWN: "CLINICAL_RESTRICTION_COVERAGE_UNKNOWN",
  FOOD_PROFILE_NOT_EVALUATED: "FOOD_PROFILE_NOT_EVALUATED",
  FOOD_PROFILE_UNKNOWN: "FOOD_PROFILE_UNKNOWN",
  FOOD_PROFILE_PARTIAL: "FOOD_PROFILE_PARTIAL",
  FOOD_SAFETY_NOT_EVALUATED: "FOOD_SAFETY_NOT_EVALUATED",
  ACTIVE_RESTRICTION_CONFLICT: "ACTIVE_RESTRICTION_CONFLICT",
  SUSPECTED_RESTRICTION: "SUSPECTED_RESTRICTION",
  FOOD_SAFETY_UNKNOWN: "FOOD_SAFETY_UNKNOWN",
  AUTO_SAFE: "AUTO_SAFE",
} as const;

export type PatientSubstitutionPolicyReason = typeof PATIENT_SUBSTITUTION_POLICY_REASONS[keyof typeof PATIENT_SUBSTITUTION_POLICY_REASONS];
export type ClinicalRestrictionCoverage = "complete" | "partial" | "unknown";

const CLINICAL_BLOCKING_FIELDS: Array<keyof NutritionRecord> = [
  "clinical_history",
  "diagnoses",
  "medications",
  "supplements",
  "allergies",
  "restrictions",
  "food_aversions",
  "intestinal_health",
  "exams",
  "assessment",
  "care_plan",
  "risk_flags",
  "target_group",
  "gestational_weeks",
  "breastfeeding_context",
  "pre_pregnancy_weight_kg",
  "pre_surgery_weight_kg",
  "bariatric_surgery_date",
  "pediatric_growth_notes",
  "target_notes",
];

function hasValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function requiresClinicalReview(record: NutritionRecord | null | undefined): string[] {
  if (!record) return [];
  return CLINICAL_BLOCKING_FIELDS
    .filter((field) => hasValue(record[field]))
    .map((field) => `clinical_context_present:${field}`);
}

function clinicalRestrictionCoverage(input: {
  record: NutritionRecord | null | undefined;
  markers: PatientClinicalMarker[];
}): { coverage: ClinicalRestrictionCoverage; reasons: string[] } {
  const unstructured = requiresClinicalReview(input.record);
  if (unstructured.length === 0) return { coverage: "complete", reasons: [] };
  return {
    coverage: input.markers.length > 0 ? "partial" : "unknown",
    reasons: [
      PATIENT_SUBSTITUTION_POLICY_REASONS.UNSTRUCTURED_CLINICAL_CONTEXT,
      ...(input.markers.length > 0
        ? [PATIENT_SUBSTITUTION_POLICY_REASONS.CLINICAL_RESTRICTION_COVERAGE_PARTIAL]
        : [PATIENT_SUBSTITUTION_POLICY_REASONS.CLINICAL_RESTRICTION_COVERAGE_UNKNOWN]),
      ...unstructured,
    ],
  };
}

function isTrustedTaco(food: MacroReferenceFood | null): boolean {
  return Boolean(food && food.fonte === "taco" && food.numero !== undefined && food.numero !== null);
}

export function evaluatePatientFoodSubstitutionPolicy(input: PatientSubstitutionPolicyInput): SubstitutionPolicyResult {
  const reasons: string[] = [];
  const markers = input.patientClinicalMarkers ?? [];

  if (!input.featureEnabled) reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.FEATURE_DISABLED);
  if (!input.plan) reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.ACTIVE_PLAN_NOT_FOUND);
  if (input.plan && input.plan.status !== "active") reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.PLAN_NOT_ACTIVE);
  if (!input.planVersion || input.planVersion !== input.plan?.version) reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.PLAN_VERSION_NOT_CURRENT);
  if (!input.mealId) reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.MEAL_NOT_LOCATED);
  if (!input.itemId) reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.SOURCE_ITEM_NOT_LOCATED);

  if (!isTrustedTaco(input.sourceFood)) reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.SOURCE_FOOD_NOT_TRUSTED);
  if (!isTrustedTaco(input.targetFood)) reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.TARGET_FOOD_NOT_TRUSTED);

  if (!input.substitution) reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.EQUIVALENCE_NOT_CALCULATED);
  else if (input.substitution.status !== "safe") reasons.push(`${PATIENT_SUBSTITUTION_POLICY_REASONS.ENGINE_NOT_SAFE}:${input.substitution.status}`);
  else if (input.substitution.equivalenceBasis !== "energyKcal") reasons.push(`${PATIENT_SUBSTITUTION_POLICY_REASONS.UNSUPPORTED_EQUIVALENCE_BASIS}:${input.substitution.equivalenceBasis}`);

  if (input.patientText && containsClinicalSignal(input.patientText)) reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.CLINICAL_SIGNAL_PRESENT);

  const coverage = clinicalRestrictionCoverage({ record: input.nutritionRecord, markers });
  reasons.push(...coverage.reasons);

  if (!input.targetFoodProfile) {
    reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.FOOD_PROFILE_NOT_EVALUATED);
  } else if (input.targetFoodProfile.completeness === "unknown") {
    reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.FOOD_PROFILE_UNKNOWN);
  } else if (input.targetFoodProfile.completeness === "partial") {
    reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.FOOD_PROFILE_PARTIAL);
  }

  if (!input.foodSafety) {
    reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.FOOD_SAFETY_NOT_EVALUATED);
  } else if (input.foodSafety.status === "conflict") {
    reasons.push(PATIENT_SUBSTITUTION_POLICY_REASONS.ACTIVE_RESTRICTION_CONFLICT);
    reasons.push(...input.foodSafety.conflicts.map((conflict) => `food_safety_conflict:${conflict.type}:${conflict.normalizedCode}:${conflict.relation}`));
  } else if (input.foodSafety.status === "unknown") {
    const suspected = input.foodSafety.reasons.some((reason) => reason.startsWith("suspected_restriction:"));
    reasons.push(suspected ? PATIENT_SUBSTITUTION_POLICY_REASONS.SUSPECTED_RESTRICTION : PATIENT_SUBSTITUTION_POLICY_REASONS.FOOD_SAFETY_UNKNOWN);
    reasons.push(...input.foodSafety.reasons.map((reason) => `food_safety_unknown:${reason}`));
  }

  if (reasons.length === 0) {
    return {
      decision: "auto_safe",
      autonomyLevel: "SAFE_A",
      reasons: [
        PATIENT_SUBSTITUTION_POLICY_REASONS.AUTO_SAFE,
        "FEATURE_ENABLED",
        "ACTIVE_PLAN_CURRENT",
        "SINGLE_MEAL_AND_ITEM",
        "TRUSTED_TACO_TO_TACO",
        "ENGINE_ENERGY_EQUIVALENCE_CALCULATED",
        "CLINICAL_RESTRICTION_COVERAGE_COMPLETE",
        "FOOD_PROFILE_COMPLETE",
        "FOOD_SAFETY_COMPATIBLE",
      ],
    };
  }

  const blocked = reasons.some((reason) =>
    reason === PATIENT_SUBSTITUTION_POLICY_REASONS.CLINICAL_SIGNAL_PRESENT ||
    reason === PATIENT_SUBSTITUTION_POLICY_REASONS.UNSTRUCTURED_CLINICAL_CONTEXT ||
    reason === PATIENT_SUBSTITUTION_POLICY_REASONS.ACTIVE_RESTRICTION_CONFLICT ||
    reason === PATIENT_SUBSTITUTION_POLICY_REASONS.SUSPECTED_RESTRICTION ||
    reason.startsWith("clinical_context_present:") ||
    reason === PATIENT_SUBSTITUTION_POLICY_REASONS.SOURCE_FOOD_NOT_TRUSTED ||
    reason === PATIENT_SUBSTITUTION_POLICY_REASONS.TARGET_FOOD_NOT_TRUSTED
  );
  const engineUnavailable = reasons.some((reason) =>
    reason === PATIENT_SUBSTITUTION_POLICY_REASONS.EQUIVALENCE_NOT_CALCULATED ||
    reason.startsWith(`${PATIENT_SUBSTITUTION_POLICY_REASONS.ENGINE_NOT_SAFE}:not_supported`) ||
    reason.startsWith(`${PATIENT_SUBSTITUTION_POLICY_REASONS.ENGINE_NOT_SAFE}:ambiguous`)
  );

  return {
    decision: "requires_review",
    autonomyLevel: blocked ? "BLOCKED" : engineUnavailable ? "REVIEW" : "SAFE_B",
    reasons,
  };
}
