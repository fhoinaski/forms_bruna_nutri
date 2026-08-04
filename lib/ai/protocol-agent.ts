import type { SubmissionWithAnswers } from "@/lib/repositories/submissions";
import type { PreAnalysis } from "@/lib/repositories/pre-analyses";
import { generateText, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  getTemplatesByGroup,
  type ProtocolTemplate,
  type ProtocolTemplateTargetGroup,
} from "@/lib/repositories/protocol-templates";
import {
  DEFAULT_PROTOCOL_SYSTEM_PROMPT,
  getAISettings,
  type AISettings,
} from "@/lib/repositories/ai-settings";
import type { ProtocolDraftOutput } from "@/lib/validators/ai-protocol";

export const PROMPT_VERSION = "v1.1.0";

export interface GenerateProtocolInput {
  submission: SubmissionWithAnswers;
  preAnalysis: PreAnalysis | null;
  extraInstructions?: string | null;
}

export interface GenerateProtocolResult {
  output: ProtocolDraftOutput;
  aiModel: string;
  promptVersion: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getStr(answers: Record<string, unknown>, key: string): string {
  const v = answers[key];
  if (!v) return "";
  return String(v);
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function inferTargetGroup(input: GenerateProtocolInput): ProtocolTemplateTargetGroup {
  const a = input.submission.answers;
  const haystack = normalizeText([
    input.submission.form_type,
    input.submission.child_name,
    input.preAnalysis?.main_goal,
    input.preAnalysis?.summary,
    input.preAnalysis?.attention_points,
    input.preAnalysis?.restrictions,
    getStr(a, "tipoAtendimento"),
    getStr(a, "objetivo"),
    getStr(a, "diagnostico"),
    getStr(a, "gestante"),
    getStr(a, "child_age"),
  ].filter(Boolean).join(" "));

  if (haystack.includes("tea") || haystack.includes("autismo") || haystack.includes("espectro")) return "TEA";
  if (haystack.includes("sop") || haystack.includes("ovario policistico") || haystack.includes("policistico")) return "SOP";
  if (haystack.includes("vegano") || haystack.includes("vegetariano estrito") || haystack.includes("vegetarianismo estrito")) return "VEGETARIANO_ESTRITO";
  if (haystack.includes("endurance") || haystack.includes("corrida") || haystack.includes("ciclismo") || haystack.includes("triathlon")) return "ENDURANCE";
  if (haystack.includes("resistencia insulin") || haystack.includes("controle glicem") || haystack.includes("pre diabetes") || haystack.includes("prediabetes")) return "RESISTENCIA_INSULINA";
  if (haystack.includes("gestante") || haystack.includes("gravidez") || haystack.includes("gestacao")) return "GESTANTE";
  if (haystack.includes("idoso") || haystack.includes("60+") || haystack.includes("terceira idade")) return "IDOSO";
  if (haystack.includes("crianca") || haystack.includes("infantil") || input.submission.child_name) return "CRIANCA";
  if (haystack.includes("hipertrofia") || haystack.includes("ganho de massa") || haystack.includes("massa muscular")) return "HIPERTROFIA";
  if (haystack.includes("emagrec") || haystack.includes("perda de peso") || haystack.includes("deficit")) return "EMAGRECIMENTO";
  return "ADULTO_SAUDAVEL";
}

async function getRestrictiveTemplates(input: GenerateProtocolInput): Promise<{
  targetGroup: ProtocolTemplateTargetGroup;
  templates: ProtocolTemplate[];
}> {
  const targetGroup = inferTargetGroup(input);
  try {
    return { targetGroup, templates: await getTemplatesByGroup(targetGroup) };
  } catch (error) {
    console.warn("[protocol-agent] Nao foi possivel carregar modelos de protocolo:", error);
    return { targetGroup, templates: [] };
  }
}

function buildTemplateKnowledgeBase(targetGroup: ProtocolTemplateTargetGroup, templates: ProtocolTemplate[]): string {
  if (!templates.length) {
    return `Grupo alvo inferido: ${targetGroup}. Nenhum modelo ativo encontrado no banco; use apenas regras gerais conservadoras e sinalize necessidade de revisao profissional.`;
  }

  return [
    `Grupo alvo inferido: ${targetGroup}.`,
    "Modelos ativos retornados do banco D1:",
    ...templates.map((template) => [
      `## ${template.type} | ${template.title}`,
      template.content,
    ].join("\n")),
  ].join("\n\n");
}

// ── Gerador sem IA externa (fallback) ────────────────────────────────────

function generateRuleBasedDraft(input: GenerateProtocolInput): ProtocolDraftOutput {
  const { submission, preAnalysis } = input;
  const a = submission.answers;

  const nome = submission.patient_name;
  const tipo = getStr(a, "tipoAtendimento") || "Geral";
  const objetivo = getStr(a, "objetivo") || preAnalysis?.main_goal || "não especificado";
  const motivacao = getStr(a, "motivacao");
  const incomodo = getStr(a, "incomodo");
  const diagnostico = getStr(a, "diagnostico");
  const medicacao = getStr(a, "medicacao");
  const sintomas = getStr(a, "sintomas");
  const gestante = getStr(a, "gestante");
  const estresse = getStr(a, "estresse");
  const sonoHoras = getStr(a, "sonoHoras");
  const intestinoFreq = getStr(a, "intestinoFreq");
  const atividadeFisica = getStr(a, "atividadeFisica");
  const naoGosta = getStr(a, "naoGosta");
  const suplementos = getStr(a, "suplementos");

  const attentionPoints: string[] = [];
  if (preAnalysis?.attention_points) {
    attentionPoints.push(...preAnalysis.attention_points.split("\n").filter(Boolean));
  }
  if (diagnostico) attentionPoints.push(`Diagnóstico relatado: ${diagnostico}`);
  if (medicacao) attentionPoints.push(`Uso de medicação: ${medicacao}`);
  if (gestante && gestante.toLowerCase() === "sim") {
    attentionPoints.push("Paciente gestante ou amamentando — condutas requerem atenção especial");
  }
  if (sintomas) attentionPoints.push(`Sintomas relatados: ${sintomas}`);
  if (estresse === "Alto") attentionPoints.push("Estresse alto relatado — impacto potencial no padrão alimentar");
  if (sonoHoras && Number(sonoHoras) < 6) {
    attentionPoints.push(`Poucas horas de sono relatadas (${sonoHoras}h) — avaliar impacto metabólico`);
  }
  if (intestinoFreq === "1x ou menos") {
    attentionPoints.push("Frequência intestinal baixa — avaliar saúde intestinal");
  }
  if (!attentionPoints.length) {
    attentionPoints.push("Nenhum ponto crítico identificado automaticamente — revisar respostas completas");
  }

  const mainGoals: string[] = [];
  if (preAnalysis?.main_goal) mainGoals.push(preAnalysis.main_goal);
  if (objetivo && !mainGoals.includes(objetivo)) mainGoals.push(objetivo);
  if (!mainGoals.length) mainGoals.push("Definir objetivo principal na pré-análise");

  const restrictions: string[] = [];
  if (preAnalysis?.restrictions) {
    restrictions.push(...preAnalysis.restrictions.split("\n").filter(Boolean));
  }
  if (naoGosta) restrictions.push(`Não gosta/intolerâncias: ${naoGosta}`);

  const restrictionsNote = restrictions.length
    ? restrictions.join("; ")
    : "Sem restrições relatadas";

  const caseSummary = [
    `Paciente: ${nome}. Tipo de atendimento: ${tipo}.`,
    motivacao ? `Motivação: ${motivacao.slice(0, 200)}.` : "",
    incomodo ? `Principal incômodo: ${incomodo.slice(0, 200)}.` : "",
    preAnalysis?.summary ? `Resumo profissional: ${preAnalysis.summary}` : "",
    `Restrições identificadas: ${restrictionsNote}.`,
    atividadeFisica ? `Atividade física: ${atividadeFisica.slice(0, 150)}.` : "",
  ].filter(Boolean).join(" ");

  const suplementosNote = suplementos
    ? `Já faz uso de: ${suplementos}. Avaliar adequação antes de manter ou ajustar.`
    : "Sem suplementação atual relatada.";

  const safetyNotes = [
    "Este rascunho é gerado como apoio e NÃO substitui avaliação profissional completa.",
    "Todas as sugestões devem ser revisadas e adaptadas pela nutricionista responsável.",
    "Antes de implementar qualquer conduta, confirmar dados clínicos com a paciente.",
    suplementosNote,
  ];

  if (gestante && gestante.toLowerCase() === "sim") {
    safetyNotes.push(
      "ATENÇÃO: Paciente gestante/lactante — protocolos específicos obrigatórios. Revisar com extremo cuidado."
    );
  }

  return {
    title: `Rascunho de conduta — ${nome} — ${tipo}`,
    caseSummary,
    mainGoals,
    attentionPoints,
    suggestedProtocol: {
      durationDays: 90,
      phases: [
        {
          title: "Fase 1 — Avaliação e adaptação",
          days: "1–21",
          objective: "Entender hábitos atuais, iniciar ajustes graduais e criar vínculo terapêutico",
          actions: [
            "Revisar recordatório alimentar detalhado com a paciente",
            "Identificar horários e padrões alimentares reais",
            "Introduzir pelo menos 3 hábitos simples e sustentáveis",
            "Avaliar hidratação e qualidade do sono",
            "Orientar sobre leitura de rótulos básica",
          ],
          notes: "Fase de escuta ativa. Não impor mudanças drásticas. Priorizar adesão.",
        },
        {
          title: "Fase 2 — Organização alimentar",
          days: "22–60",
          objective: "Estruturar refeições, trabalhar objetivos específicos e ajustar suplementação",
          actions: [
            `Focar no objetivo principal: ${objetivo}`,
            "Montar cardápio semanal modelo com a paciente",
            "Ajustar suplementação conforme avaliação clínica",
            "Trabalhar comportamento alimentar (emocional, fome, saciedade)",
            "Revisar e ajustar protocolo conforme evolução",
          ],
          notes: "Revisar respostas da Fase 1 antes de avançar. Adaptar ao contexto real da paciente.",
        },
        {
          title: "Fase 3 — Manutenção e autonomia",
          days: "61–90",
          objective: "Consolidar hábitos, preparar paciente para autonomia e definir retorno",
          actions: [
            "Avaliar resultados subjetivos e objetivos",
            "Reforçar hábitos que funcionaram",
            "Identificar gatilhos de recaída e criar plano de resposta",
            "Definir frequência de retorno e acompanhamento futuro",
            "Elaborar guia personalizado para a paciente levar",
          ],
          notes: "Fase de consolidação. Empoderar a paciente com conhecimento e ferramentas práticas.",
        },
      ],
    },
    tasks: [
      {
        title: "Revisar este rascunho",
        description: "Analisar todos os pontos de atenção e adaptar às necessidades reais da paciente",
        dueInDays: 2,
      },
      {
        title: "Solicitar exames complementares (se aplicável)",
        description: "Avaliar necessidade de hemograma, vitamina D, ferro, tireoide, etc.",
        dueInDays: 7,
      },
      {
        title: "Primeira consulta / retorno",
        description: "Apresentar plano adaptado e iniciar Fase 1 do protocolo",
        dueInDays: 14,
      },
    ],
    followUpQuestions: [
      "Qual a disponibilidade real de tempo para preparar refeições?",
      "Há restrições financeiras que influenciem as escolhas alimentares?",
      "Como é a rotina nos fins de semana versus dias úteis?",
      "Há histórico familiar relevante para o objetivo?",
      "Qual o nível de motivação atual para mudanças (0-10)?",
    ],
    educationalMaterials: [
      "Guia de leitura de rótulos",
      "Como montar um prato equilibrado",
      "Sinais de fome e saciedade",
      "Receitas práticas para o objetivo: " + objetivo,
    ],
    safetyNotes,
    professionalReviewNotes: preAnalysis?.professional_notes
      ? `Notas profissionais registradas: ${preAnalysis.professional_notes}`
      : "Nenhuma nota profissional registrada na pré-análise. Revisar e completar antes de aprovar.",
    generatedWithoutExternalAi: true,
  };
}

// ── Gerador com IA externa (Anthropic Claude) ─────────────────────────────

function createConfiguredModel(settings: AISettings): LanguageModel {
  if (!settings.api_key) {
    throw new Error("API Key de IA nao configurada. Acesse Dashboard > Sistema > IA e salve uma chave valida.");
  }

  if (settings.provider === "openai") {
    return createOpenAI({ apiKey: settings.api_key })(settings.model);
  }

  if (settings.provider === "anthropic") {
    return createAnthropic({ apiKey: settings.api_key })(settings.model);
  }

  return createGoogle({ apiKey: settings.api_key })(settings.model);
}

async function generateWithConfiguredAi(
  input: GenerateProtocolInput,
  settings: AISettings,
  templateKnowledgeBase: string
): Promise<ProtocolDraftOutput> {
  const { submission, preAnalysis, extraInstructions } = input;
  const a = submission.answers;

  const answersText = Object.entries(a)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `- ${k}: ${String(v)}`)
    .join("\n");

  const preAnalysisText = preAnalysis
    ? [
        preAnalysis.summary ? `Resumo: ${preAnalysis.summary}` : "",
        preAnalysis.attention_points ? `Pontos de atenção: ${preAnalysis.attention_points}` : "",
        preAnalysis.main_goal ? `Objetivo principal: ${preAnalysis.main_goal}` : "",
        preAnalysis.restrictions ? `Restrições: ${preAnalysis.restrictions}` : "",
        preAnalysis.professional_notes ? `Notas profissionais: ${preAnalysis.professional_notes}` : "",
        `Prioridade: ${preAnalysis.priority}`,
      ].filter(Boolean).join("\n")
    : "Nenhuma pré-análise registrada.";

  const baseSystemPrompt = settings.protocol_system_prompt?.trim() || DEFAULT_PROTOCOL_SYSTEM_PROMPT;

  const systemPrompt = `${baseSystemPrompt}

REGRAS ABSOLUTAS:
- Nunca gere diagnósticos fechados
- Nunca use linguagem determinística como "diagnóstico certo", "prescrição automática", "tratamento garantido"
- Use sempre linguagem de sugestão: "pontos de atenção", "hipóteses de organização", "rascunho de conduta"
- Deixe claro que tudo precisa de revisão profissional
- Não substitua a avaliação clínica real
- Quando houver modelos ativos abaixo, siga ESTRITAMENTE a base retornada do banco
- Use a estrutura da DIETA como guia principal; não invente outra estrutura se houver dieta base
- Suplementação só pode usar nutrientes, categorias, faixas e alertas presentes nos modelos de SUPLEMENTACAO retornados
- Substituições só podem usar alimentos e grupos presentes nos modelos de SUBSTITUICAO retornados
- Se o caso exigir algo fora da base, registre como ponto de revisão profissional em safetyNotes, sem prescrever

BASE RESTRITIVA DE MODELOS:
${templateKnowledgeBase}

Gere um rascunho de conduta nutricional em JSON com exatamente esta estrutura:
{
  "title": "string",
  "caseSummary": "string",
  "mainGoals": ["string"],
  "attentionPoints": ["string"],
  "suggestedProtocol": {
    "durationDays": number,
    "phases": [{"title": "string", "days": "string", "objective": "string", "actions": ["string"], "notes": "string"}]
  },
  "tasks": [{"title": "string", "description": "string", "dueInDays": number}],
  "followUpQuestions": ["string"],
  "educationalMaterials": ["string"],
  "safetyNotes": ["string"],
  "professionalReviewNotes": "string"
}`;

  const userMessage = `Paciente: ${submission.patient_name}

RESPOSTAS DO FORMULÁRIO PRÉ-CONSULTA:
${answersText}

PRÉ-ANÁLISE PROFISSIONAL:
${preAnalysisText}

${extraInstructions ? `INSTRUÇÕES EXTRAS DA PROFISSIONAL:\n${extraInstructions}` : ""}

Gere o rascunho de conduta nutricional em JSON conforme estrutura especificada.`;

  const { text } = await generateText({
    model: createConfiguredModel(settings),
    system: systemPrompt,
    prompt: userMessage,
    maxOutputTokens: 4096,
  });

  // Extrai o JSON da resposta (pode vir com markdown code fence)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  const parsed = JSON.parse(jsonStr) as ProtocolDraftOutput;
  return parsed;
}

// ── Ponto de entrada principal ─────────────────────────────────────────────

export async function generateProtocolDraft(
  input: GenerateProtocolInput
): Promise<GenerateProtocolResult> {
  const settings = await getAISettings();
  const { targetGroup, templates } = await getRestrictiveTemplates(input);
  const templateKnowledgeBase = buildTemplateKnowledgeBase(targetGroup, templates);

  if (!settings.api_key) {
    throw new Error("API Key de IA nao configurada. Acesse Dashboard > Sistema > IA e salve uma chave valida antes de gerar protocolos.");
  }

  try {
    const output = await generateWithConfiguredAi(input, settings, templateKnowledgeBase);

    return {
      output,
      aiModel: `${settings.provider}:${settings.model}`,
      promptVersion: PROMPT_VERSION,
    };
  } catch (err) {
    // Se a IA falhar, não bloquear o fluxo — usar fallback
    console.error("[protocol-agent] IA externa falhou, usando fallback:", err);
    const output = generateRuleBasedDraft(input);
    return {
      output,
      aiModel: "rule-based-fallback",
      promptVersion: PROMPT_VERSION,
    };
  }
}
