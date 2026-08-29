import { describe, expect, it } from "vitest";
import { buildMealPlanCopilotAnalysis } from "@/lib/clinical/meal-plan-copilot";
import type { NutritionRecord } from "@/lib/repositories/nutrition-records";

function record(fields: Partial<NutritionRecord> = {}): NutritionRecord {
  return { id: "r", client_id: "c", version: 1, created_at: "", updated_at: "", chief_complaint: null, life_stage: null, biological_sex: null, target_group: null, gestational_weeks: null, breastfeeding_context: null, clinical_history: null, diagnoses: null, medications: null, supplements: null, allergies: null, restrictions: null, food_preferences: null, food_aversions: null, eating_routine: null, intestinal_health: null, sleep_routine: null, stress_context: null, physical_activity: null, hydration: null, current_weight_kg: null, height_cm: null, bmi: null, pre_pregnancy_weight_kg: null, waist_cm: null, pre_surgery_weight_kg: null, bariatric_surgery_date: null, anthropometry_notes: null, pediatric_growth_notes: null, target_weight_kg: null, target_notes: null, exams: null, assessment: null, goals: null, care_plan: null, risk_flags: null, family_context: null, private_notes: null, ...fields };
}

describe("meal plan clinical copilot", () => {
  it("reuses data and produces only targeted missing questions", () => {
    const result = buildMealPlanCopilotAnalysis(record({ goals: "Emagrecimento", current_weight_kg: "70", height_cm: "165", eating_routine: "Trabalha em turnos", allergies: "Nenhuma" }));
    expect(result.completion).toEqual({ known: 5, required: 5, percent: 100 });
    expect(result).toMatchObject({ canGenerateDraft: true, generationReadiness: "READY", blockingFacts: [] });
    expect(result.questions.map((question) => question.key)).toContain("preferences");
    expect(result.questions.map((question) => question.key)).not.toContain("routine");
  });

  it("flags conflicting portal and record data instead of silently choosing", () => {
    const result = buildMealPlanCopilotAnalysis(record({ goals: "Emagrecimento" }), { objetivo: "Ganho de massa" });
    const objective = result.facts.find((fact) => fact.key === "objective");
    expect(objective).toMatchObject({ state: "CONFLICTING", sourcePath: "nutrition_record.goals", conflictingValue: "Ganho de massa" });
    expect(result).toMatchObject({ canGenerateDraft: false, generationReadiness: "NOT_READY" });
  });

  it("allows a reviewed proposal only when essential data exists but conflicts", () => {
    const result = buildMealPlanCopilotAnalysis(record({ goals: "Emagrecimento", current_weight_kg: "70", height_cm: "165", eating_routine: "Turno comercial", allergies: "Nenhuma" }), { objetivo: "Ganho de massa" });
    expect(result).toMatchObject({ generationReadiness: "READY_WITH_REVIEW", canGenerateDraft: true, blockingFacts: [] });
  });

  it("keeps source traces and never turns an absent fact into a value", () => {
    const result = buildMealPlanCopilotAnalysis(null, { objetivo: "Saúde intestinal" });
    expect(result.facts.find((fact) => fact.key === "objective")).toMatchObject({ state: "KNOWN", sourcePath: "pre_consultation.objetivo" });
    expect(result.facts.find((fact) => fact.key === "weight")).toMatchObject({ state: "MISSING", value: null, source: null });
    expect(result).toMatchObject({ generationReadiness: "NOT_READY" });
  });
});
