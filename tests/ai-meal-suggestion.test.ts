import { describe, expect, it } from "vitest";
import { aiMealSuggestionOutputSchema, parseAiMealSuggestionJson } from "../lib/validators/ai-meal-suggestion";

describe("AI meal suggestion validation", () => {
  it("accepts grounded TACO and recipe items", () => {
    const parsed = aiMealSuggestionOutputSchema.parse({
      meals: [
        {
          mealName: "Cafe da manha",
          items: [
            { source: "taco", id: 1, quantity: "100", unit: "g" },
            { source: "recipe", id: "recipe-1", quantity: "1", unit: "porcao" },
          ],
          notes: "Revisar antes de aplicar.",
        },
      ],
    });

    expect(parsed.meals[0].items).toHaveLength(2);
  });

  it("rejects ungrounded items without source", () => {
    expect(() => aiMealSuggestionOutputSchema.parse({
      meals: [
        {
          mealName: "Lanche",
          items: [{ food: "banana", quantity: "1", unit: "unidade" }],
        },
      ],
    })).toThrow();
  });

  it("extracts JSON from fenced model output", () => {
    const parsed = parseAiMealSuggestionJson(`\`\`\`json
{
  "meals": [
    {
      "mealName": "Almoco",
      "items": [{ "source": "taco", "id": 42, "quantity": "120", "unit": "g" }]
    }
  ]
}
\`\`\``);

    expect(parsed.meals[0].mealName).toBe("Almoco");
    expect(parsed.meals[0].items[0]).toMatchObject({ source: "taco", id: 42 });
  });
});
