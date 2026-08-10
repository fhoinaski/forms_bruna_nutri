import { describe, expect, it } from "vitest";
import { buildToolSet, getToolDefinition } from "../lib/ai/tools/registry";

describe("tool registry input validation", () => {
  it("rejects invalid input for a propose tool before execute would ever run", () => {
    const tool = getToolDefinition("proposeNewAppointment");
    expect(tool).toBeDefined();
    const result = tool!.inputSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed proposeNewAppointment input", () => {
    const tool = getToolDefinition("proposeNewAppointment");
    const result = tool!.inputSchema.safeParse({
      title: "Retorno",
      appointment_type: "retorno",
      starts_at_display: "20/08/2026 15:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects extra/unknown fields on strict schemas (no smuggling extra data through a tool call)", () => {
    const tool = getToolDefinition("proposeNewClient");
    const result = tool!.inputSchema.safeParse({ name: "Maria", isAdmin: true });
    expect(result.success).toBe(false);
  });

  it("an unknown or privileged tool name never resolves to a definition", () => {
    expect(getToolDefinition("dropAllClients")).toBeUndefined();
    expect(getToolDefinition("__proto__")).toBeUndefined();
    expect(getToolDefinition("")).toBeUndefined();
  });

  it("buildToolSet silently drops names that are not in the registry, instead of throwing", () => {
    const tools = buildToolSet(["findClient", "not-a-real-tool"], "ADMIN_ASSISTANT");
    expect(Object.keys(tools)).toEqual(["findClient"]);
  });

  it("buildToolSet never exposes a tool to a profile that isn't allowed to use it", () => {
    const tools = buildToolSet(["findClient"], "PATIENT_ASSISTANT");
    expect(Object.keys(tools)).toHaveLength(0);
  });
});
