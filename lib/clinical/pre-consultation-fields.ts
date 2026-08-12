/**
 * Definição canônica dos campos da pré-consulta.
 *
 * Este módulo é a FONTE ÚNICA DE VERDADE da estrutura do formulário de
 * pré-consulta. As chaves aqui correspondem 1:1 às chaves de
 * `LegacyFormSchema` em lib/validators/submission.ts — o schema de
 * submissão continua sendo o contrato clínico; este módulo apenas descreve
 * COMO cada campo é apresentado, perguntado e validado na interface
 * conversacional (e no formulário tradicional).
 *
 * Princípio: SCHEMA CONTROLS WHAT / AI CONTROLS HOW. A IA nunca recebe
 * liberdade para inventar campos nem opções — tudo o que ela pode perguntar
 * está descrito aqui, e o backend re-valida qualquer `normalizedValue`
 * contra o schema Zod do campo antes de persistir.
 */

export type IntakeFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "single_choice"
  | "multiple_choice"
  | "boolean";

export interface IntakeFieldOption {
  value: string;
  label: string;
}

export type IntakeVisibilityRule = (answers: Record<string, unknown>) => boolean;

export interface IntakeFieldDefinition {
  /** Chave idêntica à coluna do schema de submissão (LegacyFormSchema). */
  key: string;
  /** Seção canônica à qual o campo pertence. */
  section: IntakeSectionId;
  type: IntakeFieldType;
  label: string;
  /** Pergunta em linguagem natural que a IA pode usar para apresentar o campo. */
  conversationalPrompt: string;
  /** Campo obrigatório para a submissão final (independentemente do fluxo). */
  required: boolean;
  /** Opções válidas para single_choice / multiple_choice. */
  options?: IntakeFieldOption[];
  /** Regra determinística de exibição; ausente = sempre visível. */
  visibleWhen?: IntakeVisibilityRule;
  /** Campos sensíveis exigem confiança alta antes de gravação silenciosa. */
  sensitive?: boolean;
  /** Texto de unidade, exibido visualmente (ex.: "kg", "cm"). */
  unit?: string;
}

export type IntakeSectionId =
  | "tipo_atendimento"
  | "sobre_voce"
  | "crianca"
  | "momento_atual"
  | "historico_saude"
  | "suplementacao"
  | "rotina_comportamento"
  | "estilo_vida"
  | "saude_intestinal"
  | "preferencias"
  | "rotina_essencial"
  | "expectativas"
  | "espaco_livre";

export const INTAKE_SECTION_IDS = [
  "tipo_atendimento",
  "sobre_voce",
  "crianca",
  "momento_atual",
  "historico_saude",
  "suplementacao",
  "rotina_comportamento",
  "estilo_vida",
  "saude_intestinal",
  "preferencias",
  "rotina_essencial",
  "expectativas",
  "espaco_livre",
] as const;

export const INTAKE_SECTION_LABELS: Record<IntakeSectionId, string> = {
  tipo_atendimento: "Tipo de atendimento",
  sobre_voce: "Sobre você",
  crianca: "Dados da criança",
  momento_atual: "Seu momento atual",
  historico_saude: "Histórico de saúde",
  suplementacao: "Suplementação",
  rotina_comportamento: "Rotina e comportamento alimentar",
  estilo_vida: "Estilo de vida e sono",
  saude_intestinal: "Saúde intestinal",
  preferencias: "Preferências",
  rotina_essencial: "Sua rotina essencial",
  expectativas: "Expectativas",
  espaco_livre: "Espaço livre",
};

