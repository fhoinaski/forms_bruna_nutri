import { describe, expect, it } from "vitest";
import { LegacyFormSchema } from "@/lib/validators/submission";
import { IntakeTurnSchema } from "@/lib/ai/agents/patient/intake/intake-schema";

describe("IntakeTurnSchema — structured output", () => {
  it("aceita um turno answered válido", () => {
    const parsed = IntakeTurnSchema.safeParse({
      assistantMessage: "Anotado!",
      field: "objetivo",
      outcome: "answered",
      normalizedValue: "Emagrecimento",
      confidence: "high",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejeita outcome desconhecido", () => {
    const parsed = IntakeTurnSchema.safeParse({
      assistantMessage: "x",
      field: "objetivo",
      outcome: "decidir_diagnostico",
      confidence: "high",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejeita campos extras (strict)", () => {
    const parsed = IntakeTurnSchema.safeParse({
      assistantMessage: "x",
      field: "objetivo",
      outcome: "answered",
      confidence: "high",
      clientId: "123",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("LegacyFormSchema — contrato canônico da submissão", () => {
  it("aceita DTO vindo do intake (respostas planas)", () => {
    const parsed = LegacyFormSchema.safeParse({
      nome: "Maria",
      whatsapp: "(48) 99999-9999",
      email: "maria@example.com",
      privacyAccepted: true,
      companyWebsite: "",
      tipoAtendimento: "Emagrecimento",
      objetivo: "Rotina mais leve",
    });
    expect(parsed.success).toBe(true);
  });

  it("exige child_name/child_age no perfil pediátrico", () => {
    const parsed = LegacyFormSchema.safeParse({
      nome: "Maria",
      whatsapp: "(48) 99999-9999",
      email: "maria@example.com",
      privacyAccepted: true,
      companyWebsite: "",
      tipoAtendimento: "Infantil",
    });
    expect(parsed.success).toBe(false);
    const childKeys = parsed.success ? [] : parsed.error.issues.map((i) => i.path[0]);
    expect(childKeys).toContain("child_name");
    expect(childKeys).toContain("child_age");
  });

  it("não exige child_name/child_age no perfil adulto", () => {
    const parsed = LegacyFormSchema.safeParse({
      nome: "Maria",
      whatsapp: "(48) 99999-9999",
      email: "maria@example.com",
      privacyAccepted: true,
      companyWebsite: "",
      tipoAtendimento: "Emagrecimento",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejeita privacyAccepted diferente de true", () => {
    const parsed = LegacyFormSchema.safeParse({
      nome: "Maria",
      whatsapp: "(48) 99999-9999",
      email: "maria@example.com",
      privacyAccepted: false,
      companyWebsite: "",
    });
    expect(parsed.success).toBe(false);
  });
});