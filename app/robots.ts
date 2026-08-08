import type { MetadataRoute } from "next";

const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://brunanutri.com.br";
const host = new URL(baseUrl).host;
const privatePages = ["/api/", "/dashboard/", "/login", "/portal"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: privatePages,
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host,
  };
}
