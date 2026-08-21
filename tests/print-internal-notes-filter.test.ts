import { describe, expect, it } from "vitest";

/**
 * Replica isPatientFacingNote (não exportada de app/.../print/page.tsx —
 * server component). Prova que os textos operacionais conhecidos (IA,
 * biblioteca de receitas, boilerplate de "criar por modelo") nunca vazam
 * pro cardápio do paciente, enquanto orientações reais digitadas pelo
 * profissional continuam aparecendo.
 */
const INTERNAL_NOTE_PREFIXES = [
  "Sugerido por IA",
  "Receita da biblioteca -",
  "Modelo sugerido por IA",
  "Plano criado a partir de modelo predefinido",
];
function isPatientFacingNote(notes: string | null | undefined): notes is string {
  if (!notes || !notes.trim()) return false;
  return !INTERNAL_NOTE_PREFIXES.some((prefix) => notes.startsWith(prefix));
}

describe("filtro de notas internas no cardápio impresso", () => {
  it("bloqueia o boilerplate de 'criar por modelo' (bug real encontrado no screenshot)", () => {
    expect(isPatientFacingNote("Plano criado a partir de modelo predefinido. Revisar e personalizar antes de ativar no portal.")).toBe(false);
  });

  it("bloqueia texto de sugestão de IA", () => {
    expect(isPatientFacingNote("Sugerido por IA com base na TACO. Revisar antes de salvar.")).toBe(false);
  });

  it("bloqueia nota interna de inserção de receita", () => {
    expect(isPatientFacingNote("Receita da biblioteca - 1 porção (rendimento total: 4 porção(ões)).")).toBe(false);
  });

  it("mantém visível uma orientação real digitada pelo profissional", () => {
    expect(isPatientFacingNote("Beber pelo menos 2 litros de água por dia e mastigar bem os alimentos.")).toBe(true);
  });

  it("nota vazia ou ausente não aparece (não é 'interna', só não existe)", () => {
    expect(isPatientFacingNote(null)).toBe(false);
    expect(isPatientFacingNote(undefined)).toBe(false);
    expect(isPatientFacingNote("")).toBe(false);
    expect(isPatientFacingNote("   ")).toBe(false);
  });
});
