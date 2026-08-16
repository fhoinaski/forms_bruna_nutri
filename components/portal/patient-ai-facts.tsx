"use client";

import { formatDateBR, formatDateTimeBR } from "@/components/dashboard/ai-facts";
import type { PatientAssistantFactsPayload } from "@/lib/ai/core/patient-response";
import type {
  GetMyMealPlanOutput,
  GetMyMealDetailsOutput,
  GetMyAppointmentsOutput,
  GetMyTasksOutput,
  SearchAllowedFoodAlternativesOutput,
  FoodAlternativeOption,
  PatientMealItemSummary,
} from "@/lib/ai/agents/patient/patient-portal-agent";
import type { PatientAvailableSlotsResult } from "@/lib/ai/agents/patient/patient-scheduling-agent";
import type { GetMyRequestsOutput } from "@/lib/ai/agents/patient/patient-request-agent";

/**
 * "DO SEU ACOMPANHAMENTO" — dados determinísticos do próprio paciente
 * (secao 9/31 do pedido). Reusa formatDateBR/formatDateTimeBR do widget
 * admin (funcoes puras, sem acoplamento) em vez de reimplementar formatacao
 * de data.
 */

function MealItemsList({ items }: { items: PatientMealItemSummary[] }) {
  if (!items.length) return <p className="text-xs text-[#75675E]">Nenhum item registrado.</p>;
  return (
    <ul className="space-y-1 text-sm text-[#3A3028]">
      {items.map((item, index) => (
        <li key={index} className="flex justify-between gap-3 border-b border-[#EFE2D6] pb-1 last:border-0 last:pb-0">
          <span>{item.food}</span>
          <span className="shrink-0 font-semibold">{[item.quantity, item.unit].filter(Boolean).join(" ")}</span>
        </li>
      ))}
    </ul>
  );
}

function MealPlanFacts({ data }: { data: GetMyMealPlanOutput }) {
  if (!data.found) return <p className="text-xs text-[#75675E]">Não encontrei um plano alimentar ativo.</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#607A56]">{data.mealPlanTitle}</p>
      {data.meals.map((meal, index) => (
        <div key={index}>
          <p className="text-sm font-semibold">{meal.name}{meal.suggestedTime ? ` — ${meal.suggestedTime}` : ""}</p>
          <MealItemsList items={meal.items} />
        </div>
      ))}
    </div>
  );
}

function MealDetailFacts({ data }: { data: GetMyMealDetailsOutput }) {
  if (!data.found) return <p className="text-xs text-[#75675E]">Não encontrei essa refeição no seu plano atual.</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{data.mealName}{data.suggestedTime ? ` — ${data.suggestedTime}` : ""}</p>
      <MealItemsList items={data.items} />
    </div>
  );
}

function AppointmentsFacts({ data }: { data: GetMyAppointmentsOutput }) {
  if (!data.appointments.length) return <p className="text-xs text-[#75675E]">Nenhuma consulta futura encontrada.</p>;
  return (
    <div className="space-y-2">
      {data.appointments.map((appointment, index) => (
        <div key={index} className="rounded-lg border border-[#E6D5C5] bg-white px-3 py-2">
          <p className="text-sm font-semibold">{formatDateTimeBR(appointment.startsAtIso)}</p>
          <p className="text-xs text-[#75675E]">{appointment.type}{appointment.location ? ` — ${appointment.location}` : ""}</p>
        </div>
      ))}
    </div>
  );
}

function TasksFacts({ data }: { data: GetMyTasksOutput }) {
  if (!data.tasks.length) return <p className="text-xs text-[#75675E]">Não há tarefas pendentes no momento.</p>;
  return (
    <ul className="space-y-1 text-sm text-[#3A3028]">
      {data.tasks.map((task, index) => (
        <li key={index} className="rounded-lg border border-[#E6D5C5] bg-white px-3 py-2">
          {task.title}
          {task.dueDate && <span className="text-[#9A8B80]"> — prazo {formatDateBR(task.dueDate)}</span>}
        </li>
      ))}
    </ul>
  );
}

