"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ClientProtocol {
  id: string;
  protocol_title?: string;
  status: string;
  review_date: string | null;
  professional_notes: string | null;
  phase_count?: number;
  task_count?: number;
  completed_task_count?: number;
}

/**
 * Protocolo ativo (secao 13) — SO leitura aqui. Qualquer sugestao de
 * revisao vira uma proposta de atualizacao de notas via o Copiloto (Area
 * C), reaproveitando a proposta client_protocol ja existente — nunca um
 * avanco de fase automatico.
 */
export function ConsultationProtocol({ clientId }: { clientId: string }) {
  const [protocols, setProtocols] = useState<ClientProtocol[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/clients/${clientId}/protocols`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setProtocols(data))
      .catch(() => setProtocols([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  const active = protocols.find((protocol) => protocol.status === "ativo" || protocol.status === "pausado");

  return (
    <div className="rounded-2xl border border-[#EDE1D6] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-[#3A3028]">Protocolo</h2>
        <Link
          href={`/dashboard/clients/${clientId}?tab=plano-alimentar&view=protocolos`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-[#75675E] hover:text-[#3A3028]"
        >
          Ver protocolos (nova aba)
        </Link>
      </div>
      {loading ? (
        <p className="mt-2 text-sm text-[#75675E]">Carregando...</p>
      ) : !active ? (
        <p className="mt-2 text-sm text-[#75675E]">Nenhum protocolo ativo.</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          <p className="text-sm font-semibold text-[#3A3028]">{active.protocol_title ?? "Protocolo"}</p>
          <p className="text-xs text-[#75675E]">
            {active.completed_task_count ?? 0}/{active.task_count ?? 0} tarefas concluídas · {active.phase_count ?? 0} fase(s)
          </p>
          {active.review_date && <p className="text-xs text-[#9A6F5E]">Revisão prevista: {new Date(active.review_date).toLocaleDateString("pt-BR")}</p>}
          {active.professional_notes && <p className="text-xs text-[#75675E]">{active.professional_notes}</p>}
        </div>
      )}
    </div>
  );
}
