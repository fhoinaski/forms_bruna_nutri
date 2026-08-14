import { afterEach, describe, expect, it } from "vitest";
import { readE2EIntakeModeOverride, resolvePreConsultationMode } from "@/lib/clinical/pre-consultation-mode";

describe("resolvePreConsultationMode — regra configuredMode → effectiveMode", () => {
  it("traditional + IA disponível → traditional", () => {
    expect(resolvePreConsultationMode("traditional", true)).toEqual({
      configuredMode: "traditional",
      effectiveMode: "traditional",
      aiAvailable: true,
      reason: undefined,
    });
  });

  it("traditional + IA indisponível → traditional", () => {
    expect(resolvePreConsultationMode("traditional", false)).toEqual({
      configuredMode: "traditional",
      effectiveMode: "traditional",
      aiAvailable: false,
      reason: undefined,
    });
  });

  it("smart + IA disponível → smart", () => {
    expect(resolvePreConsultationMode("smart", true)).toEqual({
      configuredMode: "smart",
      effectiveMode: "smart",
      aiAvailable: true,
      reason: undefined,
    });
  });

  it("smart + IA indisponível → traditional (com motivo)", () => {
    expect(resolvePreConsultationMode("smart", false)).toEqual({
      configuredMode: "smart",
      effectiveMode: "traditional",
      aiAvailable: false,
      reason: "ai_unavailable",
    });
  });
});

describe("readE2EIntakeModeOverride — override por header (só sob E2E_TEST_MODE=1)", () => {
  const original = process.env.E2E_TEST_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.E2E_TEST_MODE;
    else process.env.E2E_TEST_MODE = original;
  });

  it("ignora o header fora de E2E_TEST_MODE (sem backdoor em produção)", () => {
    delete process.env.E2E_TEST_MODE;
    expect(readE2EIntakeModeOverride({ get: () => "traditional" })).toBeUndefined();
    expect(readE2EIntakeModeOverride({ get: () => "smart" })).toBeUndefined();
  });

  it("retorna o valor válido do header sob E2E_TEST_MODE=1", () => {
    process.env.E2E_TEST_MODE = "1";
    expect(readE2EIntakeModeOverride({ get: () => "traditional" })).toBe("traditional");
    expect(readE2EIntakeModeOverride({ get: () => "smart" })).toBe("smart");
  });

  it("ignora valores fora do enum e header ausente", () => {
    process.env.E2E_TEST_MODE = "1";
    expect(readE2EIntakeModeOverride({ get: () => "bogus" })).toBeUndefined();
    expect(readE2EIntakeModeOverride({ get: () => null })).toBeUndefined();
    expect(readE2EIntakeModeOverride(undefined)).toBeUndefined();
  });
});
