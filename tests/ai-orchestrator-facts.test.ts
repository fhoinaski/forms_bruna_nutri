import { describe, expect, it } from "vitest";
import { buildFactsPayload } from "../lib/ai/core/ai-orchestrator";
import {
  GET_CLIENT_EVOLUTION_SUMMARY_TOOL_NAME,
} from "../lib/ai/agents/clinical/evolution-summary-agent";
import { GET_AVAILABLE_SLOTS_TOOL_NAME } from "../lib/ai/agents/appointments/availability-lookup-agent";
import { GET_PATIENTS_WITH_PENDENCIES_TOOL_NAME } from "../lib/ai/agents/appointments/schedule-lookup-agent";
import { FIND_CLIENT_TOOL_NAME } from "../lib/ai/agents/navigation/navigation-agent";

/**
 * `buildFactsPayload` e o que liga "DADOS DO SISTEMA" (secao 9/11 do pedido
 * de UX) ao envelope de resposta — repassa o resultado JA CALCULADO por uma
 * tool de leitura para o frontend renderizar de forma rica, sem recalcular
 * nem interpretar nada aqui.
 */
describe("buildFactsPayload", () => {
  it("sem tool results relevantes, nao anexa facts (nunca inventa um bloco vazio)", () => {
    expect(buildFactsPayload(undefined)).toBeUndefined();
    expect(buildFactsPayload([])).toBeUndefined();
    expect(buildFactsPayload([{ toolName: FIND_CLIENT_TOOL_NAME, output: { found: true, items: [] } }])).toBeUndefined();
  });

  it("repassa o output real de getClientEvolutionSummary sem alterar nenhum numero", () => {
    const evolutionOutput = { found: true, clientName: "Maria Silva", currentWeightKg: 69.8, previousWeightKg: 72.1, weightVariationKg: -2.3, bmi: 24.6, lastAppointment: null, measurementsOnRecord: 2 };
    const facts = buildFactsPayload([{ toolName: GET_CLIENT_EVOLUTION_SUMMARY_TOOL_NAME, output: evolutionOutput }]);
    expect(facts).toEqual({ type: "client_evolution", data: evolutionOutput });
  });

  it("repassa o output real de getAvailableSlots (horarios vem do backend, nunca inventados aqui)", () => {
    const slotsOutput = { slots: ["2026-08-13T15:00:00.000Z"], totalFound: 1, truncated: false };
    const facts = buildFactsPayload([{ toolName: GET_AVAILABLE_SLOTS_TOOL_NAME, output: slotsOutput }]);
    expect(facts).toEqual({ type: "available_slots", data: slotsOutput });
  });

  it("repassa o output real de getPatientsWithPendenciesForDate", () => {
    const pendenciesOutput = { date: "2026-08-11", patients: [], totalFound: 0, truncated: false };
    const facts = buildFactsPayload([{ toolName: GET_PATIENTS_WITH_PENDENCIES_TOOL_NAME, output: pendenciesOutput }]);
    expect(facts).toEqual({ type: "patients_with_pendencies", data: pendenciesOutput });
  });

  it("quando mais de uma tool rica foi chamada no mesmo turno, usa a ULTIMA (a mais recente no fluxo)", () => {
    const evolutionOutput = { found: true, clientName: "Maria", currentWeightKg: 60, previousWeightKg: null, weightVariationKg: null, bmi: null, lastAppointment: null, measurementsOnRecord: 1 };
    const slotsOutput = { slots: [], totalFound: 0, truncated: false };
    const facts = buildFactsPayload([
      { toolName: GET_CLIENT_EVOLUTION_SUMMARY_TOOL_NAME, output: evolutionOutput },
      { toolName: GET_AVAILABLE_SLOTS_TOOL_NAME, output: slotsOutput },
    ]);
    expect(facts).toEqual({ type: "available_slots", data: slotsOutput });
  });

  it("tool nao-relacionada no meio da lista nao atrapalha achar a tool rica correta", () => {
    const pendenciesOutput = { date: "2026-08-11", patients: [], totalFound: 0, truncated: false };
    const facts = buildFactsPayload([
      { toolName: GET_PATIENTS_WITH_PENDENCIES_TOOL_NAME, output: pendenciesOutput },
      { toolName: FIND_CLIENT_TOOL_NAME, output: { found: false, items: [] } },
    ]);
    expect(facts).toEqual({ type: "patients_with_pendencies", data: pendenciesOutput });
  });
});