const TIPO_ATENDIMENTO_OPTIONS: IntakeFieldOption[] = [
  { value: "Gestação", label: "Gestação" },
  { value: "Pós-parto", label: "Pós-parto" },
  { value: "Introdução alimentar", label: "Introdução alimentar" },
  { value: "Infantil", label: "Infantil" },
  { value: "TEA", label: "TEA" },
  { value: "Seletividade alimentar", label: "Seletividade alimentar" },
  { value: "Emagrecimento", label: "Emagrecimento" },
  { value: "Saúde intestinal", label: "Saúde intestinal" },
  { value: "Bariátrico", label: "Bariátrico" },
  { value: "Renal", label: "Renal" },
  { value: "Oncológico", label: "Oncológico" },
  { value: "Outro", label: "Outro" },
];

const OBJETIVO_OPTIONS: IntakeFieldOption[] = [
  { value: "Mais segurança na alimentação", label: "Mais segurança na alimentação" },
  { value: "Introdução alimentar", label: "Introdução alimentar" },
  { value: "Seletividade alimentar", label: "Seletividade alimentar" },
  { value: "Gestação/pós-parto", label: "Gestação/pós-parto" },
  { value: "Saúde intestinal", label: "Saúde intestinal" },
  { value: "Rotina mais leve", label: "Rotina mais leve" },
  { value: "Outro", label: "Outro" },
];

const SIM_NAO: IntakeFieldOption[] = [
  { value: "Sim", label: "Sim" },
  { value: "Não", label: "Não" },
];

const SIM_NAO_AS_VEZES: IntakeFieldOption[] = [
  { value: "Sim", label: "Sim" },
  { value: "Não", label: "Não" },
  { value: "Às vezes", label: "Às vezes" },
];

const SINTOMAS_ADULT: IntakeFieldOption[] = [
  { value: "Cansaço", label: "Cansaço" },
  { value: "Inchaço", label: "Inchaço" },
  { value: "Queda de cabelo", label: "Queda de cabelo" },
  { value: "Ansiedade", label: "Ansiedade" },
  { value: "Compulsão", label: "Compulsão" },
  { value: "Intestino preso", label: "Intestino preso" },
];

const SINTOMAS_PEDIATRIC: IntakeFieldOption[] = [
  { value: "Seletividade", label: "Seletividade" },
  { value: "Recusa alimentar", label: "Recusa alimentar" },
  { value: "Engasgos", label: "Engasgos" },
  { value: "Constipação", label: "Constipação" },
  { value: "Dor abdominal", label: "Dor abdominal" },
  { value: "Alergias", label: "Alergias" },
];

/** Mesma heurística determinística usada no schema de submissão e no formulário. */
export function isPediatricProfile(value: string | null | undefined): boolean {
  const normalized = (value ?? "").toLowerCase();
  return (
    normalized.includes("infantil") ||
    normalized.includes("tea") ||
    normalized.includes("introdu") ||
    normalized.includes("seletividade")
  );
}

export function isBariatricProfile(value: string | null | undefined): boolean {
  return (value ?? "").toLowerCase().includes("bariatri");
}

function pediatricOnly(): IntakeVisibilityRule {
  return (answers) => isPediatricProfile(typeof answers.tipoAtendimento === "string" ? answers.tipoAtendimento : undefined);
}

function nonPediatricOnly(): IntakeVisibilityRule {
  return (answers) => !isPediatricProfile(typeof answers.tipoAtendimento === "string" ? answers.tipoAtendimento : undefined);
}

/**
 * Definição canônica completa, em ordem de apresentação. `sintomas` aparece
 * uma única vez, com opções resolvidas em runtime conforme o perfil
 * (pediátrico vs adulto) — exatamente como o formulário tradicional faz.
 */
