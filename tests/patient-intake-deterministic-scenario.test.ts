import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  delete process.env.E2E_TEST_MODE;
  delete process.env.INTAKE_AI_TEST_PROVIDER;
});

describe("resolveDeterministicScenario — sem backdoor em produção", () => {
  it("retorna normal fora do ambiente E2E (marcadores inertes)", async () => {
    const { resolveDeterministicScenario } = await import("@/lib/ai/agents/patient/intake/intake-agent");
    expect(resolveDeterministicScenario("__TEST_INTAKE_ALWAYS_INVALID__")).toBe("normal");
    expect(resolveDeterministicScenario("__TEST_INTAKE_UNEXPECTED__")).toBe("normal");
    expect(resolveDeterministicScenario("__TEST_INTAKE_FAIL__")).toBe("normal");
    expect(resolveDeterministicScenario("__TEST_INTAKE_INVALID_ONCE__")).toBe("normal");
  });

  it("classifica os cenários quando E2E está ativo", async () => {
    process.env.E2E_TEST_MODE = "1";
    process.env.INTAKE_AI_TEST_PROVIDER = "deterministic";
    const { resolveDeterministicScenario } = await import("@/lib/ai/agents/patient/intake/intake-agent");
    expect(resolveDeterministicScenario("mensagem comum")).toBe("normal");
    expect(resolveDeterministicScenario("__TEST_INTAKE_INVALID_ONCE__")).toBe("invalid_once_then_valid");
    expect(resolveDeterministicScenario("__TEST_INTAKE_INVALID_TWICE__")).toBe("invalid_twice_then_valid");
    expect(resolveDeterministicScenario("__TEST_INTAKE_ALWAYS_INVALID__")).toBe("always_invalid");
    expect(resolveDeterministicScenario("__TEST_INTAKE_FAIL__")).toBe("provider_error");
    expect(resolveDeterministicScenario("__TEST_INTAKE_UNEXPECTED__")).toBe("unexpected_error");
  });
});
