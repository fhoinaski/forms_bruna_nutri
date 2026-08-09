"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Archive,
  CheckCircle2,
  Edit3,
  Eye,
  Filter,
  LibraryBig,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import {
  PROTOCOL_TEMPLATE_GROUP_LABELS,
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  PROTOCOL_TEMPLATE_TYPE_LABELS,
  PROTOCOL_TEMPLATE_TYPES,
  type ProtocolTemplateTargetGroup,
  type ProtocolTemplateType,
} from "@/lib/protocol-templates/constants";

type ProtocolTemplate = {
  id: string;
  type: ProtocolTemplateType;
  target_group: ProtocolTemplateTargetGroup;
  title: string;
  content: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type TemplateForm = {
  id?: string;
  title: string;
  type: ProtocolTemplateType;
  target_group: ProtocolTemplateTargetGroup;
  mealsText: string;
  orientationsText: string;
  substitutionsText: string;
  supplementsText: string;
  notesText: string;
  is_active: boolean;
  extraContent: Record<string, unknown>;
};

type FriendlyContent = {
  mealsText: string;
  orientationsText: string;
  substitutionsText: string;
  supplementsText: string;
  notesText: string;
  extraContent: Record<string, unknown>;
};

const emptyForm: TemplateForm = {
  title: "",
  type: "DIETA",
  target_group: "ADULTO_SAUDAVEL",
  mealsText:
    "Café da manhã: refeição prática com fonte de proteína, carboidrato e fruta.\nAlmoço: prato com proteína, carboidrato, leguminosas e vegetais.",
  orientationsText:
    "Ajustar quantidades conforme avaliação individual.\nRevisar preferências, restrições e rotina antes de entregar ao cliente.",
  substitutionsText: "",
  supplementsText: "",
  notesText: "",
  is_active: true,
  extraContent: {},
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function splitLines(value: string) {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function asText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((item) => valueToText(item)).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        if (typeof item === "string") return `${humanizeKey(key)}: ${item}`;
        if (item && typeof item === "object") {
          return `${humanizeKey(key)}: ${sectionValueToText(item)}`;
        }
        return `${humanizeKey(key)}: ${String(item)}`;
      })
      .join("\n");
  }
  return String(value);
}

