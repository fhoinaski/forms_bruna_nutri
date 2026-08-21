import { describe, expect, it } from "vitest";
import { getToolDefinition } from "@/lib/ai/tools/registry";
import { requiresConfirmation } from "@/lib/ai/policies/action-policy";

/**
 * Tool "generateMealPlanDraft" registrada para o Assistente de chat (mesma
 * função/engine do wizard "Criar com IA" — nunca uma segunda lógica). Prova
 * que ela está corretamente classificada como leitura (nunca persiste
 * sozinha, nunca exige confirmação) e que o schema estrito nunca aceita
 * campos de kcal/macro vindos da IA.
 */
describe("tool generateMealPlanDraft — registrada como leitura, nunca persiste sozinha", () => {
  it("está registrada e disponível para o perfil ADMIN", () => {
    const tool = getToolDefinition("generateMealPlanDraft");
    expect(tool).toBeDefined();
    expect(tool!.risk).toBe("read");
    expect(tool!.profiles).toContain("ADMIN_ASSISTANT");
  });

  it("risk=read nunca exige confirmação humana (mesma regra de toda tool de leitura)", () => {
    const tool = getToolDefinition("generateMealPlanDraft");
    expect(requiresConfirmation(tool!.risk)).toBe(false);
  });

  it("schema exige clientId e ao menos uma refeição solicitada — nunca gera 'no vácuo'", () => {
    const tool = getToolDefinition("generateMealPlanDraft");
    const missingClient = tool!.inputSchema.safeParse({ objectiveLabel: "Emagrecimento", requestedMeals: [{ key: "almoco" }] });
    expect(missingClient.success).toBe(false);

    const emptyMeals = tool!.inputSchema.safeParse({ clientId: "c1", objectiveLabel: "Emagrecimento", requestedMeals: [] });
    expect(emptyMeals.success).toBe(false);
  });

  it("schema estrito rejeita campo de kcal/macro injetado — a IA nunca consegue fornecer um número nutricional por esta tool", () => {
    const tool = getToolDefinition("generateMealPlanDraft");
    const withKcal = tool!.inputSchema.safeParse({
      clientId: "c1",
      objectiveLabel: "Emagrecimento",
      requestedMeals: [{ key: "almoco" }],
      targetEnergyKcal: 1800,
      kcalOverride: 999, // campo nao declarado, tentativa de contrabando
    });
    expect(withKcal.success).toBe(false);
  });

  it("aceita um input bem formado equivalente ao que o wizard envia", () => {
    const tool = getToolDefinition("generateMealPlanDraft");
    const result = tool!.inputSchema.safeParse({
      clientId: "c1",
      objectiveLabel: "Emagrecimento",
      targetEnergyKcal: 1800,
      targetProteinG: null,
      targetCarbohydrateG: null,
      targetFatG: null,
      requestedMeals: [{ key: "cafe_da_manha", suggestedTime: "07:30" }, { key: "almoco", suggestedTime: null }],
      prioritizeFoods: "arroz, feijão",
      avoidFoods: null,
      useRecipes: true,
    });
    expect(result.success).toBe(true);
  });
});
