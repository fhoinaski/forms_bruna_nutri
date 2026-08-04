import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, SearchCheck } from "lucide-react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { getPublishedBlogPosts } from "@/lib/repositories/blog-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog de Nutrição Materno-Infantil",
  description:
    "Conteúdos sobre introdução alimentar, seletividade, gestação, saúde intestinal infantil e nutrição familiar com linguagem humana e base profissional.",
  alternates: { canonical: "/blog" },
};

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export default async function BlogPage() {
  const posts = await getPublishedBlogPosts(30);

  return (
    <main className="min-h-screen bg-[#FFFDFC] text-[#3A3028]">
      <PublicHeader />
      <section className="relative overflow-hidden bg-[#FBF7F1] pt-32">
        <div className="absolute inset-0 brand-texture opacity-35" />
        <div className="relative z-10 mx-auto max-w-7xl px-5 pb-16 lg:px-8">
          <div className="max-w-3xl">
            <p className="brand-kicker mb-4">Biblioteca Bruna Flores Nutri</p>
            <h1 className="font-serif text-5xl font-semibold leading-tight text-[#3A3028] md:text-6xl">
              Conteúdo para cuidar da alimentação com mais clareza.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[#75675E]">
              Artigos sobre nutrição materno-infantil, rotina familiar, introdução
              alimentar, seletividade, gestação e saúde intestinal infantil.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        {posts.length === 0 ? (
          <div className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FBF7F1] p-10 text-center">
            <BookOpen className="mx-auto mb-4 h-10 w-10 text-[#7F9A74]" />
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
              Os artigos serão publicados em breve.
            </h2>
            <p className="mt-2 text-sm text-[#75675E]">
              A biblioteca editorial está pronta para receber conteúdos recorrentes.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => {
              const tags = JSON.parse(post.tags_json || "[]") as string[];
              return (
                <article
                  key={post.id}
                  className="group flex min-h-[300px] flex-col rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)] transition hover:-translate-y-1 hover:shadow-[0_24px_58px_rgba(58,48,40,0.08)]"
                >
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <span className="rounded-full bg-[#EAF0E4] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#607A56]">
                      {post.category || "Nutrição"}
                    </span>
                    <span className="text-xs text-[#A9978A]">
                      {formatDate(post.published_at)}
                    </span>
                  </div>
                  <h2 className="font-serif text-2xl font-semibold leading-tight text-[#3A3028]">
                    {post.title}
                  </h2>
                  <p className="mt-3 line-clamp-4 text-sm leading-7 text-[#75675E]">
                    {post.excerpt}
                  </p>
                  {tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[11px] text-[#8C5F50]">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <Link
                    href={`/blog/${post.slug}`}
                    className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-semibold text-[#607A56] transition group-hover:text-[#8C5F50]"
                  >
                    Ler artigo
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-12 rounded-[1.5rem] border border-[#EDE1D6] bg-[#FBF7F1] p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="brand-kicker mb-2">Autoridade e segurança</p>
              <p className="max-w-2xl text-sm leading-7 text-[#75675E]">
                Os conteúdos têm caráter educativo e não substituem consulta
                individualizada, avaliação clínica ou acompanhamento nutricional.
              </p>
            </div>
            <SearchCheck className="h-8 w-8 text-[#7F9A74]" />
          </div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
