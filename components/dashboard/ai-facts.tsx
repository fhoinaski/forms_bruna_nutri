"use client";

import type {
  AssistantFactsPayload,
  ClientPendingTasksFacts as ClientPendingTasksFactsData,
} from "@/lib/ai/core/ai-response";
import type { GetClientEvolutionSummaryOutput } from "@/lib/ai/agents/clinical/evolution-summary-agent";
import type { AvailableSlotsResult } from "@/lib/ai/agents/appointments/availability-lookup-agent";
import type { PatientsWithPendenciesResult } from "@/lib/ai/agents/appointments/schedule-lookup-agent";

/**
 * Renderiza "DADOS DO SISTEMA" (secao 9/11 do pedido de UX) — todo numero
 * aqui vem pronto de `AssistantFactsPayload`, calculado deterministicamente
 * no backend. Nenhum componente aqui interpreta ou arredonda nada; se um
 * campo vier nulo/ausente, mostramos "sem dado", nunca inventamos.
 */

export function formatDateBR(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export function formatDateTimeBR(iso: string): string {
  const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  return `${date} às ${time}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#EDE1D6] bg-white px-2.5 py-1.5">
      <span className="text-xs text-[#75675E]">{label}</span>
      <span className="text-xs font-semibold text-[#3A3028]">{value}</span>
    </div>
  );
}

function Comparison({ label, before, after, unit }: { label: string; before: number; after: number; unit: string }) {
  const diff = Math.round((after - before) * 10) / 10;
  const sign = diff > 0 ? "+" : "";
  return (
    <div className="rounded-lg border border-[#EDE1D6] bg-white px-2.5 py-1.5">
      <p className="text-xs text-[#75675E]">{label}</p>
      <p className="text-sm font-semibold text-[#3A3028]">
        {before}{unit} → {after}{unit}{" "}
        <span className="text-xs font-normal text-[#8A7B70]">({sign}{diff}{unit})</span>
      </p>
    </div>
  );
}

function ClientEvolutionFacts({ data }: { data: GetClientEvolutionSummaryOutput }) {
  if (!data.found) {
    return <p className="text-xs text-[#75675E]">Não encontrei esse paciente.</p>;
  }
  const hasComparison = data.previousWeightKg !== null && data.currentWeightKg !== null;
  return (
    <div className="space-y-1.5">
      {hasComparison && (
        <Comparison label="Peso" before={data.previousWeightKg as number} after={data.currentWeightKg as number} unit=" kg" />
      )}
      {!hasComparison && data.currentWeightKg !== null && <Metric label="Peso atual" value={`${data.currentWeightKg} kg`} />}
      {data.bmi !== null && <Metric label="IMC mais recente" value={String(data.bmi)} />}
      {data.lastAppointment && <Metric label="Última consulta" value={formatDateBR(data.lastAppointment.date)} />}
      {!data.lastAppointment && <Metric label="Última consulta" value="nenhuma registrada" />}
      {!hasComparison && data.currentWeightKg === null && (
        <p className="text-xs text-[#75675E]">Não há avaliações suficientes para calcular evolução.</p>
      )}
      <p className="text-[11px] text-[#A9978A]">{data.measurementsOnRecord} avaliação(ões) registrada(s) no total.</p>
    </div>
  );
}

function AvailableSlotsFacts({ data, onPickSlot }: { data: AvailableSlotsResult; onPickSlot?: (iso: string) => void }) {
  if (!data.slots.length) {
    return <p className="text-xs text-[#75675E]">Nenhum horário disponível encontrado nesse período.</p>;
  }
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {data.slots.map((iso, index) => (
          <button
            key={iso}
            type="button"
            onClick={() => onPickSlot?.(iso)}
            disabled={!onPickSlot}
            className="rounded-full border border-[#D9E4D3] bg-white px-2.5 py-1 text-xs font-semibold text-[#4F6847] transition hover:bg-[#EAF0E4] disabled:cursor-default disabled:opacity-70"
          >
            {data.slotsDisplay[index] ?? formatDateTimeBR(iso)}
          </button>
        ))}
      </div>
      {data.truncated && (
        <p className="text-[11px] text-[#A9978A]">
          Mostrando {data.slots.length} de {data.totalFound} horários — estreite o período para ver outros.
        </p>
      )}
    </div>
  );
}

function PatientsWithPendenciesFacts({ data }: { data: PatientsWithPendenciesResult }) {
  if (!data.patients.length) {
    return <p className="text-xs text-[#75675E]">Nenhuma consulta encontrada para {formatDateBR(`${data.date}T12:00:00`)}.</p>;
  }
  return (
    <div className="space-y-1.5">
      {data.patients.map((patient) => (
        <div key={`${patient.clientId}-${patient.appointmentTime}`} className="rounded-lg border border-[#EDE1D6] bg-white px-2.5 py-1.5">
          <p className="text-xs font-semibold text-[#3A3028]">
            {formatDateTimeBR(patient.appointmentTime).split(" às ")[1]} — {patient.clientName}
          </p>
          <p className="text-[11px] text-[#75675E]">{patient.appointmentTitle}</p>
          {patient.pendingTasks.length > 0 ? (
            <p className="mt-1 text-[11px] text-[#8C5F50]">Pendente: {patient.pendingTasks.join("; ")}</p>
          ) : (
            <p className="mt-1 text-[11px] text-[#A9978A]">Sem pendências.</p>
          )}
        </div>
      ))}
      {data.truncated && (
        <p className="text-[11px] text-[#A9978A]">
          Mostrando {data.patients.length} de {data.totalFound} — refine por um intervalo menor para ver todos.
        </p>
      )}
    </div>
  );
}

function ClientPendingTasksFacts({ data }: { data: ClientPendingTasksFactsData }) {
  if (!data.found) {
    return <p className="text-xs text-[#75675E]">Não encontrei esse paciente.</p>;
  }
  if (!data.tasks.length) {
    return <p className="text-xs text-[#75675E]">Nenhuma tarefa pendente registrada para {data.clientName}.</p>;
  }
  return (
    <ul className="space-y-1 text-xs leading-5 text-[#3A3028]">
      {data.tasks.map((task, index) => (
        <li key={index} className="rounded-lg border border-[#EDE1D6] bg-white px-2.5 py-1.5">
          {task.title}
          {task.dueDate && <span className="text-[#A9978A]"> — prazo {formatDateBR(task.dueDate)}</span>}
        </li>
      ))}
    </ul>
  );
}

export function FactsCard({ facts, onPickSlot }: { facts: AssistantFactsPayload; onPickSlot?: (iso: string) => void }) {
  return (
    <div className="max-w-[92%] space-y-2 rounded-2xl border border-[#D9E4D3] bg-[#F9FBF7] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#607A56]">Dados do sistema</p>
      {facts.type === "client_evolution" && <ClientEvolutionFacts data={facts.data} />}
      {facts.type === "available_slots" && <AvailableSlotsFacts data={facts.data} onPickSlot={onPickSlot} />}
      {facts.type === "patients_with_pendencies" && <PatientsWithPendenciesFacts data={facts.data} />}
      {facts.type === "client_pending_tasks" && <ClientPendingTasksFacts data={facts.data} />}
    </div>
  );
}
