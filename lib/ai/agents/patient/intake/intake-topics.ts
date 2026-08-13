import {
  isBariatricProfile,
  isGestationalProfile,
  isPediatricProfile,
  isPostpartumProfile,
} from "@/lib/clinical/pre-consultation-fields";
import type { IntakeInteractionKind, IntakeTopicId } from "@/lib/ai/agents/patient/intake/intake-types";

/**
 * Motor de tópicos da pré-consulta. A unidade principal deixou de ser
 * "campo" e passou a ser "tópico/intenção de coleta" (§3/§4/§19 do produto).
 *
 * Cada tópico possui passos ordenados. Um passo "prompt" faz uma pergunta
 * aberta e a IA pode preencher MÚLTIPLOS campos (`promptFields` = allow-list),
 * reduzindo interações e chamadas LLM. Um passo "choice/multi_choice/number/
 * date/boolean" é objetivo e capturado deterministicamente, sem LLM.
 */

export interface IntakeTopicStep {
  /** Chave única do passo dentro do tópico (persistida em completedSteps). */
  stepKey: string;
  kind: IntakeInteractionKind;
  /** Pergunta natural apresentada ao paciente. */
  prompt: string;
  helperText?: string;
  /** Campo canônico (passos objetivos). */
  field?: string;
  /**
   * Allow-list de campos extraíveis (passos de prompt). A IA só pode devolver
   * campos presentes aqui; o servidor re-valida cada um contra o schema.
   */
  promptFields?: string[];
  unit?: string | null;
  inputMode?: "text" | "decimal" | "numeric" | "tel" | "email";
  required?: boolean;
  allowSkip?: boolean;
  skipLabel?: string;
}

export interface IntakeTopicDefinition {
  id: IntakeTopicId;
  /** Rótulo curto do passo indicador (ex.: "Saúde"). */
  title: string;
  /** Frase humana exibida na transição para este tópico. */
  transition?: string;
  steps: IntakeTopicStep[];
  /** Campos canonicalmente obrigatórios deste tópico (para sumário de cobertura). */
  requiredFields: string[];
  /** Campos de valor clínico/alimentar desejados (suficiência prática). */
  coreFields: string[];
  applicableWhen?: (answers: Record<string, unknown>) => boolean;
}

/** Ordem canônica de tópicos da experiência adulta padrão. */
const ADULT_TOPIC_ORDER: IntakeTopicId[] = [
  "current_moment",
  "service_type",
  "identity",
  "health",
  "routine",
  "nutrition",
  "expectations",
];

/**
 * Fluxo por perfil (§27). O `service_type` vem DEPOIS de `current_moment`
 * para criar engajamento antes da burocracia (§11); branches por atendimento
 * permanecem determinísticos via `applicableWhen` — a IA NÃO decide o perfil
 * clínico sozinha (§47), ele é confirmado por chips.
 */
const BRANCH_TOPICS: { id: IntakeTopicId; when: (a: Record<string, unknown>) => boolean }[] = [
  { id: "pediatric", when: (a) => isPediatricProfile(asProfile(a)) },
  { id: "gestational", when: (a) => isGestationalProfile(asProfile(a)) },
  { id: "postpartum", when: (a) => isPostpartumProfile(asProfile(a)) },
  { id: "bariatric", when: (a) => isBariatricProfile(asProfile(a)) },
];

function asProfile(answers: Record<string, unknown>): string {
  return typeof answers.tipoAtendimento === "string" ? answers.tipoAtendimento : "";
}

