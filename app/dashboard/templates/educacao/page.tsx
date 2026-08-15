"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, BookOpenText, Edit3, Eye, Plus, Save, Search, X } from "lucide-react";
import { HelpPopover } from "@/components/dashboard/HelpPopover";

type EducationCategory = "geral" | "patologia";

type EducationCard = {
  id: string;
  slug: string;
  title: string;
  category: EducationCategory;
  summary: string;
  sections: Record<string, unknown>;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type EducationForm = {
  id?: string;
  slug: string;
  title: string;
  category: EducationCategory;
  summary: string;
  sectionsText: string;
  is_active: boolean;
};

const categoryLabels: Record<EducationCategory, string> = {
  geral: "Geral",
  patologia: "Patologia",
};

const emptyForm: EducationForm = {
  slug: "",
  title: "",
  category: "geral",
  summary: "",
  sectionsText: "{}",
  is_active: true,
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function cardToForm(card: EducationCard): EducationForm {
  return {
    id: card.id,
    slug: card.slug,
    title: card.title,
    category: card.category,
    summary: card.summary,
    sectionsText: JSON.stringify(card.sections, null, 2),
    is_active: Boolean(card.is_active),
  };
}

function sectionPreview(sections: Record<string, unknown>) {
  return Object.entries(sections).slice(0, 3).map(([key]) => key.replaceAll("_", " ")).join(", ");
}

function renderSectionValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join("\n");
  }
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export default function PatientEducationCardsPage() {
  const [cards, setCards] = useState<EducationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [form, setForm] = useState<EducationForm | null>(null);
  const [viewCard, setViewCard] = useState<EducationCard | null>(null);
  const [archiveCard, setArchiveCard] = useState<EducationCard | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadCards = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ includeInactive: includeInactive ? "true" : "false" });
    if (search.trim()) params.set("q", search.trim());
    if (category) params.set("category", category);
    const response = await fetch(`/api/admin/patient-education-cards?${params}`, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json() as { items: EducationCard[] };
      setCards(data.items);
    }
    setLoading(false);
  }, [category, includeInactive, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCards(), 250);
    return () => window.clearTimeout(timer);
  }, [loadCards]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!form && !viewCard && !archiveCard) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [form, viewCard, archiveCard]);

  const stats = useMemo(() => ({
    total: cards.length,
    general: cards.filter((card) => card.category === "geral").length,
    pathology: cards.filter((card) => card.category === "patologia").length,
    active: cards.filter((card) => card.is_active).length,
  }), [cards]);

  function openCreate() {
    setError("");
    setMessage("");
    setForm({ ...emptyForm });
  }

  async function saveCard() {
    if (!form) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const sections = JSON.parse(form.sectionsText || "{}") as unknown;
      if (!sections || typeof sections !== "object" || Array.isArray(sections)) {
        throw new Error("O conteudo flexivel precisa ser um objeto JSON.");
      }
      const payload = {
        slug: form.slug.trim() || slugify(form.title),
        title: form.title.trim(),
        category: form.category,
        summary: form.summary.trim(),
        sections,
        is_active: form.is_active,
      };
      const response = await fetch(form.id ? `/api/admin/patient-education-cards/${form.id}` : "/api/admin/patient-education-cards", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = response.ok ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? "Nao foi possivel salvar a ficha.");
      setForm(null);
      setMessage("Ficha educativa salva.");
      await loadCards();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel salvar a ficha.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveSelectedCard() {
    if (!archiveCard) return;
    setArchiving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/patient-education-cards/${archiveCard.id}`, { method: "DELETE" });
      const data = response.ok ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? "Nao foi possivel arquivar a ficha.");
      setArchiveCard(null);
      setMessage("Ficha educativa arquivada.");
      await loadCards();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel arquivar a ficha.");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="brand-kicker mb-3">Educação do paciente</p>
            <div className="flex items-start gap-3">
              <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028] sm:text-5xl">Fichas de orientação</h1>
              <HelpPopover topicKey="templates/educacao" />
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Edite materiais educativos gerais e por patologia para apoiar comunicação, protocolos e acompanhamento sem depender de deploy.
            </p>
          </div>
          <button type="button" onClick={openCreate} className="brand-btn-primary w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Nova ficha
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Stat label="Total" value={stats.total} />
          <Stat label="Ativas" value={stats.active} />
          <Stat label="Gerais" value={stats.general} />
          <Stat label="Patologias" value={stats.pathology} />
        </div>
      </section>

      {message && <p className="rounded-xl border border-[#D9E4D3] bg-[#F5FAF0] px-4 py-3 text-sm text-[#607A56]">{message}</p>}
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
          <div>
            <label className="brand-label">Busca</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="brand-input brand-input-with-icon" placeholder="Titulo, resumo ou slug..." />
            </div>
          </div>
          <div>
            <label className="brand-label">Categoria</label>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="brand-input">
              <option value="">Todas</option>
              <option value="geral">Geral</option>
              <option value="patologia">Patologia</option>
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 text-sm text-[#75675E]">
            <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
            Inativas
          </label>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <p className="text-sm text-[#8C6E52]">Carregando fichas...</p>
        ) : cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D9C4B2] bg-[#FFFDFC] p-8 text-center md:col-span-2 xl:col-span-3">
            <BookOpenText className="mx-auto mb-3 h-9 w-9 text-[#C4B3A6]" />
            <p className="font-serif text-xl font-semibold text-[#3A3028]">Nenhuma ficha encontrada.</p>
          </div>
        ) : cards.map((card) => (
          <article key={card.id} className="flex min-w-0 flex-col rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF0E4] text-[#607A56]"><BookOpenText className="h-5 w-5" /></span>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${card.is_active ? "border-[#D9E4D3] text-[#607A56]" : "border-[#EDE1D6] text-[#75675E]"}`}>
                {card.is_active ? "Ativa" : "Inativa"}
              </span>
            </div>
            <h2 className="mt-4 break-words font-serif text-xl font-semibold text-[#3A3028]">{card.title}</h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#8C5F50]">{categoryLabels[card.category]}</p>
            <p className="mt-3 line-clamp-4 text-sm leading-6 text-[#75675E]">{card.summary}</p>
            <p className="mt-3 rounded-xl bg-[#FBF7F1] px-3 py-2 text-xs leading-5 text-[#75675E]">
              Campos: {sectionPreview(card.sections) || "sem campos"}
            </p>
            <div className="mt-auto grid grid-cols-3 gap-2 pt-5">
              <button type="button" onClick={() => setViewCard(card)} className="brand-btn-secondary"><Eye className="h-4 w-4" />Ver</button>
              <button type="button" onClick={() => setForm(cardToForm(card))} className="brand-btn-secondary"><Edit3 className="h-4 w-4" />Editar</button>
              <button type="button" onClick={() => setArchiveCard(card)} className="inline-flex min-h-11 items-center justify-center rounded-full px-3 text-[#9A5C4E] hover:bg-[#FFF5F3]" title="Arquivar ficha">
                <Archive className="h-4 w-4" />
              </button>
            </div>
          </article>
        ))}
      </section>

      {portalReady && viewCard && createPortal(<ViewModal card={viewCard} onClose={() => setViewCard(null)} />, document.body)}
      {portalReady && form && createPortal(
        <EditModal form={form} saving={saving} error={error} setForm={setForm} onSave={() => void saveCard()} onClose={() => setForm(null)} />,
        document.body
      )}
      {portalReady && archiveCard && createPortal(
        <ArchiveModal card={archiveCard} archiving={archiving} onCancel={() => setArchiveCard(null)} onConfirm={() => void archiveSelectedCard()} />,
        document.body
      )}
    </div>
  );
}

