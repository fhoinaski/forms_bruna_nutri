import { describe, expect, it } from "vitest";
import { buildCapabilityManifest, listUncoveredDomains } from "../lib/ai/tools/capability-manifest";
import { listRegisteredTools } from "../lib/ai/tools/registry";
import { AGENT_DOMAINS } from "../lib/ai/tools/capability-types";

describe("capability manifest", () => {
  it("classifies every registered tool under a known domain", () => {
    for (const tool of listRegisteredTools()) {
      expect(AGENT_DOMAINS).toContain(tool.domain);
    }
  });

  it("groups all registered tools into the manifest without dropping or duplicating any", () => {
    const manifest = buildCapabilityManifest();
    const manifestNames = Object.values(manifest.domains)
      .flat()
      .map((entry) => entry.name)
      .sort();
    const registryNames = listRegisteredTools()
      .map((t) => t.name)
      .sort();
    expect(manifestNames).toEqual(registryNames);
  });

  it("derives requiresConfirmation/autoExecutes from risk, never hardcoded per tool", () => {
    const manifest = buildCapabilityManifest();
    for (const entry of Object.values(manifest.domains).flat()) {
      if (entry.risk === "clinical" || entry.risk === "sensitive") {
        expect(entry.requiresConfirmation).toBe(true);
        expect(entry.autoExecutes).toBe(false);
      } else {
        expect(entry.requiresConfirmation).toBe(false);
        expect(entry.autoExecutes).toBe(true);
      }
    }
  });

  it("todos os domínios do capability manifest têm pelo menos uma tool (FASE 5 fechou document/configuration/admin, os últimos descobertos)", () => {
    const uncovered = listUncoveredDomains();
    expect(uncovered).toEqual([]);
  });
});