export const PRECONSULTATION_FIELDS: IntakeFieldDefinition[] = [
  { key: "tipoAtendimento", section: "tipo_atendimento", type: "single_choice", label: "Tipo de atendimento", conversationalPrompt: "Qual tipo de atendimento você procura?", required: false, options: TIPO_ATENDIMENTO_OPTIONS },

  { key: "nome", section: "sobre_voce", type: "text", label: "Nome completo", conversationalPrompt: "Qual é o seu nome completo?", required: true },
  { key: "idade", section: "sobre_voce", type: "text", label: "Idade", conversationalPrompt: "Qual é a sua idade?", required: false, unit: "anos" },
  { key: "nascimento", section: "sobre_voce", type: "date", label: "Data de nascimento", conversationalPrompt: "Qual é a sua data de nascimento?", required: false },
  { key: "whatsapp", section: "sobre_voce", type: "text", label: "WhatsApp", conversationalPrompt: "Qual é o seu WhatsApp (com DDD)?", required: true, sensitive: true },
  { key: "email", section: "sobre_voce", type: "text", label: "E-mail", conversationalPrompt: "Qual é o seu e-mail?", required: true, sensitive: true },
  { key: "profissao", section: "sobre_voce", type: "text", label: "Profissão", conversationalPrompt: "Qual é a sua profissão?", required: false },
  { key: "cidade", section: "sobre_voce", type: "text", label: "Cidade / Estado", conversationalPrompt: "Em qual cidade e estado você mora?", required: false },

  { key: "child_name", section: "crianca", type: "text", label: "Nome da criança", conversationalPrompt: "Qual é o nome da criança?", required: false, visibleWhen: pediatricOnly() },
  { key: "child_age", section: "crianca", type: "text", label: "Idade da criança", conversationalPrompt: "Qual é a idade da criança?", required: false, visibleWhen: pediatricOnly() },
  { key: "child_weight_kg", section: "crianca", type: "number", label: "Peso atual", conversationalPrompt: "Qual é o peso atual da criança?", required: false, unit: "kg", visibleWhen: pediatricOnly() },
  { key: "child_height_cm", section: "crianca", type: "number", label: "Estatura atual", conversationalPrompt: "Qual é a estatura atual da criança?", required: false, unit: "cm", visibleWhen: pediatricOnly() },
  { key: "child_birth_date", section: "crianca", type: "date", label: "Nascimento da criança", conversationalPrompt: "Qual é a data de nascimento da criança?", required: false, visibleWhen: pediatricOnly() },
  { key: "child_breastfeeding", section: "crianca", type: "textarea", label: "Aleitamento / fórmula / mamadeiras", conversationalPrompt: "Conte sobre aleitamento, fórmula ou mamadeiras.", required: false, visibleWhen: pediatricOnly() },
  { key: "child_food_repertoire", section: "crianca", type: "textarea", label: "Repertório alimentar atual", conversationalPrompt: "Quais alimentos a criança aceita ou recusa?", required: false, visibleWhen: pediatricOnly() },
  { key: "child_feeding_difficulties", section: "crianca", type: "textarea", label: "Dificuldades percebidas na alimentação", conversationalPrompt: "Há dificuldades como engasgos, seletividade ou recusas?", required: false, visibleWhen: pediatricOnly() },
  { key: "child_school_routine", section: "crianca", type: "textarea", label: "Rotina familiar, escola e cuidadores", conversationalPrompt: "Como é a rotina familiar, de escola e de cuidadores?", required: false, visibleWhen: pediatricOnly() },

  { key: "motivacao", section: "momento_atual", type: "textarea", label: "O que te motivou a buscar acompanhamento agora?", conversationalPrompt: "O que te motivou a buscar acompanhamento agora?", required: false },
  { key: "objetivo", section: "momento_atual", type: "single_choice", label: "Qual seu principal objetivo?", conversationalPrompt: "Qual é o seu principal objetivo?", required: false, options: OBJETIVO_OPTIONS },
  { key: "incomodo", section: "momento_atual", type: "textarea", label: "O que mais te incomoda hoje?", conversationalPrompt: "O que mais te incomoda hoje?", required: false },

  { key: "diagnostico", section: "historico_saude", type: "text", label: "Possui algum diagnóstico?", conversationalPrompt: "Possui algum diagnóstico de saúde? Se não, pode seguir sem preencher.", required: false, sensitive: true },
  { key: "medicacao", section: "historico_saude", type: "text", label: "Faz uso de medicação contínua? Qual?", conversationalPrompt: "Faz uso de medicação contínua? Quais?", required: false, sensitive: true },
  { key: "anticoncepcional", section: "historico_saude", type: "single_choice", label: "Usa anticoncepcional?", conversationalPrompt: "Você usa anticoncepcional?", required: false, options: SIM_NAO, visibleWhen: nonPediatricOnly() },
  { key: "gestante", section: "historico_saude", type: "single_choice", label: "Gestante ou amamentando?", conversationalPrompt: "Você está gestante ou amamentando?", required: false, options: SIM_NAO, visibleWhen: nonPediatricOnly() },
  { key: "sintomas", section: "historico_saude", type: "multiple_choice", label: "Apresenta com frequência:", conversationalPrompt: "Quais destes sintomas você apresenta com frequência?", required: false, options: SINTOMAS_ADULT, sensitive: true },

  { key: "suplementos", section: "suplementacao", type: "text", label: "Usa suplementos atualmente? Quais?", conversationalPrompt: "Você usa suplementos atualmente? Quais?", required: false },
  { key: "suplementosNegativo", section: "suplementacao", type: "text", label: "Já usou algo que não se adaptou?", conversationalPrompt: "Já usou algum suplemento que não se adaptou?", required: false },

  { key: "rotina", section: "rotina_comportamento", type: "textarea", label: "Como é sua rotina diária?", conversationalPrompt: "Como é a sua rotina diária (horários, trabalho, refeições)?", required: false },
  { key: "semComer", section: "rotina_comportamento", type: "single_choice", label: "Fica muito tempo sem comer?", conversationalPrompt: "Você fica muito tempo sem comer?", required: false, options: SIM_NAO_AS_VEZES, visibleWhen: nonPediatricOnly() },
  { key: "comerEmocao", section: "rotina_comportamento", type: "single_choice", label: "Come mais por fome ou emoção?", conversationalPrompt: "Você come mais por fome ou por emoção?", required: false, options: [{ value: "Fome", label: "Fome" }, { value: "Emoção", label: "Emoção" }, { value: "Os dois", label: "Os dois" }], visibleWhen: nonPediatricOnly() },
  { key: "fomeDia", section: "rotina_comportamento", type: "textarea", label: "Como avalia sua fome ao longo do dia?", conversationalPrompt: "Como você avalia sua fome ao longo do dia?", required: false },

  { key: "sonoHoras", section: "estilo_vida", type: "text", label: "Horas de sono", conversationalPrompt: "Quantas horas você dorme por noite?", required: false, unit: "horas" },
  { key: "descansada", section: "estilo_vida", type: "single_choice", label: "Acorda descansada?", conversationalPrompt: "Você acorda descansada?", required: false, options: SIM_NAO_AS_VEZES },
  { key: "estresse", section: "estilo_vida", type: "single_choice", label: "Nível de estresse", conversationalPrompt: "Como está o seu nível de estresse?", required: false, options: [{ value: "Baixo", label: "Baixo" }, { value: "Moderado", label: "Moderado" }, { value: "Alto", label: "Alto" }] },
  { key: "atividadeFisica", section: "estilo_vida", type: "textarea", label: "Pratica atividade física? Frequência?", conversationalPrompt: "Você pratica atividade física? Com que frequência?", required: false },

  { key: "intestinoFreq", section: "saude_intestinal", type: "single_choice", label: "Frequência intestinal", conversationalPrompt: "Com que frequência você vai ao banheiro?", required: false, options: [{ value: "1x ou menos", label: "1x ou menos" }, { value: "2-3x", label: "2-3x" }, { value: "Todo dia", label: "Todo dia" }, { value: "Mais de 1x/dia", label: "Mais de 1x/dia" }] },
  { key: "desconforto", section: "saude_intestinal", type: "single_choice", label: "Sente estufamento/desconforto?", conversationalPrompt: "Você sente estufamento ou desconforto abdominal?", required: false, options: [{ value: "Sempre", label: "Sempre" }, { value: "Às vezes", label: "Às vezes" }, { value: "Raramente", label: "Raramente" }, { value: "Não", label: "Não" }] },

  { key: "naoGosta", section: "preferencias", type: "text", label: "Alimentos que não gosta/tolera", conversationalPrompt: "Quais alimentos você não gosta ou não tolera?", required: false },
  { key: "favoritos", section: "preferencias", type: "text", label: "Alimentos que não podem faltar", conversationalPrompt: "Quais alimentos não podem faltar para você?", required: false },

  { key: "diaAlimentar", section: "rotina_essencial", type: "textarea", label: "Descreva um dia alimentar típico", conversationalPrompt: "Descreva um dia alimentar típico, com horários e quantidades.", required: false },

  { key: "expectativas", section: "expectativas", type: "textarea", label: "O que espera do acompanhamento?", conversationalPrompt: "O que você espera do acompanhamento?", required: false },
  { key: "disposicao", section: "expectativas", type: "number", label: "De 0 a 10, disposta a mudar?", conversationalPrompt: "De 0 a 10, o quanto você está disposta a mudar?", required: false, unit: "0–10" },

  { key: "espacoLivre", section: "espaco_livre", type: "textarea", label: "Mais alguma coisa?", conversationalPrompt: "Tem mais alguma coisa que você gostaria de compartilhar?", required: false },
  { key: "privacyAccepted", section: "espaco_livre", type: "boolean", label: "Aceite da Política de Privacidade", conversationalPrompt: "Você leu e aceita a Política de Privacidade?", required: true },
];

