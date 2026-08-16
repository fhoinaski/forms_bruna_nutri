import type { ProposedActionKind } from "@/lib/ai/schemas/action.schema";

/**
 * Classificacao de recuperacao por proposal kind — usada quando uma
 * proposta fica presa em 'executing' (processo morreu no meio) e NAO existe
 * registro em ai_proposal_executions provando que o side effect aconteceu.
 * Esse estado e ambiguo por definicao: pode ser "nada aconteceu" ou "o side
 * effect aconteceu mas o processo morreu antes de gravar a chave de
 * idempotencia" — as duas hipoteses sao indistinguiveis so olhando o banco.
 *
 * "automatic" so e usado quando o proprio handler tem uma garantia PROPRIA
 * (nao inventada aqui) de que executa-lo de novo produz um resultado
 * seguro em QUALQUER dos dois cenarios acima:
 *   - kind idempotente por natureza (UPDATE/upsert que so sobrescreve os
 *     mesmos campos: client_protocol, nutrition_record, pre_analysis) — rodar
 *     de novo reproduz o mesmo estado final, tenha rodado 0 ou 1 vez antes;
 *   - kind com um guard de negocio amarrado à IDENTIDADE do proprio pedido
 *     (nao a um estado geral do sistema): new_client tem UNIQUE constraint
 *     em email/telefone normalizados (migration 0032) — se a segunda
 *     tentativa falhar com "ja existe", isso PROVA que a primeira tentativa
 *     teve sucesso, entao reportar falha e nao duplicar esta sempre correto;
 *     meal_plan_change tem o baseVersion (concorrencia otimista) — se a
 *     versao ja mudou, rodar de novo falha alto e nunca aplica por cima;
 *     patient_change_request tem deduplicacao deterministica pela IDENTIDADE
 *     do proprio pedido (mesmo cliente+tipo+referencias+texto).
 *
 * Kinds que so fazem INSERT sem nenhuma chave de identidade amarrada ao
 * pedido (new_appointment, new_task, new_recipe, new_protocol,
 * new_blog_post) sempre vao para "manual": rodar de novo cegamente cria um
 * segundo registro, sem excecao.
 *
 * patient_appointment_request e um caso intermediario que FOI considerado
 * para "automatic" e descartado: ele tem um guard (no maximo 1 consulta
 * futura), mas esse guard e amarrado ao ESTADO GERAL do paciente (numero de
 * consultas futuras), nao à identidade deste pedido especifico — se a
 * primeira tentativa teve sucesso e a segunda for bloqueada pelo guard, a
 * mensagem de erro nao prova que foi ESTA tentativa que criou a consulta
 * (poderia ser outra, criada por outro canal enquanto isso). Reportar
 * "falhou" nesse caso seria enganoso se a consulta realmente foi criada por
 * este pedido — por isso fica em "manual", como os INSERTs puros.
 */
export type RecoveryStrategy = "automatic" | "manual";

export const RECOVERY_STRATEGY_BY_KIND: Record<ProposedActionKind, RecoveryStrategy> = {
  new_appointment: "manual",
  new_task: "manual",
  new_client: "automatic",
  new_recipe: "manual",
  new_protocol: "manual",
  client_protocol: "automatic",
  nutrition_record: "automatic",
  pre_analysis: "automatic",
  new_blog_post: "manual",
  meal_plan_change: "automatic",
  patient_appointment_request: "manual",
  patient_change_request: "automatic",
  // consultation_tasks_batch: INSERT puro (varias tarefas), sem chave de
  // identidade amarrada ao pedido — mesmo raciocinio de new_task/new_appointment.
  consultation_tasks_batch: "manual",
  // consultation_summary: UPDATE idempotente (sobrescreve summary_json da
  // mesma sessao) — mesmo raciocinio de client_protocol/nutrition_record.
  consultation_summary: "automatic",
  // FASE 3 (safe writes): os 4 kinds abaixo sao UPDATE por id guardado por
  // um snapshot do estado anterior (previousStartsAtIso/previousStatus) —
  // mesmo raciocinio de meal_plan_change.baseVersion: se a primeira
  // tentativa teve sucesso, o snapshot da segunda tentativa nao bate mais
  // com o estado atual e ela falha alto (409), o que PROVA sucesso da
  // primeira — nunca aplica duas vezes.
  reschedule_appointment: "automatic",
  cancel_appointment: "automatic",
  resolve_patient_request: "automatic",
  mark_payment_received: "automatic",
};

export function getRecoveryStrategy(kind: string): RecoveryStrategy {
  return (RECOVERY_STRATEGY_BY_KIND as Record<string, RecoveryStrategy | undefined>)[kind] ?? "manual";
}
