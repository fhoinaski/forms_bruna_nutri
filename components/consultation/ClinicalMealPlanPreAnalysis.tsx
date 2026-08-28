"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, RefreshCw, X } from "lucide-react";
import type { ClinicalCopilotAnalysis, ClinicalDataState, ClinicalFact } from "@/lib/clinical/meal-plan-copilot";

export function clinicalCopilotSummary(analysis: ClinicalCopilotAnalysis) {
  return {
    known: analysis.facts.filter((fact) => fact.state === "KNOWN").length,
    missing: analysis.facts.filter((fact) => fact.state === "MISSING").length,
    conflicts: analysis.facts.filter((fact) => fact.state === "CONFLICTING").length,
  };
}

function sourceLabel(fact: ClinicalFact) {
  if (fact.source === "pre_consultation") return "Pré-consulta";
  if (fact.source === "nutrition_record") return "Prontuário";
  return "";
}

function StateList({ facts, state }: { facts: ClinicalFact[]; state: ClinicalDataState }) {
  const visible = facts.filter((fact) => fact.state === state);
  if (!visible.length) return <p className="text-sm text-[#75675E]">Nenhum item nesta seção.</p>;
  return (
    <ul className="space-y-2">
      {visible.map((fact) => (
        <li key={fact.key} className={state === "CONFLICTING" ? "rounded-lg border border-[#E8C3BA] bg-[#FFF7F5] p-3" : "rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-3"}>
          <p className="text-sm font-semibold text-[#3A3028]">{fact.label}</p>
          {state === "MISSING" ? (
            <p className="mt-1 text-xs text-[#75675E]">Ainda não informado.</p>
          ) : state === "CONFLICTING" ? (
            <div className="mt-1 space-y-1 text-xs text-[#75675E]">
              <p><span className="font-semibold text-[#3A3028]">Prontuário:</span> {fact.value}</p>
              <p><span className="font-semibold text-[#3A3028]">Pré-consulta:</span> {fact.conflictingValue}</p>
              <p className="pt-1 font-semibold text-[#9A5C4E]">Confirme a informação durante a consulta.</p>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-[#3A3028]">{fact.value}</p>
              <p className="mt-1 text-xs text-[#75675E]">Origem: {sourceLabel(fact)}</p>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ClinicalMealPlanPreAnalysis({ clientId }: { clientId: string }) {
  const [analysis, setAnalysis] = useState<ClinicalCopilotAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/clinical-copilot`, { cache: "no-store" });
      if (!response.ok) throw new Error("analysis unavailable");
      setAnalysis(await response.json() as ClinicalCopilotAnalysis);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (loading) return <section aria-label="Carregando pré-análise para o plano" className="h-28 animate-pulse rounded-lg border border-[#EDE1D6] bg-[#FBF7F1]" />;
  if (error || !analysis) return (
    <section className="rounded-lg border border-[#E8C3BA] bg-[#FFF7F5] p-4" aria-live="polite">
      <p className="text-sm text-[#9A5C4E]">Não foi possível carregar a pré-análise.</p>
      <button type="button" onClick={() => void load()} className="mt-2 text-xs font-semibold text-[#9A5C4E] hover:text-[#3A3028]"><RefreshCw className="mr-1 inline h-3.5 w-3.5" />Tentar novamente</button>
    </section>
  );

  const summary = clinicalCopilotSummary(analysis);
  return (
    <>
      <section className="rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-4" aria-labelledby="clinical-copilot-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="brand-kicker">Plano alimentar</p>
            <h2 id="clinical-copilot-heading" className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">Pré-análise para o plano</h2>
            {summary.known === 0 && summary.conflicts === 0 ? <p className="mt-1 text-sm text-[#75675E]">Ainda faltam informações para preparar o plano.</p> : (
              <p className="mt-1 text-sm text-[#75675E]">{summary.known} informações disponíveis · {summary.missing} pendências{summary.conflicts ? ` · ${summary.conflicts} conflito${summary.conflicts === 1 ? "" : "s"}` : ""}</p>
            )}
          </div>
          <button type="button" onClick={() => setOpen(true)} className="brand-btn-secondary min-h-11 shrink-0">Revisar pré-análise <ChevronRight className="h-4 w-4" /></button>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="clinical-copilot-dialog-title" className="flex h-full w-full max-w-xl flex-col bg-[#FFFDFC] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between border-b border-[#EDE1D6] p-5">
              <div><p className="brand-kicker">Plano alimentar</p><h2 id="clinical-copilot-dialog-title" className="mt-1 font-serif text-2xl font-semibold text-[#3A3028]">Revisar pré-análise</h2></div>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Fechar pré-análise" className="rounded-md p-2 text-[#75675E] hover:bg-[#FBF7F1]"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
              <section><h3 className="mb-2 text-sm font-semibold text-[#3A3028]">Dados disponíveis</h3><StateList facts={analysis.facts} state="KNOWN" /></section>
              <section><h3 className="mb-2 text-sm font-semibold text-[#3A3028]">Informações pendentes</h3><StateList facts={analysis.facts} state="MISSING" /></section>
              {summary.conflicts > 0 && <section><h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#9A5C4E]"><AlertTriangle className="h-4 w-4" />Conflitos para revisar</h3><StateList facts={analysis.facts} state="CONFLICTING" /></section>}
              <section><h3 className="mb-2 text-sm font-semibold text-[#3A3028]">Perguntas sugeridas</h3>{analysis.questions.length ? <ol className="space-y-2">{analysis.questions.map((question, index) => <li key={question.key} className="rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-3 text-sm text-[#3A3028]"><span className="mr-2 font-semibold text-[#607A56]">{index + 1}.</span>{question.question}<p className="mt-1 pl-5 text-xs text-[#75675E]">{question.reason}</p></li>)}</ol> : <p className="text-sm text-[#607A56]">Pré-análise pronta. Não há perguntas prioritárias.</p>}</section>
            </div>
            <footer className="border-t border-[#EDE1D6] p-4"><button type="button" onClick={() => void load()} className="brand-btn-secondary"><RefreshCw className="h-4 w-4" />Atualizar análise</button></footer>
          </section>
        </div>
      )}
    </>
  );
}
