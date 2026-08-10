import { z } from "zod";
import { getClientById, getClients } from "@/lib/repositories/clients";

export const FIND_CLIENT_TOOL_NAME = "findClient";
export const NAVIGATE_TOOL_NAME = "navigateInSystem";

export const findClientInputSchema = z.object({
  query: z.string().min(2).max(120),
}).strict();

export async function executeFindClient({ query }: { query: string }) {
  const result = await getClients({ search: query, pageSize: 5 });
  if (!result.items.length) return { found: false, items: [] as { id: string; name: string }[] };
  return { found: true, items: result.items.map((client) => ({ id: client.id, name: client.name })) };
}

/**
 * Destinos fixos e conhecidos — a IA nunca envia um caminho de URL livre,
 * apenas escolhe um destino desta lista, o que elimina qualquer risco de
 * navegacao para um lugar nao previsto pelo sistema.
 */
export const NAVIGATION_DESTINATIONS = [
  "client_record",
  "clients_list",
  "agenda",
  "protocols_library",
  "templates_library",
  "recipes_library",
  "tasks",
  "financeiro",
] as const;

export type NavigationDestination = typeof NAVIGATION_DESTINATIONS[number];

export const navigateInputSchema = z.object({
  destination: z.enum(NAVIGATION_DESTINATIONS),
  clientId: z.string().max(120).optional(),
  reason: z.string().max(200).optional(),
}).strict();

export type NavigateInput = z.infer<typeof navigateInputSchema>;

const STATIC_DESTINATION_PATHS: Partial<Record<NavigationDestination, string>> = {
  clients_list: "/dashboard/clients",
  agenda: "/dashboard/agenda",
  protocols_library: "/dashboard/protocols",
  templates_library: "/dashboard/templates",
  recipes_library: "/dashboard/templates/receitas",
  tasks: "/dashboard/tarefas",
  financeiro: "/dashboard/financeiro",
};

/**
 * Resolve o destino escolhido pela IA para um caminho real, validando que
 * o cliente informado (quando aplicavel) realmente existe antes de navegar.
 */
export async function resolveNavigationPath(input: NavigateInput): Promise<{ path: string; clientName?: string } | null> {
  if (input.destination === "client_record") {
    if (!input.clientId) return null;
    const client = await getClientById(input.clientId);
    if (!client) return null;
    return { path: `/dashboard/clients/${client.id}`, clientName: client.name };
  }
  const path = STATIC_DESTINATION_PATHS[input.destination];
  return path ? { path } : null;
}

export const NAVIGATION_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode navegar pelo sistema para a nutricionista, abrindo a tela certa quando ela disser o que precisa fazer agora (ex.: "vou atender a Fulana agora", "abre o cliente Beltrano", "quero montar um plano para tal paciente", "abre a agenda").
Como fazer isso:
- Se a pessoa mencionar um cliente pelo nome e voce ainda nao sabe o id dele, use a ferramenta ${FIND_CLIENT_TOOL_NAME} para buscar. Se vier mais de um resultado parecido, pergunte qual é o certo antes de navegar. Se nao vier nenhum, avise que nao encontrou.
- Quando souber para onde ir, use a ferramenta ${NAVIGATE_TOOL_NAME} escolhendo o destino certo (${NAVIGATION_DESTINATIONS.join(", ")}) e o clientId quando for para a ficha de um cliente.
- So chame ${NAVIGATE_TOOL_NAME} quando a intencao de ir para outra tela estiver clara. Nao navegue so porque um nome foi citado de passagem.
- Depois de navegar, diga de forma breve o que abriu e que a conversa pode continuar ali mesmo — nesta mesma tela, uma vez carregada, voce passa a poder ajudar tambem a preencher prontuario, pre-analise ou notas de protocolo, conforme o caso.
`.trim();
