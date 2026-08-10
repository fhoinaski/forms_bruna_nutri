import { beforeEach, describe, expect, it, vi } from "vitest";
import { suggestMealWithAI } from "../lib/ai/agents/nutrition/meal-suggestion-agent";
import { generate } from "../lib/ai/gateway/ai-gateway";

vi.mock("@/lib/repositories/ai-settings", () => ({
  getAISettings: vi.fn(async () => ({
    id: "default",
    provider: "openai",
    api_key: "test-key",
    model: "gpt-4o-mini",
    protocol_system_prompt: null,
    chat_system_prompt: null,
    updated_at: "2026-08-10T00:00:00.000Z",
  })),
  DEFAULT_MEAL_SUGGESTION_SYSTEM_PROMPT: "meal prompt",
}));

vi.mock("@/lib/ai/gateway/ai-gateway", () => ({
  generate: vi.fn(),
}));

vi.mock("@/lib/repositories/recipes", () => ({
  getRecipeById: vi.fn(async () => null),
  getRecipes: vi.fn(async () => []),
}));

describe("meal suggestion agent", () => {
  beforeEach(() => {
    vi.mocked(generate).mockReset();
  });

  it("uses the central AI gateway and resolves only real TACO ids", async () => {
    vi.mocked(generate).mockResolvedValueOnce({
      text: JSON.stringify({
        meals: [{
          mealName: "Almoco",
          items: [{ source: "taco", id: 4, quantity: "100", unit: "g" }],
          notes: "Sugestao revisavel.",
        }],
      }),
    } as Awaited<ReturnType<typeof generate>>);

    const result = await suggestMealWithAI({
      context: "meal",
      targetGroup: "EMAGRECIMENTO",
      mealName: "Almoco",
      instructions: "simples",
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generate).mock.calls[0][0].agent).toBe("meal-suggestion");
    expect(result.aiModel).toBe("openai:gpt-4o-mini");
    expect(result.resolvedMeals[0].items[0]).toMatchObject({
      source: "taco",
      taco_number: 4,
      ai_suggested: true,
    });
  });

  it("rejects malformed or ungrounded provider output before returning a proposal", async () => {
    vi.mocked(generate).mockResolvedValueOnce({
      text: JSON.stringify({
        meals: [{
          mealName: "Almoco",
          items: [{ source: "taco", id: 999999, quantity: "100", unit: "g" }],
        }],
      }),
    } as Awaited<ReturnType<typeof generate>>);

    await expect(suggestMealWithAI({ context: "meal", mealName: "Almoco" }))
      .rejects
      .toThrow(/TACO invalido/);
  });
});