export const INTAKE_TOPICS: IntakeTopicDefinition[] = [
  {
    id: "current_moment",
    title: "Você",
    transition: "Antes de tudo, quero entender o que trouxe você até aqui.",
    requiredFields: [],
    coreFields: ["motivacao", "incomodo", "objetivo"],
    steps: [
      {
        stepKey: "motivo_inicial",
        kind: "textarea",
        prompt: "O que fez você procurar acompanhamento nutricional neste momento?",
        helperText: "Conte do seu jeito. Uma única resposta já me ajuda a entender bastante.",
        promptFields: ["motivacao", "incomodo"],
        required: false,
        allowSkip: true,
        skipLabel: "Prefiro contar durante a consulta",
      },
      {
        stepKey: "objetivo",
        kind: "single_choice",
        prompt: "E o que você mais gostaria de melhorar hoje?",
        field: "objetivo",
        required: false,
        allowSkip: true,
        skipLabel: "Ainda não sei",
      },
    ],
  },
  {
    id: "service_type",
    title: "Você",
    transition: "Entendi. Agora quero entender melhor para quem é o acompanhamento.",
    requiredFields: [],
    coreFields: ["tipoAtendimento"],
    steps: [
      {
        stepKey: "tipo_atendimento",
        kind: "single_choice",
        prompt: "O acompanhamento é para qual momento?",
        helperText: "Isso me ajuda a adaptar as próximas perguntas.",
        field: "tipoAtendimento",
        required: false,
      },
    ],
  },
  {
    id: "identity",
    title: "Você",
    transition: "Perfeito. Agora, alguns dados rápidos para a Bruna entrar em contato.",
    requiredFields: ["nome", "whatsapp", "email"],
    coreFields: ["nome", "whatsapp", "email"],
    steps: [
      { stepKey: "nome", kind: "text", prompt: "Qual é o seu nome completo?", field: "nome", inputMode: "text", required: true },
      { stepKey: "whatsapp", kind: "text", prompt: "Qual é o seu WhatsApp (com DDD)?", field: "whatsapp", inputMode: "tel", required: true },
      { stepKey: "email", kind: "text", prompt: "Qual é o seu e-mail?", field: "email", inputMode: "email", required: true },
    ],
  },
  {
    id: "health",
    title: "Saúde",
    transition: "Perfeito. Agora quero entender um pouco da sua saúde.",
    requiredFields: [],
    coreFields: ["diagnostico", "medicacao", "sintomas"],
    steps: [
      {
        stepKey: "saude_aberta",
        kind: "textarea",
        prompt: "Você tem algum diagnóstico ou faz uso de algum medicamento atualmente?",
        helperText: "Pode responder \"não\" se nada disso se aplicar. Pode citar sem pressa.",
        promptFields: ["diagnostico", "medicacao"],
        required: false,
        allowSkip: true,
        skipLabel: "Prefiro conversar sobre isso na consulta",
      },
      {
        stepKey: "sintomas",
        kind: "multi_choice",
        prompt: "Você apresenta com frequência:",
        field: "sintomas",
        required: false,
        allowSkip: true,
        skipLabel: "Nenhum destes",
      },
    ],
  },
  {
    id: "gestational",
    title: "Saúde",
    transition: "Agora quero entender um pouco da sua saúde e da gestação.",
    requiredFields: [],
    coreFields: ["gestational_details"],
    applicableWhen: (a) => isGestationalProfile(asProfile(a)),
    steps: [
      {
        stepKey: "gestacao",
        kind: "textarea",
        prompt: "Sobre a gestação: em que momento você está e como tem se sentido?",
        helperText: "Idade gestacional, ganho de peso, náuseas, constipação ou azia — o que fizer sentido.",
        promptFields: ["gestational_details"],
        required: false,
        allowSkip: true,
        skipLabel: "Prefiro conversar sobre isso na consulta",
      },
    ],
  },
  {
    id: "postpartum",
    title: "Saúde",
    transition: "Agora quero entender um pouco da sua saúde e do pós-parto.",
    requiredFields: [],
    coreFields: ["gestational_details"],
    applicableWhen: (a) => isPostpartumProfile(asProfile(a)),
    steps: [
      {
        stepKey: "pos_parto",
        kind: "textarea",
        prompt: "Sobre o pós-parto: há quanto tempo e como está a amamentação e sua rotina?",
        helperText: "Conte o que fizer sentido: tempo desde o parto, amamentação, fome, sono.",
        promptFields: ["gestational_details", "fomeDia"],
        required: false,
        allowSkip: true,
        skipLabel: "Prefiro conversar sobre isso na consulta",
      },
    ],
  },
  {
    id: "pediatric",
    title: "Saúde",
    transition: "Agora quero conhecer um pouco sobre a criança.",
    requiredFields: ["child_name", "child_age"],
    coreFields: ["child_name", "child_age", "child_feeding_difficulties"],
    applicableWhen: (a) => isPediatricProfile(asProfile(a)),
    steps: [
      { stepKey: "child_name", kind: "text", prompt: "Qual é o nome da criança?", field: "child_name", inputMode: "text", required: true },
      { stepKey: "child_age", kind: "text", prompt: "Qual é a idade da criança?", field: "child_age", inputMode: "text", required: true },
      {
        stepKey: "crianca_alimentacao",
        kind: "textarea",
        prompt: "Como é a alimentação da criança hoje?",
        helperText: "Aleitamento, fórmula, alimentos aceitos, recusas, engasgos e rotina das refeições.",
        promptFields: ["child_breastfeeding", "child_food_repertoire", "child_feeding_difficulties"],
        required: false,
        allowSkip: true,
        skipLabel: "Prefiro conversar sobre isso na consulta",
      },
    ],
  },
  {
    id: "bariatric",
    title: "Saúde",
    transition: "Agora quero entender um pouco sobre a sua cirurgia bariátrica.",
    requiredFields: [],
    coreFields: ["bariatric_details"],
    applicableWhen: (a) => isBariatricProfile(asProfile(a)),
    steps: [
      {
        stepKey: "bariatrica",
        kind: "textarea",
        prompt: "Sobre a cirurgia bariátrica: quando foi, qual tipo e como está a suplementação?",
        helperText: "Conte o que lembrar; a Bruna aprofunda na consulta.",
        promptFields: ["bariatric_details"],
        required: false,
        allowSkip: true,
        skipLabel: "Prefiro conversar sobre isso na consulta",
      },
    ],
  },
  {
    id: "routine",
    title: "Rotina",
    transition: "Ótimo. Falta conhecer um pouco da sua rotina e alimentação.",
    requiredFields: [],
    coreFields: ["rotina", "fomeDia", "atividadeFisica"],
    steps: [
      {
        stepKey: "rotina_aberta",
        kind: "textarea",
        prompt: "Como é a sua rotina no dia a dia?",
        helperText: "Horários, trabalho, refeições, fome ao longo do dia e atividade física.",
        promptFields: ["rotina", "fomeDia", "atividadeFisica"],
        required: false,
        allowSkip: true,
        skipLabel: "Prefiro conversar sobre isso na consulta",
      },
    ],
  },
  {
    id: "nutrition",
    title: "Alimentação",
    transition: "Quase lá. Só quero entender como costuma ser sua alimentação no dia a dia.",
    requiredFields: [],
    coreFields: ["diaAlimentar", "intestinoFreq", "naoGosta"],
    steps: [
      {
        stepKey: "dia_alimentar",
        kind: "textarea",
        prompt: "Descreva um dia alimentar típico para você.",
        helperText: "Café da manhã, almoço, jantar e o que costuma aparecer entre eles.",
        promptFields: ["diaAlimentar", "naoGosta", "favoritos", "suplementos"],
        required: false,
        allowSkip: true,
        skipLabel: "Prefiro conversar sobre isso na consulta",
      },
      {
        stepKey: "intestino",
        kind: "single_choice",
        prompt: "Com que frequência você vai ao banheiro?",
        field: "intestinoFreq",
        required: false,
        allowSkip: true,
        skipLabel: "Prefiro conversar sobre isso na consulta",
      },
    ],
  },
  {
    id: "expectations",
    title: "Final",
    transition: "Só mais uma coisa antes de finalizarmos.",
    // privacyAccepted é obrigatório no contrato canônico (LegacyFormSchema usa
    // z.literal(true)). Precisa estar em requiredFields para o tópico NÃO ser
    // considerado completo (reviewReady) sem o aceite — senão o passo
    // "privacidade" é pulado e o /complete responde 409.
    requiredFields: ["privacyAccepted"],
    coreFields: ["expectativas"],
    steps: [
      {
        stepKey: "expectativas",
        kind: "textarea",
        prompt: "O que você espera do acompanhamento?",
        helperText: "Em uma frase ou duas.",
        promptFields: ["expectativas"],
        required: false,
        allowSkip: true,
        skipLabel: "Prefiro contar durante a consulta",
      },
      {
        stepKey: "privacidade",
        kind: "boolean",
        prompt: "Você leu e aceita a Política de Privacidade?",
        helperText: "Seus dados são protegidos e usados apenas para a pré-consulta e o atendimento nutricional.",
        field: "privacyAccepted",
        required: true,
      },
    ],
  },
];

