"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Archive, BookOpenText, CheckCircle2, Edit3, Eye, Filter, LibraryBig, Plus, Save, Search, Sparkles, Trash2, Utensils, X } from "lucide-react";
import { HelpPopover } from "@/components/dashboard/HelpPopover";
import { EditableList } from "@/components/dashboard/MealPlanEditor";
import { MealItemsEditor, cleanMealsForSave, emptyMeal, type Meal } from "@/components/dashboard/MealItemsEditor";
import {
  PROTOCOL_TEMPLATE_GROUP_LABELS,
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  PROTOCOL_TEMPLATE_TYPE_LABELS,
  PROTOCOL_TEMPLATE_TYPES,
  type ProtocolTemplateTargetGroup,
  type ProtocolTemplateType,
} from "@/lib/protocol-templates/constants";

type Substitution = { base_food: string; option_food: string; quantity?: string | null; unit?: string | null; notes?: string | null };
type Supplement = { name: string; dosage?: string | null; unit?: string | null; instructions?: string | null; notes?: string | null };

type ProtocolTemplate = {
  id: string;
  type: ProtocolTemplateType;
  target_group: ProtocolTemplateTargetGroup;
  title: string;
  content: string;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type ProtocolTemplateDetail = ProtocolTemplate & {
  meals: Meal[];
  substitutions: Substitution[];
  supplements: Supplement[];
};

type TemplateForm = {
  id?: string;
  title: string;
  type: ProtocolTemplateType;
  target_group: ProtocolTemplateTargetGroup;
  notes: string;
  meals: Meal[];
  substitutions: Substitution[];
  supplements: Supplement[];
  is_active: boolean;
};

const emptyForm: TemplateForm = {
  title: "",
  type: "DIETA",
  target_group: "ADULTO_SAUDAVEL",
  notes: "Modelo de partida para revisao profissional antes de usar com cliente.",
  meals: [emptyMeal()],
  substitutions: [],
  supplements: [],
  is_active: true,
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function typeIcon(type: ProtocolTemplateType) {
  if (type === "DIETA") return <Utensils className="h-5 w-5" />;
  if (type === "SUPLEMENTACAO") return <Sparkles className="h-5 w-5" />;
  return <LibraryBig className="h-5 w-5" />;
}

function legacyMealFallback(content: string): Meal[] {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const meals = parsed.refeicoes;
    if (!Array.isArray(meals)) return [];
    return meals.map((meal, index) => {
      const row = meal as Record<string, unknown>;
      const items = Array.isArray(row.itens) ? row.itens : [];
      return {
        name: String(row.nome ?? row.name ?? `Refeicao ${index + 1}`),
        suggested_time: String(row.horario ?? row.suggested_time ?? ""),
        notes: String(row.observacao ?? row.notes ?? ""),
        source_recipe_id: typeof row.source_recipe_id === "string" ? row.source_recipe_id : null,
        items: items.map((item) => {
          const data = item as Record<string, unknown>;
          return {
            food: String(data.alimento ?? data.food ?? data.nome ?? ""),
            quantity: data.quantidade === undefined ? "" : String(data.quantidade),
            unit: data.unidade === undefined ? "" : String(data.unidade),
            notes: data.observacao === undefined ? "" : String(data.observacao),
          };
        }).filter((item) => item.food.trim()),
      };
    }).filter((meal) => meal.items.length);
  } catch {
    return [];
  }
}

function templateSummary(template: ProtocolTemplate) {
  if (template.notes?.trim()) return template.notes.trim();
  return template.content?.trim() ? "Modelo legado em JSON. Abra e salve para migrar para a estrutura nova." : "Modelo estruturado.";
}

function formPayload(form: TemplateForm) {
  return {
    title: form.title.trim(),
    type: form.type,
    target_group: form.target_group,
    content: "",
    notes: form.notes.trim() || null,
    meals: form.type === "DIETA" ? cleanMealsForSave(form.meals) : [],
    substitutions: (form.type === "DIETA" || form.type === "SUBSTITUICAO")
      ? form.substitutions.filter((item) => item.base_food.trim() && item.option_food.trim())
      : [],
    supplements: form.type === "SUPLEMENTACAO"
      ? form.supplements.filter((item) => item.name.trim())
      : [],
    is_active: form.is_active,
  };
}

function TemplateCard({ template, onView, onEdit, onRemove }: {
  template: ProtocolTemplate;
  onView: (template: ProtocolTemplate) => void;
  onEdit: (template: ProtocolTemplate) => void;
  onRemove: (template: ProtocolTemplate) => void;
}) {
  return (
    <article className="flex h-full flex-col rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)] transition hover:border-[#7F9A74]/45 hover:bg-[#FBF7F1]">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF0E4] text-[#607A56]">{typeIcon(template.type)}</span>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${template.is_active ? "border-[#D9E4D3] bg-[#EAF0E4] text-[#607A56]" : "border-[#EDE1D6] bg-[#F1ECE7] text-[#75675E]"}`}>
          {template.is_active ? "Ativo" : "Inativo"}
        </span>
      </div>
      <div className="mt-4 min-w-0">
        <p className="break-words font-semibold leading-5 text-[#3A3028]">{template.title}</p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8C5F50]">
          {PROTOCOL_TEMPLATE_TYPE_LABELS[template.type]} - {PROTOCOL_TEMPLATE_GROUP_LABELS[template.target_group]}
        </p>
        <p className="mt-3 line-clamp-3 rounded-xl bg-[#FBF7F1] px-3 py-2 text-xs leading-5 text-[#75675E]">{templateSummary(template)}</p>
        <p className="mt-3 text-[11px] text-[#A9978A]">Atualizado em {formatDate(template.updated_at || template.created_at)}</p>
      </div>
      <div className="mt-auto grid grid-cols-3 gap-2 pt-5">
        <button type="button" onClick={() => onView(template)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[#EDE1D6] text-sm font-semibold text-[#75675E] transition hover:bg-[#FBF7F1]"><Eye className="h-4 w-4" />Ver</button>
        <button type="button" onClick={() => onEdit(template)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[#D9E4D3] text-sm font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]"><Edit3 className="h-4 w-4" />Editar</button>
        <button type="button" onClick={() => onRemove(template)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[#F2CDC7] text-sm font-semibold text-[#9A5C4E] transition hover:bg-[#FFF5F3]"><Trash2 className="h-4 w-4" />Excluir</button>
      </div>
    </article>
  );
}

export default function ProtocolTemplatesPage() {
  const [templates, setTemplates] = useState<ProtocolTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [viewTemplate, setViewTemplate] = useState<ProtocolTemplateDetail | null>(null);
  const [deleteTemplate, setDeleteTemplate] = useState<ProtocolTemplate | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [filterGroup, setFilterGroup] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);

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
    return [template.title, PROTOCOL_TEMPLATE_TYPE_LABELS[template.type], PROTOCOL_TEMPLATE_GROUP_LABELS[template.target_group], template.notes ?? ""].join(" ").toLowerCase().includes(q);
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
    fetch("/api/admin/settings/ai", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((settings: { has_api_key?: boolean } | null) => setAiEnabled(Boolean(settings?.has_api_key)))
      .catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    if (!form && !viewTemplate && !deleteTemplate) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [form, viewTemplate, deleteTemplate]);

  function openCreate(type: ProtocolTemplateType = "DIETA") {
    setError("");
    setMessage("");
    setViewTemplate(null);
    setForm({ ...emptyForm, type, meals: type === "DIETA" ? [emptyMeal()] : [] });
  }

  async function loadTemplateDetail(template: ProtocolTemplate) {
    const response = await fetch(`/api/admin/protocol-templates/${template.id}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Nao foi possivel carregar o modelo.");
    return await response.json() as ProtocolTemplateDetail;
  }

  async function openView(template: ProtocolTemplate) {
    setError("");
    setForm(null);
    try {
      const detail = await loadTemplateDetail(template);
      setViewTemplate({ ...detail, meals: detail.meals.length ? detail.meals : legacyMealFallback(detail.content) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel carregar o modelo.");
    }
  }

  async function openEdit(template: ProtocolTemplate) {
    setError("");
    setMessage("");
    setViewTemplate(null);
    try {
      const detail = await loadTemplateDetail(template);
      setForm({
        id: detail.id,
        title: detail.title,
        type: detail.type,
        target_group: detail.target_group,
        notes: detail.notes ?? "",
        meals: detail.meals.length ? detail.meals : legacyMealFallback(detail.content),
        substitutions: detail.substitutions,
        supplements: detail.supplements,
        is_active: Boolean(detail.is_active),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel carregar o modelo.");
    }
  }

  async function saveTemplate() {
    if (!form) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(form.id ? `/api/admin/protocol-templates/${form.id}` : "/api/admin/protocol-templates", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formPayload(form)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Nao foi possivel salvar o modelo.");
      setForm(null);
      setMessage("Modelo salvo com estrutura reutilizavel.");
      await loadTemplates();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel salvar o modelo.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate() {
    if (!deleteTemplate) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/protocol-templates/${deleteTemplate.id}`, { method: "DELETE" });
      const data = response.ok ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? "Nao foi possivel excluir o modelo.");
      setDeleteTemplate(null);
      await loadTemplates();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel excluir o modelo.");
    } finally {
      setDeleting(false);
    }
  }

  async function suggestDietTemplate(currentForm: TemplateForm) {
    setAiSuggesting(true);
    setError("");
    setMessage("");
    try {
      const instructions = window.prompt("Pedido opcional para a IA (ex: mais pratico, sem laticinio):") ?? "";
      const response = await fetch("/api/admin/ai/suggest-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: "template", targetGroup: currentForm.target_group, instructions }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Nao foi possivel sugerir o modelo.");
      const meals = (result.resolvedMeals ?? []) as Meal[];
      if (!meals.length) throw new Error("A IA nao retornou refeicoes validas.");
      setForm({
        ...currentForm,
        type: "DIETA",
        meals: meals.map((meal) => ({
          ...meal,
          items: meal.items.map((item) => ({ ...item, ai_suggested: true })),
        })),
        notes: [currentForm.notes, "Modelo sugerido por IA com base em TACO/receitas. Revisar antes de salvar e usar clinicamente."].filter(Boolean).join("\n"),
      });
      setMessage("Sugestao estruturada aplicada. Revise os itens antes de salvar o modelo.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel sugerir o modelo.");
    } finally {
      setAiSuggesting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="overflow-hidden rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="p-6 sm:p-7">
            <p className="brand-kicker mb-3">Modelos profissionais</p>
            <div className="flex items-start gap-3">
              <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028] sm:text-5xl">Dietas, protocolos e substituicoes</h1>
              <HelpPopover topicKey="templates" />
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Organize modelos-base com refeicoes, alimentos, suplementos e substituicoes estruturados para reaproveitar com seguranca no prontuario.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {PROTOCOL_TEMPLATE_TYPES.map((type) => (
                <button key={type} type="button" onClick={() => openCreate(type)} className="group rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-left transition hover:border-[#7F9A74]/45 hover:bg-[#F5FAF0]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF0E4] text-[#607A56]">{typeIcon(type)}</span>
                  <span className="mt-3 block text-sm font-semibold text-[#3A3028]">Novo {PROTOCOL_TEMPLATE_TYPE_LABELS[type].toLowerCase()}</span>
                  <span className="mt-1 block text-xs leading-5 text-[#75675E]">Estruture um modelo reutilizavel e ajustavel.</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/dashboard/templates/receitas" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#D9E4D3] px-5 py-2 text-sm font-semibold text-[#607A56] transition-colors hover:bg-[#EAF0E4]">
                <Utensils className="h-4 w-4" />
                Abrir biblioteca de receitas
              </Link>
              <Link href="/dashboard/templates/educacao" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#D9E4D3] px-5 py-2 text-sm font-semibold text-[#607A56] transition-colors hover:bg-[#EAF0E4]">
                <BookOpenText className="h-4 w-4" />
                Fichas educativas
              </Link>
            </div>
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
              Editar um modelo altera apenas a biblioteca. Planos ja criados para pacientes continuam como instancias independentes.
            </p>
          </aside>
        </div>
      </section>

      {message && <p className="rounded-xl border border-[#D9E4D3] bg-[#F5FAF0] px-4 py-3 text-sm text-[#607A56]">{message}</p>}
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_220px_220px_auto] lg:items-end">
          <div>
            <label className="brand-label">Busca</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="brand-input brand-input-with-icon" placeholder="Nome, grupo ou tipo..." />
            </div>
          </div>
          <div>
            <label className="brand-label">Grupo</label>
            <select value={filterGroup} onChange={(event) => setFilterGroup(event.target.value)} className="brand-input">
              <option value="">Todos</option>
              {PROTOCOL_TEMPLATE_TARGET_GROUPS.map((group) => <option key={group} value={group}>{PROTOCOL_TEMPLATE_GROUP_LABELS[group]}</option>)}
            </select>
          </div>
          <div>
            <label className="brand-label">Tipo</label>
            <select value={filterType} onChange={(event) => setFilterType(event.target.value)} className="brand-input">
              <option value="">Todos</option>
              {PROTOCOL_TEMPLATE_TYPES.map((type) => <option key={type} value={type}>{PROTOCOL_TEMPLATE_TYPE_LABELS[type]}</option>)}
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
            <p className="brand-kicker mb-1">Acervo clinico</p>
            <h2 className="font-serif text-xl font-semibold text-[#3A3028]">Templates cadastrados</h2>
          </div>
          <span className="w-fit rounded-full border border-[#7F9A74]/30 px-3 py-1 text-xs font-semibold text-[#607A56]">{filtered.length} modelo{filtered.length !== 1 ? "s" : ""}</span>
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
            {filtered.map((template) => <TemplateCard key={template.id} template={template} onView={(item) => void openView(item)} onEdit={(item) => void openEdit(item)} onRemove={setDeleteTemplate} />)}
          </div>
        )}
      </section>

      {portalReady && viewTemplate && createPortal(
        <TemplateViewModal template={viewTemplate} onClose={() => setViewTemplate(null)} onEdit={(template) => void openEdit(template)} />,
        document.body
      )}

      {portalReady && form && createPortal(
        <TemplateEditModal
          form={form}
          saving={saving}
          aiEnabled={aiEnabled}
          aiSuggesting={aiSuggesting}
          error={error}
          setForm={setForm}
          onClose={() => setForm(null)}
          onSave={() => void saveTemplate()}
          onSuggest={() => void suggestDietTemplate(form)}
          onMessage={setMessage}
          onError={setError}
        />,
        document.body
      )}

      {portalReady && deleteTemplate && createPortal(
        <TemplateDeleteModal
          template={deleteTemplate}
          deleting={deleting}
          error={error}
          onCancel={() => setDeleteTemplate(null)}
          onConfirm={() => void removeTemplate()}
        />,
        document.body
      )}
    </div>
  );
}

function TemplateDeleteModal({ template, deleting, error, onCancel, onConfirm }: {
  template: ProtocolTemplate;
  deleting: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <section className="w-full max-w-md overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)]">
        <div className="border-b border-[#EDE1D6] px-5 py-4">
          <p className="brand-kicker">Excluir modelo</p>
          <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Confirmar exclusao</h2>
          <p className="mt-2 text-sm leading-6 text-[#75675E]">
            O modelo <strong className="text-[#3A3028]">{template.title}</strong> sera removido da biblioteca. Planos de pacientes ja criados nao serao alterados.
          </p>
        </div>
        {error && <p className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="grid gap-3 px-5 py-4 sm:flex sm:justify-end">
          <button type="button" onClick={onCancel} disabled={deleting} className="brand-btn-secondary w-full sm:w-auto">Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={deleting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#F2CDC7] px-5 py-2 text-sm font-semibold text-[#9A5C4E] transition hover:bg-[#FFF5F3] disabled:opacity-50">
            <Trash2 className="h-4 w-4" />
            {deleting ? "Excluindo..." : "Excluir modelo"}
          </button>
        </div>
      </section>
    </div>
  );
}

function TemplateViewModal({ template, onClose, onEdit }: {
  template: ProtocolTemplateDetail;
  onClose: () => void;
  onEdit: (template: ProtocolTemplate) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <section className="flex h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)] sm:h-auto sm:max-h-[calc(100dvh-3rem)]">
        <div className="shrink-0 flex items-start justify-between gap-3 border-b border-[#EDE1D6] bg-[#FFFDFC] px-5 py-4">
          <div className="min-w-0">
            <p className="brand-kicker">Visualizar modelo</p>
            <h2 className="break-words font-serif text-2xl font-semibold text-[#3A3028]">{template.title}</h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#8C5F50]">{PROTOCOL_TEMPLATE_TYPE_LABELS[template.type]} - {PROTOCOL_TEMPLATE_GROUP_LABELS[template.target_group]}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" title="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          <TemplateReadSections template={template} />
        </div>
        <div className="shrink-0 grid gap-3 border-t border-[#EDE1D6] bg-[#FFFDFC] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:justify-end sm:py-4">
          <button type="button" onClick={onClose} className="brand-btn-secondary w-full sm:w-auto">Fechar</button>
          <button type="button" onClick={() => onEdit(template)} className="brand-btn-primary w-full sm:w-auto"><Edit3 className="h-4 w-4" />Editar modelo</button>
        </div>
      </section>
    </div>
  );
}

function TemplateEditModal({ form, saving, aiEnabled, aiSuggesting, error, setForm, onClose, onSave, onSuggest, onMessage, onError }: {
  form: TemplateForm;
  saving: boolean;
  aiEnabled: boolean;
  aiSuggesting: boolean;
  error: string;
  setForm: (form: TemplateForm | null) => void;
  onClose: () => void;
  onSave: () => void;
  onSuggest: () => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <section className="flex h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)] sm:h-auto sm:max-h-[calc(100dvh-3rem)]">
        <div className="shrink-0 flex items-start justify-between gap-3 border-b border-[#EDE1D6] bg-[#FFFDFC] px-5 py-4">
          <div className="min-w-0">
            <p className="brand-kicker">{form.id ? "Editar modelo" : "Novo modelo"}</p>
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Modelo de {PROTOCOL_TEMPLATE_TYPE_LABELS[form.type].toLowerCase()}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onSuggest} disabled={!aiEnabled || aiSuggesting || form.type !== "DIETA"} title={aiEnabled ? "Sugerir modelo com IA" : "Configure a IA em Dashboard > Inteligencia artificial"} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#EAD8C2] px-3 text-xs font-semibold text-[#8C5F50] transition hover:bg-[#FBF7F1] disabled:cursor-not-allowed disabled:opacity-50">
              <Sparkles className="h-4 w-4" />
              {aiSuggesting ? "Sugerindo..." : "Sugerir com IA"}
            </button>
            <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" title="Fechar"><X className="h-5 w-5" /></button>
          </div>
        </div>
        {!aiEnabled && <p className="shrink-0 border-b border-[#EDE1D6] bg-[#FFF7F3] px-5 py-2 text-xs text-[#8C5F50]">Para usar Sugerir com IA, configure a chave em <a href="/dashboard/settings/ai" className="font-semibold underline">Inteligencia artificial</a>.</p>}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="brand-label">Titulo do modelo</label>
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
            <div className="md:col-span-2">
              <label className="brand-label">Orientacoes gerais do modelo</label>
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="brand-input min-h-28 resize-y" placeholder="Pontos de atencao e orientacoes gerais para adaptar antes de entregar." />
            </div>
            <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-sm text-[#75675E]">
              <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} className="mt-1 h-4 w-4 accent-[#7F9A74]" />
              <span><strong className="block text-[#3A3028]">Modelo ativo</strong>Disponivel para uso no prontuario e apoio do agente de IA.</span>
            </label>
          </div>

          <div className="mt-6 space-y-6">
            {form.type === "DIETA" && (
              <>
                <MealItemsEditor
                  meals={form.meals}
                  onChange={(meals) => setForm({ ...form, meals })}
                  targetGroup={form.target_group}
                  aiEnabled={aiEnabled}
                  context="template"
                  recipeTags={[form.target_group, "modelo de dieta"].join(", ")}
                  recipeDescriptionPrefix={`Receita criada a partir do modelo "${form.title || "sem titulo"}"`}
                  onMessage={onMessage}
                  onError={onError}
                />
                <EditableList
                  title="Substituicoes"
                  items={form.substitutions}
                  onChange={(substitutions) => setForm({ ...form, substitutions })}
                  emptyItem={{ base_food: "", option_food: "", quantity: "", unit: "", notes: "" }}
                  fields={["base_food", "option_food", "quantity", "unit"]}
                  labels={["Alimento base", "Pode trocar por", "Qtd.", "Un."]}
                />
              </>
            )}
            {form.type === "SUPLEMENTACAO" && (
              <EditableList
                title="Suplementos"
                items={form.supplements}
                onChange={(supplements) => setForm({ ...form, supplements })}
                emptyItem={{ name: "", dosage: "", unit: "", instructions: "", notes: "" }}
                fields={["name", "dosage", "unit", "instructions"]}
                labels={["Nome", "Dose", "Un.", "Como usar"]}
              />
            )}
            {form.type === "SUBSTITUICAO" && (
              <EditableList
                title="Substituicoes"
                items={form.substitutions}
                onChange={(substitutions) => setForm({ ...form, substitutions })}
                emptyItem={{ base_food: "", option_food: "", quantity: "", unit: "", notes: "" }}
                fields={["base_food", "option_food", "quantity", "unit"]}
                labels={["Alimento base", "Pode trocar por", "Qtd.", "Un."]}
              />
            )}
          </div>
          {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
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

function TemplateReadSections({ template }: { template: ProtocolTemplateDetail }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ReadSection title="Orientacoes gerais" items={template.notes ? [template.notes] : []} />
      <ReadSection title="Refeicoes" items={template.meals.map((meal) => `${meal.name}: ${meal.items.map((item) => `${item.food} ${item.quantity ?? ""}${item.unit ?? ""}`.trim()).join(", ")}`)} />
      <ReadSection title="Substituicoes" items={template.substitutions.map((item) => `${item.base_food} -> ${item.option_food}${item.quantity ? ` (${item.quantity} ${item.unit ?? ""})` : ""}`)} />
      <ReadSection title="Suplementacao" items={template.supplements.map((item) => `${item.name}${item.dosage ? ` - ${item.dosage} ${item.unit ?? ""}` : ""}${item.instructions ? ` - ${item.instructions}` : ""}`)} />
    </div>
  );
}

function ReadSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4">
      <p className="text-sm font-semibold text-[#3A3028]">{title}</p>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[#75675E]">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7F9A74]" />
              <span className="break-words">{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#A9978A]">Sem conteudo cadastrado.</p>
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
