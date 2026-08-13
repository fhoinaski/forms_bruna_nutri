import { describe, expect, it } from "vitest";
import { getTopicDefinition } from "@/lib/ai/agents/patient/intake/intake-topics";
import { getNextInteraction, getTopicCoverage } from "@/lib/ai/agents/patient/intake/intake-flow";
import { createInitialState } from "@/lib/ai/agents/patient/intake/intake-rules";

describe("intake-flow — coverage de tópicos", () => {
  it("expectations não completa sem privacyAccepted (obrigatório canônico)", () => {
    const topic = getTopicDefinition("expectations")!;
    const state = createInitialState("s1");
    state.answers = { expectativas: "Melhorar minha rotina" };

    const coverage = getTopicCoverage(state, topic);
    expect(coverage.requiredMissing).toContain("privacyAccepted");
    expect(coverage.complete).toBe(false);
  });

  it("o próximo passo após responder expectativas é o aceite de privacidade", () => {
    const state = createInitialState("s1");
    state.answers = { expectativas: "Melhorar minha rotina" };
    state.currentTopic = "expectations";

    const next = getNextInteraction(state);
    expect(next.reviewReady).toBe(false);
    expect(next.interaction?.stepKey).toBe("privacidade");
  });

  it("com privacyAccepted aceito, expectations completa", () => {
    const topic = getTopicDefinition("expectations")!;
    const state = createInitialState("s1");
    state.answers = { expectativas: "Melhorar minha rotina", privacyAccepted: true };

    const coverage = getTopicCoverage(state, topic);
    expect(coverage.complete).toBe(true);
  });
});