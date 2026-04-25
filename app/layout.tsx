import type { Metadata } from 'next';
import { Jost, Cormorant_Garamond } from 'next/font/google';
import './globals.css';

const jost = Jost({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Bruna Flores Nutri',
    template: '%s | Bruna Flores Nutri',
  },
  description: 'Nutrição materna e infantil com cuidado e personalização. Preencha o formulário pré-consulta e dê o primeiro passo para uma alimentação que respeita a sua rotina.',
  applicationName: 'Bruna Flores Nutri',
  authors: [{ name: 'Bruna Flores Nutri' }],
  keywords: ['nutrição', 'nutricionista', 'materna', 'infantil', 'pré-consulta', 'Bruna Flores'],
  creator: 'Bruna Flores Nutri',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? 'https://brunafloresnutri.com.br'
  ),
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Bruna Flores Nutri',
    title: 'Bruna Flores Nutri',
    description: 'Nutrição materna e infantil personalizada. Preencha o formulário pré-consulta.',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'Bruna Flores Nutri — Nutrição Materna e Infantil',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bruna Flores Nutri',
    description: 'Nutrição materna e infantil personalizada.',
    images: ['/og-image.svg'],
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${jost.variable} ${cormorant.variable}`}>
      <body className="font-sans antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
