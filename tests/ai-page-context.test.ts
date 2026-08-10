import { describe, expect, it } from "vitest";
import { resolveBasePageContext } from "../lib/ai/context/assistant-page-context";

/**
 * `resolveBasePageContext` e a funcao pura por tras do contexto automatico
 * de tela (secao 2/5 do pedido de UX) — sem hooks, sem DOM, para poder ser
 * testada isoladamente. O provider (AssistantPageContextProvider) so chama
 * isso a cada troca de pathname e limpa qualquer "extra" publicado por uma
 * pagina anterior (comportamento de useEffect, verificado por leitura de
 * codigo — nao ha Testing Library configurada neste projeto para testar o
 * componente React em si).
 */
describe("resolveBasePageContext", () => {
  it("ficha do cliente: currentPage client_record + clientId da URL", () => {
    expect(resolveBasePageContext("/dashboard/clients/client-123")).toEqual({
      currentPage: "client_record",
      clientId: "client-123",
    });
  });

  it("formulario de pre-consulta: currentPage submission_detail + submissionId da URL", () => {
    expect(resolveBasePageContext("/dashboard/submissions/sub-456")).toEqual({
      currentPage: "submission_detail",
      submissionId: "sub-456",
    });
  });

  it("detalhe de protocolo: currentPage protocol_detail + protocolId da URL", () => {
    expect(resolveBasePageContext("/dashboard/protocols/protocol-789")).toEqual({
      currentPage: "protocol_detail",
      protocolId: "protocol-789",
    });
  });

  it("dashboard: sem nenhum identificador de entidade", () => {
    expect(resolveBasePageContext("/dashboard")).toEqual({ currentPage: "dashboard" });
  });

  it("lista de clientes: sem clientId (nao e a ficha de ninguem)", () => {
    expect(resolveBasePageContext("/dashboard/clients")).toEqual({ currentPage: "clients_list" });
  });

  it("agenda, protocolos, receitas, oportunidades, financeiro: cada um com seu currentPage, sem inventar ids que a tela nao tem", () => {
    expect(resolveBasePageContext("/dashboard/agenda")).toEqual({ currentPage: "agenda" });
    expect(resolveBasePageContext("/dashboard/protocols")).toEqual({ currentPage: "protocols_library" });
    expect(resolveBasePageContext("/dashboard/templates/receitas")).toEqual({ currentPage: "recipes_library" });
    expect(resolveBasePageContext("/dashboard/templates")).toEqual({ currentPage: "templates_library" });
    expect(resolveBasePageContext("/dashboard/oportunidades")).toEqual({ currentPage: "opportunities" });
    expect(resolveBasePageContext("/dashboard/financeiro")).toEqual({ currentPage: "financeiro" });
    expect(resolveBasePageContext("/dashboard/tarefas")).toEqual({ currentPage: "tasks" });
  });

  it("rota nao mapeada cai em 'other' — nunca inventa contexto que a pagina nao tem", () => {
    expect(resolveBasePageContext("/dashboard/settings/ai")).toEqual({ currentPage: "other" });
  });

  it("trocar de paciente (A -> B) produz um objeto de contexto totalmente diferente, nao uma extensao do anterior", () => {
    const forA = resolveBasePageContext("/dashboard/clients/paciente-A");
    const forB = resolveBasePageContext("/dashboard/clients/paciente-B");
    expect(forA.clientId).toBe("paciente-A");
    expect(forB.clientId).toBe("paciente-B");
    expect(forA).not.toEqual(forB);
  });

  it("sair da ficha do cliente para o dashboard remove clientId — nunca reutiliza implicitamente o ultimo paciente", () => {
    const onClientPage = resolveBasePageContext("/dashboard/clients/paciente-A");
    const onDashboard = resolveBasePageContext("/dashboard");
    expect(onClientPage.clientId).toBe("paciente-A");
    expect(onDashboard.clientId).toBeUndefined();
  });
});
