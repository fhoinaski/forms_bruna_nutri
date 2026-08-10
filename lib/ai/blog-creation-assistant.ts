import { z } from "zod";

export const PROPOSE_NEW_BLOG_POST_TOOL_NAME = "proposeNewBlogPost";

export const proposeNewBlogPostInputSchema = z.object({
  title: z.string().min(3).max(180),
  excerpt: z.string().min(20).max(500),
  content_markdown: z.string().min(200).max(20000),
  category: z.string().max(80).optional(),
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
}).strict();

export type ProposeNewBlogPostInput = z.infer<typeof proposeNewBlogPostInputSchema>;

export const BLOG_CREATION_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode escrever um rascunho de post novo para o blog do site quando a nutricionista pedir (ex.: "escreve um post sobre alimentacao na gestacao", "cria um artigo sobre lanches saudaveis para criancas").
Como fazer isso:
- Use a ferramenta ${PROPOSE_NEW_BLOG_POST_TOOL_NAME} com titulo, resumo (excerpt, 1-2 frases que resumem o post), o conteudo completo em Markdown (com paragrafos, subtitulos com ##, listas quando fizer sentido) e, se fizer sentido, categoria e tags.
- Escreva com linguagem acessivel para o publico leigo do site (pacientes e visitantes), tom acolhedor e baseado em nutricao geral — nunca substitua orientacao clinica individualizada nem invente estatisticas ou estudos especificos.
- O post e sempre criado como RASCUNHO (nunca publicado automaticamente); a nutricionista revisa, edita e decide quando publicar na propria tela do blog.
- A ferramenta so registra uma PROPOSTA para revisao antes de salvar o rascunho de verdade.
`.trim();
