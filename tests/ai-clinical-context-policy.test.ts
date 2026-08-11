import { describe, expect, it } from "vitest";
import {
  CONTEXT_POLICIES,
  ClinicalContextPolicyViolation,
  assertCategoryAllowed,
  filterAllowedCategories,
  isCategoryAllowed,
} from "@/lib/ai/policies/clinical-context-policy";

/**
 * ClinicalContextPolicy — minimizacao de dados por finalidade (Modo
 * Consulta / FASE 0 do hardening). Cada teste aqui protege contra um
 * agente novo incluir, por engano, uma categoria de dado fora do que a
 * finalidade permite.
 */

describe("ClinicalContextPolicy", () => {
  it("nenhuma finalidade clinica inclui contact_info ou financial", () => {
    for (const categories of Object.values(CONTEXT_POLICIES)) {
      expect(categories).not.toContain("contact_info");
      expect(categories).not.toContain("financial");
    }
  });

  it("consultation_brief permite as categorias clinicas amplas, mas nao notas privadas de exame", () => {
    expect(isCategoryAllowed("consultation_brief", "anthropometry")).toBe(true);
    expect(isCategoryAllowed("consultation_brief", "evolution")).toBe(true);
    expect(isCategoryAllowed("consultation_brief", "meal_plan")).toBe(true);
    expect(isCategoryAllowed("consultation_brief", "protocol")).toBe(true);
    expect(isCategoryAllowed("consultation_brief", "tasks")).toBe(true);
    expect(isCategoryAllowed("consultation_brief", "exams_text")).toBe(false);
    expect(isCategoryAllowed("consultation_brief", "notes_free_text")).toBe(false);
  });

  it("weight_evolution e a finalidade mais estreita — so identidade/antropometria/evolucao", () => {
    expect(CONTEXT_POLICIES.weight_evolution).toEqual(["identity", "anthropometry", "evolution"]);
    expect(isCategoryAllowed("weight_evolution", "meal_plan")).toBe(false);
    expect(isCategoryAllowed("weight_evolution", "protocol")).toBe(false);
  });

  it("notes_organization so pode ver o texto livre da nota, nunca plano/protocolo", () => {
    expect(isCategoryAllowed("notes_organization", "notes_free_text")).toBe(true);
    expect(isCategoryAllowed("notes_organization", "meal_plan")).toBe(false);
    expect(isCategoryAllowed("notes_organization", "protocol")).toBe(false);
    expect(isCategoryAllowed("notes_organization", "financial")).toBe(false);
  });

  it("assertCategoryAllowed falha fechado: lanca para combinacao nao permitida", () => {
    expect(() => assertCategoryAllowed("meal_plan_review", "financial")).toThrow(ClinicalContextPolicyViolation);
    expect(() => assertCategoryAllowed("meal_plan_review", "meal_plan")).not.toThrow();
  });

  it("categoria/finalidade inexistente nunca e permitida por omissao", () => {
    expect(isCategoryAllowed("consultation_brief" as never, "nao_existe" as never)).toBe(false);
    expect(isCategoryAllowed("finalidade_inventada" as never, "identity")).toBe(false);
  });

  it("filterAllowedCategories remove categorias fora da politica sem exigir if manual por campo", () => {
    const data = {
      identity: { name: "Maria" },
      anthropometry: { weight: 68 },
      contact_info: { phone: "48999999999" },
      financial: { balance: 100 },
    };
    const filtered = filterAllowedCategories("weight_evolution", data);
    expect(filtered).toEqual({ identity: { name: "Maria" }, anthropometry: { weight: 68 } });
    expect(filtered).not.toHaveProperty("contact_info");
    expect(filtered).not.toHaveProperty("financial");
  });
});
