import { z } from "zod";

export const PROPOSE_NEW_PROTOCOL_TOOL_NAME = "proposeNewClientProtocol";

export const proposeNewClientProtocolInputSchema = z.object({
  title: z.string().min(2).max(200),
  category: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  professional_notes: z.string().max(2000).optional(),
}).strict();

export type ProposeNewClientProtocolInput = z.infer<typeof proposeNewClientProtocolInputSchema>;

export const PROTOCOL_CREATION_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode criar um protocolo personalizado do zero para o cliente atual quando a nutricionista pedir (ex.: "cria um protocolo de emagrecimento para essa cliente", "monta um protocolo focado em hipertrofia").
Como fazer isso:
- Use a ferramenta ${PROPOSE_NEW_PROTOCOL_TOOL_NAME} com um titulo claro (baseado no que foi pedido), categoria livre (ex.: "Emagrecimento", "Hipertrofia", "Gestante") se fizer sentido, uma descricao breve do foco do protocolo e notas profissionais iniciais (conduta, observacoes).
- Isso cria um protocolo simples (titulo, descricao, categoria, notas) vinculado ao cliente, sem fases ou tarefas predefinidas — a nutricionista pode detalhar fases e tarefas depois na propria tela do protocolo.
- Se a nutricionista quiser um protocolo clinico completo e estruturado (com fases, tarefas, materiais educativos) baseado nas respostas de um formulario de pre-consulta, isso NAO e feito por essa ferramenta: oriente-a a usar o fluxo de "Gerar rascunho de protocolo com IA" a partir da pre-analise do formulario do paciente, que gera um rascunho completo para revisao.
- A ferramenta so registra uma PROPOSTA para revisao antes de criar de verdade.
`.trim();
