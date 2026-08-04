import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bruna Flores Nutri",
    short_name: "Bruna Nutri",
    description:
      "Nutrição materno-infantil com escuta, evidência e planos possíveis para famílias.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF7F1",
    theme_color: "#7F9A74",
    lang: "pt-BR",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "16x16 32x32 48x48",
        type: "image/x-icon",
        purpose: "any",
      },
      {
        src: "/favicon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/favicon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
