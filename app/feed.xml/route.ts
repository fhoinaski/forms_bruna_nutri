import { NextResponse } from "next/server";
import { getPublishedBlogPosts } from "@/lib/repositories/blog-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://brunanutri.com.br";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = await getPublishedBlogPosts(50);
  const items = posts
    .map((post) => {
      const url = `${baseUrl}/blog/${post.slug}`;
      return `
        <item>
          <title>${escapeXml(post.title)}</title>
          <link>${url}</link>
          <guid>${url}</guid>
          <description>${escapeXml(post.seo_description || post.excerpt)}</description>
          <author>${escapeXml(post.author_name)}</author>
          <category>${escapeXml(post.category || "Nutrição materno-infantil")}</category>
          <pubDate>${new Date(post.published_at || post.created_at).toUTCString()}</pubDate>
        </item>`;
    })
    .join("");

  const feed = `<?xml version="1.0" encoding="UTF-8" ?>
    <rss version="2.0">
      <channel>
        <title>Bruna Flores Nutri - Blog</title>
        <link>${baseUrl}/blog</link>
        <description>Conteúdos educativos sobre nutrição materno-infantil, introdução alimentar, seletividade e rotina familiar.</description>
        <language>pt-BR</language>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
        ${items}
      </channel>
    </rss>`;

  return new NextResponse(feed, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