function sectionValueToText(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return valueToText(value);
  const data = value as Record<string, unknown>;
  const lines: string[] = [];

  if (typeof data.objetivo === "string" && data.objetivo.trim()) {
    lines.push(data.objetivo.trim());
  }
  if (Array.isArray(data.alimentos) && data.alimentos.length) {
    lines.push(`alimentos: ${data.alimentos.map((item) => valueToText(item)).filter(Boolean).join(", ")}`);
  }
  if (Array.isArray(data.substituicoes) && data.substituicoes.length) {
    lines.push(`substituições: ${data.substituicoes.map((item) => valueToText(item)).filter(Boolean).join(", ")}`);
  }

  if (lines.length) return lines.join(" | ");
  return valueToText(value);
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => valueToText(item)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const data = value as Record<string, unknown>;
    const preferredKeys = [
      "nome",
      "alimento",
      "item",
      "quantidade",
      "medida",
      "porcao",
      "porção",
      "objetivo",
      "observacao",
      "observação",
      "horario",
      "horário",
      "opcao",
      "opção",
    ];
    const preferred = preferredKeys
      .map((key) => data[key])
      .filter((item) => item !== undefined && item !== null && String(item).trim() !== "")
      .map((item) => valueToText(item));

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

function humanizeKey(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseFriendlyContent(value: string): FriendlyContent {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const extraContent = { ...parsed };
    const mealsText = asText(parsed.refeicoes ?? parsed.refeicoes_texto);
    const orientationsText = asText(parsed.orientacoes);
    const substitutionsText = asText(parsed.substituicoes);
    const supplementsText = asText(parsed.suplementacao ?? parsed.suplementos);
    const notesText = asText(parsed.observacoes ?? parsed.observacoes_tecnicas);

    delete extraContent.refeicoes;
    delete extraContent.refeicoes_texto;
    delete extraContent.orientacoes;
    delete extraContent.substituicoes;
    delete extraContent.suplementacao;
    delete extraContent.suplementos;
    delete extraContent.observacoes;
    delete extraContent.observacoes_tecnicas;

    return {
      mealsText,
      orientationsText,
      substitutionsText,
      supplementsText,
      notesText,
      extraContent,
    };
  } catch {
    return {
      mealsText: value,
      orientationsText: "",
      substitutionsText: "",
      supplementsText: "",
      notesText: "",
      extraContent: {},
    };
  }
}

function buildTemplateContent(form: TemplateForm) {
  const content: Record<string, unknown> = { ...form.extraContent };
  if (form.mealsText.trim()) content.refeicoes_texto = splitLines(form.mealsText);
  if (form.orientationsText.trim()) content.orientacoes = splitLines(form.orientationsText);
  if (form.substitutionsText.trim()) content.substituicoes = splitLines(form.substitutionsText);
  if (form.supplementsText.trim()) content.suplementacao = splitLines(form.supplementsText);
  if (form.notesText.trim()) content.observacoes = splitLines(form.notesText);
  return JSON.stringify(content, null, 2);
}

function contentSummary(value: string) {
  const content = parseFriendlyContent(value);
  const meals = splitLines(content.mealsText).length;
  const orientations = splitLines(content.orientationsText).length;
  const substitutions = splitLines(content.substitutionsText).length;
  const supplements = splitLines(content.supplementsText).length;
  return [
    meals ? `${meals} refeição${meals !== 1 ? "ões" : ""}` : null,
    orientations ? `${orientations} orientação${orientations !== 1 ? "ões" : ""}` : null,
    substitutions ? `${substitutions} substituição${substitutions !== 1 ? "ões" : ""}` : null,
    supplements ? `${supplements} suplemento${supplements !== 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ") || "Modelo sem blocos preenchidos";
}

function typeIcon(type: ProtocolTemplateType) {
  if (type === "DIETA") return <Utensils className="h-5 w-5" />;
  if (type === "SUPLEMENTACAO") return <Sparkles className="h-5 w-5" />;
  return <LibraryBig className="h-5 w-5" />;
}

function TemplateCard({
  template,
  onView,
  onEdit,
  onRemove,
}: {
  template: ProtocolTemplate;
  onView: (template: ProtocolTemplate) => void;
  onEdit: (template: ProtocolTemplate) => void;
  onRemove: (template: ProtocolTemplate) => void;
}) {
  return (
    <article className="flex h-full flex-col rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)] transition hover:border-[#7F9A74]/45 hover:bg-[#FBF7F1]">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF0E4] text-[#607A56]">
          {typeIcon(template.type)}
        </span>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
          template.is_active
            ? "border-[#D9E4D3] bg-[#EAF0E4] text-[#607A56]"
            : "border-[#EDE1D6] bg-[#F1ECE7] text-[#75675E]"
        }`}>
          {template.is_active ? "Ativo" : "Inativo"}
        </span>
      </div>

      <div className="mt-4 min-w-0">
        <p className="break-words font-semibold leading-5 text-[#3A3028]">{template.title}</p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8C5F50]">
          {PROTOCOL_TEMPLATE_TYPE_LABELS[template.type]} · {PROTOCOL_TEMPLATE_GROUP_LABELS[template.target_group]}
        </p>
        <p className="mt-3 rounded-xl bg-[#FBF7F1] px-3 py-2 text-xs leading-5 text-[#75675E]">
          {contentSummary(template.content)}
        </p>
        <p className="mt-3 text-[11px] text-[#A9978A]">
          Atualizado em {formatDate(template.updated_at || template.created_at)}
        </p>
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 pt-5">
        <button
          type="button"
          onClick={() => onView(template)}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[#EDE1D6] text-sm font-semibold text-[#75675E] transition hover:bg-[#FBF7F1]"
        >
          <Eye className="h-4 w-4" />
          Ver
        </button>
        <button
          type="button"
          onClick={() => onEdit(template)}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[#D9E4D3] text-sm font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]"
        >
          <Edit3 className="h-4 w-4" />
          Editar
        </button>
        <button
          type="button"
          onClick={() => onRemove(template)}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[#F2CDC7] text-sm font-semibold text-[#9A5C4E] transition hover:bg-[#FFF5F3]"
        >
          <Trash2 className="h-4 w-4" />
          Excluir
        </button>
      </div>
    </article>
  );
}

export default function ProtocolTemplatesPage() {
  const [templates, setTemplates] = useState<ProtocolTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [viewTemplate, setViewTemplate] = useState<ProtocolTemplate | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [filterGroup, setFilterGroup] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const stats = useMemo(() => ({
    total: templates.length,
    active: templates.filter((template) => template.is_active).length,
    diet: templates.filter((template) => template.type === "DIETA").length,
    supplement: templates.filter((template) => template.type === "SUPLEMENTACAO").length,
  }), [templates]);

  const filtered = useMemo(() => templates.filter((template) => {
    const q = search.trim().toLowerCase();
    if (filterGroup && template.target_group !== filterGroup) return false;
    if (filterType && template.type !== filterType) return false;
    if (!q) return true;
    return [
      template.title,
      PROTOCOL_TEMPLATE_TYPE_LABELS[template.type],
      PROTOCOL_TEMPLATE_GROUP_LABELS[template.target_group],
      contentSummary(template.content),
    ].join(" ").toLowerCase().includes(q);
  }), [templates, filterGroup, filterType, search]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/admin/protocol-templates?includeInactive=${includeInactive ? "true" : "false"}`, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json() as { items: ProtocolTemplate[] };
      setTemplates(data.items);
    }
    setLoading(false);
  }, [includeInactive]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!form && !viewTemplate) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [form, viewTemplate]);

  function openCreate(type: ProtocolTemplateType = "DIETA") {
    setError("");
    setViewTemplate(null);
    setForm({ ...emptyForm, type });
  }

  function openEdit(template: ProtocolTemplate) {
    const content = parseFriendlyContent(template.content);
    setError("");
    setViewTemplate(null);
    setForm({
      id: template.id,
      title: template.title,
      type: template.type,
      target_group: template.target_group,
      mealsText: content.mealsText,
      orientationsText: content.orientationsText,
      substitutionsText: content.substitutionsText,
      supplementsText: content.supplementsText,
      notesText: content.notesText,
      extraContent: content.extraContent,
      is_active: Boolean(template.is_active),
    });
  }

  async function saveTemplate() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: form.title.trim(),
        type: form.type,
        target_group: form.target_group,
        content: buildTemplateContent(form),
        is_active: form.is_active,
      };
      const response = await fetch(form.id ? `/api/admin/protocol-templates/${form.id}` : "/api/admin/protocol-templates", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível salvar o modelo.");
      setForm(null);
      await loadTemplates();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o modelo.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate(template: ProtocolTemplate) {
    if (!confirm(`Excluir o modelo "${template.title}"?`)) return;
    const response = await fetch(`/api/admin/protocol-templates/${template.id}`, { method: "DELETE" });
    if (response.ok) await loadTemplates();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="overflow-hidden rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="p-6 sm:p-7">
            <p className="brand-kicker mb-3">Modelos profissionais</p>
            <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028] sm:text-5xl">
              Dietas, protocolos e substituições
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Organize modelos-base para agilizar prescrições, criar planos por
              grupo de cuidado e alimentar o processo clínico sem perder personalização.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {PROTOCOL_TEMPLATE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => openCreate(type)}
                  className="group rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-left transition hover:border-[#7F9A74]/45 hover:bg-[#F5FAF0]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF0E4] text-[#607A56]">
                    {typeIcon(type)}
                  </span>
                  <span className="mt-3 block text-sm font-semibold text-[#3A3028]">
                    Novo {PROTOCOL_TEMPLATE_TYPE_LABELS[type].toLowerCase()}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[#75675E]">
                    Estruture um modelo reutilizável e ajustável.
                  </span>
                </button>
              ))}
            </div>
            <Link href="/dashboard/templates/receitas" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#D9E4D3] px-5 py-2 text-sm font-semibold text-[#607A56] transition-colors hover:bg-[#EAF0E4]">
              <Utensils className="h-4 w-4" />
              Abrir biblioteca de receitas
            </Link>
          </div>

          <aside className="border-t border-[#EDE1D6] bg-[#FBF7F1] p-6 lg:border-l lg:border-t-0">
            <p className="brand-kicker mb-3">Biblioteca</p>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total" value={stats.total} />
              <Stat label="Ativos" value={stats.active} />
              <Stat label="Dietas" value={stats.diet} />
              <Stat label="Suplementos" value={stats.supplement} />
            </div>
            <p className="mt-4 rounded-2xl border border-[#EDE1D6] bg-[#FFFDFC] p-4 text-xs leading-5 text-[#75675E]">
              Use modelos como ponto de partida. A entrega ao cliente deve ser
              personalizada no prontuário conforme anamnese, evolução e rotina.
            </p>
          </aside>
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_220px_220px_auto] lg:items-end">
          <div>
            <label className="brand-label">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="brand-input brand-input-with-icon"
                placeholder="Nome, grupo, tipo ou conteúdo..."
              />
            </div>
          </div>
          <div>
            <label className="brand-label">Grupo</label>
            <select value={filterGroup} onChange={(event) => setFilterGroup(event.target.value)} className="brand-input">
              <option value="">Todos</option>
              {PROTOCOL_TEMPLATE_TARGET_GROUPS.map((group) => (
                <option key={group} value={group}>{PROTOCOL_TEMPLATE_GROUP_LABELS[group]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="brand-label">Tipo</label>
            <select value={filterType} onChange={(event) => setFilterType(event.target.value)} className="brand-input">
              <option value="">Todos</option>
              {PROTOCOL_TEMPLATE_TYPES.map((type) => (
                <option key={type} value={type}>{PROTOCOL_TEMPLATE_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 text-sm text-[#75675E]">
            <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
            Inativos
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="flex flex-col gap-3 border-b border-[#EDE1D6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="brand-kicker mb-1">Acervo clínico</p>
            <h2 className="font-serif text-xl font-semibold text-[#3A3028]">
              Templates cadastrados
            </h2>
          </div>
          <span className="w-fit rounded-full border border-[#7F9A74]/30 px-3 py-1 text-xs font-semibold text-[#607A56]">
            {filtered.length} modelo{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div className="py-14 text-center text-sm text-[#9A8B80]">Carregando modelos...</div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <Filter className="mx-auto mb-3 h-9 w-9 text-[#C4B3A6]" />
            <p className="font-serif text-xl font-semibold text-[#3A3028]">Nenhum modelo encontrado.</p>
            <p className="mt-2 text-sm text-[#75675E]">Ajuste os filtros ou crie um novo modelo.</p>
          </div>
        ) : (
          <div className="grid gap-4 bg-[#FBF7F1] p-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onView={setViewTemplate}
                onEdit={openEdit}
                onRemove={(item) => void removeTemplate(item)}
              />
            ))}
          </div>
        )}
      </section>

      {portalReady && viewTemplate && createPortal(
        <TemplateViewModal
          template={viewTemplate}
          onClose={() => setViewTemplate(null)}
          onEdit={(template) => openEdit(template)}
        />,
        document.body
      )}

      {portalReady && form && createPortal(
        <TemplateEditModal
          form={form}
          saving={saving}
          error={error}
          setForm={setForm}
          onClose={() => setForm(null)}
          onSave={() => void saveTemplate()}
        />,
        document.body
      )}
    </div>
  );
}

function TemplateViewModal({
  template,
  onClose,
  onEdit,
}: {
  template: ProtocolTemplate;
  onClose: () => void;
  onEdit: (template: ProtocolTemplate) => void;
}) {
  const content = parseFriendlyContent(template.content);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <section className="flex h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)] sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-[1.5rem]">
        <div className="shrink-0 flex items-start justify-between gap-3 border-b border-[#EDE1D6] bg-[#FFFDFC] px-5 py-4">
          <div className="min-w-0">
            <p className="brand-kicker">Visualizar modelo</p>
            <h2 className="break-words font-serif text-2xl font-semibold text-[#3A3028]">{template.title}</h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#8C5F50]">
              {PROTOCOL_TEMPLATE_TYPE_LABELS[template.type]} · {PROTOCOL_TEMPLATE_GROUP_LABELS[template.target_group]}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" title="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          <FriendlySections content={content} />
        </div>

        <div className="shrink-0 grid gap-3 border-t border-[#EDE1D6] bg-[#FFFDFC] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:justify-end sm:py-4">
          <button type="button" onClick={onClose} className="brand-btn-secondary w-full sm:w-auto">Fechar</button>
          <button type="button" onClick={() => onEdit(template)} className="brand-btn-primary w-full sm:w-auto">
            <Edit3 className="h-4 w-4" />
            Editar modelo
          </button>
        </div>
      </section>
    </div>
  );
}

function TemplateEditModal({
  form,
  saving,
  error,
  setForm,
  onClose,
  onSave,
}: {
  form: TemplateForm;
  saving: boolean;
  error: string;
  setForm: (form: TemplateForm | null) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <section className="flex h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)] sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-[1.5rem]">
        <div className="shrink-0 flex items-start justify-between gap-3 border-b border-[#EDE1D6] bg-[#FFFDFC] px-5 py-4">
          <div className="min-w-0">
            <p className="brand-kicker">{form.id ? "Editar modelo" : "Novo modelo"}</p>
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
              Modelo de {PROTOCOL_TEMPLATE_TYPE_LABELS[form.type].toLowerCase()}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" title="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto overscroll-contain lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="brand-label">Título do modelo</label>
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="brand-input" placeholder="Ex: Plano alimentar - hipertrofia" />
            </div>
            <div>
              <label className="brand-label">Tipo</label>
              <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ProtocolTemplateType })} className="brand-input">
                {PROTOCOL_TEMPLATE_TYPES.map((type) => <option key={type} value={type}>{PROTOCOL_TEMPLATE_TYPE_LABELS[type]}</option>)}
              </select>
            </div>
            <div>
              <label className="brand-label">Grupo alvo</label>
              <select value={form.target_group} onChange={(event) => setForm({ ...form, target_group: event.target.value as ProtocolTemplateTargetGroup })} className="brand-input">
                {PROTOCOL_TEMPLATE_TARGET_GROUPS.map((group) => <option key={group} value={group}>{PROTOCOL_TEMPLATE_GROUP_LABELS[group]}</option>)}
              </select>
            </div>

            <FriendlyTextarea
              label="Refeições e composição"
              value={form.mealsText}
              onChange={(value) => setForm({ ...form, mealsText: value })}
              placeholder="Ex: Café da manhã: iogurte, fruta e aveia..."
              minRows={7}
            />
            <FriendlyTextarea
              label="Orientações para o cliente"
              value={form.orientationsText}
              onChange={(value) => setForm({ ...form, orientationsText: value })}
              placeholder="Uma orientação por linha."
              minRows={6}
            />
            <FriendlyTextarea
              label="Substituições"
              value={form.substitutionsText}
              onChange={(value) => setForm({ ...form, substitutionsText: value })}
              placeholder="Ex: Arroz por batata, frango por ovos..."
              minRows={5}
            />
            <FriendlyTextarea
              label="Suplementação"
              value={form.supplementsText}
              onChange={(value) => setForm({ ...form, supplementsText: value })}
              placeholder="Use apenas quando houver indicação profissional."
              minRows={5}
            />
            <div className="md:col-span-2">
              <FriendlyTextarea
                label="Observações clínicas internas"
                value={form.notesText}
                onChange={(value) => setForm({ ...form, notesText: value })}
                placeholder="Pontos de atenção para a nutricionista antes de adaptar."
                minRows={4}
                maxRows={10}
              />
            </div>

            <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-sm text-[#75675E]">
              <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} className="mt-1 h-4 w-4 accent-[#7F9A74]" />
              <span>
                <strong className="block text-[#3A3028]">Modelo ativo</strong>
                Disponível para uso manual, adaptação no prontuário e apoio do agente de IA.
              </span>
            </label>
            {error && <p className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          </div>

          <aside className="border-t border-[#EDE1D6] bg-[#FBF7F1] p-5 lg:border-l lg:border-t-0">
            <p className="brand-kicker mb-3">Qualidade do modelo</p>
            <div className="space-y-3">
              <QualityItem ok={!!form.title.trim()} text="Título claro para busca e reutilização" />
              <QualityItem ok={Boolean(form.mealsText.trim() || form.orientationsText.trim() || form.substitutionsText.trim() || form.supplementsText.trim())} text="Conteúdo clínico preenchido" />
              <QualityItem ok={form.is_active} text="Disponível para uso no sistema" />
            </div>
            <div className="mt-5 rounded-2xl border border-[#EDE1D6] bg-[#FFFDFC] p-4">
              <p className="text-sm font-semibold text-[#3A3028]">Preview técnico</p>
              <p className="mt-2 text-xs leading-5 text-[#75675E]">
                {contentSummary(buildTemplateContent(form))}
              </p>
            </div>
            <div className="mt-5 rounded-2xl border border-[#EDE1D6] bg-[#FFFDFC] p-4">
              <p className="text-sm font-semibold text-[#3A3028]">Como usar</p>
              <p className="mt-2 text-xs leading-5 text-[#75675E]">
                Escreva em linguagem prática, uma ideia por linha. O sistema salva
                estruturado por trás, mas a edição deve ser clínica e legível.
              </p>
            </div>
          </aside>
        </div>

        <div className="shrink-0 grid gap-3 border-t border-[#EDE1D6] bg-[#FFFDFC] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:justify-end sm:py-4">
          <button type="button" onClick={onClose} className="brand-btn-secondary w-full sm:w-auto">Cancelar</button>
          <button type="button" onClick={onSave} disabled={saving || !form.title.trim()} className="brand-btn-primary w-full sm:w-auto">
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar modelo"}
          </button>
        </div>
      </section>
    </div>
  );
}

function FriendlyTextarea({
  label,
  value,
  onChange,
  placeholder,
  minRows = 6,
  maxRows = 14,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minRows?: number;
  maxRows?: number;
}) {
  const rows = Math.min(maxRows, Math.max(minRows, value.split("\n").length + 1));
  return (
    <div>
      <label className="brand-label">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="brand-input max-h-[22rem] resize-none overflow-y-auto leading-6"
        placeholder={placeholder}
      />
    </div>
  );
}

function FriendlySections({ content }: { content: FriendlyContent }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ReadSection title="Refeições e composição" value={content.mealsText} />
      <ReadSection title="Orientações para o cliente" value={content.orientationsText} />
      <ReadSection title="Substituições" value={content.substitutionsText} />
      <ReadSection title="Suplementação" value={content.supplementsText} />
      <div className="md:col-span-2">
        <ReadSection title="Observações clínicas internas" value={content.notesText} />
      </div>
    </div>
  );
}

function ReadSection({ title, value }: { title: string; value: string }) {
  const items = splitLines(value);
  return (
    <section className="rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4">
      <p className="text-sm font-semibold text-[#3A3028]">{title}</p>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[#75675E]">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7F9A74]" />
              <span className="break-words">{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#A9978A]">Sem conteúdo cadastrado.</p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[#FFFDFC] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">{label}</p>
      <p className="mt-2 font-serif text-3xl font-semibold text-[#607A56]">{value}</p>
    </div>
  );
}

function QualityItem({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-[#FFFDFC] p-3 text-sm text-[#75675E]">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#607A56]" /> : <Archive className="mt-0.5 h-4 w-4 shrink-0 text-[#A9978A]" />}
      <span>{text}</span>
    </div>
  );
}
