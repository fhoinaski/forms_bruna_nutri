import { describe, expect, it } from "vitest";
import { suggestEducationCardsFromDiagnoses } from "@/lib/clinical/patient-education-suggestions";

describe("suggestEducationCardsFromDiagnoses", () => {
  it("matches pathology cards from diagnosis text", () => {
    expect(suggestEducationCardsFromDiagnoses("DM2; hipertensao arterial")).toEqual([
      { slug: "diabetes-tipo-2", keywords: ["dm2"] },
      { slug: "hipertensao-arterial", keywords: ["hipertensao arterial"] },
    ]);
  });

  it("ignores family history and negated contexts", () => {
    expect(suggestEducationCardsFromDiagnoses("Historico familiar de diabetes. Nega hipertensao. Gastrite em acompanhamento.")).toEqual([
      { slug: "refluxo-gastroesofagico-e-gastrite", keywords: ["gastrite"] },
    ]);
  });
});
