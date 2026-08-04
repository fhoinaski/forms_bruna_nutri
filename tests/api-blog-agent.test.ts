import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createBlogPost = vi.fn();
const consumeRateLimit = vi.fn();
const writeAuditLog = vi.fn();

vi.mock("@/lib/repositories/blog-posts", () => ({
  createBlogPost,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit,
}));

vi.mock("@/lib/security/audit", () => ({
  writeAuditLog,
}));

function makeAgentRequest(body: unknown, token = "test-agent-token") {
  return new NextRequest("https://brunanutri.com.br/api/agent/blog-posts", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const validPost = {
  title: "Introducao alimentar com rotina familiar",
  excerpt: "Um guia educativo para organizar a introducao alimentar com seguranca e acolhimento.",
  content_markdown: `${"Conteudo educativo sobre introducao alimentar, sinais de prontidao, rotina familiar, seguranca, texturas, autonomia e acompanhamento profissional. ".repeat(8)}`,
  category: "Introducao alimentar",
  tags: ["familia", "bebe"],
  seo_description:
    "Entenda como organizar a introducao alimentar com seguranca, acolhimento e orientacoes adequadas para a rotina da familia.",
};

describe("POST /api/agent/blog-posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOG_AGENT_TOKEN = "test-agent-token";
    createBlogPost.mockResolvedValue("post_123");
    consumeRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0, ipHash: "ip_hash" });
    writeAuditLog.mockResolvedValue(undefined);
  });

  it("rejects requests without the configured bearer token", async () => {
    const { POST } = await import("../app/api/agent/blog-posts/route");

    const response = await POST(makeAgentRequest(validPost, "wrong-token"));

    expect(response.status).toBe(401);
    expect(createBlogPost).not.toHaveBeenCalled();
  });

  it("forces AI content to draft even when published is requested", async () => {
    const { POST } = await import("../app/api/agent/blog-posts/route");

    const response = await POST(makeAgentRequest({ ...validPost, status: "published" }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ id: "post_123", status: "draft", review_required: true });
    expect(createBlogPost).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
        ai_generated: true,
        published_at: null,
      })
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          requested_status: "published",
          effective_status: "draft",
          review_required: true,
        },
      })
    );
  });
});
