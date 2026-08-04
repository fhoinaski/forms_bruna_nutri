"use client";

import { Plus, Save, Trash2 } from "lucide-react";

export interface ProtocolPhaseForm {
  title: string;
  days: string;
  objective: string;
  actions: string[];
  notes: string;
}

export interface ProtocolFormValue {
  title: string;
  description: string;
  category: string;
  phases: ProtocolPhaseForm[];
}

export function emptyProtocolPhase(index = 0): ProtocolPhaseForm {
  return {
    title: `Fase ${index + 1}`,
    days: "",
    objective: "",
    actions: [],
    notes: "",
  };
}

export function ProtocolBuilder({
  value,
  onChange,
  onSubmit,
  saving,
  submitLabel = "Salvar protocolo",
  error,
}: {
  value: ProtocolFormValue;
  onChange: (value: ProtocolFormValue) => void;
  onSubmit: () => void;
  saving: boolean;
  submitLabel?: string;
  error?: string;
}) {
  const setField = (field: keyof Omit<ProtocolFormValue, "phases">, nextValue: string) => {
    onChange({ ...value, [field]: nextValue });
  };

  const setPhase = (index: number, patch: Partial<ProtocolPhaseForm>) => {
    onChange({
      ...value,
      phases: value.phases.map((phase, phaseIndex) =>
        phaseIndex === index ? { ...phase, ...patch } : phase
      ),
    });
  };

  const addPhase = () => {
    onChange({ ...value, phases: [...value.phases, emptyProtocolPhase(value.phases.length)] });
  };

  const removePhase = (index: number) => {
    onChange({ ...value, phases: value.phases.filter((_, phaseIndex) => phaseIndex !== index) });
  };

  return (
    <div className="space-y-6">
      <section className="brand-card p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="brand-label">Nome do protocolo</label>
            <input
              value={value.title}
              onChange={(event) => setField("title", event.target.value)}
              className="brand-input"
              placeholder="Ex: Rotina alimentar familiar - 8 semanas"
            />
          </div>
          <div>
            <label className="brand-label">Categoria</label>
            <input
              value={value.category}
              onChange={(event) => setField("category", event.target.value)}
              className="brand-input"
              placeholder="Ex: materno-infantil, comportamento alimentar"
            />
          </div>
          <div className="md:col-span-2">
            <label className="brand-label">Objetivo e contexto clínico</label>
            <textarea
              value={value.description}
              onChange={(event) => setField("description", event.target.value)}
              className="brand-input min-h-28 resize-y"
              placeholder="Descreva para quem este protocolo serve, objetivo central e critérios importantes."
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="brand-kicker mb-1">Plano de cuidado</p>
            <h2 className="font-serif text-2xl font-semibold">Fases do protocolo</h2>
            <p className="mt-1 text-sm text-[#75675E]">Cada ação pode virar uma tarefa com prazo na ficha da cliente.</p>
          </div>
          <button type="button" onClick={addPhase} className="brand-btn-secondary">
            <Plus className="h-4 w-4" />
            Adicionar fase
          </button>
        </div>

        {value.phases.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D9C4B2] bg-[#FFFDFC] p-8 text-center">
            <p className="text-sm font-semibold text-[#3A3028]">Comece pela primeira fase</p>
            <p className="mt-1 text-xs leading-5 text-[#75675E]">Organize período, objetivo, ações práticas e observações profissionais.</p>
            <button type="button" onClick={addPhase} className="brand-btn-secondary mt-4">
              <Plus className="h-4 w-4" />
              Criar primeira fase
            </button>
          </div>
        ) : (
          value.phases.map((phase, index) => (
            <article key={index} className="brand-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#EDE1D6] bg-[#FBF7F1] px-5 py-4">
                <div>
                  <p className="brand-kicker">Fase {index + 1}</p>
                  <p className="mt-1 text-sm font-semibold text-[#3A3028]">{phase.title || "Sem título"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removePhase(index)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50"
                  aria-label={`Remover fase ${index + 1}`}
                  title="Remover fase"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_160px]">
                <div>
                  <label className="brand-label">Título da fase</label>
                  <input value={phase.title} onChange={(event) => setPhase(index, { title: event.target.value })} className="brand-input" />
                </div>
                <div>
                  <label className="brand-label">Período em dias</label>
                  <input value={phase.days} onChange={(event) => setPhase(index, { days: event.target.value })} className="brand-input" placeholder="Ex: 1-14" />
                </div>
                <div className="md:col-span-2">
                  <label className="brand-label">Objetivo desta fase</label>
                  <textarea value={phase.objective} onChange={(event) => setPhase(index, { objective: event.target.value })} className="brand-input min-h-20 resize-y" />
                </div>
                <div className="md:col-span-2">
                  <label className="brand-label">Ações práticas, uma por linha</label>
                  <textarea
                    value={phase.actions.join("\n")}
                    onChange={(event) => setPhase(index, { actions: event.target.value.split("\n") })}
                    className="brand-input min-h-32 resize-y"
                    placeholder={"Organizar horários das refeições\nRegistrar aceitação alimentar\nRevisar hidratação"}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="brand-label">Observações profissionais</label>
                  <textarea value={phase.notes} onChange={(event) => setPhase(index, { notes: event.target.value })} className="brand-input min-h-20 resize-y" />
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={onSubmit} disabled={saving || !value.title.trim()} className="brand-btn-primary">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : submitLabel}
        </button>
      </div>
    </div>
  );
}
