import { d1Execute, d1Query } from "@/lib/d1/client";

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content_markdown: string;
  category: string | null;
  tags_json: string;
  status: string;
  author_name: string;
  cover_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  ai_generated: number;
  ai_prompt: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogPostInput {
  title: string;
  slug?: string | null;
  excerpt: string;
  content_markdown: string;
  category?: string | null;
  tags?: string[];
  status?: "draft" | "published" | "archived";
  author_name?: string;
  cover_image_url?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  ai_generated?: boolean;
  ai_prompt?: string | null;
  published_at?: string | null;
}

export interface BlogPostFilters {
  status?: string;
  search?: string;
  limit?: number;
}

export interface BlogMetrics {
  published: number;
  drafts: number;
  aiGenerated: number;
}

export async function ensureBlogPostsTable(): Promise<void> {
  await d1Execute(
    `CREATE TABLE IF NOT EXISTS blog_posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL,
      content_markdown TEXT NOT NULL,
      category TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      author_name TEXT NOT NULL DEFAULT 'Bruna Flores Nutri',
      cover_image_url TEXT,
      seo_title TEXT,
      seo_description TEXT,
      ai_generated INTEGER NOT NULL DEFAULT 0,
      ai_prompt TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );
  await d1Execute(`CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status)`);
  await d1Execute(`CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published_at)`);
  await d1Execute(`CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug)`);
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

async function uniqueSlug(base: string): Promise<string> {
  const cleanBase = slugify(base) || `post-${Date.now()}`;
  let candidate = cleanBase;
  let suffix = 2;

  while (true) {
    const rows = await d1Query<{ id: string }>(
      `SELECT id FROM blog_posts WHERE slug = ?1 LIMIT 1`,
      [candidate]
    );
    if (!rows.length) return candidate;
    candidate = `${cleanBase}-${suffix++}`;
  }
}

export async function getBlogPosts(
  filters: BlogPostFilters = {}
): Promise<BlogPost[]> {
  await ensureBlogPostsTable();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.status) {
    conditions.push(`status = ?${idx++}`);
    params.push(filters.status);
  }
  if (filters.search) {
    conditions.push(`(title LIKE ?${idx} OR excerpt LIKE ?${idx} OR category LIKE ?${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const clause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(100, Math.max(1, filters.limit ?? 50));

  return d1Query<BlogPost>(
    `SELECT *
     FROM blog_posts
     ${clause}
     ORDER BY COALESCE(published_at, created_at) DESC
     LIMIT ?${idx}`,
    [...params, limit]
  );
}

export async function getPublishedBlogPosts(limit = 50): Promise<BlogPost[]> {
  return getBlogPosts({ status: "published", limit });
}

export async function getBlogMetrics(): Promise<BlogMetrics> {
  await ensureBlogPostsTable();
  const [publishedRows, draftRows, aiRows] = await Promise.all([
    d1Query<{ c: number }>(
      `SELECT COUNT(*) as c FROM blog_posts WHERE status = 'published'`,
      []
    ),
    d1Query<{ c: number }>(
      `SELECT COUNT(*) as c FROM blog_posts WHERE status = 'draft'`,
      []
    ),
    d1Query<{ c: number }>(
      `SELECT COUNT(*) as c FROM blog_posts WHERE ai_generated = 1`,
      []
    ),
  ]);

  return {
    published: publishedRows[0]?.c ?? 0,
    drafts: draftRows[0]?.c ?? 0,
    aiGenerated: aiRows[0]?.c ?? 0,
  };
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  await ensureBlogPostsTable();
  const rows = await d1Query<BlogPost>(
    `SELECT * FROM blog_posts WHERE slug = ?1 AND status = 'published' LIMIT 1`,
    [slug]
  );
  return rows[0] ?? null;
}

export async function getBlogPostById(id: string): Promise<BlogPost | null> {
  await ensureBlogPostsTable();
  const rows = await d1Query<BlogPost>(
    `SELECT * FROM blog_posts WHERE id = ?1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createBlogPost(input: BlogPostInput): Promise<string> {
  await ensureBlogPostsTable();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const status = input.status ?? "draft";
  const slug = await uniqueSlug(input.slug || input.title);
  const publishedAt =
    status === "published" ? input.published_at ?? now : input.published_at ?? null;

  await d1Execute(
    `INSERT INTO blog_posts
       (id, title, slug, excerpt, content_markdown, category, tags_json, status,
        author_name, cover_image_url, seo_title, seo_description, ai_generated,
        ai_prompt, published_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
    [
      id,
      input.title,
      slug,
      input.excerpt,
      input.content_markdown,
      input.category ?? null,
      JSON.stringify(input.tags ?? []),
      status,
      input.author_name ?? "Bruna Flores Nutri",
      input.cover_image_url ?? null,
      input.seo_title ?? null,
      input.seo_description ?? null,
      input.ai_generated ? 1 : 0,
      input.ai_prompt ?? null,
      publishedAt,
      now,
      now,
    ]
  );

  return id;
}

export async function updateBlogPost(
  id: string,
  data: Partial<BlogPostInput>
): Promise<void> {
  await ensureBlogPostsTable();
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const fieldMap: Record<string, unknown> = {
    title: data.title,
    excerpt: data.excerpt,
    content_markdown: data.content_markdown,
    category: data.category,
    status: data.status,
    author_name: data.author_name,
    cover_image_url: data.cover_image_url,
    seo_title: data.seo_title,
    seo_description: data.seo_description,
    ai_generated: data.ai_generated === undefined ? undefined : data.ai_generated ? 1 : 0,
    ai_prompt: data.ai_prompt,
    published_at:
      data.status === "published" && data.published_at === undefined
        ? new Date().toISOString()
        : data.published_at,
  };

  if (data.slug !== undefined) {
    fieldMap.slug = await uniqueSlug(data.slug || data.title || id);
  }
  if (data.tags !== undefined) {
    fieldMap.tags_json = JSON.stringify(data.tags);
  }

  for (const [key, value] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      updates.push(`${key} = ?${idx++}`);
      params.push(value);
    }
  }

  if (!updates.length) return;
  updates.push(`updated_at = ?${idx++}`);
  params.push(new Date().toISOString());
  params.push(id);

  await d1Execute(`UPDATE blog_posts SET ${updates.join(", ")} WHERE id = ?${idx}`, params);
}

export async function deleteBlogPost(id: string): Promise<void> {
  await ensureBlogPostsTable();
  await d1Execute(`DELETE FROM blog_posts WHERE id = ?1`, [id]);
}
