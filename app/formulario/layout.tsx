import { Metadata } from 'next';
import { Jost, Cormorant_Garamond } from 'next/font/google';
import { siteConfig } from '@/lib/seo/site';
import '../globals.css';

const jost = Jost({ 
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['300', '400', '500'],
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'Pré-consulta nutricional',
  description: 'Preencha a pré-consulta nutricional da Bruna Flores para atendimento em Florianópolis ou online. Suas respostas ajudam a preparar um acompanhamento individualizado.',
  alternates: { canonical: '/formulario' },
  openGraph: {
    type: 'website',
    url: '/formulario',
    title: 'Pré-consulta nutricional | Bruna Flores Nutri',
    description: 'Formulário seguro para iniciar o atendimento nutricional com Bruna Flores em Florianópolis ou online.',
    images: [siteConfig.ogImagePath],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pré-consulta nutricional | Bruna Flores Nutri',
    description: 'Formulário para iniciar o atendimento nutricional com Bruna Flores em Florianópolis ou online.',
    images: [siteConfig.ogImagePath],
  },
};

export default function FormularioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${jost.variable} ${cormorant.variable} font-sans min-h-screen bg-[#FAF7F2] text-[#3A2B1F]`}>
      {children}
    </div>
  );
}
