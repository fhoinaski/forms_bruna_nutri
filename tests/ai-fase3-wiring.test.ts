import { describe, expect, it } from "vitest";
import { buildToolSet, getToolDefinition } from "../lib/ai/tools/registry";
import { resolveNavigationPath, NAVIGATION_DESTINATIONS } from "../lib/ai/agents/navigation/navigation-agent";
import { PROPOSE_RESCHEDULE_APPOINTMENT_TOOL_NAME, PROPOSE_CANCEL_APPOINTMENT_TOOL_NAME } from "../lib/ai/agents/appointments/appointment-write-agent";
import { PROPOSE_RESOLVE_PATIENT_REQUEST_TOOL_NAME } from "../lib/ai/agents/clients/patient-request-write-agent";
import { PROPOSE_MARK_PAYMENT_RECEIVED_TOOL_NAME } from "../lib/ai/agents/finance/finance-write-agent";

/**
 * FASE 3 (safe writes operacionais) — confirma que as 4 tools de escrita
 * novas estão corretamente classificadas (risk "sensitive", nunca
 * auto-executam), alcançáveis só pelo perfil ADMIN_ASSISTANT, e que a
 * navegação para "solicitacoes" está na whitelist.
 */

const FASE3_WRITE_TOOL_NAMES = [
  PROPOSE_RESCHEDULE_APPOINTMENT_TOOL_NAME,
  PROPOSE_CANCEL_APPOINTMENT_TOOL_NAME,
  PROPOSE_RESOLVE_PATIENT_REQUEST_TOOL_NAME,
  PROPOSE_MARK_PAYMENT_RECEIVED_TOOL_NAME,
];

describe("Fase 3 — tools de write sempre exigem confirmação, nunca auto-executam", () => {
  it("todas registradas com risk 'sensitive' e contextRequirement 'none'", () => {
    for (const name of FASE3_WRITE_TOOL_NAMES) {
      const tool = getToolDefinition(name);
      expect(tool, `tool ${name} deveria estar registrada`).toBeDefined();
      expect(tool!.risk).toBe("sensitive");
      expect(tool!.contextRequirement).toBe("none");
    }
  });

  it("buildToolSet devolve todas para ADMIN_ASSISTANT", () => {
    const tools = buildToolSet(FASE3_WRITE_TOOL_NAMES, "ADMIN_ASSISTANT");
    for (const name of FASE3_WRITE_TOOL_NAMES) {
      expect(Object.keys(tools)).toContain(name);
    }
  });

  it("nenhuma delas fica disponível para PATIENT_ASSISTANT — o paciente nunca reagenda/cancela/resolve/marca pagamento de outra pessoa", () => {
    const tools = buildToolSet(FASE3_WRITE_TOOL_NAMES, "PATIENT_ASSISTANT");
    expect(Object.keys(tools)).toHaveLength(0);
  });
});

describe("Fase 3 — navegação para solicitações", () => {
  it("'solicitacoes' está na whitelist de destinos", () => {
    expect(NAVIGATION_DESTINATIONS).toContain("solicitacoes");
  });

  it("resolveNavigationPath('solicitacoes') resolve para a rota real, sem depender de clientId", async () => {
    const result = await resolveNavigationPath({ destination: "solicitacoes" });
    expect(result).toEqual({ path: "/dashboard/solicitacoes" });
  });

  it("um destino fora da whitelist nunca é aceito pelo schema de input (nunca uma URL livre)", async () => {
    const { navigateInputSchema } = await import("../lib/ai/agents/navigation/navigation-agent");
    const result = navigateInputSchema.safeParse({ destination: "http://evil.example.com" });
    expect(result.success).toBe(false);
  });
});