function FoodAlternativesFacts({
  data,
  onRequestReview,
}: {
  data: SearchAllowedFoodAlternativesOutput;
  onRequestReview?: (alternative: FoodAlternativeOption) => void;
}) {
  if (!data.found) {
    if (data.reason === "ambiguous_item") {
      return (
        <div className="space-y-1.5">
          <p className="text-xs text-[#75675E]">Encontrei mais de uma refeição com esse alimento — qual delas?</p>
          <ul className="space-y-1 text-sm text-[#3A3028]">
            {data.matches.map((match) => (
              <li key={match.itemId} className="rounded-lg border border-[#E6D5C5] bg-white px-3 py-2">
                <strong>{match.food}</strong> — {match.mealName}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    return (
      <p className="text-xs text-[#75675E]">
        {data.reason === "item_not_in_plan" ? "Não encontrei esse alimento no seu plano atual." : "Não encontrei um plano alimentar ativo."}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-[#75675E]">Em {data.mealName}: <strong>{data.currentFood}</strong></p>
      {data.substitution && <FoodSubstitutionFacts substitution={data.substitution} />}
      {data.alternatives.length === 0 ? (
        <p className="text-xs text-[#75675E]">Não encontrei opções parecidas na base de alimentos.</p>
      ) : (
        <ul className="space-y-1.5 text-sm text-[#3A3028]">
          {data.alternatives.map((alternative) => (
            <li key={alternative.tacoNumber} className="flex items-center justify-between gap-2 rounded-lg border border-[#E6D5C5] bg-white px-3 py-2">
              <span>{alternative.descricao}</span>
              {onRequestReview && (
                <button
                  type="button"
                  onClick={() => onRequestReview(alternative)}
                  className="shrink-0 rounded-full border border-[#D9E4D3] bg-[#EEF3EA] px-2.5 py-1 text-[11px] font-semibold text-[#4F6847] transition hover:bg-[#E1EBDB]"
                >
                  Enviar pedido
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] italic text-[#9A8B80]">Essas opções não alteram seu plano automaticamente — enviar um pedido só avisa sua nutricionista para revisar.</p>
    </div>
  );
}

/**
 * Renderiza o resultado ESTRUTURADO da engine determinística
 * (lib/nutrition/food-substitution.ts) — a quantidade em "safe" vem pronta
 * do campo `targetQuantity`, nunca reformatada/recalculada aqui (secao 2/12
 * do pedido: linguagem simples, sem jargão, mas o número nunca muda).
 */
function FoodSubstitutionFacts({ substitution }: { substitution: NonNullable<Extract<SearchAllowedFoodAlternativesOutput, { found: true }>["substitution"]> }) {
  if (substitution.status === "safe") {
    return (
      <p className="rounded-lg border border-[#D9E4D3] bg-[#EEF3EA] px-3 py-2 text-sm text-[#3A3028]">
        Você pode substituir <strong>{substitution.sourceQuantity} g de {substitution.sourceFoodName}</strong> por aproximadamente{" "}
        <strong>{substitution.targetQuantity} g de {substitution.targetFoodName}</strong>, mantendo uma equivalência compatível com essa refeição.
        Essa sugestão considera o seu plano atual e ainda precisa passar pela sua nutricionista.
      </p>
    );
  }
  if (substitution.status === "ambiguous") {
    return (
      <div className="rounded-lg border border-[#E6D5C5] bg-white px-3 py-2 text-sm text-[#3A3028]">
        <p>Encontrei mais de uma opção parecida — qual delas você quis dizer?</p>
        <ul className="mt-1 list-disc pl-4 text-xs text-[#75675E]">
          {substitution.candidates.map((candidate) => <li key={candidate.id}>{candidate.name}</li>)}
        </ul>
      </div>
    );
  }
  return (
    <p className="rounded-lg border border-[#E7C9A9] bg-white px-3 py-2 text-xs leading-5 text-[#9B6F59]">
      Essa troca precisa de uma avaliação da sua nutricionista. Você pode registrar sua dúvida para análise.
    </p>
  );
}

const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending_review: "Aguardando análise",
  reviewed: "Em análise",
  resolved: "Resolvida",
  dismissed: "Encerrada",
};

function MyRequestsFacts({ data }: { data: GetMyRequestsOutput }) {
  if (!data.requests.length) return <p className="text-xs text-[#75675E]">Você ainda não enviou nenhuma solicitação.</p>;
  return (
    <ul className="space-y-1.5 text-sm text-[#3A3028]">
      {data.requests.map((request, index) => (
        <li key={index} className="rounded-lg border border-[#E6D5C5] bg-white px-3 py-2">
          <p className="line-clamp-2">{request.patientText}</p>
          <p className="mt-1 text-[11px] font-semibold text-[#9A6F5E]">
            {REQUEST_STATUS_LABELS[request.status] ?? request.status} — {formatDateBR(request.createdAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function AvailableSlotsFacts({ data, onPickSlot }: { data: PatientAvailableSlotsResult; onPickSlot?: (iso: string) => void }) {
  if (!data.slots.length) return <p className="text-xs text-[#75675E]">Nenhum horário disponível encontrado.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {data.slots.map((iso) => (
        <button
          key={iso}
          type="button"
          onClick={() => onPickSlot?.(iso)}
          disabled={!onPickSlot}
          className="rounded-full border border-[#D9E4D3] bg-white px-3 py-1.5 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4] disabled:opacity-70"
        >
          {formatDateTimeBR(iso)}
        </button>
      ))}
    </div>
  );
}

export function PatientFactsCard({
  facts,
  onPickSlot,
  onRequestFoodReview,
}: {
  facts: PatientAssistantFactsPayload;
  onPickSlot?: (iso: string) => void;
  onRequestFoodReview?: (alternative: FoodAlternativeOption) => void;
}) {
  return (
    <div className="max-w-[92%] space-y-2 rounded-2xl border border-[#E6D5C5] bg-[#FBF7F1] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#607A56]">Do seu acompanhamento</p>
      {facts.type === "meal_plan" && <MealPlanFacts data={facts.data} />}
      {facts.type === "meal_detail" && <MealDetailFacts data={facts.data} />}
      {facts.type === "appointments" && <AppointmentsFacts data={facts.data} />}
      {facts.type === "tasks" && <TasksFacts data={facts.data} />}
      {facts.type === "food_alternatives" && <FoodAlternativesFacts data={facts.data} onRequestReview={onRequestFoodReview} />}
      {facts.type === "available_slots" && <AvailableSlotsFacts data={facts.data} onPickSlot={onPickSlot} />}
      {facts.type === "my_requests" && <MyRequestsFacts data={facts.data} />}
    </div>
  );
}
