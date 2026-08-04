import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, UserRound } from "lucide-react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { getBlogPostBySlug } from "@/lib/repositories/blog-posts";
import { PROFESSIONAL_PROFILE } from "@/lib/seo/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://brunanutri.com.br";

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function renderMarkdown(content: string) {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return blocks.map((block, index) => {
    if (block.startsWith("### ")) {
      return (
        <h3 key={index} className="mt-8 font-serif text-2xl font-semibold text-[#3A3028]">
          {block.replace(/^### /, "")}
        </h3>
      );
    }
    if (block.startsWith("## ")) {
      return (
        <h2 key={index} className="mt-10 font-serif text-3xl font-semibold text-[#3A3028]">
          {block.replace(/^## /, "")}
        </h2>
      );
    }
    if (block.startsWith("- ")) {
      return (
        <ul key={index} className="my-6 space-y-3">
          {block.split("\n").map((item) => (
            <li key={item} className="flex gap-3 text-base leading-8 text-[#75675E]">
              <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7F9A74]" />
              <span>{item.replace(/^- /, "")}</span>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={index} className="my-6 text-base leading-8 text-[#75675E]">
        {block}
      </p>
    );
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.seo_title || post.title,
    description: post.seo_description || post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      url: `/blog/${post.slug}`,
      title: post.seo_title || post.title,
      description: post.seo_description || post.excerpt,
      publishedTime: post.published_at ?? undefined,
      authors: [post.author_name],
      images: post.cover_image_url ? [post.cover_image_url] : ["/bruna-hero-family.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: post.seo_title || post.title,
      description: post.seo_description || post.excerpt,
      images: post.cover_image_url ? [post.cover_image_url] : ["/bruna-hero-family.png"],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) notFound();

  const tags = JSON.parse(post.tags_json || "[]") as string[];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seo_description || post.excerpt,
    author: {
      "@type": "Person",
      name: post.author_name,
      jobTitle: "Nutricionista materno-infantil",
    },
    reviewedBy: {
      "@type": "Person",
      name: PROFESSIONAL_PROFILE.professionalName,
    },
    publisher: {
      "@type": "Organization",
      name: "Bruna Flores Nutri",
      url: baseUrl,
    },
    datePublished: post.published_at,
    dateModified: post.updated_at,
    mainEntityOfPage: `${baseUrl}/blog/${post.slug}`,
    articleSection: post.category || "Nutrição materno-infantil",
    keywords: tags.join(", "),
    isAccessibleForFree: true,
    educationalUse: "Conteudo educativo em nutricao materno-infantil",
    inLanguage: "pt-BR",
  };

  return (
    <main className="min-h-screen bg-[#FFFDFC] text-[#3A3028]">
      <PublicHeader />
      <article>
        <header className="relative overflow-hidden bg-[#FBF7F1] pt-32">
          <div className="absolute inset-0 brand-texture opacity-35" />
          <div className="relative z-10 mx-auto max-w-4xl px-5 pb-14 lg:px-8">
            <Link
              href="/blog"
              className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#607A56] transition hover:text-[#8C5F50]"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao blog
            </Link>
            <p className="brand-kicker mb-4">{post.category || "Nutrição materno-infantil"}</p>
            <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028] md:text-6xl">
              {post.title}
            </h1>
            <p className="mt-6 text-lg leading-8 text-[#75675E]">{post.excerpt}</p>
            <div className="mt-6 flex flex-wrap gap-4 text-sm text-[#75675E]">
              <span className="inline-flex items-center gap-2">
                <UserRound className="h-4 w-4 text-[#7F9A74]" />
                {post.author_name}
              </span>
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[#7F9A74]" />
                {formatDate(post.published_at)}
              </span>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-5 py-14 lg:px-8">
          <div className="prose-none">{renderMarkdown(post.content_markdown)}</div>

          <aside className="mt-10 rounded-[1.25rem] border border-[#EDE1D6] bg-[#FBF7F1] p-5">
            <p className="brand-kicker mb-2">Revisão e segurança</p>
            <p className="text-sm leading-7 text-[#75675E]">
              Conteúdo educativo revisado antes da publicação. Ele ajuda a entender
              possibilidades de cuidado, mas não substitui avaliação individual,
              diagnóstico ou prescrição nutricional.
            </p>
          </aside>

          {tags.length > 0 && (
            <div className="mt-12 flex flex-wrap gap-2 border-t border-[#EDE1D6] pt-8">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[#EAF0E4] px-3 py-1 text-xs font-semibold text-[#607A56]"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-12 rounded-[1.5rem] border border-[#EDE1D6] bg-[#FBF7F1] p-6">
            <p className="font-serif text-xl font-semibold text-[#3A3028]">
              Precisa de orientação individual?
            </p>
            <p className="mt-2 text-sm leading-7 text-[#75675E]">
              Este conteúdo é educativo. Para avaliar rotina, sintomas, fase da
              criança ou gestação, o ideal é uma consulta personalizada.
            </p>
            <Link href="/formulario" className="brand-btn-primary mt-5">
              Preencher pré-consulta
            </Link>
          </div>
        </div>
      </article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicFooter />
    </main>
  );
}
