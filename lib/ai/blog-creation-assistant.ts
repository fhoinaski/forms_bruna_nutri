import { z } from "zod";

export const PROPOSE_NEW_BLOG_POST_TOOL_NAME = "proposeNewBlogPost";

export const proposeNewBlogPostInputSchema = z.object({
  title: z.string().min(3).max(180),
  excerpt: z.string().min(20).max(500),
  content_markdown: z.string().min(200).max(20000),
  category: z.string().max(80).optional(),
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
  seo_title: z.string().min(3).max(180).optional(),
  seo_description: z.string().min(20).max(300).optional(),
}).strict();

export type ProposeNewBlogPostInput = z.infer<typeof proposeNewBlogPostInputSchema>;

export const BLOG_CREATION_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode escrever um rascunho de post novo para o blog do site quando a nutricionista pedir (ex.: "escreve um post sobre alimentacao na gestacao", "cria um artigo sobre lanches saudaveis para criancas").
Como fazer isso:
- Use a ferramenta ${PROPOSE_NEW_BLOG_POST_TOOL_NAME} preenchendo TODOS os campos que fizerem sentido: titulo, resumo (excerpt, 1-2 frases), o conteudo completo em Markdown (com paragrafos, subtitulos com ##/###, listas e negrito quando fizer sentido), categoria, tags, titulo SEO e descricao SEO.
- Titulo SEO: uma variacao do titulo pensada para buscadores (pode repetir o titulo se ja for bom para isso), ate 60-70 caracteres idealmente. Descricao SEO: um resumo curto e atrativo pensado para aparecer no resultado de busca (150-160 caracteres idealmente), diferente do excerpt se possivel.
- Escreva com linguagem acessivel para o publico leigo do site (pacientes e visitantes), tom acolhedor e baseado em nutricao geral — nunca substitua orientacao clinica individualizada nem invente estatisticas ou estudos especificos.
- O post e sempre criado como RASCUNHO (nunca publicado automaticamente); a nutricionista revisa, edita e decide quando publicar na propria tela do blog.
- A ferramenta so registra uma PROPOSTA para revisao antes de salvar o rascunho de verdade.
`.trim();
