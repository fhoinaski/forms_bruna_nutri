"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { ConsultationAiBrief } from "@/lib/ai/agents/clinical/consultation-briefing";
import type { ConsultationSystemData } from "@/lib/ai/agents/clinical/consultation-briefing";

interface BriefState {
  systemData: ConsultationSystemData;
  aiBrief: ConsultationAiBrief | null;
  generatedAt: string;
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

/**
 * "Resumo para consulta" (secao 4) + "Preparar consulta com IA" (secao 5).
 * Dados do sistema SEMPRE deterministicos (renderizados mesmo sem IA
 * configurada); a interpretacao de IA e uma camada opcional, claramente
 * separada visualmente ("Leitura da IA" vs os cartoes de dados).
 */
export function ConsultationBrief({ consultationSessionId, initialBrief }: { consultationSessionId: string; initialBrief: unknown | null }) {
  const [brief, setBrief] = useState<BriefState | null>((initialBrief as BriefState) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function prepare() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/consultation-sessions/${consultationSessionId}/brief`, { method: "POST" });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { brief: BriefState };
      setBrief(data.brief);
    } catch {
      setError("Não foi possível preparar o briefing agora.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!brief) void prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = brief?.systemData;

  return (
    <div className="space-y-4 rounded-2xl border border-[#EDE1D6] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-[#3A3028]">Resumo para consulta</h2>
        <button type="button" onClick={() => void prepare()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-full border border-[#D9E4D3] bg-[#EEF3EA] px-3 py-1.5 text-xs font-semibold text-[#4F6847] hover:bg-[#E1EBDB] disabled:opacity-60">
          <Sparkles className="h-3.5 w-3.5" /> {loading ? "Preparando..." : "Preparar consulta com IA"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {!data ? (
        <p className="text-sm text-[#75675E]">{loading ? "Carregando..." : "Sem dados ainda."}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Última consulta" value={fmtDate(data.lastVisit.date)} />
            <Metric label="Peso atual" value={data.evolution.currentWeightKg !== null ? `${data.evolution.currentWeightKg} kg` : "—"} />
            <Metric
              label="Variação de peso"
              value={data.evolution.weightDeltaKg !== null ? `${data.evolution.weightDeltaKg > 0 ? "+" : ""}${data.evolution.weightDeltaKg} kg` : "—"}
            />
            <Metric label="Adesão (0-10)" value={data.evolution.adherenceScore !== null ? String(data.evolution.adherenceScore) : "—"} />
            <Metric label="Plano ativo" value={data.activePlan.title ?? "Nenhum"} />
            <Metric label="Protocolo ativo" value={data.activeProtocol?.title ?? "Nenhum"} />
            <Metric label="Tarefas pendentes" value={String(data.pending.tasks.length)} />
            <Metric label="Solicitações pendentes" value={String(data.pending.patientRequests.length)} />
          </div>

          {data.evolution.symptoms && (
            <p className="rounded-lg border border-[#EDE1D6] bg-[#FBF7F1] px-3 py-2 text-xs text-[#75675E]">
              <span className="font-semibold text-[#3A3028]">Sintomas na última avaliação: </span>{data.evolution.symptoms}
            </p>
          )}

          {brief?.aiBrief && (
            <div className="space-y-3 rounded-xl border border-[#D9E4D3] bg-[#F4F8F1] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#607A56]">Leitura da IA (apoio, não substitui julgamento clínico)</p>
              <p className="text-sm text-[#3A3028]">{brief.aiBrief.clinicalSummary}</p>
              <BriefSection title="Mudanças desde a última consulta" items={brief.aiBrief.changesSinceLastVisit} />
              <BriefSection title="Pontos de atenção" items={brief.aiBrief.attentionPoints} />
              <BriefSection title="Pendências" items={brief.aiBrief.pendingItems} />
              <BriefSection title="Sugestões de tópicos para hoje" items={brief.aiBrief.suggestedTopics} />
              <BriefSection title="Dados faltantes" items={brief.aiBrief.missingData} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#EDE1D6] bg-[#FBF7F1] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9A6F5E]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#3A3028]">{value}</p>
    </div>
  );
}

function BriefSection({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-[#4F6847]">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[#3A3028]">
        {items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    </div>
  );
}
