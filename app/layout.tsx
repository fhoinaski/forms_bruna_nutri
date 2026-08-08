import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { PROFESSIONAL_PROFILE, SITE_URL, TOPIC_KEYWORDS, siteConfig } from "@/lib/seo/site";
import "./globals.css";

const jost = Jost({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#7F9A74",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: siteConfig.homeTitle,
    template: "%s | Bruna Flores Nutri",
  },
  description: siteConfig.homeDescription,
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.professionalName }],
  keywords: TOPIC_KEYWORDS,
  creator: siteConfig.professionalName,
  publisher: siteConfig.name,
  category: "healthcare",
  classification: "Nutrição",
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  other: {
    "ai-content-declaration": PROFESSIONAL_PROFILE.editorialDisclaimer,
    "content-policy":
      "Conteúdos educativos passam por revisão humana antes de publicação; recomendações individuais exigem consulta profissional.",
  },
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    url: "/",
    siteName: siteConfig.name,
    title: siteConfig.homeTitle,
    description: siteConfig.homeDescription,
    images: [
      {
        url: siteConfig.ogImagePath,
        width: 1792,
        height: 1024,
        alt: "Bruna Flores Nutri - atendimento nutricional em Florianópolis e online",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.homeTitle,
    description: siteConfig.homeDescription,
    images: [siteConfig.ogImagePath],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon-512.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${jost.variable} ${cormorant.variable}`}>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
