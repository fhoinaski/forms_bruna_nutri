import { normalize } from "@/lib/nutrition/normalize";

/**
 * Killer Feature 4 — deteccao DETERMINISTICA de sinal clinico na mensagem do
 * paciente (secao 4/Nivel 3 do pedido). Nao e "a IA decide se e clinico" —
 * e uma checagem por padrao de texto, em codigo, que roda ANTES de o modelo
 * ver a mensagem, e que remove a tool de substituicao do conjunto oferecido
 * quando disparada (patient-orchestrator.ts). Mesma filosofia de
 * `lib/ai/privacy/pii.ts` (`redactPii`): guardrail estrutural, nao so
 * instrucao de prompt — funciona mesmo se o modelo tentar ignorar a regra.
 *
 * Deliberadamente permissivo (falso positivo custa uma escalada extra para
 * a nutricionista; falso negativo poderia deixar uma queixa clinica passar
 * como se fosse so duvida de troca de alimento) — a assimetria de custo
 * justifica errar para o lado de escalar demais, nunca de menos.
 */

const CLINICAL_SIGNAL_PATTERNS = [
  "sintoma",
  "mal estar",
  "mal-estar",
  "passando mal",
  "me sentindo mal",
  "alergi",
  "reacao alergica",
  "intoleran",
  "gestante",
  "gravidez",
  "gravida",
  "amamentando",
  "amamentacao",
  "doenca",
  "diagnostic",
  "medicamento",
  "remedio",
  "suplemento",
  "dor de",
  "dor no",
  "dor na",
  "enjoo",
  "nausea",
  "vomito",
  "diarreia",
  "prisao de ventre",
  "febre",
  "tontura",
  "desmaio",
  "sangramento",
  "urgencia",
  "emergencia",
  "internad",
  "hospital",
  "pronto socorro",
  "mudei de objetivo",
  "mudanca de objetivo",
  "sem apetite",
  "perdi o apetite",
  "muita fome",
  "cirurgia",
  "pos operatorio",
];

/**
 * Verdadeiro quando o texto contem qualquer sinal de conteudo clinico —
 * paciente deve ser sempre escalado para a nutricionista nesses casos,
 * nunca respondido com uma decisao automatica (mesmo de Nivel 2).
 */
export function containsClinicalSignal(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;
  return CLINICAL_SIGNAL_PATTERNS.some((pattern) => normalized.includes(pattern));
}
