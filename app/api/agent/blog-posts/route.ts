import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createBlogPost } from "@/lib/repositories/blog-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.enum(["draft", "published"]);

const AgentPostSchema = z.object({
  title: z.string().trim().min(3).max(180),
  slug: z.string().trim().max(120).nullable().optional(),
  excerpt: z.string().trim().min(20).max(500),
  content_markdown: z.string().trim().min(600).max(50000),
  category: z.string().trim().max(80).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  status: statusSchema.default("draft"),
  author_name: z.string().trim().max(120).default("Bruna Flores Nutri"),
  cover_image_url: z.string().trim().url().nullable().optional(),
  seo_title: z.string().trim().max(180).nullable().optional(),
  seo_description: z.string().trim().min(80).max(300).nullable().optional(),
  ai_prompt: z.string().trim().max(4000).nullable().optional(),
});

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.BLOG_AGENT_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const parsed = AgentPostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Conteudo invalido.",
        requirements:
          "Envie title, excerpt, content_markdown com conteudo longo, tags e seo_description.",
      },
      { status: 400 }
    );
  }

  const id = await createBlogPost({
    ...parsed.data,
    ai_generated: true,
    published_at: parsed.data.status === "published" ? new Date().toISOString() : null,
  });

  return NextResponse.json({ id }, { status: 201 });
}
