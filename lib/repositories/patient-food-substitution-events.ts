import { d1Execute, d1Query } from "@/lib/d1/client";
import type { SubstitutionPolicyResult } from "@/lib/ai/policies/patient-substitution-policy";

export interface CreatePatientFoodSubstitutionEventInput {
  clientId: string;
  mealPlanId?: string | null;
  mealPlanVersion?: number | null;
  mealId?: string | null;
  itemId?: string | null;
  sourceFoodName?: string | null;
  targetFoodName?: string | null;
  sourceQuantityG?: number | null;
  targetQuantityG?: number | null;
  substitutionStatus: string;
  policy: SubstitutionPolicyResult;
  clinicalMetadata?: Record<string, unknown> | null;
}

export interface PatientFoodSubstitutionEvent {
  id: string;
  client_id: string;
  meal_plan_id: string | null;
  meal_plan_version: number | null;
  meal_id: string | null;
  item_id: string | null;
  source_food_name: string | null;
  target_food_name: string | null;
  source_quantity_g: number | null;
  target_quantity_g: number | null;
  substitution_status: string;
  policy_decision: "auto_safe" | "requires_review";
  autonomy_level: string;
  policy_reasons_json: string;
  clinical_metadata_json: string | null;
  created_at: string;
}

export async function createPatientFoodSubstitutionEvent(input: CreatePatientFoodSubstitutionEventInput): Promise<string> {
  const id = crypto.randomUUID();
  await d1Execute(
    `INSERT INTO patient_food_substitution_events
      (id, client_id, meal_plan_id, meal_plan_version, meal_id, item_id,
       source_food_name, target_food_name, source_quantity_g, target_quantity_g,
       substitution_status, policy_decision, autonomy_level, policy_reasons_json, clinical_metadata_json, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`,
    [
      id,
      input.clientId,
      input.mealPlanId ?? null,
      input.mealPlanVersion ?? null,
      input.mealId ?? null,
      input.itemId ?? null,
      input.sourceFoodName ?? null,
      input.targetFoodName ?? null,
      input.sourceQuantityG ?? null,
      input.targetQuantityG ?? null,
      input.substitutionStatus,
      input.policy.decision,
      input.policy.autonomyLevel,
      JSON.stringify(input.policy.reasons),
      input.clinicalMetadata ? JSON.stringify(input.clinicalMetadata) : null,
      new Date().toISOString(),
    ]
  );
  return id;
}

export async function listRecentPatientFoodSubstitutionEvents(clientId: string, limit = 5): Promise<PatientFoodSubstitutionEvent[]> {
  return d1Query<PatientFoodSubstitutionEvent>(
    `SELECT * FROM patient_food_substitution_events
     WHERE client_id = ?1
     ORDER BY created_at DESC
     LIMIT ?2`,
    [clientId, Math.min(Math.max(limit, 1), 20)]
  );
}