/**
 * Chaves que fazem parte da entrevista guiada. `companyWebsite` (honeypot
 * anti-bot) fica de fora — é responsabilidade do fluxo de submissão.
 */
export const PRECONSULTATION_FIELD_KEYS = PRECONSULTATION_FIELDS.map((field) => field.key);

const FIELD_INDEX = new Map<string, IntakeFieldDefinition>();
for (const field of PRECONSULTATION_FIELDS) FIELD_INDEX.set(field.key, field);

export function getIntakeField(key: string): IntakeFieldDefinition | undefined {
  return FIELD_INDEX.get(key);
}

/** Ordem canônica de apresentação dos campos (índice na lista). */
export function getIntakeFieldOrder(key: string): number {
  const index = PRECONSULTATION_FIELDS.findIndex((field) => field.key === key);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Retorna as opções corretas de `sintomas` considerando o perfil atual.
 * O formulário tradicional faz essa troca; a entrevista guiada reutiliza a
 * mesma regra determinística.
 */
export function getSintomasOptions(answers: Record<string, unknown>): IntakeFieldOption[] {
  return isPediatricProfile(typeof answers.tipoAtendimento === "string" ? answers.tipoAtendimento : undefined)
    ? SINTOMAS_PEDIATRIC
    : SINTOMAS_ADULT;
}

/** Representação serializável (JSON-safe) de um campo — sem `visibleWhen`. */
export interface IntakeFieldView {
  key: string;
  section: IntakeSectionId;
  type: IntakeFieldType;
  label: string;
  conversationalPrompt: string;
  required: boolean;
  sensitive: boolean;
  unit: string | null;
  options: IntakeFieldOption[];
}

export function toFieldView(field: IntakeFieldDefinition, answers: Record<string, unknown>): IntakeFieldView {
  const options = field.key === "sintomas" ? getSintomasOptions(answers) : (field.options ?? []);
  return {
    key: field.key,
    section: field.section,
    type: field.type,
    label: field.label,
    conversationalPrompt: field.conversationalPrompt,
    required: field.required,
    sensitive: field.sensitive === true,
    unit: field.unit ?? null,
    options,
  };
}
