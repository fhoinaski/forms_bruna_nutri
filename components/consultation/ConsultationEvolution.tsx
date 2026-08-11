"use client";

import { useEffect, useState } from "react";
import { EvolutionChart } from "@/components/dashboard/EvolutionChart";

interface Evolution {
  id: string;
  measured_at: string | null;
  weight: number | null;
  body_fat_percentage: number | null;
}

/**
 * Grafico compacto de evolucao (secao 10) — reaproveita EvolutionChart tal
 * como esta (ja usado na aba Evolucao existente), sem nenhuma mudanca.
 */
export function ConsultationEvolution({ clientId }: { clientId: string }) {
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);

  useEffect(() => {
    fetch(`/api/admin/clients/${clientId}/evolutions`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setEvolutions)
      .catch(() => setEvolutions([]));
  }, [clientId]);

  return (
    <div className="rounded-2xl border border-[#EDE1D6] bg-white p-5">
      <h2 className="mb-3 font-serif text-lg font-semibold text-[#3A3028]">Evolução</h2>
      <EvolutionChart history={evolutions} />
    </div>
  );
}
