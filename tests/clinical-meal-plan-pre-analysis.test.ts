import { describe, expect, it } from "vitest";
import { clinicalCopilotSummary } from "@/components/consultation/ClinicalMealPlanPreAnalysis";
import type { ClinicalCopilotAnalysis } from "@/lib/clinical/meal-plan-copilot";

const analysis: ClinicalCopilotAnalysis = {
  facts: [
    { key: "objective", label: "Objetivo", state: "KNOWN", value: "Emagrecer", source: "nutrition_record", sourcePath: "nutrition_record.goals" },
    { key: "routine", label: "Rotina", state: "MISSING", value: null, source: null, sourcePath: null },
    { key: "weight", label: "Peso", state: "CONFLICTING", value: "70", source: "nutrition_record", sourcePath: "nutrition_record.current_weight_kg", conflictingValue: "72" },
  ], completion: { known: 1, required: 5, percent: 20 }, questions: [], canGenerateDraft: false, generationReadiness: "NOT_READY", blockingFacts: [],
  brief: {} as ClinicalCopilotAnalysis["brief"],
};

describe("ClinicalMealPlanPreAnalysis summary", () => {
  it("counts known, missing and conflicting data without interpreting values", () => {
    expect(clinicalCopilotSummary(analysis)).toEqual({ known: 1, missing: 1, conflicts: 1 });
  });
});
