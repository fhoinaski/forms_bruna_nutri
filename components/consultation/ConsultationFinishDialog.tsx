"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { ConsultationChecklist, type ConsultationChecklistState } from "@/components/consultation/ConsultationChecklist";

const DEFAULT_CHECKLIST: ConsultationChecklistState = {
  anthropometryUpdated: false,
  evolutionRecorded: false,
  planReviewed: false,
  protocolReviewed: false,
  tasksDefined: false,
  followUpScheduled: false,
};

/**
 * Finalizar consulta (secao 15/16) — checklist nao bloqueante, depois
 * finaliza. Gerar resumo estruturado e o pacote de tarefas pos-consulta
 * continuam disponiveis pelo Copiloto (proposals consultation_summary /
 * consultation_tasks_batch) antes ou depois de fechar este dialogo —
 * decisao de escopo documentada no relatorio final (nao duplicamos aqui a
 * UI de confirmacao de proposta que o Copiloto ja tem).
 */
export function ConsultationFinishDialog({
  consultationSessionId,
  clientId,
  onClose,
  onFinished,
}: {
  consultationSessionId: string;
  clientId: string;
  onClose: () => void;
  onFinished: () => void;
}) {
  const [checklist, setChecklist] = useState<ConsultationChecklistState>(DEFAULT_CHECKLIST);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");

  async function finish() {
    setFinishing(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/consultation-sessions/${consultationSessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist }),
      });
      if (!response.ok) throw new Error();
      onFinished();
    } catch {
      setError("Não foi possível finalizar a consulta agora.");
      setFinishing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#EDE1D6] bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-[#3A3028]">Finalizar consulta</h2>
          <button type="button" onClick={onClose} className="text-[#9A978A] hover:text-[#3A3028]"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 text-xs text-[#75675E]">
          Checklist só para lembrar — nada aqui impede finalizar. Se quiser gerar o resumo estruturado da consulta ou criar tarefas em lote, peça ao copiloto antes de fechar.
        </p>
        <ConsultationChecklist state={checklist} onChange={setChecklist} />
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-[#EDE1D6] px-4 py-2 text-sm font-semibold text-[#75675E] hover:bg-[#FBF7F1]">Cancelar</button>
          <button type="button" disabled={finishing} onClick={() => void finish()} className="brand-btn-primary">
            {finishing ? "Finalizando..." : "Finalizar consulta"}
          </button>
        </div>
      </div>
    </div>
  );
}
