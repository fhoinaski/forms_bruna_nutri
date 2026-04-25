import { Metadata } from 'next';
import { Jost, Cormorant_Garamond } from 'next/font/google';
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
  title: 'Formulário Pré-Consulta',
  description: 'Preencha o formulário pré-consulta da Bruna Flores Nutri. Quanto mais você compartilhar, mais assertivo será seu plano alimentar.',
};

export default function FormularioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${jost.variable} ${cormorant.variable} font-sans min-h-screen bg-[#FAF7F2] text-[#3A2B1F]`}>
      {children}
    </div>
  );
}
