import { describe, expect, it } from "vitest";
import { listRegisteredTools } from "../lib/ai/tools/registry";
import { buildCapabilityManifest, listToolsBySensitivity } from "../lib/ai/tools/capability-manifest";
import { DATA_SENSITIVITY_LEVELS } from "../lib/ai/tools/capability-types";

/**
 * FASE 2A — taxonomia de leitura sensivel (item 2/14 do pedido): toda tool
 * declara `dataSensitivity`, e o capability manifest expoe isso para
 * responder programaticamente "quais tools leem dado sensivel/clinico?".
 */

describe("dataSensitivity — toda tool classificada", () => {
  it("todas as tools registradas tem um dataSensitivity valido", () => {
    for (const tool of listRegisteredTools()) {
      expect(DATA_SENSITIVITY_LEVELS, `tool ${tool.name}`).toContain(tool.dataSensitivity);
    }
  });

  it("capability manifest expoe dataSensitivity por tool", () => {
    const manifest = buildCapabilityManifest();
    const foodSearch = manifest.domains.food.find((t) => t.name === "searchFoods");
    expect(foodSearch?.dataSensitivity).toBe("safe");
    const clinicalMarkers = manifest.domains.clinical.find((t) => t.name === "getPatientClinicalMarkers");
    expect(clinicalMarkers?.dataSensitivity).toBe("clinical");
  });

  it("listToolsBySensitivity('clinical') inclui as tools de prontuario/marcadores/plano terapeutico", () => {
    const clinicalTools = listToolsBySensitivity("clinical");
    expect(clinicalTools).toContain("getPatientClinicalMarkers");
    expect(clinicalTools).toContain("getPatientActivePlan");
    expect(clinicalTools).toContain("getClientEvolutionSummary");
    expect(clinicalTools).toContain("compareAnthropometry");
  });

  it("listToolsBySensitivity('sensitive') inclui financeiro, solicitacoes e dashboard", () => {
    const sensitiveTools = listToolsBySensitivity("sensitive");
    expect(sensitiveTools).toContain("getOverduePayments");
    expect(sensitiveTools).toContain("getPatientRequestDetails");
    expect(sensitiveTools).toContain("getDashboardActionItems");
  });

  it("listToolsBySensitivity('safe') inclui busca de alimento e agenda sem conteudo clinico", () => {
    const safeTools = listToolsBySensitivity("safe");
    expect(safeTools).toContain("searchFoods");
    expect(safeTools).toContain("getFoodDetails");
    expect(safeTools).toContain("getTodayAppointments");
    expect(safeTools).toContain("getFinancialSummary");
  });

  it("nenhuma tool 'safe' e ao mesmo tempo classificada como dominio clinical/finance sem justificativa — sanity check cruzado", () => {
    // getFinancialSummary e finance+safe deliberadamente (so agregado, sem
    // identidade de paciente) — confirma que essa excecao é a UNICA do dominio finance.
    const financeSafe = listRegisteredTools().filter((t) => t.domain === "finance" && t.dataSensitivity === "safe");
    expect(financeSafe.map((t) => t.name)).toEqual(["getFinancialSummary"]);
  });
});
