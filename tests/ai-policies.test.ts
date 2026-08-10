import { describe, expect, it } from "vitest";
import { assertNeverAutoAppliesClinical, canAutoExecute, requiresConfirmation } from "../lib/ai/policies/action-policy";
import { evaluateAutonomy } from "../lib/ai/policies/autonomy-policy";
import { getToolDefinition, getToolRisk, listRegisteredTools } from "../lib/ai/tools/registry";

describe("action-policy risk rules", () => {
  it("read and low risk auto-execute without confirmation", () => {
    expect(canAutoExecute("read")).toBe(true);
    expect(canAutoExecute("low")).toBe(true);
    expect(requiresConfirmation("read")).toBe(false);
    expect(requiresConfirmation("low")).toBe(false);
  });

  it("sensitive and clinical never auto-execute and always require confirmation", () => {
    expect(canAutoExecute("sensitive")).toBe(false);
    expect(canAutoExecute("clinical")).toBe(false);
    expect(requiresConfirmation("sensitive")).toBe(true);
    expect(requiresConfirmation("clinical")).toBe(true);
  });

  it("throws if a clinical action is ever marked as auto-applied (defensive invariant)", () => {
    expect(() => assertNeverAutoAppliesClinical("clinical", true)).toThrow();
    expect(() => assertNeverAutoAppliesClinical("clinical", false)).not.toThrow();
    expect(() => assertNeverAutoAppliesClinical("sensitive", true)).not.toThrow();
  });
});

describe("tool registry risk classification", () => {
  it("every registered sensitive/clinical tool requires confirmation via the central policy", () => {
    const tools = listRegisteredTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      const decision = evaluateAutonomy(tool.risk);
      if (tool.risk === "clinical" || tool.risk === "sensitive") {
        expect(decision.requiresConfirmation).toBe(true);
        expect(decision.autoExecuted).toBe(false);
      } else {
        expect(decision.requiresConfirmation).toBe(false);
        expect(decision.autoExecuted).toBe(true);
      }
    }
  });

  it("classifies clinical tools correctly (prontuario, pre-analise, protocolo)", () => {
    expect(getToolRisk("proposeNutritionRecordUpdate")).toBe("clinical");
    expect(getToolRisk("proposePreAnalysisUpdate")).toBe("clinical");
    expect(getToolRisk("proposeClientProtocolNotes")).toBe("clinical");
  });

  it("classifies read tools (leitura, sem confirmacao) correctly", () => {
    expect(getToolRisk("findClient")).toBe("read");
    expect(getToolRisk("getSystemOverview")).toBe("read");
    expect(getToolRisk("listOpportunities")).toBe("read");
  });

  it("classifies navigation as low risk (automatico, mas nao read puro)", () => {
    expect(getToolRisk("navigateInSystem")).toBe("low");
  });

  it("access to a client that does not exist yields no tool definition side effects (unknown tool name)", () => {
    expect(getToolDefinition("nonexistent-tool")).toBeUndefined();
    expect(getToolRisk("nonexistent-tool")).toBeUndefined();
  });
});
