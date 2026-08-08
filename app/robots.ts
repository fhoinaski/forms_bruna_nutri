import type { MetadataRoute } from "next";

const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://brunanutri.com.br";
const host = new URL(baseUrl).host;
const publicPages = [
  "/",
  "/servicos",
  "/como-funciona",
  "/formulario",
  "/blog",
  "/blog/",
  "/privacidade",
  "/termos",
];
const privatePages = ["/api/", "/dashboard/", "/login", "/portal"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: publicPages,
        disallow: privatePages,
      },
      {
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "ClaudeBot",
          "PerplexityBot",
          "Google-Extended",
        ],
        allow: publicPages,
        disallow: privatePages,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host,
  };
}
