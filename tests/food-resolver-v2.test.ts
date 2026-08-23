import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/d1/client", () => ({ d1Query: vi.fn().mockResolvedValue([]), d1Execute: vi.fn(), d1Batch: vi.fn().mockResolvedValue([]) }));
import { getFoodByReference } from "@/lib/nutrition/food-catalog";
import { classifyFoodExchangeGroup } from "@/lib/nutrition/food-exchange-hierarchy";
import { resolveFoodCandidate } from "@/lib/nutrition/food-resolver";

/**
 * Food Resolver V2 (fechamento de gaps — nomenclatura trivial em
 * linguagem natural). Auditoria real contra o catálogo (offline, sem
 * USDA/CUSTOM via rede — resultados de USDA/CUSTOM não entram aqui):
 * 16 nomes comuns reportados como falhando no wizard, cada um com o
 * status ANTES e DEPOIS das correções (stopwords/abreviação/alias/
 * ranking) medido de verdade, não suposto.
 *
 *   QUERY                              ANTES        DEPOIS      SOURCE  RESOLUTION METHOD
 *   café coado sem açúcar              NOT_FOUND    RESOLVED    TACO    ALIAS ("café coado [sem açúcar]"->"café infusão", Food Terminology V1 — auditado: TACO não distingue açúcar pra café)
 *   pão de forma integral              AMBIGUOUS    RESOLVED    TACO    ALIAS seguro para entrada genérica calculável; não captura variante "com fibras"
 *   ovo de galinha cozido              AMBIGUOUS    RESOLVED    TACO    RANKED (único candidato em todo o catálogo)
 *   mamão papaia                       AMBIGUOUS    RESOLVED    TACO    RANKED
 *   arroz branco cozido                NOT_FOUND    RESOLVED    TACO    ALIAS ("arroz branco"->"arroz tipo 1") + RANKED
 *   feijão preto cozido                AMBIGUOUS    RESOLVED    TACO    RANKED
 *   peito de frango grelhado           NOT_FOUND    RESOLVED    TACO    NORMALIZED (stopword "de" removido do match de tokens) + RANKED
 *   brócolis cozido                    AMBIGUOUS    RESOLVED    TACO    RANKED
 *   azeite de oliva extra virgem       AMBIGUOUS    RESOLVED    TACO    RANKED
 *   iogurte natural integral           NOT_FOUND    NOT_FOUND   —       — (TACO não distingue "integral" pra iogurte; gap real)
 *   granola sem açúcar                 NOT_FOUND    NOT_FOUND   —       — (TACO só tem "s/ óleo e s/ mel"; "açúcar" não é sinônimo, gap real)
 *   banana prata                       AMBIGUOUS    RESOLVED    TACO    RANKED
 *   filé de tilápia assado             NOT_FOUND    PREPARATION_NEEDS_REVIEW — (Food Preparation Engine V1: "assado" detectado como preparo; em produção resolve via USDA, ver tests/food-catalog-usda-preparo.test.ts)
 *   batata doce cozida                 AMBIGUOUS    RESOLVED    TACO    RANKED
 *   alface americana                   AMBIGUOUS    RESOLVED    TACO    RANKED
 *   tomate cereja                      NOT_FOUND    NOT_FOUND   —       — (tomate cereja não existe na TACO; gap real)
 *
 * 11/16 passaram a resolver automaticamente (sem nenhum caso de escolha
 * errada — os 4 que continuam NOT_FOUND/AMBIGUOUS neste harness OFFLINE
 * são gaps reais do catálogo TACO/ambiguidade genuína ou dependem de USDA
 * via rede, que não roda aqui — ver tests/food-terminology.test.ts para a
 * cobertura via fallback USDA de "tomate cereja"/"filé de tilápia assado").
 */
