import { describe, expect, it } from "vitest";
import { calculatePilotMetrics } from "@/scripts/curated-exchange-pilot-report";

function row(action: string, metadata: Record<string, unknown>) {
  return {
    action,
    entity_id: String(metadata.exchangeGroupId ?? "group-1"),
    metadata_json: JSON.stringify(metadata),
    created_at: "2026-08-23T00:00:00.000Z",
  };
}

describe("curated exchange pilot report metrics", () => {
  it("calcula utilidade, atrito, fallback e pilot-only sem PHI", () => {
    const metrics = calculatePilotMetrics([
      row("SUGGESTION_SHOWN", {
        exchangeGroupId: "group-1",
        strategyRequested: "CURATED_ELIGIBILITY_GLOBAL_RANK",
        strategyUsed: "CURATED_ELIGIBILITY_GLOBAL_RANK",
        candidateCount: 5,
        engineShadowCandidateRefs: ["TACO:1", "TACO:2"],
      }),
      row("SUGGESTION_APPROVED", {
        exchangeGroupId: "group-1",
        approvedCount: 2,
        reviewedSuggestionCount: 2,
        reviewedCandidateRefs: ["TACO:1", "TACO:99"],
      }),
      row("SUGGESTION_REJECTED", {
        exchangeGroupId: "group-1",
        rejectedCount: 1,
        reviewedSuggestionCount: 1,
        rejectionReason: "MEAL_CONTEXT",
      }),
      row("SUGGESTION_EDITED", {
        exchangeGroupId: "group-1",
        editedCount: 1,
        reviewedSuggestionCount: 1,
      }),
      row("ALTERNATIVES_REGENERATED", {
        exchangeGroupId: "group-2",
        strategyRequested: "CURATED_ELIGIBILITY_GLOBAL_RANK",
        strategyUsed: "ENGINE_ONLY",
        fallback: true,
        fallbackCategory: "NO_CURATED_LIST",
        candidateCount: 4,
      }),
      row("SUGGESTION_REPLACED_MANUALLY", {
        exchangeGroupId: "group-2",
        manuallyAddedCount: 1,
      }),
    ]);

    expect(metrics.itemsGenerated).toBe(2);
    expect(metrics.itemsReviewed).toBe(2);
    expect(metrics.usefulSuggestionRate).toBe(0.75);
    expect(metrics.approvalRate).toBe(0.5);
    expect(metrics.rejectionRate).toBe(0.25);
    expect(metrics.manualInterventionRate).toBe(1);
    expect(metrics.firstPassAcceptanceRate).toBe(0.5);
    expect(metrics.fallbackRate).toBe(0.5);
    expect(metrics.pilotOnlyApproved).toBe(1);
    expect(metrics.fallbackByCategory.NO_CURATED_LIST).toBe(1);
    expect(metrics.rejectedByReason.MEAL_CONTEXT).toBe(1);
  });
});
