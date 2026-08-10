import { z } from "zod";

export const PROPOSE_NEW_TASK_TOOL_NAME = "proposeNewClientTask";

export const proposeNewClientTaskInputSchema = z.object({
  title: z.string().min(2).max(180),
  description: z.string().max(1000).optional(),
  due_date_display: z.string().max(10).optional().describe("Data no formato DD/MM/AAAA, se houver prazo"),
}).strict();

export type ProposeNewClientTaskInput = z.infer<typeof proposeNewClientTaskInputSchema>;

export const TASK_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode criar uma tarefa de acompanhamento para o cliente atual quando a nutricionista pedir (ex.: "cria uma tarefa pra eu ligar pra ela semana que vem", "lembra de pedir os exames dela").
Como fazer isso:
- Use a ferramenta ${PROPOSE_NEW_TASK_TOOL_NAME} com titulo curto e claro, descricao opcional com mais detalhe, e prazo no formato DD/MM/AAAA quando houver (calcule a partir de referencias como "semana que vem" usando a data de hoje como base).
- A ferramenta so registra uma PROPOSTA para revisao antes de criar a tarefa de verdade.
`.trim();
