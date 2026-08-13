import { getIntakeField } from "@/lib/clinical/pre-consultation-fields";
import {
  getOrderedTopics,
  getTopicDefinition,
  INTAKE_STEP_GROUPS,
  isTopicApplicable,
  type IntakeTopicDefinition,
  type IntakeTopicStep,
} from "@/lib/ai/agents/patient/intake/intake-topics";
import type {
  IntakeInteraction,
  IntakeNextInteraction,
  IntakeSessionState,
  IntakeTopicId,
} from "@/lib/ai/agents/patient/intake/intake-types";

/**
 * Flow engine da pré-consulta. A UI apenas renderiza `currentInteraction` —
 * aqui é onde o servidor decide "qual pergunta vem agora" (§44/§46).
 *
 * O LLM NÃO controla topic routing: a ordem deriva do perfil determinístico
 * e das coberturas abaixo (§47).
 */

function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "boolean") return value === true;
  return true;
}

export function stepKeyOf(topicId: IntakeTopicId, stepKey: string): string {
  return `${topicId}:${stepKey}`;
}

export function isStepDone(state: IntakeSessionState, topicId: IntakeTopicId, stepKey: string): boolean {
  const key = stepKeyOf(topicId, stepKey);
  // Estado legado/parcial pode não trazer os arrays de passos; trata como vazio.
  return (state.completedSteps ?? []).includes(key) || (state.skippedSteps ?? []).includes(key);
}

function stepFieldAnswered(step: IntakeTopicStep, answers: Record<string, unknown>): boolean {
  if (!step.field) return false;
  return isAnswered(answers[step.field]);
}

/** Um passo "prompt" está satisfeito se já foi respondido/pulado ao menos uma vez. */
function stepPromptSatisfied(
  state: IntakeSessionState,
  topic: IntakeTopicDefinition,
  step: IntakeTopicStep
): boolean {
  if (isStepDone(state, topic.id, step.stepKey)) return true;
  if (!step.promptFields?.length) return false;
  // Se ao menos um dos campos centrais do passo já está respondido, o passo
  // foi parcialmente coberto — não repetimos a pergunta.
  return step.promptFields.some((key) => isAnswered(state.answers[key]));
}

export interface TopicCoverage {
  topicId: IntakeTopicId;
  requiredMissing: string[];
  coreMissing: string[];
  /** Suficiência prática: informação essencial do tópico foi coletada. */
  sufficient: boolean;
  complete: boolean;
}

export function getTopicCoverage(state: IntakeSessionState, topic: IntakeTopicDefinition): TopicCoverage {
  const requiredMissing = topic.requiredFields.filter((key) => !isAnswered(state.answers[key]));
  const coreMissing = topic.coreFields.filter((key) => !isAnswered(state.answers[key]));

  const pending = topic.steps.filter((step) => {
    if (step.kind === "message") return false;
    if (step.field) {
      // Passo objetivo: pendente se ainda não concluído E o campo não respondido.
      if (isStepDone(state, topic.id, step.stepKey)) return false;
      if (stepFieldAnswered(step, state.answers)) return false;
      return true;
    }
    return !stepPromptSatisfied(state, topic, step);
  });

  const allStepsDone = pending.length === 0;
  // Tópico suficiente quando os campos essenciais foram coletados (ou todos os
  // passos terminados). Não exige 100% dos opcionais (§19).
  const sufficient = coreMissing.length === 0 || allStepsDone;
  const complete = requiredMissing.length === 0 && sufficient;

  return { topicId: topic.id, requiredMissing, coreMissing, sufficient, complete };
}

/** Tópico com passos pendentes, na ordem efetiva. */
export function findCurrentTopic(state: IntakeSessionState): IntakeTopicDefinition | null {
  const ordered = getOrderedTopics(state.answers);

  // Se já existe tópico ativo válido, continua nele até completá-lo.
  if (state.currentTopic) {
    const active = getTopicDefinition(state.currentTopic);
    if (active && isTopicApplicable(active, state.answers)) {
      const coverage = getTopicCoverage(state, active);
      if (!coverage.complete) return active;
    }
  }

  for (const topic of ordered) {
    const coverage = getTopicCoverage(state, topic);
    if (!coverage.complete) return topic;
  }
  return null;
}

export function isTopicComplete(state: IntakeSessionState, topicId: IntakeTopicId): boolean {
  const topic = getTopicDefinition(topicId);
  if (!topic) return true;
  return getTopicCoverage(state, topic).complete;
}

export function getNextTopic(state: IntakeSessionState): IntakeTopicDefinition | null {
  return findCurrentTopic(state);
}

function nextStepOf(topic: IntakeTopicDefinition, state: IntakeSessionState): IntakeTopicStep | null {
  for (const step of topic.steps) {
    if (step.kind === "message") continue;
    if (step.field) {
      if (isStepDone(state, topic.id, step.stepKey)) continue;
      if (stepFieldAnswered(step, state.answers)) continue;
      return step;
    }
    if (!stepPromptSatisfied(state, topic, step)) return step;
  }
  return null;
}

function buildInteraction(topic: IntakeTopicDefinition, step: IntakeTopicStep): IntakeInteraction {
  const options = step.field ? getIntakeField(step.field)?.options ?? [] : [];

  return {
    kind: step.kind,
    topic: topic.id,
    stepKey: step.stepKey,
    prompt: step.prompt,
    helperText: step.helperText,
    unit: step.unit ?? null,
    inputMode: step.inputMode,
    options,
    allowSkip: step.allowSkip,
    skipLabel: step.skipLabel,
    required: step.required,
  };
}

export function getNextInteraction(state: IntakeSessionState): IntakeNextInteraction {
  const topic = findCurrentTopic(state);
  if (!topic) return { interaction: null, reviewReady: true };

  const step = nextStepOf(topic, state);
  if (!step) return { interaction: null, reviewReady: false };

  const transitionMessage =
    state.currentTopic === topic.id ? null : (topic.transition ?? null);

  return {
    interaction: buildInteraction(topic, step),
    transitionMessage,
    reviewReady: false,
  };
}

/** Estado visual do indicador por grandes etapas (§12): completed|active|pending. */
export function getTopicStepProgress(state: IntakeSessionState): {
  key: string;
  label: string;
  status: "completed" | "active" | "pending";
}[] {
  const current = findCurrentTopic(state);
  const currentGroupKey = current
    ? INTAKE_STEP_GROUPS.find((g) => g.topics.includes(current.id))?.key
    : undefined;

  return INTAKE_STEP_GROUPS.map((group) => {
    let status: "completed" | "active" | "pending" = "pending";
    if (currentGroupKey === group.key) {
      status = "active";
    } else {
      // Grupo concluído se todos os seus tópicos aplicáveis estão completos.
      const allComplete = group.topics.every((topicId) => {
        const topic = getTopicDefinition(topicId);
        if (!topic || !isTopicApplicable(topic, state.answers)) return true;
        return getTopicCoverage(state, topic).complete;
      });
      status = allComplete ? "completed" : "pending";
    }
    return { key: group.key, label: group.label, status };
  });
}