import { describe, expect, it } from "vitest";
import { resolvePreConsultationMode } from "@/lib/clinical/pre-consultation-mode";

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