function ViewModal({ card, onClose }: { card: EducationCard; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <section className="flex h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)] sm:h-auto sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EDE1D6] px-5 py-4">
          <div>
            <p className="brand-kicker">Ficha educativa</p>
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">{card.title}</h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#8C5F50]">{categoryLabels[card.category]}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" title="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
          <ReadBox title="Resumo" value={card.summary} />
          {Object.entries(card.sections).map(([key, value]) => {
            const text = renderSectionValue(value);
            return text ? <ReadBox key={key} title={key.replaceAll("_", " ")} value={text} /> : null;
          })}
        </div>
        <div className="shrink-0 border-t border-[#EDE1D6] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onClose} className="brand-btn-secondary w-full sm:w-auto">Fechar</button>
        </div>
      </section>
    </div>
  );
}

function EditModal({ form, saving, error, setForm, onSave, onClose }: {
  form: EducationForm;
  saving: boolean;
  error: string;
  setForm: (form: EducationForm | null) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <section className="flex h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)] sm:h-auto sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EDE1D6] px-5 py-4">
          <div>
            <p className="brand-kicker">{form.id ? "Editar ficha" : "Nova ficha"}</p>
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Orientação ao paciente</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" title="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="brand-label">Titulo</label>
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value, slug: form.slug || slugify(event.target.value) })} className="brand-input" />
            </div>
            <div>
              <label className="brand-label">Slug</label>
              <input value={form.slug} onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })} className="brand-input" />
            </div>
            <div>
              <label className="brand-label">Categoria</label>
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as EducationCategory })} className="brand-input">
                <option value="geral">Geral</option>
                <option value="patologia">Patologia</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="brand-label">Resumo</label>
              <textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} className="brand-input min-h-24 resize-y" />
            </div>
            <div className="md:col-span-2">
              <label className="brand-label">Conteudo flexivel JSON</label>
              <textarea value={form.sectionsText} onChange={(event) => setForm({ ...form, sectionsText: event.target.value })} className="brand-input min-h-[22rem] resize-y font-mono text-xs leading-5" />
            </div>
            <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-sm text-[#75675E]">
              <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} className="mt-1 accent-[#7F9A74]" />
              <span><strong className="block text-[#3A3028]">Ficha ativa</strong>Disponivel para uso na biblioteca.</span>
            </label>
            {error && <p className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          </div>
        </div>
        <div className="grid shrink-0 gap-3 border-t border-[#EDE1D6] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:justify-end">
          <button type="button" onClick={onClose} className="brand-btn-secondary w-full sm:w-auto">Cancelar</button>
          <button type="button" onClick={onSave} disabled={saving || !form.title.trim()} className="brand-btn-primary w-full sm:w-auto"><Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar ficha"}</button>
        </div>
      </section>
    </div>
  );
}

