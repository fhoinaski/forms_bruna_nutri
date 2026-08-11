"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { calculateAgeInYears, calculateWeightDelta } from "@/lib/clinical/anthropometry";
import { ClinicalEvolutionForm } from "@/components/dashboard/ClinicalEvolutionForm";

interface Evolution {
  id: string;
  measured_at: string | null;
  weight: number | null;
  waist_cm: number | null;
  body_fat_percentage: number | null;
  bmi: number | null;
}

function diff(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return "—";
  const delta = Math.round((current - previous) * 10) / 10;
  return `${delta > 0 ? "+" : ""}${delta}`;
}

/**
 * Registro rapido de antropometria (secao 9) — reaproveita 100% do
 * ClinicalEvolutionForm ja usado na aba Antropometria (extraido do arquivo
 * gigante de detalhe do cliente). Comparacao Atual/Anterior/Diferenca e
 * SEMPRE calculada aqui no cliente, deterministicamente — nunca pela IA.
 */
export function ConsultationAnthropometry({ clientId, birthDate, biologicalSex }: { clientId: string; birthDate: string | null; biologicalSex: string | null }) {
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/admin/clients/${clientId}/evolutions`, { cache: "no-store" });
    if (response.ok) setEvolutions(await response.json());
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const sorted = [...evolutions]
    .filter((evolution) => evolution.measured_at)
    .sort((a, b) => new Date(b.measured_at as string).getTime() - new Date(a.measured_at as string).getTime());
  const current = sorted[0] ?? null;
  const previous = sorted[1] ?? null;
  const ageYears = calculateAgeInYears(birthDate);

  return (
    <div className="space-y-4 rounded-2xl border border-[#EDE1D6] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-[#3A3028]">Antropometria</h2>
        <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex items-center gap-1.5 rounded-full border border-[#D9E4D3] bg-[#EEF3EA] px-3 py-1.5 text-xs font-semibold text-[#4F6847] hover:bg-[#E1EBDB]">
          <Plus className="h-3.5 w-3.5" /> {showForm ? "Fechar" : "Registrar medidas"}
        </button>
      </div>

      {!loading && current && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9A6F5E]">
                <th className="pb-2">Medida</th>
                <th className="pb-2">Atual</th>
                <th className="pb-2">Anterior</th>
                <th className="pb-2">Diferença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFE2D6]">
              <Row label="Peso (kg)" current={current.weight} previous={previous?.weight ?? null} delta={calculateWeightDelta(current.weight, previous?.weight ?? null)} />
              <Row label="Cintura (cm)" current={current.waist_cm} previous={previous?.waist_cm ?? null} delta={current.waist_cm !== null && previous?.waist_cm != null ? Number(diff(current.waist_cm, previous.waist_cm)) : null} />
              <Row label="Gordura corporal (%)" current={current.body_fat_percentage} previous={previous?.body_fat_percentage ?? null} delta={current.body_fat_percentage !== null && previous?.body_fat_percentage != null ? Number(diff(current.body_fat_percentage, previous.body_fat_percentage)) : null} />
              <Row label="IMC" current={current.bmi} previous={previous?.bmi ?? null} delta={current.bmi !== null && previous?.bmi != null ? Number(diff(current.bmi, previous.bmi)) : null} />
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-[#9A978A]">Última medida: {new Date(current.measured_at as string).toLocaleDateString("pt-BR")}</p>
        </div>
      )}
      {!loading && !current && <p className="text-sm text-[#75675E]">Nenhuma medida registrada ainda.</p>}

      {showForm && (
        <ClinicalEvolutionForm
          clientId={clientId}
          biologicalSex={biologicalSex}
          ageYears={ageYears}
          onSuccess={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Row({ label, current, previous, delta }: { label: string; current: number | null; previous: number | null; delta: number | null }) {
  return (
    <tr>
      <td className="py-2 text-[#3A3028]">{label}</td>
      <td className="py-2 font-semibold text-[#3A3028]">{current ?? "—"}</td>
      <td className="py-2 text-[#75675E]">{previous ?? "—"}</td>
      <td className={`py-2 font-semibold ${delta !== null && delta < 0 ? "text-[#607A56]" : delta !== null && delta > 0 ? "text-[#B47F6A]" : "text-[#75675E]"}`}>
        {delta !== null ? `${delta > 0 ? "+" : ""}${delta}` : "—"}
      </td>
    </tr>
  );
}
