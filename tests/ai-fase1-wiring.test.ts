import { describe, expect, it } from "vitest";
import { buildToolSet, getToolDefinition } from "../lib/ai/tools/registry";
import { SEARCH_FOODS_TOOL_NAME, GET_FOOD_DETAILS_TOOL_NAME, GET_FOOD_PORTIONS_TOOL_NAME, CALCULATE_FOOD_NUTRIENTS_TOOL_NAME } from "../lib/ai/agents/food/food-catalog-agent";
import { GET_PATIENT_SUMMARY_TOOL_NAME, GET_PATIENT_ACTIVE_PLAN_TOOL_NAME, GET_PATIENT_CLINICAL_MARKERS_TOOL_NAME } from "../lib/ai/agents/clients/patient-lookup-agent";
import { GET_MEAL_PLAN_NUTRITION_TOOL_NAME } from "../lib/ai/agents/nutrition/meal-plan-change-agent";

/**
 * FASE 1 (operador interno) — confirma que as tools novas ficam
 * genuinamente alcancaveis pelo LLM num turno real, e nao so registradas.
 * `ai-orchestrator.ts` monta `activeToolNames` e chama `buildToolSet` com
 * ela — este teste exercita o mesmo mecanismo (sem duplicar a logica de
 * montagem do prompt, que ja e coberta por outros testes de workflow).
 */

const FASE1_ALWAYS_ACTIVE_TOOL_NAMES = [
  SEARCH_FOODS_TOOL_NAME,
  GET_FOOD_DETAILS_TOOL_NAME,
  GET_FOOD_PORTIONS_TOOL_NAME,
  CALCULATE_FOOD_NUTRIENTS_TOOL_NAME,
  GET_PATIENT_SUMMARY_TOOL_NAME,
  GET_PATIENT_ACTIVE_PLAN_TOOL_NAME,
  GET_PATIENT_CLINICAL_MARKERS_TOOL_NAME,
  GET_MEAL_PLAN_NUTRITION_TOOL_NAME,
];

describe("Fase 1 — tools sempre ativas, mesmo sem cliente pre-selecionado", () => {
  it("todas tem contextRequirement 'none' — nunca dependem de client/submission ja resolvidos", () => {
    for (const name of FASE1_ALWAYS_ACTIVE_TOOL_NAMES) {
      const tool = getToolDefinition(name);
      expect(tool, `tool ${name} deveria estar registrada`).toBeDefined();
      expect(tool!.contextRequirement, `tool ${name} deveria ter contextRequirement "none"`).toBe("none");
    }
  });

  it("buildToolSet devolve todas elas para o perfil ADMIN_ASSISTANT, do jeito que o orquestrador monta o turno", () => {
    const tools = buildToolSet(FASE1_ALWAYS_ACTIVE_TOOL_NAMES, "ADMIN_ASSISTANT");
    for (const name of FASE1_ALWAYS_ACTIVE_TOOL_NAMES) {
      expect(Object.keys(tools)).toContain(name);
    }
  });

  it("nenhuma delas fica disponivel para o perfil PATIENT_ASSISTANT (nunca vaza tool de admin ao paciente)", () => {
    const tools = buildToolSet(FASE1_ALWAYS_ACTIVE_TOOL_NAMES, "PATIENT_ASSISTANT");
    expect(Object.keys(tools)).toHaveLength(0);
  });
});
