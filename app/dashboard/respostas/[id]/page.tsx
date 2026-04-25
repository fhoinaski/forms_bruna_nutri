"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import React from "react";

export default function ResponseDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/respostas/${id}`)
      .then(res => res.json())
      .then(res => setData(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-center py-20 text-[#8C6E52]">Carregando...</div>;
  if (!data) return <div className="text-center py-20 text-[#8C6E52]">Resposta não encontrada.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 text-[#7A9A74] hover:text-[#B47F6A] transition-colors font-medium text-sm">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
        <a 
          href={`/dashboard/respostas/${id}/pdf`}
          target="_blank"
          className="flex items-center gap-2 bg-[#F4C9C6] text-[#B47F6A] px-5 py-2.5 rounded-full text-sm font-bold tracking-wider hover:bg-[#f1b8b4] transition-all"
        >
          <Printer className="w-4 h-4" />
          PDF
        </a>
      </div>

      <div className="bg-white rounded-3xl border border-[#EAD8C2] shadow-sm overflow-hidden mt-6">
        <div className="p-8 border-b border-[#EAD8C2] bg-[#FAF7F2]/30 relative overflow-hidden flex flex-col items-center text-center">
           <div className="relative z-10 w-full">
             <p className="text-[11px] uppercase tracking-widest text-[#B47F6A] font-bold mb-2">Relatório do Paciente</p>
             <h1 className="font-serif font-bold text-3xl md:text-4xl text-[#7A9A74] mb-2">{data.nome}</h1>
             <p className="text-xs text-gray-500 italic">Recebido em {format(parseISO(data.createdAt), "dd/MM/yyyy 'às' HH:mm")}</p>
           </div>
           {/* Decorative corner element */}
           <div className="absolute right-[-20px] top-[-20px] opacity-10 pointer-events-none">
             <svg width="150" height="150" viewBox="0 0 100 100" fill="none">
               <path d="M10 90 Q 50 10 90 90" stroke="#7A9A74" strokeWidth="0.5" fill="none"/>
               <circle cx="50" cy="30" r="5" fill="#F4C9C6" opacity="0.5"/>
             </svg>
           </div>
        </div>

        <div className="p-8 md:p-12 space-y-10">
          <Section title="1. Dados Pessoais">
            <Item label="Idade" val={data.idade} />
            <Item label="Nascimento" val={data.nascimento ? format(parseISO(data.nascimento), "dd/MM/yyyy") : ""} />
            <Item label="WhatsApp" val={data.whatsapp} />
            <Item label="E-mail" val={data.email} />
            <Item label="Profissão" val={data.profissao} />
            <Item label="Cidade/Estado" val={data.cidade} />
          </Section>

          <Section title="2. Momento Atual">
            <Item label="Motivação" val={data.motivacao} full />
            <Item label="Objetivo Principal" val={data.objetivo} full />
            <Item label="O que mais incomoda" val={data.incomodo} full />
          </Section>

          <Section title="3. Histórico de Saúde">
            <Item label="Diagnóstico" val={data.diagnostico} full />
            <Item label="Medicação contínua" val={data.medicacao} full />
            <Item label="Anticoncepcional" val={data.anticoncepcional} />
            <Item label="Gestante/Amamentando" val={data.gestante} />
            <Item label="Sintomas frequentes" val={data.sintomas} full />
          </Section>

          <Section title="4. Suplementação">
            <Item label="Uso atual" val={data.suplementos} full />
            <Item label="Não se adaptou" val={data.suplementosNegativo} full />
          </Section>

          <Section title="5. Rotina Alimentar">
            <Item label="Rotina descrita" val={data.rotina} full />
            <Item label="Fica longo tempo sem comer" val={data.semComer} />
            <Item label="Come por fome/emoção" val={data.comerEmocao} />
            <Item label="Fome ao longo do dia" val={data.fomeDia} full />
          </Section>

          <Section title="6. Sono, Estresse e Rotina">
            <Item label="Horas de sono" val={data.sonoHoras} />
            <Item label="Acorda descansada" val={data.descansada} />
            <Item label="Nível de estresse" val={data.estresse} />
            <Item label="Atividade física" val={data.atividadeFisica} full />
          </Section>

          <Section title="7. Saúde Intestinal">
            <Item label="Frequência" val={data.intestinoFreq} />
            <Item label="Gases/Desconforto" val={data.desconforto} />
          </Section>

          <Section title="8. Preferências">
            <Item label="Não gosta/tolera" val={data.naoGosta} full />
            <Item label="Favoritos no dia a dia" val={data.favoritos} full />
          </Section>

          <Section title="9. Dia Alimentar">
            <Item label="Relato" val={data.diaAlimentar} full />
          </Section>

          <Section title="10. Expectativas">
             <Item label="O que espera?" val={data.expectativas} full />
             <Item label="Disposição para mudar (0-10)" val={data.disposicao} />
          </Section>

          <Section title="11. Espaço Livre">
             <Item label="Mensagem" val={data.espacoLivre} full />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="border-b border-[#EAD8C2]/50 pb-8 last:border-0 last:pb-0">
      <h3 className="font-serif font-bold text-xl text-[#B47F6A] mb-6">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {children}
      </div>
    </div>
  );
}

function Item({ label, val, full }: { label: string, val?: string | null, full?: boolean }) {
  if (!val) return null;
  return (
    <div className={full ? "col-span-1 md:col-span-2" : ""}>
      <p className="text-[10px] uppercase tracking-wider text-[#B47F6A] font-bold mb-1.5">{label}</p>
      <div className="bg-[#FAF7F2]/50 rounded-xl p-4 text-gray-800 whitespace-pre-wrap leading-relaxed outline outline-1 outline-[#EAD8C2]/50">
        {val}
      </div>
    </div>
  );
}
