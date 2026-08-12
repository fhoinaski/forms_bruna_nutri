import { describe, expect, it } from "vitest";
import {
  BLOG_CREATION_ASSISTANT_INSTRUCTIONS,
  BLOG_MEDICATION_DISCLAIMER,
  blogDomainRequiresMedicalDisclaimer,
  PROPOSE_NEW_BLOG_POST_TOOL_NAME,
  proposeNewBlogPostInputSchema,
} from "@/lib/ai/agents/content/blog-creation-agent";
import { getToolRisk, buildToolSet } from "@/lib/ai/tools/registry";
import { requiresConfirmation } from "@/lib/ai/policies/action-policy";
import { SEARCH_EDITORIAL_SOURCES_TOOL_NAME } from "@/lib/ai/research/editorial-sources";

/**
 * O agente de blog nao tem provedor de IA real nos testes (mesma convencao
 * do resto do projeto), entao nao ha como simular um "pedido em linguagem
 * natural -> resposta do modelo" de ponta a ponta aqui. O que estes testes
 * verificam e exatamente o que controla o comportamento do modelo quando um
 * provedor real estiver configurado: (1) o schema da tool aceita os temas
 * pedidos sem rejeitar nada por "fora de escopo", (2) as instrucoes do
 * agente contem a permissao explicita de escopo E a proibicao explicita de
 * prescricao individual, e (3) o risco/gate de confirmacao continua
 * controlado pelo codigo (registry + action-policy), nunca pelo texto do
 * prompt — o que é a garantia real contra o caso 4 do pedido (dose
 * individual), ja que nao existe nenhum campo na tool que permita
 * direcionar o post a um paciente especifico.
 */

describe("blog-creation-agent — escopo ampliado", () => {
  it("caso 1: aceita um pedido de post explicando Mounjaro/tirzepatida sem rejeitar por fora de escopo", () => {
    const parsed = proposeNewBlogPostInputSchema.safeParse({
      title: "Mounjaro: o que é a tirzepatida e como ela funciona?",
      excerpt: "Entenda o que é a tirzepatida, como ela age no organismo e por que costuma ser associada à perda de peso.",
      content_markdown: "## O que é\n".repeat(1) + "A tirzepatida é o princípio ativo do Mounjaro. ".repeat(20),
      content_domain: "medication",
      tags: ["tirzepatida", "mounjaro"],
    });
    expect(parsed.success).toBe(true);
  });

  it("caso 2: aceita um artigo sobre tirzepatida e perda de massa muscular, com foco nutricional", () => {
    const parsed = proposeNewBlogPostInputSchema.safeParse({
      title: "Tirzepatida e composição corporal: por que a ingestão de proteína importa",
      excerpt: "Durante o uso de medicamentos para emagrecimento, parte do peso perdido pode vir de massa magra — veja o papel da alimentação.",
      content_markdown: "Durante o tratamento com tirzepatida, a ingestão proteica adequada e o acompanhamento nutricional ajudam a preservar massa magra. ".repeat(15),
      content_domain: "medication",
    });
    expect(parsed.success).toBe(true);
    // Nunca promete prevencao absoluta — isso e responsabilidade do texto (instrucoes), nao do schema, entao so confirmamos que o schema nao exige nem rejeita esse tipo de conteudo.
  });

  it("caso 3: aceita um comparativo Ozempic/Wegovy/Mounjaro com referências estruturadas reais", () => {
    const parsed = proposeNewBlogPostInputSchema.safeParse({
      title: "Ozempic, Wegovy e Mounjaro: quais são as diferenças?",
      excerpt: "Semaglutida e tirzepatida têm mecanismos parecidos, mas não são o mesmo medicamento — entenda as diferenças de forma educativa.",
      content_markdown: "Semaglutida (Ozempic, Wegovy) e tirzepatida (Mounjaro) atuam em vias hormonais relacionadas ao apetite e à glicemia. ".repeat(15),
      content_domain: "medication",
      references: [
        { title: "Bula oficial - ANVISA", organization: "ANVISA", year: 2024 },
        { title: "Ficha técnica do medicamento", organization: "FDA", url: "https://www.fda.gov" },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("caso 4: o schema não tem NENHUM campo capaz de direcionar o post a um paciente específico (proteção estrutural contra prescrição individual)", () => {
    const shape = proposeNewBlogPostInputSchema.shape;
    expect(Object.keys(shape)).not.toContain("clientId");
    expect(Object.keys(shape)).not.toContain("patientId");
    expect(Object.keys(shape)).not.toContain("dose");
    expect(Object.keys(shape)).not.toContain("dosage");

    // .strict() rejeita qualquer campo extra que o modelo tente inventar (ex.: um "dose" improvisado).
    const withExtraField = proposeNewBlogPostInputSchema.safeParse({
      title: "Mounjaro: cuidados durante o tratamento",
      excerpt: "Conteúdo educativo sobre tirzepatida e acompanhamento nutricional durante o tratamento medicamentoso.",
      content_markdown: "Conteúdo educativo sobre tirzepatida. ".repeat(20),
      dose_mg: 10,
    });
    expect(withExtraField.success).toBe(false);
  });

  it("caso 4b: as instruções proíbem explicitamente recomendar dose individual, mesmo que pedido", () => {
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).toMatch(/n(a|ã)o insira essa instru(c|ç)(a|ã)o no rascunho/i);
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).toMatch(/recomendar uma dose para uma pessoa espec(i|í)fica/i);
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).toMatch(/depende(m)? sempre de prescri(c|ç)(a|ã)o e acompanhamento medico/i);
  });

  it("caso 5: alimentação na gestação continua funcionando (regressão do comportamento anterior)", () => {
    const parsed = proposeNewBlogPostInputSchema.safeParse({
      title: "Alimentação na gestação: guia prático por trimestre",
      excerpt: "Orientações gerais sobre alimentação equilibrada durante a gestação, trimestre a trimestre.",
      content_markdown: "Uma alimentação equilibrada durante a gestação apoia o desenvolvimento do bebê e o bem-estar da gestante. ".repeat(15),
    });
    expect(parsed.success).toBe(true);
  });

  it("as instruções explicitam o escopo ampliado (não fica restrito a 'nutrição geral')", () => {
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).toMatch(/mounjaro/i);
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).toMatch(/ozempic/i);
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).toMatch(/tirzepatida/i);
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).toMatch(/obesidade/i);
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).toMatch(/diabetes/i);
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).toMatch(/farmacoterapia/i);
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).toMatch(/recusar ou esvaziar esses pedidos.*errado/i);
  });

  it("as instruções deixam explícito que educação em saúde não é conduta clínica individual", () => {
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).toMatch(/EDUCACAO EM SAUDE != CONDUTA CLINICA INDIVIDUAL/);
  });

  it("as instruções nunca instruem o modelo a tratar o assunto medicamento como bloqueado", () => {
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).not.toMatch(/nunca (fale|escreva|aborde) sobre medicamento/i);
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).not.toMatch(/recuse pedidos sobre medicamento/i);
  });

  it("clarifica localmente que a instrução geral de 'nunca dar orientação clínica' não se aplica à redação do blog", () => {
    expect(BLOG_CREATION_ASSISTANT_INSTRUCTIONS).toMatch(/n(a|ã)o se aplica a redigir conte(u|ú)do educativo p(u|ú)blico do blog/i);
  });
});

