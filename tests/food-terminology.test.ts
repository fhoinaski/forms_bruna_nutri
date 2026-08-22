import { describe, expect, it } from "vitest";
import {
  applyFoodQueryAliases,
  tokenMatchesCandidateText,
  usdaFallbackTermFor,
  usdaModifierAlternatives,
} from "@/lib/nutrition/food-terminology";

describe("applyFoodQueryAliases", () => {
  it('"arroz branco" -> "arroz tipo 1" (validado desde o Food Resolver V2)', () => {
    expect(applyFoodQueryAliases("arroz branco cozido")).toBe("arroz tipo 1 cozido");
  });

  it('"castanha-do-pará"/"castanha do pará" -> "castanha do brasil" (mesma espécie, TACO só cataloga como Brasil)', () => {
    expect(applyFoodQueryAliases("castanha-do-pará")).toBe("castanha do brasil");
    expect(applyFoodQueryAliases("castanha do pará")).toBe("castanha do brasil");
    expect(applyFoodQueryAliases("castanha do para")).toBe("castanha do brasil");
  });

  it('nunca reescreve castanha-de-caju (espécie diferente)', () => {
    expect(applyFoodQueryAliases("castanha de caju")).toBe("castanha de caju");
  });

  it('"café coado" / "café coado sem açúcar" -> "café infusão" (coado = método de infusão, TACO não distingue açúcar)', () => {
    expect(applyFoodQueryAliases("café coado")).toBe("café infusão");
    expect(applyFoodQueryAliases("café coado sem açúcar")).toBe("café infusão");
  });

  it('nunca toca "café solúvel" (produto diferente, não bate no padrão)', () => {
    expect(applyFoodQueryAliases("café solúvel sem açúcar")).toBe("café solúvel sem açúcar");
  });
});

describe("usdaFallbackTermFor", () => {
  it('reconhece "tilápia" (com acento) e devolve o termo em inglês verificado', () => {
    expect(usdaFallbackTermFor("tilápia")).toBe("tilapia");
    expect(usdaFallbackTermFor("filé de tilápia assado")).toBe("tilapia");
  });

  it("reconhece sem acento também (normalização)", () => {
    expect(usdaFallbackTermFor("tilapia")).toBe("tilapia");
  });

  it('reconhece "tomate cereja" -> "cherry tomato" (variedade ausente do TACO, presente no USDA)', () => {
    expect(usdaFallbackTermFor("tomate cereja")).toBe("cherry tomato");
  });

  it('reconhece "peito de frango" -> "chicken breast" (rede de segurança, TACO normalmente já resolve local)', () => {
    expect(usdaFallbackTermFor("peito de frango")).toBe("chicken breast");
  });

  it("nunca reconhece outros peixes — não generaliza pra 'peixe'", () => {
    expect(usdaFallbackTermFor("peixe")).toBeNull();
    expect(usdaFallbackTermFor("merluza")).toBeNull();
    expect(usdaFallbackTermFor("salmão")).toBeNull();
    expect(usdaFallbackTermFor("atum")).toBeNull();
  });

  it('nunca confunde "tomate cereja" com tomate comum', () => {
    expect(usdaFallbackTermFor("tomate")).toBeNull();
    expect(usdaFallbackTermFor("tomate salada")).toBeNull();
  });

  it("nunca reconhece alimentos não relacionados", () => {
    expect(usdaFallbackTermFor("arroz branco cozido")).toBeNull();
    expect(usdaFallbackTermFor("frango")).toBeNull();
  });
});

describe("usdaModifierAlternatives / tokenMatchesCandidateText", () => {
  it("traduz modificadores de preparo auditados", () => {
    expect(usdaModifierAlternatives("assado")).toContain("roasted");
    expect(usdaModifierAlternatives("cru")).toContain("raw");
    expect(usdaModifierAlternatives("grelhado")).toContain("grilled");
  });

  it("token sem tradução conhecida devolve lista vazia", () => {
    expect(usdaModifierAlternatives("tilapia")).toEqual([]);
  });

  it("candidato USDA: aceita tradução do modificador além do texto literal", () => {
    expect(tokenMatchesCandidateText("assado", "fish tilapia cooked dry heat", true)).toBe(true);
    expect(tokenMatchesCandidateText("cru", "fish tilapia raw", true)).toBe(true);
  });

  it("candidato NÃO-USDA: nunca aceita tradução, só substring literal (TACO já está em português)", () => {
    expect(tokenMatchesCandidateText("assado", "frango cozido", false)).toBe(false);
    expect(tokenMatchesCandidateText("assado", "frango assado", false)).toBe(true);
  });

  it('nunca deixa "assado" bater com "cru" (proibido pelo pedido, seção 11)', () => {
    expect(tokenMatchesCandidateText("assado", "fish tilapia raw", true)).toBe(false);
    expect(tokenMatchesCandidateText("cru", "fish tilapia cooked dry heat", true)).toBe(false);
  });
});
