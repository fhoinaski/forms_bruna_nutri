import type { MetadataRoute } from "next";

const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://brunanutri.com.br";
const host = new URL(baseUrl).host;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/servicos", "/como-funciona", "/formulario", "/blog", "/blog/", "/feed.xml", "/privacidade", "/termos", "/llms.txt"],
        disallow: ["/api/", "/dashboard/", "/login"],
      },
      {
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "ClaudeBot",
          "PerplexityBot",
          "Google-Extended",
        ],
        allow: ["/", "/servicos", "/como-funciona", "/formulario", "/blog", "/blog/", "/feed.xml", "/privacidade", "/termos", "/llms.txt"],
        disallow: ["/api/", "/dashboard/", "/login"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host,
  };
}
