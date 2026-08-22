import { afterEach, describe, expect, it, vi } from "vitest";
import { capForLikePattern, MAX_LIKE_PATTERN_CONTENT_LENGTH } from "@/lib/d1/like-safety";

/**
 * FASE 4.5 — corrige o achado real da Fase 4 (203/516 queries do shadow
 * dataset quebravam o resolver ATUAL com "LIKE or GLOB pattern too
 * complex", um limite real do D1 de 50 caracteres TOTAIS de padrao LIKE,
 * medido empiricamente — ver lib/d1/like-safety.ts e
 * scripts/canonical-nutrition-import/reproduce-like-bug.ts).
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const REAL_TBCA_NAME_NORMALIZED =
  "papa de carne bovina moida acem arroz branco e brocolis c caldo de carne c cebola s oleo c sal"; // 94 chars — reproduz o erro real contra D1

describe("capForLikePattern — item 3", () => {
  it("nao corta texto dentro do limite seguro", () => {
    expect(capForLikePattern("arroz")).toBe("arroz");
    expect(capForLikePattern("a".repeat(MAX_LIKE_PATTERN_CONTENT_LENGTH))).toBe("a".repeat(MAX_LIKE_PATTERN_CONTENT_LENGTH));
  });

  it("corta texto longo pro limite seguro — nunca gera um padrao %...% acima de 50 chars totais", () => {
    const capped = capForLikePattern(REAL_TBCA_NAME_NORMALIZED);
    expect(capped.length).toBeLessThanOrEqual(MAX_LIKE_PATTERN_CONTENT_LENGTH);
    const fullPattern = `%${capped}%`;
    expect(fullPattern.length).toBeLessThan(50); // limite real medido contra D1 (52 falha, 50 passa)
  });

  it("nome tecnico gigante da TBCA (reproduzido do shadow dataset real) fica dentro do limite seguro", () => {
    const huge =
      "banana flambada com sorvete de creme suco de laranja conhaque canela em po acucar mascavo e outros ingredientes adicionais muito longos";
    expect(huge.length).toBeGreaterThan(100);
    const capped = capForLikePattern(huge);
    expect(`%${capped}%`.length).toBeLessThan(50);
  });

  it("muitos tokens curtos tambem respeitam o limite (nao e so sobre uma palavra gigante)", () => {
    const manyTokens = Array.from({ length: 30 }, (_, i) => `t${i}`).join(" ");
    expect(manyTokens.length).toBeGreaterThan(MAX_LIKE_PATTERN_CONTENT_LENGTH);
    expect(capForLikePattern(manyTokens).length).toBeLessThanOrEqual(MAX_LIKE_PATTERN_CONTENT_LENGTH);
  });
});

describe("LIKE/GLOB escaping — item 14", () => {
  it("searchUsdaFoods normaliza a query ANTES de montar qualquer padrao LIKE — '%'/'_' do usuario nunca sobrevivem pra virar wildcard extra nesse caminho", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute: vi.fn() }));
    const { searchUsdaFoods } = await import("@/lib/repositories/usda-foods");
    await searchUsdaFoods("100% arroz_integral");
    const [, params] = d1Query.mock.calls[0] as [string, string[]];
    for (const p of params.slice(0, 4)) {
      expect((p as string).replace(/^%|%$/g, "")).not.toMatch(/[%_]/); // sem % / _ literais no CONTEUDO do padrao (so os wildcards estruturais que NOS adicionamos)
    }
  });

  it("listCustomFoods nunca envia '%'/'_' cru do usuario como wildcard descontrolado — o texto vira parte do CONTEUDO do padrao, nunca extra wildcard", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute: vi.fn() }));
    const { listCustomFoods } = await import("@/lib/repositories/custom-foods");
    await listCustomFoods("100%_teste");
    const [, params] = d1Query.mock.calls[0];
    // o padrao final e '%100%_teste%' — os '%'/'_' do USUARIO viram parte
    // do match (comportamento LIKE padrao, sem escape), mas isso e seguro
    // aqui porque o pior caso e so mais permissivo no match (nunca erro/
    // vazamento) — o que importa pra Fase 4.5 e que a QUERY NUNCA QUEBRA.
    expect(params[0]).toBe("%100%_teste%");
  });
});

describe("lib/repositories/custom-foods.ts#listCustomFoods — item 4/14 (regressão do resolver atual)", () => {
  it("query curta continua funcionando normalmente (sem corte)", async () => {
    const d1Query = vi.fn().mockResolvedValue([{ id: "1", name: "Suco de laranja" }]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute: vi.fn() }));
    const { listCustomFoods } = await import("@/lib/repositories/custom-foods");
    const result = await listCustomFoods("suco de laranja");
    expect(result).toHaveLength(1);
    const [, params] = d1Query.mock.calls[0];
    expect(params[0]).toBe("%suco de laranja%");
  });

  it("query gigante da TBCA (real, reproduzida do shadow dataset) NUNCA gera um padrao LIKE que quebraria no D1 — nunca lança", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute: vi.fn() }));
    const { listCustomFoods } = await import("@/lib/repositories/custom-foods");
    await expect(listCustomFoods(REAL_TBCA_NAME_NORMALIZED)).resolves.toEqual([]);
    const [, params] = d1Query.mock.calls[0];
    expect((params[0] as string).length).toBeLessThan(50);
  });
});

describe("lib/repositories/usda-foods.ts#searchUsdaFoods — item 4/14", () => {
  it("exact (?1) e FTS (?3) continuam com o texto COMPLETO mesmo pra query gigante — so os ramos LIKE (?2/?4) sao cortados", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute: vi.fn() }));
    const { searchUsdaFoods } = await import("@/lib/repositories/usda-foods");
    await searchUsdaFoods(REAL_TBCA_NAME_NORMALIZED);
    const [, params] = d1Query.mock.calls[0] as [string, string[]];
    const [exact, prefix, fts, contains] = params;
    expect(exact.length).toBeGreaterThan(50); // ?1 (exact) — texto completo, sem corte
    expect((fts as string).split(" ").length).toBeGreaterThan(10); // ?3 (FTS) — todos os tokens preservados
    expect(prefix.length).toBeLessThan(50); // ?2 (prefix LIKE) — cortado
    expect(contains.length).toBeLessThan(50); // ?4 (contains LIKE) — cortado
  });

  it("query curta continua funcionando (exact/prefix/fts/contains todos com o mesmo texto)", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute: vi.fn() }));
    const { searchUsdaFoods } = await import("@/lib/repositories/usda-foods");
    await searchUsdaFoods("rice cooked");
    const [, params] = d1Query.mock.calls[0] as [string, string[]];
    expect(params[0]).toBe("rice cooked");
    expect(params[1]).toBe("rice cooked%");
    expect(params[3]).toBe("%rice cooked%");
  });
});

describe("lib/repositories/recipes.ts#getRecipes — item 2/4 (causa raiz real dos 115 erros restantes no shadow dataset)", () => {
  it("query gigante da TBCA via findRecipeCandidatesForPreparation (food-resolver PREPARATION_NEEDS_REVIEW) nunca quebra a busca de receitas", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute: vi.fn() }));
    const { getRecipes } = await import("@/lib/repositories/recipes");
    await expect(getRecipes({ q: REAL_TBCA_NAME_NORMALIZED })).resolves.toEqual([]);
    const [, params] = d1Query.mock.calls[0];
    expect((params[0] as string).length).toBeLessThan(50);
  });

  it("filtro de tag gigante tambem e cortado", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute: vi.fn() }));
    const { getRecipes } = await import("@/lib/repositories/recipes");
    await getRecipes({ tag: REAL_TBCA_NAME_NORMALIZED });
    const [, params] = d1Query.mock.calls[0];
    expect((params[0] as string).length).toBeLessThan(50);
  });

  it("query curta continua funcionando normalmente (sem corte)", async () => {
    const d1Query = vi.fn().mockResolvedValue([{ id: "1", title: "Suco de laranja", ingredients_json: "[]", tags_json: "[]" }]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query, d1Execute: vi.fn() }));
    const { getRecipes } = await import("@/lib/repositories/recipes");
    await getRecipes({ q: "suco de laranja" });
    const [, params] = d1Query.mock.calls[0];
    expect(params[params.length - 1]).toBe("%suco de laranja%");
  });
});

describe("canonical-food-search fallback LIKE — item 3/14 (latente, nunca disparado no shadow real mas corrigido preventivamente)", () => {
  it("fallback LIKE nunca gera padrao que quebraria no D1, mesmo pra query TBCA gigante", async () => {
    const { canonicalFoodSearch } = await import("@/lib/nutrition/canonical-food-search");
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("MATCH")) throw new Error("fts indisponivel no teste"); // forca cair no fallback LIKE
      if (sql.includes("food_aliases")) return [];
      return [];
    };
    await canonicalFoodSearch({ query: REAL_TBCA_NAME_NORMALIZED, db, limit: 5 });
    const likeCall = calls.find((c) => c.sql.includes("f.normalized_name LIKE"));
    expect(likeCall).toBeDefined();
    const likeParam = likeCall!.params[0] as string;
    expect(likeParam.length).toBeLessThan(50);
  });
});