describe("blog-creation-agent — risco e confirmação continuam controlados pelo código, nunca pelo assunto", () => {
  it("proposeNewBlogPost continua risk=sensitive (nunca vira 'clinical' só por o assunto envolver saúde)", () => {
    expect(getToolRisk(PROPOSE_NEW_BLOG_POST_TOOL_NAME)).toBe("sensitive");
    expect(requiresConfirmation("sensitive")).toBe(true);
  });

  it("searchEditorialSources é risk=read (consulta, nunca escreve, executa automaticamente)", () => {
    expect(getToolRisk(SEARCH_EDITORIAL_SOURCES_TOOL_NAME)).toBe("read");
  });

  it("ambas as tools ficam disponíveis só para ADMIN_ASSISTANT (nunca para PATIENT_ASSISTANT)", () => {
    const toolNames = [PROPOSE_NEW_BLOG_POST_TOOL_NAME, SEARCH_EDITORIAL_SOURCES_TOOL_NAME];
    const adminTools = buildToolSet(toolNames, "ADMIN_ASSISTANT");
    expect(Object.keys(adminTools)).toEqual(expect.arrayContaining(toolNames));

    const patientTools = buildToolSet(toolNames, "PATIENT_ASSISTANT");
    expect(Object.keys(patientTools)).toHaveLength(0);
  });
});

describe("blogDomainRequiresMedicalDisclaimer", () => {
  it("exige disclaimer para medication, clinical_condition e supplement", () => {
    expect(blogDomainRequiresMedicalDisclaimer("medication")).toBe(true);
    expect(blogDomainRequiresMedicalDisclaimer("clinical_condition")).toBe(true);
    expect(blogDomainRequiresMedicalDisclaimer("supplement")).toBe(true);
  });

  it("não exige disclaimer para nutrition, behavior, maternal_child, general_health ou domínio ausente", () => {
    expect(blogDomainRequiresMedicalDisclaimer("nutrition")).toBe(false);
    expect(blogDomainRequiresMedicalDisclaimer("behavior")).toBe(false);
    expect(blogDomainRequiresMedicalDisclaimer(null)).toBe(false);
    expect(blogDomainRequiresMedicalDisclaimer(undefined)).toBe(false);
  });

  it("o texto do disclaimer não instrui uma dose nem substitui acompanhamento médico", () => {
    expect(BLOG_MEDICATION_DISCLAIMER).toMatch(/n(a|ã)o substitui avalia(c|ç)(a|ã)o individual/i);
    expect(BLOG_MEDICATION_DISCLAIMER).not.toMatch(/\d+\s*mg/i);
  });
});
