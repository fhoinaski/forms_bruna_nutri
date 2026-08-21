import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Resolução rigorosa de alimento — prova que "primeiro resultado" nunca é
 * aceito cegamente. Só resolve automaticamente com confiança inequívoca
 * (exato/alias, ou prefixo sem concorrente igualmente bom); qualquer
 * ambiguidade real (ex.: "frango" batendo em vários cortes) fica AMBIGUOUS
 * para revisão humana, nunca "tilápia" virando "merluza" por estar em
 * primeiro no ranking.
 */

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

function ref(sourceId: string) {
  return { source: "TACO" as const, sourceId };
}

describe("resolveFoodCandidate — classificação de confiança", () => {
  it("match exato (matchRank 0) resolve automaticamente mesmo com outros resultados no mesmo rank", async () => {
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([
        { ref: ref("1"), name: "Arroz, integral, cozido", sourceLabel: "TACO", matchRank: 0 },
        { ref: ref("2"), name: "Arroz, integral, cru", sourceLabel: "TACO", matchRank: 2 },
      ]),
      getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 1, descricao: "Arroz, integral, cozido", energia_kcal: 123, proteina_g: 2, carboidrato_g: 25, lipidios_g: 1 } }),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));
    const { resolveFoodCandidate } = await import("@/lib/nutrition/food-resolver");
    const result = await resolveFoodCandidate("Arroz, integral, cozido", []);
    expect(result.status).toBe("RESOLVED");
    expect(result.ref?.sourceId).toBe("1");
  });

  it("dois candidatos empatados em prefixo (rank 2) — 'frango' batendo em peito E coxa — fica AMBIGUOUS, nunca escolhe um sozinho", async () => {
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([
        { ref: ref("10"), name: "Frango, peito, sem pele, cru", sourceLabel: "TACO", matchRank: 2 },
        { ref: ref("11"), name: "Frango, coxa, com pele, crua", sourceLabel: "TACO", matchRank: 2 },
      ]),
      getFoodByReference: vi.fn(),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn() }));
    const { resolveFoodCandidate } = await import("@/lib/nutrition/food-resolver");
    const result = await resolveFoodCandidate("frango", []);
    expect(result.status).toBe("AMBIGUOUS");
    expect(result.ref).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  it("prefixo único sem concorrente no mesmo nível resolve automaticamente", async () => {
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([
        { ref: ref("20"), name: "Peito de frango grelhado", sourceLabel: "TACO", matchRank: 2 },
        { ref: ref("21"), name: "Outro alimento qualquer", sourceLabel: "TACO", matchRank: 4 },
      ]),
      getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 20, descricao: "Peito de frango grelhado", energia_kcal: 159, proteina_g: 32, carboidrato_g: 0, lipidios_g: 3 } }),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));
    const { resolveFoodCandidate } = await import("@/lib/nutrition/food-resolver");
    const result = await resolveFoodCandidate("peito de frango grelhado", []);
    expect(result.status).toBe("RESOLVED");
    expect(result.ref?.sourceId).toBe("20");
  });

  it("match por 'contém'/tokens (rank 3+) com MAIS DE UM candidato nunca resolve sozinho — ambiguidade real fica pra revisão humana", async () => {
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([
        { ref: ref("30"), name: "Peixe, tilápia, filé, cru", sourceLabel: "TACO", matchRank: 3 },
        { ref: ref("31"), name: "Peixe, tilápia, filé, assado", sourceLabel: "TACO", matchRank: 3 },
      ]),
      getFoodByReference: vi.fn(),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn() }));
    const { resolveFoodCandidate } = await import("@/lib/nutrition/food-resolver");
    const result = await resolveFoodCandidate("tilápia", []);
    expect(result.status).toBe("AMBIGUOUS");
    expect(result.ref).toBeNull();
  });

  // Food Resolver V2: um candidato ÚNICO em rank 3+ (nada mais no catálogo
  // INTEIRO bate, nem parcialmente) agora resolve automaticamente — "não há
  // absolutamente mais nada parecido" é sinal forte, não fraco (seção 5 do
  // pedido V5). Isso NUNCA reabre o risco "tilápia -> merluza": rank 3/4 só
  // existe quando a query é literalmente um substring/todos os tokens do
  // texto do candidato (scoreText, food-catalog.ts) — "tilápia" nunca
  // poderia gerar rank>=3 contra "Merluza, filé, cru" de verdade (o teste
  // antigo simulava um cenário que o algoritmo real nunca produz). A prova
  // real, contra o catálogo de verdade, está em
  // tests/food-resolver-v2.test.ts ("tilápia" -> NOT_FOUND, nunca RESOLVED).
  it("match por 'contém'/tokens (rank 3+) resolve quando é o ÚNICO candidato em todo o catálogo — nunca dois ou mais", async () => {
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([
        { ref: ref("32"), name: "Peixe, tilápia, filé, assado", sourceLabel: "TACO", matchRank: 4 },
      ]),
      getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 32, descricao: "Peixe, tilápia, filé, assado", energia_kcal: 130, proteina_g: 26, carboidrato_g: 0, lipidios_g: 3 } }),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));
    const { resolveFoodCandidate } = await import("@/lib/nutrition/food-resolver");
    const result = await resolveFoodCandidate("tilápia assada", []);
    expect(result.status).toBe("RESOLVED");
    expect(result.ref?.sourceId).toBe("32");
  });

  it("nenhum resultado -> NOT_FOUND, nunca inventa um vínculo", async () => {
    vi.doMock("@/lib/nutrition/food-catalog", () => ({ searchFoods: vi.fn().mockResolvedValue([]), getFoodByReference: vi.fn() }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn() }));
    const { resolveFoodCandidate } = await import("@/lib/nutrition/food-resolver");
    const result = await resolveFoodCandidate("alimento inexistente xyz", []);
    expect(result.status).toBe("NOT_FOUND");
  });

  it("conflito de segurança clínica -> CLINICAL_CONFLICT, mesmo com match exato", async () => {
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([{ ref: ref("40"), name: "Amendoim torrado", sourceLabel: "TACO", matchRank: 0 }]),
      getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 40, descricao: "Amendoim torrado", energia_kcal: 500, proteina_g: 20, carboidrato_g: 20, lipidios_g: 40 } }),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "conflict", conflicts: [] }) }));
    const { resolveFoodCandidate } = await import("@/lib/nutrition/food-resolver");
    const result = await resolveFoodCandidate("Amendoim torrado", []);
    expect(result.status).toBe("CLINICAL_CONFLICT");
    expect(result.ref).not.toBeNull(); // identidade preservada pra a UI mostrar QUAL alimento entrou em conflito
  });

  it("segurança clínica desconhecida -> CLINICAL_UNKNOWN", async () => {
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods: vi.fn().mockResolvedValue([{ ref: ref("50"), name: "Alimento sem perfil clínico", sourceLabel: "Personalizado", matchRank: 0 }]),
      getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "custom", numero: "50", descricao: "Alimento sem perfil clínico", energia_kcal: 100, proteina_g: 1, carboidrato_g: 1, lipidios_g: 1 } }),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "unknown", reasons: [] }) }));
    const { resolveFoodCandidate } = await import("@/lib/nutrition/food-resolver");
    const result = await resolveFoodCandidate("alimento sem perfil clínico", []);
    expect(result.status).toBe("CLINICAL_UNKNOWN");
  });
});

