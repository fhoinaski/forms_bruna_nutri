import { describe, expect, it } from "vitest";
import { computeMealPlanReadiness } from "@/lib/ai/agents/nutrition/meal-plan-readiness";

const complete = { ageYears: 34, weightKg: "70", heightDisplay: "1,70 m", goals: "Emagrecimento", allergies: "Nenhuma conhecida", restrictions: "Nenhuma" };

describe("computeMealPlanReadiness — R5 (seções 3-6)", () => {
  it("NOT_READY quando não há antropometria nem objetivo (mesmo com idade conhecida — idade sozinha não basta)", () => {
    const result = computeMealPlanReadiness({ ageYears: 34, weightKg: null, heightDisplay: null, goals: null, allergies: null, restrictions: null });
    expect(result.status).toBe("NOT_READY");
    expect(result.reasons[0]).toBe("Faltam informações para gerar uma proposta segura.");
  });

  it("READY quando todos os dados críticos estão presentes e revisados", () => {
    const result = computeMealPlanReadiness(complete);
    expect(result.status).toBe("READY");
    expect(result.reasons).toHaveLength(0);
  });

  it("READY_WITH_REVIEW quando há idade mas falta antropometria", () => {
    const result = computeMealPlanReadiness({ ...complete, weightKg: null, heightDisplay: null });
    expect(result.status).toBe("READY_WITH_REVIEW");
    expect(result.reasons.some((r) => /antropometria/i.test(r))).toBe(true);
  });

  it("READY_WITH_REVIEW quando há antropometria mas nenhum objetivo registrado", () => {
    const result = computeMealPlanReadiness({ ...complete, goals: null });
    expect(result.status).toBe("READY_WITH_REVIEW");
    expect(result.reasons.some((r) => /objetivo/i.test(r))).toBe(true);
  });

  it("READY_WITH_REVIEW quando alergias/restrições nunca foram revisadas (null, distinto de string vazia)", () => {
    const result = computeMealPlanReadiness({ ...complete, allergies: null, restrictions: null });
    expect(result.status).toBe("READY_WITH_REVIEW");
    expect(result.reasons.some((r) => /alergias/i.test(r))).toBe(true);
    expect(result.reasons.some((r) => /restrições/i.test(r))).toBe(true);
  });

  it("trata string vazia (revisado, sem nada a registrar) como diferente de null (nunca revisado) — missing != zero", () => {
    const reviewedEmpty = computeMealPlanReadiness({ ...complete, allergies: "", restrictions: "" });
    // string vazia é falsy pra `.trim()`, mas para allergies/restrictions a
    // regra é "!== null", não "truthy" — string vazia conta como revisado.
    expect(reviewedEmpty.status).toBe("READY");
  });

  it("READY_WITH_REVIEW quando a idade não pôde ser calculada, mesmo com o resto completo", () => {
    const result = computeMealPlanReadiness({ ...complete, ageYears: null });
    expect(result.status).toBe("READY_WITH_REVIEW");
    expect(result.reasons.some((r) => /idade/i.test(r))).toBe(true);
  });

  it("presença de objetivo OU antropometria já evita NOT_READY, mesmo sem os outros dois", () => {
    const onlyGoals = computeMealPlanReadiness({ ageYears: null, weightKg: null, heightDisplay: null, goals: "Ganho de massa", allergies: null, restrictions: null });
    expect(onlyGoals.status).toBe("READY_WITH_REVIEW");
    const onlyAnthropometry = computeMealPlanReadiness({ ageYears: null, weightKg: "70", heightDisplay: "1,70 m", goals: null, allergies: null, restrictions: null });
    expect(onlyAnthropometry.status).toBe("READY_WITH_REVIEW");
  });
});
