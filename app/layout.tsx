import type { Metadata, Viewport } from 'next';
import { Jost, Cormorant_Garamond } from 'next/font/google';
import './globals.css';

const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL ?? 'https://brunanutri.com.br';

const jost = Jost({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#7F9A74',
};

export const metadata: Metadata = {
  title: {
    default: 'Bruna Flores Nutri | Nutrição Materno-Infantil',
    template: '%s | Bruna Flores Nutri',
  },
  description: 'Nutricionista materno-infantil para gestantes, mães, bebês e crianças. Introdução alimentar, seletividade, TEA, alimentação infantil e saúde intestinal com acolhimento e evidência.',
  applicationName: 'Bruna Flores Nutri',
  authors: [{ name: 'Bruna Flores Nutri' }],
  keywords: [
    'nutricionista materno infantil',
    'nutrição materno-infantil',
    'nutricionista infantil',
    'introdução alimentar',
    'seletividade alimentar',
    'nutrição para TEA',
    'nutrição na gestação',
    'nutrição pós-parto',
    'alimentação infantil',
    'saúde intestinal infantil',
    'Bruna Flores Nutri',
  ],
  creator: 'Bruna Flores Nutri',
  publisher: 'Bruna Flores Nutri',
  category: 'healthcare',
  classification: 'Nutrição materno-infantil',
  metadataBase: new URL(baseUrl),
  alternates: {
    canonical: '/',
  },
  manifest: '/manifest.webmanifest',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  other: {
    'ai-content-declaration':
      'Informações institucionais sobre atendimento nutricional materno-infantil; não substitui consulta individual.',
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: '/',
    siteName: 'Bruna Flores Nutri',
    title: 'Bruna Flores Nutri | Nutrição Materno-Infantil',
    description: 'Acompanhamento nutricional para gestantes, mães, bebês e crianças com escuta clínica, acolhimento e orientação possível para a rotina familiar.',
    images: [
      {
        url: '/bruna-hero-family.png',
        width: 1792,
        height: 1024,
        alt: 'Bruna Flores Nutri - nutrição materno-infantil para famílias',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bruna Flores Nutri | Nutrição Materno-Infantil',
    description: 'Nutrição para gestantes, mães, bebês e crianças com acolhimento, segurança e rotina possível.',
    images: ['/bruna-hero-family.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.ico',
    apple: '/favicon-512.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${jost.variable} ${cormorant.variable}`}>
      <body className="font-sans antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
