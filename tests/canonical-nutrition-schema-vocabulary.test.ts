import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NUTRIENT_DEFINITIONS } from "@/lib/nutrition/nutrient-vocabulary";

/**
 * Trava a promessa central da Fase 1: nutrient_code no schema D1 e um
 * PONTEIRO para o vocabulario existente, nunca um segundo vocabulario. Se
 * alguem adicionar um NutrientCode novo em nutrient-vocabulary.ts e
 * esquecer de atualizar o CHECK da migration (ou vice-versa), este teste
 * quebra imediatamente em vez de deixar os dois divergirem em silencio.
 */
describe("canonical_nutrition_foundation migration — CHECK de nutrient_code espelha o vocabulario", () => {
  it("todos os NutrientCode do vocabulario aparecem no CHECK da migration, e nada alem deles", () => {
    const migrationPath = resolve("db/20260822_0055_canonical_nutrition_foundation.sql");
    const sql = readFileSync(migrationPath, "utf8");
    const checkBlocks = Array.from(sql.matchAll(/nutrient_code IS NULL OR nutrient_code IN \(([\s\S]*?)\)\)/g));
    expect(checkBlocks.length).toBe(2); // food_nutrient_values + nutrient_statistics
    const codesInVocabulary = new Set(NUTRIENT_DEFINITIONS.map((d) => d.code));

    for (const block of checkBlocks) {
      const codesInSql = new Set(Array.from(block[1].matchAll(/'([A-Z0-9_]+)'/g)).map((m) => m[1]));
      expect(codesInSql).toEqual(codesInVocabulary);
    }
  });
});