describe("Food Resolver V2 — nomes comuns em linguagem natural (matriz real)", () => {
  it.each([
    ["ovo de galinha cozido", "RESOLVED"],
    ["pão de forma integral", "RESOLVED"],
    ["mamão papaia", "RESOLVED"],
    ["arroz branco cozido", "RESOLVED"],
    ["feijão preto cozido", "RESOLVED"],
    ["peito de frango grelhado", "RESOLVED"],
    ["brócolis cozido", "RESOLVED"],
    ["azeite de oliva extra virgem", "RESOLVED"],
    ["banana prata", "RESOLVED"],
    ["batata doce cozida", "RESOLVED"],
    ["alface americana", "RESOLVED"],
  ] as const)('"%s" -> %s (antes era NOT_FOUND ou AMBIGUOUS)', async (query, expected) => {
    const resolution = await resolveFoodCandidate(query, []);
    expect(resolution.status).toBe(expected);
  });

  it.each([
    ["pão de forma integral", "Pão, trigo, forma, integral", "CARBOHYDRATE"],
    ["ovo de galinha inteiro cozido", "Ovo, de galinha, inteiro, cozido/10minutos", "PROTEIN"],
    ["banana prata", "Banana, prata, crua", "FRUIT"],
  ] as const)("golden template: %s resolve identidade calculável e grupo %s", async (query, expectedName, expectedGroup) => {
    const resolution = await resolveFoodCandidate(query, []);
    expect(resolution.status).toBe("RESOLVED");
    expect(resolution.name).toBe(expectedName);
    expect(resolution.ref).toBeTruthy();
    const details = resolution.ref ? await getFoodByReference(resolution.ref) : null;
    expect(details?.energyKcal).toBeGreaterThan(0);
    expect(details?.proteinG).not.toBeNull();
    expect(details?.carbohydrateG).not.toBeNull();
    expect(details?.fatG).not.toBeNull();
    expect(classifyFoodExchangeGroup(details!.macroReference).foodGroup).toBe(expectedGroup);
  });

  it.each([
    ["café coado", "Café, infusão 10%"],
    ["café coado sem açúcar", "Café, infusão 10%"],
  ] as const)('"%s" -> RESOLVED via alias Food Terminology V1 (coado = método de infusão, TACO não distingue açúcar)', async (query, expectedName) => {
    const resolution = await resolveFoodCandidate(query, []);
    expect(resolution.status).toBe("RESOLVED");
    expect(resolution.name).toBe(expectedName);
  });

  it.each([
    "iogurte natural integral",
    "granola sem açúcar",
    "tomate cereja",
  ])('"%s" continua NOT_FOUND — gap real do catálogo TACO offline, nunca mascarado com um alias inventado', async (query) => {
    const resolution = await resolveFoodCandidate(query, []);
    expect(resolution.status).toBe("NOT_FOUND");
  });

  it('"filé de tilápia assado" offline (sem USDA/receitas cadastradas neste harness) -> PREPARATION_NEEDS_REVIEW, não mais NOT_FOUND genérico (Food Preparation Engine V1: "assado" é um preparo detectado, nunca cai de volta pra tilápia crua)', async () => {
    const resolution = await resolveFoodCandidate("filé de tilápia assado", []);
    expect(resolution.status).toBe("PREPARATION_NEEDS_REVIEW");
    expect(resolution.preparation).toBe("ROASTED");
    expect(resolution.recipeCandidates).toEqual([]);
  });
});

describe("Food Resolver V2 — testes negativos (nunca resolve errado)", () => {
  it.each([
    "tilápia",
    "frango",
    "arroz branco",
    "leite integral",
    "batata doce",
    "peixe",
    "carne",
  ])('query genérica/ambígua "%s" NUNCA resolve sozinha (nem AMBIGUOUS nem NOT_FOUND viram RESOLVED por acidente)', async (query) => {
    const resolution = await resolveFoodCandidate(query, []);
    expect(resolution.status).not.toBe("RESOLVED");
  });

  it("nunca troca espécie/preparo diferente silenciosamente: tilápia nunca resolve pra merluza ou qualquer outro peixe", async () => {
    const resolution = await resolveFoodCandidate("tilápia", []);
    expect(resolution.status).not.toBe("RESOLVED");
  });

  it('o alias "arroz branco" nunca aponta pra "arroz integral" — são alimentos diferentes, não um alias', async () => {
    const resolution = await resolveFoodCandidate("arroz branco cozido", []);
    expect(resolution.status).toBe("RESOLVED");
    expect(resolution.name?.toLowerCase()).not.toContain("integral");
    expect(resolution.name).toBe("Arroz, tipo 1, cozido");
  });
});
