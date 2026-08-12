import { z } from "zod";

/**
 * Abstracao de pesquisa editorial para agentes de conteudo (hoje so o
 * agente de blog usa isto) — desacoplada de qualquer provedor especifico.
 *
 * Nenhum provedor de busca esta configurado neste projeto hoje (nao ha
 * chave de busca web em ai_settings nem convencao de variavel de ambiente
 * existente) — chamar searchEditorialSources() sem um provider registrado
 * devolve `{ available: false, results: [] }`, nunca uma fonte inventada.
 * Quando um provedor real for integrado (ex.: um servico de busca dedicado,
 * ou a ferramenta de busca nativa de algum provedor de LLM), basta chamar
 * registerEditorialSearchProvider() uma vez na inicializacao do processo —
 * nenhum outro arquivo (agente, registry, orquestrador) precisa mudar.
 */

/**
 * Classificacao editorial interna do post (ver blog-creation-agent.ts) —
 * usada so para orientar profundidade de pesquisa/disclaimer/badge de
 * revisao, nunca para bloquear ou liberar uma acao automaticamente.
 */
export const blogContentDomainSchema = z.enum([
  "nutrition",
  "maternal_child",
  "clinical_condition",
  "medication",
  "supplement",
  "behavior",
  "general_health",
]);
export type BlogContentDomain = z.infer<typeof blogContentDomainSchema>;

export const blogReferenceSchema = z.object({
  title: z.string().min(1).max(300),
  organization: z.string().max(200).optional(),
  url: z.string().url().max(500).optional(),
  year: z.number().int().min(1990).max(2100).optional(),
  accessed_at: z.string().max(40).optional(),
});
export type BlogReference = z.infer<typeof blogReferenceSchema>;

export type EditorialSource = BlogReference & { snippet?: string };

export interface EditorialSearchProvider {
  name: string;
  search(query: string, opts?: { limit?: number }): Promise<EditorialSource[]>;
}

/**
 * Ordem de prioridade sugerida para fontes de saude/medicamento (organizada
 * do pedido original) — usada como orientacao no prompt do agente. Nao e um
 * filtro automatico: sem um provider real conectado, nao ha resultado para
 * filtrar ainda.
 */
export const PRIORITY_SOURCE_ORGANIZATIONS = [
  "ANVISA (bula oficial)",
  "Ministerio da Saude",
  "FDA",
  "EMA",
  "OMS/WHO",
  "sociedades cientificas (ex.: SBEM, SBD, SBP, SBPC/ML)",
  "guidelines e consensos clinicos",
  "artigos cientificos revisados por pares (PubMed/periodicos indexados)",
  "fontes institucionais reconhecidas (universidades, hospitais de referencia)",
] as const;

let activeProvider: EditorialSearchProvider | null = null;

/** So para uso em inicializacao real do processo (nunca dentro de um request handler) e em testes. */
export function registerEditorialSearchProvider(provider: EditorialSearchProvider | null): void {
  activeProvider = provider;
}

export function hasEditorialSearchProvider(): boolean {
  return activeProvider !== null;
}

export interface EditorialSearchResult {
  available: boolean;
  provider: string | null;
  results: EditorialSource[];
}

/**
 * Nunca inventa uma fonte: se nenhum provider estiver registrado, ou o
 * provider nao encontrar nada, devolve results:[] — o agente e instruido
 * (BLOG_CREATION_ASSISTANT_INSTRUCTIONS) a nunca preencher `references` com
 * dado que nao veio daqui.
 */
export async function searchEditorialSources(
  query: string,
  opts?: { limit?: number }
): Promise<EditorialSearchResult> {
  if (!activeProvider) {
    return { available: false, provider: null, results: [] };
  }
  const results = await activeProvider.search(query, opts);
  return { available: true, provider: activeProvider.name, results };
}

// ── tool (registrada em lib/ai/tools/registry.ts, risco "read") ──────────

export const SEARCH_EDITORIAL_SOURCES_TOOL_NAME = "searchEditorialSources";

export const searchEditorialSourcesInputSchema = z.object({
  query: z.string().min(3).max(200),
}).strict();
export type SearchEditorialSourcesInput = z.infer<typeof searchEditorialSourcesInputSchema>;

export async function executeSearchEditorialSources(input: SearchEditorialSourcesInput): Promise<EditorialSearchResult> {
  return searchEditorialSources(input.query);
}