const TOPIC_INDEX = new Map<IntakeTopicId, IntakeTopicDefinition>();
for (const topic of INTAKE_TOPICS) TOPIC_INDEX.set(topic.id, topic);

export function getTopicDefinition(id: IntakeTopicId): IntakeTopicDefinition | undefined {
  return TOPIC_INDEX.get(id);
}

/** Localiza o passo (tópico + stepKey) responsável por coletar um campo. */
export function findStepForField(fieldKey: string): { topicId: IntakeTopicId; stepKey: string } | null {
  for (const topic of INTAKE_TOPICS) {
    for (const step of topic.steps) {
      if (step.field === fieldKey) return { topicId: topic.id, stepKey: step.stepKey };
      if (step.promptFields?.includes(fieldKey)) return { topicId: topic.id, stepKey: step.stepKey };
    }
  }
  return null;
}

export function isTopicApplicable(
  topic: IntakeTopicDefinition,
  answers: Record<string, unknown>
): boolean {
  return topic.applicableWhen ? topic.applicableWhen(answers) : true;
}

/**
 * Ordem efetiva dos tópicos considerando branches determinísticos. A IA não
 * decide a ordem — é derivada do perfil (`tipoAtendimento`) já confirmado.
 */
export function getOrderedTopics(answers: Record<string, unknown>): IntakeTopicDefinition[] {
  const ordered: IntakeTopicDefinition[] = [];

  for (const id of ADULT_TOPIC_ORDER) {
    const topic = getTopicDefinition(id)!;
    if (!isTopicApplicable(topic, answers)) continue;

    // Insere o tópico pediátrico logo após a identidade do responsável.
    if (id === "identity") {
      const pediatric = getTopicDefinition("pediatric")!;
      if (isTopicApplicable(pediatric, answers)) ordered.push(pediatric);
    }

    ordered.push(topic);

    // Branches clínicos logo após saúde (gestação → pós-parto → bariátrica).
    if (id === "health") {
      for (const branch of BRANCH_TOPICS) {
        const topic = getTopicDefinition(branch.id)!;
        if (topic.id === "pediatric") continue; // já inserido acima
        if (isTopicApplicable(topic, answers)) ordered.push(topic);
      }
    }
  }

  return ordered;
}

