"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, LibraryBig, Plus, Save, Trash2, X } from "lucide-react";
import {
  PROTOCOL_TEMPLATE_GROUP_LABELS,
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  PROTOCOL_TEMPLATE_TYPE_LABELS,
  type ProtocolTemplateTargetGroup,
  type ProtocolTemplateType,
  PROTOCOL_TEMPLATE_TYPES,
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
  content: string;
  is_active: boolean;
};

const emptyForm: TemplateForm = {
  title: "",
  type: "DIETA",
  target_group: "ADULTO_SAUDAVEL",
  content: "{\n  \"refeicoes\": {}\n}",
  is_active: true,
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function prettyJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default function ProtocolTemplatesPage() {
  const [templates, setTemplates] = useState<ProtocolTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [filterGroup, setFilterGroup] = useState("");
  const [filterType, setFilterType] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => templates.filter((template) => {
    if (filterGroup && template.target_group !== filterGroup) return false;
    if (filterType && template.type !== filterType) return false;
    return true;
  }), [templates, filterGroup, filterType]);

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

  function openCreate() {
    setError("");
    setForm(emptyForm);
  }

  function openEdit(template: ProtocolTemplate) {
    setError("");
    setForm({
      id: template.id,
      title: template.title,
      type: template.type,
      target_group: template.target_group,
      content: prettyJson(template.content),
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
        content: prettyJson(form.content),
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
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="brand-kicker">Base profissional</p>
          <h1 className="font-serif text-3xl font-semibold text-[#3A3028]">Modelos de protocolos</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#75675E]">
            Cadastre dietas, suplementações e substituições por grupo alvo. Essa base alimenta o preenchimento manual e limita o agente de IA.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="brand-btn-primary">
          <Plus className="h-4 w-4" />
          Novo modelo
        </button>
      </div>

      <section className="brand-card p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div>
            <label className="brand-label">Grupo alvo</label>
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
          <label className="flex items-center gap-2 rounded-xl border border-[#EDE1D6] bg-[#FFFDFC] px-4 py-3 text-sm text-[#75675E]">
            <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
            Incluir inativos
          </label>
        </div>
      </section>

      <section className="brand-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#EDE1D6] px-5 py-4">
          <h2 className="brand-section-title flex items-center gap-2">
            <LibraryBig className="h-4 w-4" />
            Templates cadastrados
          </h2>
          <span className="rounded-full border border-[#7F9A74]/30 px-3 py-1 text-xs font-semibold text-[#607A56]">
            {filtered.length} modelo{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#FBF7F1]">
              <tr>
                {["Título", "Tipo", "Grupo", "Status", "Criado em", ""].map((title) => (
                  <th key={title} className="px-5 py-3 brand-kicker last:text-right">{title}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2E9DF]">
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-[#9A8B80]">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-[#9A8B80]">Nenhum modelo encontrado.</td></tr>
              ) : filtered.map((template) => (
                <tr key={template.id} className="hover:bg-[#FBF7F1]/70">
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-[#3A3028]">{template.title}</p>
                    <p className="mt-1 max-w-[360px] truncate text-xs text-[#9A8B80]">{template.content}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-[#75675E]">{PROTOCOL_TEMPLATE_TYPE_LABELS[template.type]}</td>
                  <td className="px-5 py-4 text-sm text-[#75675E]">{PROTOCOL_TEMPLATE_GROUP_LABELS[template.target_group]}</td>
                  <td className="px-5 py-4">
                    <span className={`brand-badge ${template.is_active ? "brand-badge-finalizado" : "brand-badge-arquivado"}`}>
                      {template.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-[#9A8B80]">{formatDate(template.created_at)}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openEdit(template)} className="rounded-lg p-2 text-[#607A56] hover:bg-[#EAF0E4]" title="Editar">
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => void removeTemplate(template)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 px-4 py-6 backdrop-blur-sm sm:items-center">
          <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#EDE1D6] bg-[#FFFDFC]/95 px-5 py-4 backdrop-blur">
              <div>
                <p className="brand-kicker">{form.id ? "Editar modelo" : "Novo modelo"}</p>
                <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Modelo de protocolo</h2>
              </div>
              <button type="button" onClick={() => setForm(null)} className="rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" title="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="brand-label">Título</label>
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="brand-input" />
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
                <label className="brand-label">Content JSON</label>
                <textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} className="brand-input min-h-[320px] resize-y font-mono text-xs leading-5" spellCheck={false} />
              </div>
              <label className="md:col-span-2 flex items-center gap-2 text-sm text-[#75675E]">
                <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
                Modelo ativo para uso manual e pelo agente de IA
              </label>
              {error && <p className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-[#EDE1D6] px-5 py-4">
              <button type="button" onClick={() => setForm(null)} className="brand-btn-secondary">Cancelar</button>
              <button type="button" onClick={() => void saveTemplate()} disabled={saving || !form.title.trim()} className="brand-btn-primary">
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar modelo"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
