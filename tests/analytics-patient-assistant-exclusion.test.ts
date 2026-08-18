import { describe, expect, it } from "vitest";
import { getToolDefinition, listRegisteredTools } from "@/lib/ai/tools/registry";
import {
  GET_SITE_ANALYTICS_OVERVIEW_TOOL_NAME,
  GET_TOP_TRAFFIC_SOURCES_TOOL_NAME,
  GET_TOP_PAGES_TOOL_NAME,
  GET_CONVERSION_FUNNEL_TOOL_NAME,
  GET_CAMPAIGN_PERFORMANCE_TOOL_NAME,
} from "@/lib/ai/agents/analytics/analytics-agent";

const ANALYTICS_TOOL_NAMES = [
  GET_SITE_ANALYTICS_OVERVIEW_TOOL_NAME,
  GET_TOP_TRAFFIC_SOURCES_TOOL_NAME,
  GET_TOP_PAGES_TOOL_NAME,
  GET_CONVERSION_FUNNEL_TOOL_NAME,
  GET_CAMPAIGN_PERFORMANCE_TOOL_NAME,
];

describe("ferramentas de analytics — restritas ao assistente admin", () => {
  it("todas as tools de analytics estao registradas", () => {
    for (const name of ANALYTICS_TOOL_NAMES) {
      expect(getToolDefinition(name)).toBeDefined();
    }
  });

  it("nenhuma tool de analytics inclui o perfil PATIENT_ASSISTANT", () => {
    for (const name of ANALYTICS_TOOL_NAMES) {
      const definition = getToolDefinition(name);
      expect(definition?.profiles).toEqual(["ADMIN_ASSISTANT"]);
      expect(definition?.profiles).not.toContain("PATIENT_ASSISTANT");
    }
  });

  it("todas sao somente leitura (risk: read) e nunca escrevem nada", () => {
    for (const name of ANALYTICS_TOOL_NAMES) {
      expect(getToolDefinition(name)?.risk).toBe("read");
    }
  });

  it("todas declaram dataSensitivity 'safe' (agregado, sem identificacao pessoal)", () => {
    for (const name of ANALYTICS_TOOL_NAMES) {
      expect(getToolDefinition(name)?.dataSensitivity).toBe("safe");
    }
  });

  it("nenhuma tool cujo nome comece com 'analytics'/'siteAnalytics' aparece entre as tools do perfil paciente", () => {
    const patientVisibleAnalyticsTools = listRegisteredTools().filter(
      (tool) => tool.profiles.includes("PATIENT_ASSISTANT") && ANALYTICS_TOOL_NAMES.includes(tool.name as (typeof ANALYTICS_TOOL_NAMES)[number])
    );
    expect(patientVisibleAnalyticsTools).toHaveLength(0);
  });
});
