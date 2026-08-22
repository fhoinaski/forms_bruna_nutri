import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/d1/client", () => ({ d1Query: vi.fn().mockResolvedValue([]), d1Execute: vi.fn(), d1Batch: vi.fn().mockResolvedValue([]) }));

/**
 * Prova fim-a-fim (via searchFoods real, não só a função de tradução
 * isolada) de que "filé de tilápia assado" — frase composta que ficou
 * documentada como limitação conhecida na rodada anterior (USDA fallback só
 * ajudava a query BARE "tilápia", nunca uma frase com método de preparo) —
 * agora resolve, graças à tradução auditada de modificador de preparo
 * (Food Terminology V1, seção 5). Os dois registros aqui são exatamente os
 * verificados manualmente contra o catálogo USDA real na auditoria
 * anterior ("Fish, tilapia, raw" e "Fish, tilapia, cooked, dry heat") —
 * nunca inventados.
 */
// vi.mock é hoisted acima dos imports — os dados de fixture precisam viver
// DENTRO do factory (nunca em const de módulo referenciada de fora), senão
// caem em temporal-dead-zone no momento em que o mock é avaliado.
vi.mock("@/lib/repositories/usda-foods", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/usda-foods")>("@/lib/repositories/usda-foods");
  const base = {
    id: "usda-tilapia-raw",
    source: "USDA" as const,
    source_id: "15228",
    upstream_source: "USDA_SR_LEGACY" as const,
    upstream_source_id: "15228",
    original_name: "Fish, tilapia, raw",
    normalized_name: "fish tilapia raw",
    food_group: "Finfish and Shellfish Products",
    data_quality: null,
    source_url: null,
    source_version: null,
    import_run_id: null,
    created_at: "",
    energy_kcal: 96,
    protein_g: 20.1,
    carbohydrate_g: 0,
    fat_g: 1.7,
    fiber_g: 0,
  };
  const tilapiaRaw = base;
  const tilapiaCookedDryHeat = {
    ...base,
    id: "usda-tilapia-cooked",
    source_id: "15229",
    original_name: "Fish, tilapia, cooked, dry heat",
    normalized_name: "fish tilapia cooked dry heat",
    energy_kcal: 128,
    protein_g: 26.2,
    fat_g: 2.7,
  };
  return {
    ...actual,
    // "filé de tilápia assado" (a query original, em português) nunca bate
    // no full-text em inglês — só o termo de fallback ("tilapia") retorna
    // algo, exatamente como no catálogo USDA real.
    searchUsdaFoods: vi.fn(async (query: string) => (query === "tilapia" ? [tilapiaRaw, tilapiaCookedDryHeat] : [])),
  };
});

import { searchFoods } from "@/lib/nutrition/food-catalog";
import { resolveFoodCandidate } from "@/lib/nutrition/food-resolver";

describe("USDA fallback + tradução de preparo (Food Terminology V1, seção 5)", () => {
  it('"filé de tilápia assado" agora encontra "Fish, tilapia, cooked, dry heat" via tradução auditada de preparo', async () => {
    const results = await searchFoods({ query: "filé de tilápia assado" });
    const names = results.map((r) => r.name);
    expect(names).toContain("Fish, tilapia, cooked, dry heat");
  });

  it('"filé de tilápia cru" prefere a raw, nunca a cooked (nunca "assado" bate com "cru" ou vice-versa)', async () => {
    const results = await searchFoods({ query: "filé de tilápia cru" });
    const names = results.map((r) => r.name);
    expect(names).toContain("Fish, tilapia, raw");
    expect(names).not.toContain("Fish, tilapia, cooked, dry heat");
  });

  it('resolveFoodCandidate: "filé de tilápia assado" -> RESOLVED (só um candidato bate no preparo pedido)', async () => {
    const resolution = await resolveFoodCandidate("filé de tilápia assado", []);
    expect(resolution.status).toBe("RESOLVED");
    expect(resolution.name).toBe("Fish, tilapia, cooked, dry heat");
  });

  it('bare "tilápia" (sem preparo) continua AMBIGUOUS — dois candidatos reais, nenhum escolhido sozinho', async () => {
    const resolution = await resolveFoodCandidate("tilápia", []);
    expect(resolution.status).toBe("AMBIGUOUS");
    expect(resolution.candidates.length).toBe(2);
  });
});
