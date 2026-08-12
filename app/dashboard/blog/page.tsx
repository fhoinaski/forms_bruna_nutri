"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Newspaper,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { HelpPopover } from "@/components/dashboard/HelpPopover";
import { MarkdownEditor } from "@/components/dashboard/MarkdownEditor";
import type { BlogContentDomain, BlogReference } from "@/lib/ai/research/editorial-sources";

type BlogStatus = "draft" | "published" | "archived";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content_markdown: string;
  category: string | null;
  tags_json: string;
  status: BlogStatus;
  author_name: string;
  cover_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  ai_generated: number;
  references_json: string;
  content_domain: BlogContentDomain | null;
  published_at: string | null;
  created_at: string;
}

interface FormState {
  title: string;
  excerpt: string;
  content_markdown: string;
  category: string;
  tags: string;
  status: BlogStatus;
  cover_image_url: string;
  seo_title: string;
  seo_description: string;
  content_domain: BlogContentDomain | "";
  references: BlogReference[];
}

const CONTENT_DOMAIN_LABELS: Record<BlogContentDomain, string> = {
  nutrition: "Nutrição",
  maternal_child: "Materno-infantil",
  clinical_condition: "Condição clínica",
  medication: "Medicamento",
  supplement: "Suplemento",
  behavior: "Comportamento alimentar",
  general_health: "Saúde geral",
};

const DOMAINS_NEEDING_REVIEW: readonly BlogContentDomain[] = ["medication", "clinical_condition", "supplement"];

const statusLabels: Record<BlogStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
};

const emptyForm: FormState = {
  title: "",
  excerpt: "",
  content_markdown: "",
  category: "Nutrição materno-infantil",
  tags: "",
  status: "draft",
  cover_image_url: "",
  seo_title: "",
  seo_description: "",
  content_domain: "",
  references: [],
};

function statusTone(status: BlogStatus) {
  if (status === "published") return "bg-[#EAF0E4] text-[#607A56] border-[#C7D7BC]";
  if (status === "archived") return "bg-[#F3EEE9] text-[#8D8178] border-[#E1D6CD]";
  return "bg-[#FFF8E8] text-[#9A6B28] border-[#F3DFA8]";
}

function parseTags(tagsJson: string): string[] {
  try {
    return JSON.parse(tagsJson || "[]") as string[];
  } catch {
    return [];
  }
}

function parseReferences(referencesJson: string): BlogReference[] {
  try {
    const parsed = JSON.parse(referencesJson || "[]");
    return Array.isArray(parsed) ? (parsed as BlogReference[]) : [];
  } catch {
    return [];
  }
}

