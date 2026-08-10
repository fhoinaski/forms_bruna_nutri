import { describe, expect, it } from "vitest";
import { getToolDefinition } from "../lib/ai/tools/registry";
import { buildProposedAction } from "../lib/ai/tools/proposal-builders";

describe("workflow: agendar consulta (encontrar cliente -> checar agenda -> propor consulta)", () => {
  it("proposeNewAppointment produces a sensitive proposal requiring confirmation, and its execute never writes anywhere", async () => {
    const tool = getToolDefinition("proposeNewAppointment");
    expect(tool).toBeDefined();

    const parsedInput = tool!.inputSchema.parse({
      title: "Retorno",
      appointment_type: "retorno",
      starts_at_display: "20/08/2026 15:00",
    });

    // O execute da tool so ecoa o input validado — nunca grava no banco.
    // A escrita real so acontece depois, via clique explicito de "Aplicar"
    // no frontend, contra a rota REST real de agendamentos.
    const executed = await tool!.execute(parsedInput);
    expect(executed).toEqual(parsedInput);

    const action = buildProposedAction("proposeNewAppointment", executed, { clientId: "client-1" });
    expect(action).not.toBeNull();
    expect(action?.kind).toBe("new_appointment");
    expect(action?.risk).toBe("sensitive");
    expect(action?.requiresConfirmation).toBe(true);
    if (action?.kind === "new_appointment") {
      expect(action.clientId).toBe("client-1");
      expect(action.fields.starts_at_display).toBe("20/08/2026 15:00");
    }
  });

  it("does not produce a proposal when there is no client resolved in context (nao adivinha o paciente)", () => {
    const action = buildProposedAction(
      "proposeNewAppointment",
      { title: "Retorno", appointment_type: "retorno", starts_at_display: "20/08/2026 15:00" },
      {}
    );
    expect(action).toBeNull();
  });

  it("rejects an incomplete appointment proposal (sem data/hora) before it ever reaches the tool", () => {
    const tool = getToolDefinition("proposeNewAppointment");
    const result = tool!.inputSchema.safeParse({ title: "Retorno" });
    expect(result.success).toBe(false);
  });
});

describe("workflow: alterar prontuario clinico exige confirmacao obrigatoria", () => {
  it("proposeNutritionRecordUpdate e classificada como clinical e a proposta sempre exige confirmacao", () => {
    const tool = getToolDefinition("proposeNutritionRecordUpdate");
    expect(tool?.risk).toBe("clinical");

    const action = buildProposedAction(
      "proposeNutritionRecordUpdate",
      { clinical_history: "Paciente relata melhora na adesao ao plano." },
      { clientId: "client-1" }
    );

    expect(action).not.toBeNull();
    expect(action?.risk).toBe("clinical");
    expect(action?.requiresConfirmation).toBe(true);
  });

  it("nao gera proposta clinica quando nenhum campo preenchido foi enviado", () => {
    const action = buildProposedAction("proposeNutritionRecordUpdate", {}, { clientId: "client-1" });
    expect(action).toBeNull();
  });
});
