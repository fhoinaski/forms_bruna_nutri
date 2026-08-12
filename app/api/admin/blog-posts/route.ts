import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { createBlogPost, getBlogPosts } from "@/lib/repositories/blog-posts";
import { blogContentDomainSchema, blogReferenceSchema } from "@/lib/ai/research/editorial-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.enum(["draft", "published", "archived"]);

const FiltersSchema = z.object({
  status: statusSchema.optional(),
  search: z.string().max(160).optional(),
});

const CreateSchema = z.object({
  title: z.string().trim().min(3).max(180),
  slug: z.string().trim().max(120).nullable().optional(),
  excerpt: z.string().trim().min(20).max(500),
  content_markdown: z.string().trim().min(200).max(50000),
  category: z.string().trim().max(80).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  status: statusSchema.default("draft"),
  author_name: z.string().trim().max(120).optional(),
  cover_image_url: z.string().trim().url().nullable().optional(),
  seo_title: z.string().trim().max(180).nullable().optional(),
  seo_description: z.string().trim().max(300).nullable().optional(),
  ai_generated: z.boolean().optional(),
  ai_prompt: z.string().trim().max(4000).nullable().optional(),
  references: z.array(blogReferenceSchema).max(20).optional(),
  content_domain: blogContentDomainSchema.nullable().optional(),
  published_at: z.string().datetime().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const parsed = FiltersSchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ message: "Filtros invalidos." }, { status: 400 });
  }

  const items = await getBlogPosts(parsed.data);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });
  }

  const id = await createBlogPost(parsed.data);
  return NextResponse.json({ id }, { status: 201 });
}