export default function DashboardBlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const summary = useMemo(() => {
    return posts.reduce(
      (acc, post) => {
        if (post.status === "published") acc.published++;
        if (post.status === "draft") acc.drafts++;
        if (post.ai_generated) acc.ai++;
        return acc;
      },
      { published: 0, drafts: 0, ai: 0 }
    );
  }, [posts]);

  async function loadPosts() {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(search ? { search } : {}),
      });
      const response = await fetch(`/api/admin/blog-posts?${params}`);
      if (!response.ok) throw new Error();
      const json: { items: BlogPost[] } = await response.json();
      setPosts(json.items);
    } catch {
      setMessage("Nao foi possivel carregar o blog agora.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, searchTrigger]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setSearchTrigger((current) => current + 1);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function startEditing(post: BlogPost) {
    setEditingId(post.id);
    setForm({
      title: post.title,
      excerpt: post.excerpt,
      content_markdown: post.content_markdown,
      category: post.category || "Nutrição materno-infantil",
      tags: parseTags(post.tags_json).join(", "),
      status: post.status,
      cover_image_url: post.cover_image_url || "",
      seo_title: post.seo_title || "",
      seo_description: post.seo_description || "",
      content_domain: post.content_domain ?? "",
      references: parseReferences(post.references_json),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeReference(index: number) {
    setForm((current) => ({ ...current, references: current.references.filter((_, i) => i !== index) }));
  }

  async function savePost(event: React.FormEvent) {
    event.preventDefault();
    if (form.content_markdown.trim().length < 200) {
      setMessage("O conteúdo precisa ter pelo menos 200 caracteres.");
      return;
    }
    setSaving(true);
    setMessage("");

    const payload = {
      title: form.title,
      excerpt: form.excerpt,
      content_markdown: form.content_markdown,
      category: form.category || null,
      tags: form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      status: form.status,
      cover_image_url: form.cover_image_url || null,
      seo_title: form.seo_title || form.title,
      seo_description: form.seo_description || form.excerpt,
      content_domain: form.content_domain || null,
      references: form.references,
    };

    try {
      const response = await fetch(
        editingId ? `/api/admin/blog-posts/${editingId}` : "/api/admin/blog-posts",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) throw new Error();
      const wasEditing = Boolean(editingId);
      resetForm();
      setMessage(wasEditing ? "Post atualizado." : "Post criado.");
      await loadPosts();
    } catch {
      setMessage("Nao foi possivel salvar o post. Verifique tamanho minimo do conteudo.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: BlogStatus) {
    setPosts((current) =>
      current.map((post) => (post.id === id ? { ...post, status } : post))
    );
    const response = await fetch(`/api/admin/blog-posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setMessage("Nao foi possivel atualizar o post.");
      await loadPosts();
    }
  }

  async function deletePost(id: string) {
    if (!confirm("Remover este post do blog?")) return;
    const response = await fetch(`/api/admin/blog-posts/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("Nao foi possivel remover o post.");
      return;
    }
    setPosts((current) => current.filter((post) => post.id !== id));
    if (editingId === id) resetForm();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="brand-kicker mb-3">Conteudo e autoridade</p>
            <div className="flex items-start gap-3">
              <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028]">
                Blog editorial
              </h1>
              <HelpPopover topicKey="blog" />
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Revise, edite, publique e acompanhe artigos para fortalecer SEO,
              buscas e respostas de agentes de IA sobre nutrição materno-infantil.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadPosts()}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[#7F9A74]/35 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] transition hover:bg-[#EAF0E4]"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
          <div className="flex items-center justify-between">
            <p className="brand-kicker">Publicados</p>
            <CheckCircle2 className="h-5 w-5 text-[#607A56]" />
          </div>
          <p className="mt-3 font-serif text-4xl font-semibold text-[#3A3028]">
            {summary.published}
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
          <div className="flex items-center justify-between">
            <p className="brand-kicker">Rascunhos</p>
            <FileText className="h-5 w-5 text-[#9A6B28]" />
          </div>
          <p className="mt-3 font-serif text-4xl font-semibold text-[#3A3028]">
            {summary.drafts}
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
          <div className="flex items-center justify-between">
            <p className="brand-kicker">Gerados por IA</p>
            <Sparkles className="h-5 w-5 text-[#8C5F50]" />
          </div>
          <p className="mt-3 font-serif text-4xl font-semibold text-[#3A3028]">
            {summary.ai}
          </p>
        </div>
      </div>

      <div className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FBF7F1] p-5">
        <p className="brand-kicker mb-2">API do agente</p>
        <p className="text-sm leading-7 text-[#75675E]">
          O agente deve enviar posts para <span className="font-semibold text-[#3A3028]">POST /api/agent/blog-posts</span> com
          <span className="font-semibold text-[#3A3028]"> Authorization: Bearer BLOG_AGENT_TOKEN</span>.
          Todo conteúdo recebido entra como <span className="font-semibold text-[#3A3028]">rascunho</span> para revisão humana antes de publicar.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(380px,0.65fr)]">
        <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
          <div className="border-b border-[#EDE1D6] px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
                  Biblioteca editorial
                </h2>
                <p className="mt-1 text-sm text-[#75675E]">
                  Conteudos publicados, rascunhos e posts criados pelo agente.
                </p>
              </div>
              <form onSubmit={handleSearch} className="dashboard-filter-form lg:max-w-xl">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="brand-input brand-input-with-icon"
                    placeholder="Buscar artigo..."
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="brand-input"
                >
                  <option value="">Todos</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button type="submit" className="brand-btn-primary py-0">
                  Buscar
                </button>
              </form>
            </div>
          </div>

          <div className="divide-y divide-[#F5ECE4]">
            {loading ? (
              <div className="px-6 py-16 text-center text-sm text-[#A9978A]">
                Carregando posts...
              </div>
            ) : posts.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Newspaper className="mx-auto mb-4 h-9 w-9 text-[#C4B3A6]" />
                <p className="font-serif text-xl font-semibold text-[#3A3028]">
                  Nenhum post encontrado
                </p>
              </div>
            ) : (
              posts.map((post) => (
                <article
                  key={post.id}
                  className="grid gap-4 px-6 py-5 transition hover:bg-[#FBF7F1]/75 md:grid-cols-[minmax(0,1fr)_140px_244px]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-[#3A3028]">{post.title}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusTone(post.status)}`}>
                        {statusLabels[post.status]}
                      </span>
                      {post.ai_generated ? (
                        <span className="rounded-full bg-[#F3E8E5] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8C5F50]">
                          IA
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#75675E]">
                      {post.excerpt}
                    </p>
                  </div>
                  <div>
                    <p className="brand-kicker mb-1">Categoria</p>
                    <p className="text-sm font-semibold text-[#3A3028]">
                      {post.category || "Nutrição"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2 md:justify-end">
                    <select
                      value={post.status}
                      onChange={(event) =>
                        void updateStatus(post.id, event.target.value as BlogStatus)
                      }
                      className="h-10 rounded-full border border-[#EDE1D6] bg-white px-3 text-xs font-semibold text-[#75675E] outline-none transition focus:border-[#7F9A74] focus:ring-2 focus:ring-[#7F9A74]/15"
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => startEditing(post)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#7F9A74]/35 text-[#607A56] transition hover:bg-[#EAF0E4]"
                      aria-label="Editar post"
                    >
                      <PenLine className="h-4 w-4" />
                    </button>
                    {post.status === "published" && (
                      <Link
                        href={`/blog/${post.slug}`}
                        target="_blank"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#7F9A74]/35 text-[#607A56] transition hover:bg-[#EAF0E4]"
                        aria-label="Abrir post"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => void deletePost(post.id)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E8C3BA] text-[#9A5C4E] transition hover:bg-[#F6E6E0]"
                      aria-label="Remover post"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="brand-kicker mb-2">{editingId ? "Edicao" : "Post manual"}</p>
              <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
                {editingId ? "Editar artigo" : "Criar artigo"}
              </h2>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-[#EDE1D6] px-3 py-1.5 text-xs font-semibold text-[#75675E] transition hover:bg-[#FBF7F1]"
              >
                Cancelar
              </button>
            )}
          </div>

          <form onSubmit={savePost} className="space-y-6">
            <div className="space-y-4">
              <p className="brand-kicker">Conteúdo principal</p>
              <div>
                <label className="brand-label">Título</label>
                <input
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  className="brand-input"
                  maxLength={180}
                  required
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label className="brand-label">Resumo</label>
                  <span className="text-[10px] text-[#A9978A]">{form.excerpt.length}/500</span>
                </div>
                <textarea
                  value={form.excerpt}
                  onChange={(event) => updateForm("excerpt", event.target.value)}
                  className="brand-input min-h-24 resize-none"
                  maxLength={500}
                  placeholder="1-2 frases que resumem o artigo para quem está navegando."
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="brand-label">Categoria</label>
                  <input
                    value={form.category}
                    onChange={(event) => updateForm("category", event.target.value)}
                    className="brand-input"
                  />
                </div>
                <div>
                  <label className="brand-label">Status</label>
                  <select
                    value={form.status}
                    onChange={(event) => updateForm("status", event.target.value as BlogStatus)}
                    className="brand-input"
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="brand-label">Tags separadas por vírgula</label>
                <input
                  value={form.tags}
                  onChange={(event) => updateForm("tags", event.target.value)}
                  className="brand-input"
                  placeholder="introducao alimentar, seletividade, rotina"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <label className="brand-label">Domínio editorial</label>
                  {form.content_domain && DOMAINS_NEEDING_REVIEW.includes(form.content_domain) && (
                    <span className="rounded-full bg-[#FFF3E9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9A6B28]">
                      Revisar com atenção antes de publicar
                    </span>
                  )}
                </div>
                <select
                  value={form.content_domain}
                  onChange={(event) => updateForm("content_domain", event.target.value as BlogContentDomain | "")}
                  className="brand-input"
                >
                  <option value="">Não classificado</option>
                  {Object.entries(CONTENT_DOMAIN_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {form.references.length > 0 && (
                <div className="space-y-2 rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] p-3">
                  <p className="brand-label">
                    Referências citadas pela IA ({form.references.length}) — confira antes de publicar; remova qualquer uma que pareça duvidosa.
                  </p>
                  <ul className="space-y-2">
                    {form.references.map((reference, index) => (
                      <li key={`${reference.title}-${index}`} className="flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs text-[#75675E]">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#3A3028]">{reference.title}</p>
                          <p className="truncate">
                            {[reference.organization, reference.year].filter(Boolean).join(" · ")}
                            {reference.url && (
                              <>
                                {" "}
                                <a href={reference.url} target="_blank" rel="noreferrer" className="underline">
                                  link
                                </a>
                              </>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeReference(index)}
                          className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-600 hover:bg-red-50"
                        >
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <label className="brand-label">Imagem de capa URL</label>
                <input
                  value={form.cover_image_url}
                  onChange={(event) => updateForm("cover_image_url", event.target.value)}
                  className="brand-input"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="brand-label">Conteúdo</label>
                <MarkdownEditor
                  value={form.content_markdown}
                  onChange={(value) => updateForm("content_markdown", value)}
                  minHeightClassName="min-h-64"
                  placeholder="Escreva o artigo. Use a barra de ferramentas para negrito, subtítulos, listas e links."
                />
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] p-4">
              <p className="brand-kicker">SEO e metadados</p>
              <div>
                <div className="flex items-baseline justify-between">
                  <label className="brand-label">Título SEO</label>
                  <span className="text-[10px] text-[#A9978A]">{form.seo_title.length}/180</span>
                </div>
                <input
                  value={form.seo_title}
                  onChange={(event) => updateForm("seo_title", event.target.value)}
                  className="brand-input"
                  maxLength={180}
                  placeholder="Se vazio, usa o título do artigo"
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label className="brand-label">Descrição SEO</label>
                  <span className="text-[10px] text-[#A9978A]">{form.seo_description.length}/300</span>
                </div>
                <textarea
                  value={form.seo_description}
                  onChange={(event) => updateForm("seo_description", event.target.value)}
                  className="brand-input min-h-20 resize-none"
                  maxLength={300}
                  placeholder="Se vazio, usa o resumo do artigo"
                />
              </div>
            </div>
            {message && (
              <p className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-3 py-2 text-xs text-[#75675E]">
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="brand-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {saving ? "Salvando..." : editingId ? "Salvar alteracoes" : "Criar post"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
