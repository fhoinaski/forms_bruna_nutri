import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  deleteBlogPost,
  getBlogPostById,
  updateBlogPost,
} from "@/lib/repositories/blog-posts";
import { blogContentDomainSchema, blogReferenceSchema } from "@/lib/ai/research/editorial-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.enum(["draft", "published", "archived"]);

const UpdateSchema = z
  .object({
    title: z.string().trim().min(3).max(180).optional(),
    slug: z.string().trim().max(120).nullable().optional(),
    excerpt: z.string().trim().min(20).max(500).optional(),
    content_markdown: z.string().trim().min(200).max(50000).optional(),
    category: z.string().trim().max(80).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
    status: statusSchema.optional(),
    author_name: z.string().trim().max(120).optional(),
    cover_image_url: z.string().trim().url().nullable().optional(),
    seo_title: z.string().trim().max(180).nullable().optional(),
    seo_description: z.string().trim().max(300).nullable().optional(),
    ai_generated: z.boolean().optional(),
    ai_prompt: z.string().trim().max(4000).nullable().optional(),
    references: z.array(blogReferenceSchema).max(20).optional(),
    content_domain: blogContentDomainSchema.nullable().optional(),
    published_at: z.string().datetime().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getBlogPostById(id);
  if (!existing) {
    return NextResponse.json({ message: "Post nao encontrado." }, { status: 404 });
  }

  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });
  }

  await updateBlogPost(id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { id } = await params;
  await deleteBlogPost(id);
  return NextResponse.json({ ok: true });
}
