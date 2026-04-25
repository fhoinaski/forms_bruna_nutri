import type { SubmissionWithAnswers } from "@/lib/repositories/submissions";
import type { PreAnalysis } from "@/lib/repositories/pre-analyses";
import type { ProtocolDraftOutput } from "@/lib/validators/ai-protocol";

export const PROMPT_VERSION = "v1.0.0";

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

async function generateWithAnthropicAi(
  input: GenerateProtocolInput,
  apiKey: string,
  model: string
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

  const systemPrompt = `Você é um assistente de apoio a nutricionistas. Seu papel é gerar rascunhos de conduta nutricional para revisão profissional.

REGRAS ABSOLUTAS:
- Nunca gere diagnósticos fechados
- Nunca use linguagem determinística como "diagnóstico certo", "prescrição automática", "tratamento garantido"
- Use sempre linguagem de sugestão: "pontos de atenção", "hipóteses de organização", "rascunho de conduta"
- Deixe claro que tudo precisa de revisão profissional
- Não substitua a avaliação clínica real

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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} — ${err.slice(0, 200)}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const text = data.content.find((c) => c.type === "text")?.text ?? "";

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
  const apiKey = process.env.AI_API_KEY;
  const provider = process.env.AI_PROVIDER ?? "anthropic";
  const model = process.env.AI_MODEL ?? "claude-haiku-4-5-20251001";

  if (!apiKey) {
    const output = generateRuleBasedDraft(input);
    return {
      output,
      aiModel: "rule-based-fallback",
      promptVersion: PROMPT_VERSION,
    };
  }

  try {
    let output: ProtocolDraftOutput;

    if (provider === "anthropic") {
      output = await generateWithAnthropicAi(input, apiKey, model);
    } else {
      // Outros provedores: fallback por segurança
      console.warn(`[protocol-agent] Provider "${provider}" não suportado — usando fallback`);
      output = generateRuleBasedDraft(input);
      output.generatedWithoutExternalAi = true;
    }

    return { output, aiModel: model, promptVersion: PROMPT_VERSION };
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
