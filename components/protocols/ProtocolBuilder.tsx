"use client";

import { useEffect, useMemo, useState } from "react";
import { Beef, Download, Flame, Plus, Save, Trash2, Wheat } from "lucide-react";
import {
  PROTOCOL_TEMPLATE_GROUP_LABELS,
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  PROTOCOL_TEMPLATE_TYPE_LABELS,
  type ProtocolTemplateTargetGroup,
  type ProtocolTemplateType,
} from "@/lib/protocol-templates/constants";
import { estimateMacrosFromLine, roundedMacros, sumMacros } from "@/lib/nutrition/macros";

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
  targetGroup?: ProtocolTemplateTargetGroup | "";
  phases: ProtocolPhaseForm[];
}

type ProtocolTemplate = {
  id: string;
  type: ProtocolTemplateType;
  target_group: ProtocolTemplateTargetGroup;
  title: string;
  content: string;
};

type TemplateMeal = {
  nome?: string;
  itens?: Array<{ alimento?: string; quantidade?: number | string; unidade?: string }>;
};

type SupplementItem = {
  nome?: string;
  dosagem?: number | string;
  unidade?: string;
  indicacao?: string;
};

type SubstitutionGroup = {
  base?: { alimento?: string; quantidade?: number | string; unidade?: string };
  opcoes?: Array<{ alimento?: string; quantidade?: number | string; unidade?: string }>;
};

