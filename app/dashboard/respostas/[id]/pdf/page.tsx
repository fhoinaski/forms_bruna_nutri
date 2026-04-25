import { db } from "@/db";
import { formResponses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import PrintButton from "./PrintButton";
import React from "react";

export default async function PDFPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await db.select().from(formResponses).where(eq(formResponses.id, id)).get();

  if (!data) return notFound();

  return (
    <div className="bg-white min-h-screen text-black font-sans print:m-0 print:p-0 print:bg-white print-content">
      
      {/* Hide on print */}
      <div className="md:max-w-4xl mx-auto p-4 flex justify-end print:hidden">
         <PrintButton />
      </div>

      {/* Print Document Container */}
      <div className="max-w-[800px] mx-auto p-8 md:p-12 print:p-0">
        
        {/* Header */}
        <div className="border-b-2 border-[#7A9A74] pb-6 mb-8">
           <h1 className="font-serif text-3xl font-bold text-[#7A9A74] mb-1">Bruna Flores Nutri</h1>
           <p className="text-sm font-semibold uppercase tracking-widest text-[#B47F6A]">Formulário Pré-Consulta</p>
        </div>

        {/* Patient Info */}
        <div className="mb-10">
          <h2 className="font-serif text-4xl mb-4 text-[#3A2B1F]">{data.nome}</h2>
          <div className="grid grid-cols-2 gap-4 text-sm text-[#5C4435]">
            <p><strong>Idade:</strong> {data.idade || "-"}</p>
            <p><strong>Nascimento:</strong> {data.nascimento ? format(parseISO(data.nascimento), "dd/MM/yyyy") : "-"}</p>
            <p><strong>WhatsApp:</strong> {data.whatsapp || "-"}</p>
            <p><strong>E-mail:</strong> {data.email || "-"}</p>
            <p><strong>Profissão:</strong> {data.profissao || "-"}</p>
            <p><strong>Cidade:</strong> {data.cidade || "-"}</p>
            <p><strong>Enviado em:</strong> {format(parseISO(data.createdAt), "dd/MM/yyyy HH:mm")}</p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          <Section title="Momento Atual">
            <Item label="Motivação" val={data.motivacao} />
            <Item label="Objetivo" val={data.objetivo} />
            <Item label="Incomoda hoje" val={data.incomodo} />
          </Section>

          <Section title="Histórico de Saúde">
            <Item label="Diagnóstico" val={data.diagnostico} />
            <Item label="Medicação" val={data.medicacao} />
            <Item label="Anticoncepcional" val={data.anticoncepcional} inline />
            <Item label="Gestante/Amamentando" val={data.gestante} inline />
            <Item label="Sintomas Frequentes" val={data.sintomas} />
          </Section>

          <Section title="Suplementação">
            <Item label="Uso atual" val={data.suplementos} />
            <Item label="Não se adaptou" val={data.suplementosNegativo} />
          </Section>

          <Section title="Rotina Alimentar">
            <Item label="Rotina descrita" val={data.rotina} />
            <Item label="Muito tempo sem comer" val={data.semComer} inline />
            <Item label="Fome ou Emoção" val={data.comerEmocao} inline />
            <Item label="Fome ao longo do dia" val={data.fomeDia} />
          </Section>

          <Section title="Estilo de Vida">
            <Item label="Horas de sono" val={data.sonoHoras} inline />
            <Item label="Acorda descansada" val={data.descansada} inline />
            <Item label="Nível de Estresse" val={data.estresse} inline />
            <Item label="Atividade física" val={data.atividadeFisica} />
          </Section>

          <Section title="Saúde Intestinal">
             <Item label="Frequência" val={data.intestinoFreq} inline />
             <Item label="Gases/Desconforto" val={data.desconforto} inline />
          </Section>
          
          <Section title="Preferências">
             <Item label="Não gosta/tolera" val={data.naoGosta} />
             <Item label="Favoritos no dia a dia" val={data.favoritos} />
             <Item label="Dia alimentar relatado" val={data.diaAlimentar} />
          </Section>

          <Section title="Expectativas">
             <Item label="O que espera?" val={data.expectativas} />
             <Item label="Disposição (0-10)" val={data.disposicao} inline />
          </Section>

          {data.espacoLivre && (
            <Section title="Espaço Livre">
               <Item label="Mensagem" val={data.espacoLivre} />
            </Section>
          )}
        </div>

      </div>

    </div>
  );
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
  // Only render section if it has non-null children
  let hasContent = false;
  React.Children.forEach(children, child => {
    if (React.isValidElement(child) && (child.props as any).val) hasContent = true;
  });

  if (!hasContent) return null;

  return (
    <div className="mb-6 break-inside-avoid">
      <h3 className="font-serif text-xl border-b border-gray-200 pb-1 mb-3 text-[#3A2B1F] font-semibold">{title}</h3>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

function Item({ label, val, inline }: { label: string, val?: string | null, inline?: boolean }) {
  if (!val) return null;
  return (
    <div className={inline ? "inline-block mr-6 mb-2" : "mb-3"}>
      <span className="text-xs uppercase font-bold text-[#A8927D] block mb-0.5">{label}</span>
      <div className="text-sm font-medium text-black leading-relaxed whitespace-pre-wrap">
        {val}
      </div>
    </div>
  );
}