/** Rótulos dos grandes estágios do indicador de progresso (§12). */
export interface IntakeStepGroup {
  key: string;
  label: string;
  topics: IntakeTopicId[];
}

export const INTAKE_STEP_GROUPS: IntakeStepGroup[] = [
  { key: "voce", label: "Você", topics: ["current_moment", "service_type", "identity"] },
  { key: "saude", label: "Saúde", topics: ["health", "gestational", "postpartum", "pediatric", "bariatric"] },
  { key: "rotina", label: "Rotina", topics: ["routine"] },
  { key: "alimentacao", label: "Alimentação", topics: ["nutrition"] },
  { key: "final", label: "Final", topics: ["expectations", "review"] },
];

/**
 * Campos opcionais de baixo valor que NÃO são mais perguntados
 * automaticamente (§20). Permanecem suportados pelo schema e aparecem no
 * resumo "ver todos os dados", mas não prolongam a entrevista.
 */
export const LOW_VALUE_AUTOSKIPPED_FIELDS = new Set<string>([
  "idade",
  "nascimento",
  "profissao",
  "cidade",
  "child_weight_kg",
  "child_height_cm",
  "child_birth_date",
  "child_school_routine",
  "suplementosNegativo",
  "descansada",
  "estresse",
  "anticoncepcional",
  "desconforto",
  "disposicao",
  "espacoLivre",
]);

/**
 * Reformulação determinística por passo (§21/§44). Quando a extração
 * estruturada falha repetidamente, o servidor pede uma reformulação natural —
 * NUNCA pede ao modelo que invente outro prompt após falhar.
 */
const INTAKE_REPHRASE_PROMPTS: Record<string, string> = {
  "current_moment:motivo_inicial": "Não consegui organizar essa resposta. Pode resumir em poucas palavras o que te trouxe aqui?",
  "current_moment:objetivo": "Pode me contar, de um jeito mais simples, o que você mais quer melhorar?",
  "health:saude_aberta": "Pode resumir seus diagnósticos e medicamentos em uma frase curta?",
  "routine:rotina_aberta": "Pode descrever sua rotina pensando em manhã, tarde e noite?",
  "nutrition:dia_alimentar": "Pode resumir seu dia alimentar pensando em café da manhã, almoço, tarde e noite?",
  "expectations:expectativas": "Pode resumir, em uma frase, o que você espera do acompanhamento?",
};

const DEFAULT_REPHRASE_PROMPT =
  "Não consegui organizar completamente essa resposta. Pode me contar de outra forma?";

export function getRephrasePrompt(topicId: IntakeTopicId, stepKey: string): string {
  return INTAKE_REPHRASE_PROMPTS[`${topicId}:${stepKey}`] ?? DEFAULT_REPHRASE_PROMPT;
}