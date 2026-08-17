import { z } from "zod";
import { getAllTemplates, type ProtocolTemplateType, type ProtocolTemplateTargetGroup } from "@/lib/repositories/protocol-templates";
import { getClientById } from "@/lib/repositories/clients";

/**
 * FASE 5 (document/configuration/admin) — domínio "document". Auditoria
 * confirmou (docs/AI-OPERATOR-AUDIT-ROADMAP.md): não existe entidade
 * "documento" persistida no sistema (sem tabela, sem geração de PDF
 * server-side — as telas de impressão usam `window.print()` no navegador).
 * As DUAS coisas reais que existem e que uma pergunta sobre "documento"
 * plausivelmente quer dizer:
 * 1. a biblioteca de templates (dieta/suplementação/substituição) que a
 *    nutricionista usa como base para montar planos/condutas;
 * 2. as páginas de impressão reais já existentes (ficha do paciente,
 *    formulário de pré-consulta) — links reais, nunca PDF inventado.
 * Nenhuma tool aqui gera nem lista "documentos do paciente" que não
 * existem — ver PATIENT_DOCUMENT_LINK_TYPES abaixo, que é a lista fechada
 * do que realmente pode ser aberto/impresso.
 */

// ── get_document_templates (READ) ─────────────────────────────────────────

export const GET_DOCUMENT_TEMPLATES_TOOL_NAME = "getDocumentTemplates";
export const getDocumentTemplatesInputSchema = z.object({
  type: z.enum(["DIETA", "SUPLEMENTACAO", "SUBSTITUICAO"]).optional(),
}).strict();
export type GetDocumentTemplatesInput = z.infer<typeof getDocumentTemplatesInputSchema>;

export async function executeGetDocumentTemplates(input: GetDocumentTemplatesInput) {
  const templates = await getAllTemplates({ type: input.type as ProtocolTemplateType | undefined });
  return {
    templates: templates.map((template) => ({
      id: template.id,
      type: template.type,
      targetGroup: template.target_group as ProtocolTemplateTargetGroup,
      title: template.title,
      isActive: Boolean(template.is_active),
    })),
    totalFound: templates.length,
  };
}

// ── get_patient_document_links (READ) ─────────────────────────────────────

export const GET_PATIENT_DOCUMENT_LINKS_TOOL_NAME = "getPatientDocumentLinks";
export const getPatientDocumentLinksInputSchema = z.object({
  clientId: z.string().min(1).max(120),
}).strict();
export type GetPatientDocumentLinksInput = z.infer<typeof getPatientDocumentLinksInputSchema>;

export async function executeGetPatientDocumentLinks(input: GetPatientDocumentLinksInput) {
  const client = await getClientById(input.clientId);
  if (!client) return { found: false as const };

  const links: { type: "client_record_print" | "submission_print"; label: string; path: string }[] = [
    { type: "client_record_print", label: "Ficha do paciente (impressão)", path: `/dashboard/clients/${client.id}/print` },
  ];
  if (client.source_submission_id) {
    links.push({
      type: "submission_print",
      label: "Formulário de pré-consulta (impressão)",
      path: `/dashboard/submissions/${client.source_submission_id}/print`,
    });
  }

  return { found: true as const, links };
}

export const DOCUMENT_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode consultar templates da biblioteca e os documentos imprimiveis reais de um paciente — este sistema NAO gera PDF no servidor nem guarda uma lista de "documentos" por paciente; tudo e baseado em paginas de impressao do navegador e na biblioteca de templates.
Como fazer isso:
- Para "qual template esta configurado/disponivel" (dieta, suplementacao ou substituicao), use ${GET_DOCUMENT_TEMPLATES_TOOL_NAME}. Nao existe um "template padrao" unico selecionado — varios podem estar ativos ao mesmo tempo na biblioteca; responda de acordo, nunca invente um "padrao atual".
- Para "quais documentos a Maria tem" ou "manda o prontuario dela", use ${GET_PATIENT_DOCUMENT_LINKS_TOOL_NAME} (resolva o id do paciente com findClient se so tiver o nome) — devolve os links reais das paginas de impressao (ficha do paciente, formulario de pre-consulta se existir). Explique que a nutricionista precisa abrir o link e usar "Imprimir/Salvar como PDF" do navegador — este sistema nao envia nem gera arquivo automaticamente.
- Se nao houver nenhum template do tipo pedido, ou o paciente nao tiver formulario de origem, diga isso claramente — nunca invente um documento que nao existe.
`.trim();