function ArchiveModal({ card, archiving, onCancel, onConfirm }: {
  card: EducationCard;
  archiving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-3 py-3 backdrop-blur-sm">
      <section className="w-full max-w-md rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_28px_90px_rgba(58,48,40,0.24)]">
        <p className="brand-kicker">Arquivar ficha</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold text-[#3A3028]">Confirmar arquivamento</h2>
        <p className="mt-3 text-sm leading-6 text-[#75675E]">A ficha <strong>{card.title}</strong> deixara de aparecer como ativa, mas o historico permanece no banco.</p>
        <div className="mt-5 grid gap-3 sm:flex sm:justify-end">
          <button type="button" onClick={onCancel} disabled={archiving} className="brand-btn-secondary w-full sm:w-auto">Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={archiving} className="brand-btn-primary w-full sm:w-auto">{archiving ? "Arquivando..." : "Arquivar"}</button>
        </div>
      </section>
    </div>
  );
}

function ReadBox({ title, value }: { title: string; value: string }) {
  return (
    <section className="rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4">
      <p className="text-sm font-semibold capitalize text-[#3A3028]">{title}</p>
      <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-[#75675E]">{value}</p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A9978A]">{label}</p>
      <p className="mt-2 font-serif text-3xl font-semibold text-[#607A56]">{value}</p>
    </div>
  );
}
