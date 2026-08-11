"use client";

export interface ConsultationChecklistState {
  anthropometryUpdated: boolean;
  evolutionRecorded: boolean;
  planReviewed: boolean;
  protocolReviewed: boolean;
  tasksDefined: boolean;
  followUpScheduled: boolean;
}

const ITEMS: { key: keyof ConsultationChecklistState; label: string }[] = [
  { key: "anthropometryUpdated", label: "Antropometria atualizada?" },
  { key: "evolutionRecorded", label: "Evolução registrada?" },
  { key: "planReviewed", label: "Plano revisado?" },
  { key: "protocolReviewed", label: "Protocolo revisado?" },
  { key: "tasksDefined", label: "Tarefas definidas?" },
  { key: "followUpScheduled", label: "Retorno definido?" },
];

/**
 * Checklist assistencial (secao 15) — NUNCA bloqueia a finalizacao, so
 * lembra a nutricionista do que costuma fazer parte do atendimento.
 */
export function ConsultationChecklist({ state, onChange }: { state: ConsultationChecklistState; onChange: (state: ConsultationChecklistState) => void }) {
  return (
    <div className="space-y-2">
      {ITEMS.map((item) => (
        <label key={item.key} className="flex items-center gap-2.5 rounded-lg border border-[#EDE1D6] bg-[#FBF7F1] px-3 py-2 text-sm text-[#3A3028]">
          <input
            type="checkbox"
            checked={state[item.key]}
            onChange={(event) => onChange({ ...state, [item.key]: event.target.checked })}
            className="h-4 w-4 rounded border-[#D9C4B2] text-[#7F9A74] focus:ring-[#7F9A74]/40"
          />
          {item.label}
        </label>
      ))}
    </div>
  );
}