function formatFoodItem(item: { alimento?: string; quantidade?: number | string; unidade?: string }) {
  return [item.alimento, item.quantidade !== undefined ? `${item.quantidade}${item.unidade ? ` ${item.unidade}` : ""}` : ""]
    .filter(Boolean)
    .join(" - ");
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
  const [templates, setTemplates] = useState<ProtocolTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateError, setTemplateError] = useState("");

  const setField = (field: keyof Omit<ProtocolFormValue, "phases">, nextValue: string) => {
    onChange({ ...value, [field]: nextValue });
  };

  const selectedTargetGroup = value.targetGroup || "";

  useEffect(() => {
    if (!selectedTargetGroup) {
      setTemplates([]);
      setSelectedTemplateId("");
      return;
    }

    const controller = new AbortController();
    async function loadTemplates() {
      const response = await fetch(
        `/api/admin/protocol-templates?targetGroup=${selectedTargetGroup}`,
        { signal: controller.signal, cache: "no-store" }
      );
      if (!response.ok) return;
      const data = await response.json() as { items: ProtocolTemplate[] };
      setTemplates(data.items);
    }
    void loadTemplates();
    return () => controller.abort();
  }, [selectedTargetGroup]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  function phasesFromTemplateContent(template: ProtocolTemplate): ProtocolPhaseForm[] {
    const content = JSON.parse(template.content) as Record<string, unknown>;

    const suggested = content.suggestedProtocol as { phases?: ProtocolPhaseForm[] } | undefined;
    if (Array.isArray(suggested?.phases)) {
      return suggested.phases.map((phase, index) => ({
        title: String(phase.title || `Fase ${index + 1}`),
        days: String(phase.days || ""),
        objective: String(phase.objective || ""),
        actions: Array.isArray(phase.actions) ? phase.actions.map(String) : [],
        notes: String(phase.notes || ""),
      }));
    }

    const directPhases = content.phases;
    if (Array.isArray(directPhases)) {
      return directPhases.map((phase, index) => {
        const item = phase as Record<string, unknown>;
        return {
          title: String(item.title || item.titulo || `Fase ${index + 1}`),
          days: String(item.days || item.periodo || ""),
          objective: String(item.objective || item.objetivo || ""),
          actions: Array.isArray(item.actions)
            ? item.actions.map(String)
            : Array.isArray(item.acoes)
              ? item.acoes.map(String)
              : [],
          notes: String(item.notes || item.observacoes || ""),
        };
      });
    }

    const meals = content.refeicoes;
    if (Array.isArray(meals)) {
      return (meals as TemplateMeal[]).map((meal, index) => ({
        title: meal.nome || `Refeição ${index + 1}`,
        days: "",
        objective: template.type === "DIETA" ? "Estruturar refeição base do modelo selecionado." : "",
        actions: Array.isArray(meal.itens)
          ? meal.itens.map(formatFoodItem).filter(Boolean)
          : [JSON.stringify(meal)],
        notes: index === 0 ? `Importado do modelo: ${template.title}` : "",
      }));
    }

    if (meals && typeof meals === "object" && !Array.isArray(meals)) {
      return Object.entries(meals).map(([meal, actions], index) => ({
        title: meal.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()),
        days: "",
        objective: template.type === "DIETA" ? "Estruturar refeição base do modelo selecionado." : "",
        actions: Array.isArray(actions) ? actions.map(String) : [String(actions)],
        notes: index === 0 ? `Importado do modelo: ${template.title}` : "",
      }));
    }

    if (template.type === "SUPLEMENTACAO" && Array.isArray(content.suplementos)) {
      return [{
        title: "Suplementação permitida",
        days: "",
        objective: String(content.objetivo || "Organizar suplementação conforme avaliação profissional."),
        actions: (content.suplementos as SupplementItem[]).map((item) =>
          [
            item.nome,
            item.dosagem !== undefined ? `${item.dosagem}${item.unidade ? ` ${item.unidade}` : ""}` : "",
            item.indicacao,
          ].filter(Boolean).join(" - ")
        ),
        notes: "Usar apenas como base profissional revisável. Ajustar dose, indicação e duração conforme avaliação.",
      }];
    }

    if (template.type === "SUPLEMENTACAO" && Array.isArray(content.suplementos_sugeridos)) {
      return [{
        title: "Suplementação permitida",
        days: "",
        objective: String(content.objetivo || "Organizar suplementação conforme avaliação profissional."),
        actions: content.suplementos_sugeridos.map((item) => JSON.stringify(item)),
        notes: String(content.atencao_especial || "Usar apenas como base profissional revisável."),
      }];
    }

    if (template.type === "SUBSTITUICAO" && Array.isArray(content.grupos)) {
      return (content.grupos as SubstitutionGroup[]).map((group, index) => ({
        title: group.base?.alimento ? `Substituições para ${group.base.alimento}` : `Grupo de substituição ${index + 1}`,
        days: "",
        objective: "Lista de substituições permitidas para o mesmo grupo alimentar.",
        actions: [
          group.base ? `Base: ${formatFoodItem(group.base)}` : "",
          ...(group.opcoes ?? []).map((item) => `Opção: ${formatFoodItem(item)}`),
        ].filter(Boolean),
        notes: "Trocas devem respeitar porção, contexto clínico e aceitação do paciente.",
      }));
    }

    if (template.type === "SUBSTITUICAO") {
      return Object.entries(content).map(([group, detail]) => ({
        title: group.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()),
        days: "",
        objective: "Lista de substituições permitidas para o mesmo grupo alimentar.",
        actions: Array.isArray((detail as { opcoes?: unknown[] }).opcoes)
          ? ((detail as { opcoes: unknown[] }).opcoes).map(String)
          : [JSON.stringify(detail)],
        notes: "Trocas devem respeitar porção, contexto clínico e aceitação do paciente.",
      }));
    }

    return [{
      title: template.title,
      days: "",
      objective: "Modelo importado para revisão profissional.",
      actions: [JSON.stringify(content, null, 2)],
      notes: "Ajuste o conteúdo antes de salvar o protocolo.",
    }];
  }

  function importSelectedTemplate() {
    if (!selectedTemplate) return;
    setTemplateError("");
    try {
      const phases = phasesFromTemplateContent(selectedTemplate);
      onChange({
        ...value,
        title: value.title || selectedTemplate.title,
        category: value.category || PROTOCOL_TEMPLATE_TYPE_LABELS[selectedTemplate.type],
        description: value.description || `Modelo importado: ${selectedTemplate.title}. Revisar e personalizar antes do uso clínico.`,
        phases: phases.length ? phases : value.phases,
      });
    } catch {
      setTemplateError("Não foi possível importar este modelo. Revise se o Content é um JSON válido.");
    }
  }

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

  const phaseMacros = useMemo(() => value.phases.map((phase) => roundedMacros(sumMacros(
    phase.actions.filter((action) => action.trim()).map(estimateMacrosFromLine)
  ))), [value.phases]);
  const protocolMacros = useMemo(() => roundedMacros(sumMacros(phaseMacros)), [phaseMacros]);

  return (
    <div className="space-y-6">
      <section className="brand-card p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="brand-label">Grupo alvo do cliente</label>
            <select
              value={selectedTargetGroup}
              onChange={(event) => setField("targetGroup", event.target.value)}
              className="brand-input"
            >
              <option value="">Selecione para importar modelos</option>
              {PROTOCOL_TEMPLATE_TARGET_GROUPS.map((group) => (
                <option key={group} value={group}>{PROTOCOL_TEMPLATE_GROUP_LABELS[group]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="brand-label">Importar modelo</label>
            <div className="flex gap-2">
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="brand-input"
                disabled={!selectedTargetGroup}
              >
                <option value="">{selectedTargetGroup ? "Selecione um modelo" : "Escolha o grupo alvo"}</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {PROTOCOL_TEMPLATE_TYPE_LABELS[template.type]} - {template.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={importSelectedTemplate}
                disabled={!selectedTemplate}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D9C4B2] bg-[#FFFDFC] text-[#607A56] transition hover:bg-[#EAF0E4] disabled:cursor-not-allowed disabled:opacity-50"
                title="Importar modelo"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
            {templateError && <p className="mt-2 text-xs text-red-600">{templateError}</p>}
          </div>
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
            <article key={index} className="brand-card overflow-hidden rounded-lg">
              <div className="flex items-center justify-between border-b border-[#EDE1D6] bg-[#FBF7F1] px-5 py-4">
                <div>
                  <p className="brand-kicker">Fase {index + 1}</p>
                  <p className="mt-1 text-sm font-semibold text-[#3A3028]">{phase.title || "Sem título"}</p>
                  {phaseMacros[index].kcal > 0 && <p className="mt-1 text-[11px] text-[#607A56]">{phaseMacros[index].kcal} kcal · P {phaseMacros[index].protein} g · C {phaseMacros[index].carbs} g · G {phaseMacros[index].fat} g</p>}
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
      {protocolMacros.recognizedItems > 0 && (
        <section className="sticky bottom-4 z-10 rounded-lg border border-[#D9C4B2] bg-[#FFFDFC]/95 p-3 shadow-[0_16px_42px_rgba(58,48,40,0.14)] backdrop-blur-xl">
          <div className="flex min-w-0 flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#607A56]">Estimativa do modelo alimentar</p>
              <p className="mt-0.5 text-[11px] text-[#75675E]">Calculada a partir das ações no formato “alimento - quantidade unidade”.</p>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 2xl:shrink-0">
              <ProtocolMacro icon={<Flame className="h-4 w-4" />} label="Energia" value={`${protocolMacros.kcal} kcal`} />
              <ProtocolMacro icon={<Beef className="h-4 w-4" />} label="Proteínas" value={`${protocolMacros.protein} g`} />
              <ProtocolMacro icon={<Wheat className="h-4 w-4" />} label="Carboidratos" value={`${protocolMacros.carbs} g`} />
              <ProtocolMacro icon={<span className="text-xs font-bold">G</span>} label="Gorduras" value={`${protocolMacros.fat} g`} />
            </div>
          </div>
        </section>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={onSubmit} disabled={saving || !value.title.trim()} className="brand-btn-primary">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : submitLabel}
        </button>
      </div>
    </div>
  );
}

function ProtocolMacro({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex min-w-0 items-center gap-2 rounded-lg bg-[#FBF7F1] px-3 py-2"><span className="shrink-0 text-[#C9937B]">{icon}</span><span className="min-w-0"><span className="block truncate text-[9px] font-semibold uppercase text-[#75675E]">{label}</span><strong className="block truncate text-sm text-[#3A3028]">{value}</strong></span></div>;
}
