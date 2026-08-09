"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Beef,
  CheckCircle2,
  Download,
  Flame,
  GripVertical,
  Layers3,
  Plus,
  Save,
  Target,
  Trash2,
  Wheat,
} from "lucide-react";
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

function humanizeKey(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    return value.map(valueToText).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    const data = value as Record<string, unknown>;
    const preferredKeys = [
      "nome",
      "alimento",
      "item",
      "quantidade",
      "medida",
      "unidade",
      "porcao",
      "porção",
      "objetivo",
      "observacao",
      "observação",
      "indicacao",
      "indicação",
      "horario",
      "horário",
      "opcao",
      "opção",
    ];
    const preferred = preferredKeys
      .map((key) => data[key])
      .filter((item) => item !== undefined && item !== null && String(item).trim() !== "")
      .map(valueToText)
      .filter(Boolean);

    if (preferred.length) return preferred.join(" - ");

    return Object.entries(data)
      .map(([key, item]) => {
        const text = valueToText(item);
        return text ? `${humanizeKey(key)}: ${text}` : "";
      })
      .filter(Boolean)
      .join(" | ");
  }

  return String(value);
}

function linesFromUnknown(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean);

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${humanizeKey(key)}: ${valueToText(item)}`)
      .filter(Boolean);
  }

  return [String(value)];
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

function phasesFromFriendlyTemplate(template: ProtocolTemplate, content: Record<string, unknown>): ProtocolPhaseForm[] {
  const phases: ProtocolPhaseForm[] = [];
  const mealLines = [...linesFromUnknown(content.refeicoes_texto), ...linesFromUnknown(content.refeicoes)];

  if (mealLines.length) {
    phases.push({
      title: template.type === "DIETA" ? "Plano alimentar base" : "Conduta principal",
      days: "",
      objective: "Organizar o modelo selecionado em uma base revisável para o atendimento.",
      actions: mealLines,
      notes: `Importado do modelo: ${template.title}`,
    });
  }

  const orientations = linesFromUnknown(content.orientacoes);
  if (orientations.length) {
    phases.push({
      title: "Orientações ao cliente",
      days: "",
      objective: "Transformar o modelo em orientações práticas para a rotina.",
      actions: orientations,
      notes: "",
    });
  }

  const substitutions = linesFromUnknown(content.substituicoes);
  if (substitutions.length) {
    phases.push({
      title: "Substituições e ajustes",
      days: "",
      objective: "Oferecer opções equivalentes para aderência e flexibilidade.",
      actions: substitutions,
      notes: "Validar porções e preferências antes de entregar.",
    });
  }

  const supplements = [...linesFromUnknown(content.suplementacao), ...linesFromUnknown(content.suplementos)];
  if (supplements.length) {
    phases.push({
      title: "Suplementação",
      days: "",
      objective: "Organizar suplementação apenas quando houver indicação profissional.",
      actions: supplements,
      notes: "Revisar dose, duração e contraindicações.",
    });
  }

  const notes = linesFromUnknown(content.observacoes ?? content.observacoes_tecnicas);
  if (notes.length && phases[0]) {
    phases[0].notes = [phases[0].notes, ...notes].filter(Boolean).join("\n");
  }

  return phases;
}

function phasesFromTemplateContent(template: ProtocolTemplate): ProtocolPhaseForm[] {
  const content = JSON.parse(template.content) as Record<string, unknown>;
  const suggested = content.suggestedProtocol as { phases?: ProtocolPhaseForm[] } | undefined;

  if (Array.isArray(suggested?.phases)) {
    return suggested.phases.map((phase, index) => ({
      title: String(phase.title || `Fase ${index + 1}`),
      days: String(phase.days || ""),
      objective: String(phase.objective || ""),
      actions: Array.isArray(phase.actions) ? phase.actions.map(valueToText).filter(Boolean) : [],
      notes: String(phase.notes || ""),
    }));
  }

  if (Array.isArray(content.phases)) {
    return content.phases.map((phase, index) => {
      const item = phase as Record<string, unknown>;
      return {
        title: String(item.title || item.titulo || `Fase ${index + 1}`),
        days: String(item.days || item.periodo || ""),
        objective: String(item.objective || item.objetivo || ""),
        actions: Array.isArray(item.actions)
          ? item.actions.map(valueToText).filter(Boolean)
          : Array.isArray(item.acoes)
            ? item.acoes.map(valueToText).filter(Boolean)
            : [],
        notes: String(item.notes || item.observacoes || ""),
      };
    });
  }

  const friendly = phasesFromFriendlyTemplate(template, content);
  if (friendly.length) return friendly;

  return [{
    title: template.title,
    days: "",
    objective: "Modelo importado para revisão profissional.",
    actions: Object.entries(content).map(([key, item]) => `${humanizeKey(key)}: ${valueToText(item)}`),
    notes: "Ajuste o conteúdo antes de salvar o protocolo.",
  }];
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

  const selectedTargetGroup = value.targetGroup || "";
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  const setField = (field: keyof Omit<ProtocolFormValue, "phases">, nextValue: string) => {
    onChange({ ...value, [field]: nextValue });
  };

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
        { signal: controller.signal, cache: "no-store" },
      );
      if (!response.ok) return;
      const data = await response.json() as { items: ProtocolTemplate[] };
      setTemplates(data.items);
    }

    void loadTemplates();
    return () => controller.abort();
  }, [selectedTargetGroup]);

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
      setTemplateError("Não foi possível importar este modelo. Revise se o conteúdo está estruturado corretamente.");
    }
  }

  const setPhase = (index: number, patch: Partial<ProtocolPhaseForm>) => {
    onChange({
      ...value,
      phases: value.phases.map((phase, phaseIndex) =>
        phaseIndex === index ? { ...phase, ...patch } : phase,
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
    phase.actions.filter((action) => action.trim()).map(estimateMacrosFromLine),
  ))), [value.phases]);
  const protocolMacros = useMemo(() => roundedMacros(sumMacros(phaseMacros)), [phaseMacros]);

  const quality = {
    hasTitle: Boolean(value.title.trim()),
    hasDescription: Boolean(value.description.trim()),
    hasPhases: value.phases.length > 0,
    hasActions: value.phases.some((phase) => phase.actions.some((action) => action.trim())),
  };

  return (
    <div className="min-w-0 space-y-6">
      <section className="overflow-hidden rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2">
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
              <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
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
                  className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-[#D9C4B2] bg-[#FFFDFC] px-4 text-sm font-semibold text-[#607A56] transition hover:bg-[#EAF0E4] disabled:cursor-not-allowed disabled:opacity-50 sm:w-12 sm:px-0"
                  title="Importar modelo"
                >
                  <Download className="h-4 w-4" />
                  <span className="sm:hidden">Importar</span>
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
              <AutoTextarea
                label="Objetivo e contexto clínico"
                value={value.description}
                onChange={(next) => setField("description", next)}
                placeholder="Descreva para quem este protocolo serve, objetivo central e critérios importantes."
                minRows={4}
                maxRows={10}
              />
            </div>
          </div>

          <aside className="border-t border-[#EDE1D6] bg-[#FBF7F1] p-5 lg:border-l lg:border-t-0">
            <p className="brand-kicker mb-3">Qualidade clínica</p>
            <div className="space-y-3">
              <QualityItem ok={quality.hasTitle} text="Nome claro para buscar e aplicar" />
              <QualityItem ok={quality.hasDescription} text="Contexto clínico descrito" />
              <QualityItem ok={quality.hasPhases} text="Fases de cuidado organizadas" />
              <QualityItem ok={quality.hasActions} text="Ações práticas preenchidas" />
            </div>
          </aside>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="brand-kicker mb-1">Plano de cuidado</p>
            <h2 className="font-serif text-xl font-semibold sm:text-2xl">Fases do protocolo</h2>
            <p className="mt-1 text-sm text-[#75675E]">Cada fase organiza objetivo, ações e observações profissionais.</p>
          </div>
          <button type="button" onClick={addPhase} className="brand-btn-secondary w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Adicionar fase
          </button>
        </div>

        {value.phases.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D9C4B2] bg-[#FFFDFC] p-8 text-center">
            <Layers3 className="mx-auto mb-3 h-9 w-9 text-[#C4B3A6]" />
            <p className="text-sm font-semibold text-[#3A3028]">Comece pela primeira fase</p>
            <p className="mt-1 text-xs leading-5 text-[#75675E]">Organize período, objetivo, ações práticas e observações profissionais.</p>
            <button type="button" onClick={addPhase} className="brand-btn-secondary mt-4 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Criar primeira fase
            </button>
          </div>
        ) : (
          value.phases.map((phase, index) => (
            <article key={index} className="overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
              <div className="flex items-start justify-between gap-3 border-b border-[#EDE1D6] bg-[#FBF7F1] px-4 py-4 sm:px-5">
                <div className="flex min-w-0 gap-3">
                  <span className="mt-0.5 hidden text-[#C4B3A6] sm:block">
                    <GripVertical className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="brand-kicker">Fase {index + 1}</p>
                    <p className="mt-1 break-words text-sm font-semibold text-[#3A3028]">{phase.title || "Sem título"}</p>
                    {phaseMacros[index].kcal > 0 && (
                      <p className="mt-1 text-[11px] text-[#607A56]">
                        {phaseMacros[index].kcal} kcal - P {phaseMacros[index].protein} g - C {phaseMacros[index].carbs} g - G {phaseMacros[index].fat} g
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removePhase(index)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50"
                  aria-label={`Remover fase ${index + 1}`}
                  title="Remover fase"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_170px]">
                <div>
                  <label className="brand-label">Título da fase</label>
                  <input value={phase.title} onChange={(event) => setPhase(index, { title: event.target.value })} className="brand-input" />
                </div>
                <div>
                  <label className="brand-label">Período</label>
                  <input value={phase.days} onChange={(event) => setPhase(index, { days: event.target.value })} className="brand-input" placeholder="Ex: 1-14 dias" />
                </div>
                <div className="md:col-span-2">
                  <AutoTextarea
                    label="Objetivo desta fase"
                    value={phase.objective}
                    onChange={(next) => setPhase(index, { objective: next })}
                    placeholder="Explique a intenção clínica desta etapa."
                    minRows={3}
                    maxRows={8}
                  />
                </div>
                <div className="md:col-span-2">
                  <AutoTextarea
                    label="Ações práticas, uma por linha"
                    value={phase.actions.join("\n")}
                    onChange={(next) => setPhase(index, { actions: next.split("\n") })}
                    placeholder={"Organizar horários das refeições\nRegistrar aceitação alimentar\nRevisar hidratação"}
                    minRows={7}
                    maxRows={16}
                  />
                </div>
                <div className="md:col-span-2">
                  <AutoTextarea
                    label="Observações profissionais"
                    value={phase.notes}
                    onChange={(next) => setPhase(index, { notes: next })}
                    placeholder="Pontos de atenção para adaptar antes de entregar ao cliente."
                    minRows={3}
                    maxRows={10}
                  />
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
              <p className="mt-0.5 text-[11px] text-[#75675E]">Calculada a partir das ações no formato alimento - quantidade unidade.</p>
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
        <button type="button" onClick={onSubmit} disabled={saving || !value.title.trim()} className="brand-btn-primary w-full sm:w-auto">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : submitLabel}
        </button>
      </div>
    </div>
  );
}

function AutoTextarea({
  label,
  value,
  onChange,
  placeholder,
  minRows,
  maxRows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minRows: number;
  maxRows: number;
}) {
  const rows = Math.min(maxRows, Math.max(minRows, value.split("\n").length + 1));

  return (
    <div>
      <label className="brand-label">{label}</label>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="brand-input max-h-[24rem] resize-none overflow-y-auto leading-6"
        placeholder={placeholder}
      />
    </div>
  );
}

function QualityItem({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-[#FFFDFC] p-3 text-sm text-[#75675E]">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#607A56]" /> : <Target className="mt-0.5 h-4 w-4 shrink-0 text-[#A9978A]" />}
      <span>{text}</span>
    </div>
  );
}

function ProtocolMacro({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-[#FBF7F1] px-3 py-2">
      <span className="shrink-0 text-[#C9937B]">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[9px] font-semibold uppercase text-[#75675E]">{label}</span>
        <strong className="block truncate text-sm text-[#3A3028]">{value}</strong>
      </span>
    </div>
  );
}