describe("toDisplayFoodName — nome amigável nunca altera identidade técnica", () => {
  it("reordena o formato típico da TACO removendo vírgulas de listagem", async () => {
    const { toDisplayFoodName } = await import("@/lib/nutrition/food-resolver");
    expect(toDisplayFoodName("Pão, trigo, forma, integral")).toBe("Pão trigo forma integral");
  });

  it("nome sem vírgula permanece igual", async () => {
    const { toDisplayFoodName } = await import("@/lib/nutrition/food-resolver");
    expect(toDisplayFoodName("Arroz")).toBe("Arroz");
  });
});

describe("resolveFoodCandidates — cache por query dentro da mesma chamada", () => {
  it("a mesma query pedida duas vezes só busca no catálogo uma vez", async () => {
    const searchFoods = vi.fn().mockResolvedValue([{ ref: ref("1"), name: "Arroz, integral, cozido", sourceLabel: "TACO", matchRank: 0 }]);
    vi.doMock("@/lib/nutrition/food-catalog", () => ({
      searchFoods,
      getFoodByReference: vi.fn().mockResolvedValue({ macroReference: { fonte: "taco", numero: 1, descricao: "Arroz, integral, cozido", energia_kcal: 123, proteina_g: 2, carboidrato_g: 25, lipidios_g: 1 } }),
    }));
    vi.doMock("@/lib/clinical/food-safety", () => ({ checkFoodAgainstPatientRestrictions: vi.fn().mockReturnValue({ status: "compatible", checks: [] }) }));
    const { resolveFoodCandidates } = await import("@/lib/nutrition/food-resolver");
    const results = await resolveFoodCandidates([
      { query: "Arroz, integral, cozido", key: "meal-0:item-0" },
      { query: "arroz, integral, cozido", key: "meal-1:item-0" }, // mesma query, capitalização diferente
    ], []);
    expect(searchFoods).toHaveBeenCalledTimes(1);
    expect(results.get("meal-0:item-0")?.status).toBe("RESOLVED");
    expect(results.get("meal-1:item-0")?.status).toBe("RESOLVED");
  });
});
