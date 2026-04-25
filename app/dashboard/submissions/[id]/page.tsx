"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Printer, Save } from "lucide-react";
import Link from "next/link";
import React from "react";

interface SubmissionDetail {
  id: string;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  child_name: string | null;
  child_age: string | null;
  form_type: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  answers: Record<string, string>;
}

const ANSWER_SECTIONS = [
  {
    title: "1. Dados Pessoais",
    fields: [
      { key: "idade", label: "Idade" },
      { key: "nascimento", label: "Data de nascimento" },
      { key: "profissao", label: "Profissão" },
      { key: "cidade", label: "Cidade/Estado" },
    ],
  },
  {
    title: "2. Momento Atual",
    fields: [
      { key: "motivacao", label: "Motivação", full: true },
      { key: "objetivo", label: "Objetivo principal" },
      { key: "incomodo", label: "O que mais incomoda", full: true },
    ],
  },
  {
    title: "3. Histórico de Saúde",
    fields: [
      { key: "diagnostico", label: "Diagnóstico", full: true },
      { key: "medicacao", label: "Medicação contínua", full: true },
      { key: "anticoncepcional", label: "Anticoncepcional" },
      { key: "gestante", label: "Gestante/Amamentando" },
      { key: "sintomas", label: "Sintomas frequentes", full: true },
    ],
  },
  {
    title: "4. Suplementação",
    fields: [
      { key: "suplementos", label: "Uso atual", full: true },
      { key: "suplementosNegativo", label: "Não se adaptou", full: true },
    ],
  },
  {
    title: "5. Rotina Alimentar",
    fields: [
      { key: "rotina", label: "Rotina descrita", full: true },
      { key: "semComer", label: "Fica longo tempo sem comer" },
      { key: "comerEmocao", label: "Come por fome/emoção" },
      { key: "fomeDia", label: "Fome ao longo do dia", full: true },
    ],
  },
  {
    title: "6. Sono, Estresse e Rotina",
    fields: [
      { key: "sonoHoras", label: "Horas de sono" },
      { key: "descansada", label: "Acorda descansada" },
      { key: "estresse", label: "Nível de estresse" },
      { key: "atividadeFisica", label: "Atividade física", full: true },
    ],
  },
  {
    title: "7. Saúde Intestinal",
    fields: [
      { key: "intestinoFreq", label: "Frequência" },
      { key: "desconforto", label: "Gases/Desconforto" },
    ],
  },
  {
    title: "8. Preferências",
    fields: [
      { key: "naoGosta", label: "Não gosta/tolera", full: true },
      { key: "favoritos", label: "Favoritos no dia a dia", full: true },
    ],
  },
  {
    title: "9. Dia Alimentar",
    fields: [{ key: "diaAlimentar", label: "Relato", full: true }],
  },
  {
    title: "10. Expectativas",
    fields: [
      { key: "expectativas", label: "O que espera?", full: true },
      { key: "disposicao", label: "Disposição para mudar (0-10)" },
    ],
  },
  {
    title: "11. Espaço Livre",
    fields: [{ key: "espacoLivre", label: "Mensagem", full: true }],
  },
];

const STATUS_OPTIONS = [
  { value: "novo", label: "Novo" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "finalizado", label: "Finalizado" },
  { value: "arquivado", label: "Arquivado" },
];

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/submissions/${id}`)
      .then((res) => res.json())
      .then((res) => {
        setData(res);
        setStatus(res.status || "novo");
        setNotes(res.notes || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/admin/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="text-center py-20 text-[#8C6E52]">Carregando...</div>
    );
  if (!data)
    return (
      <div className="text-center py-20 text-[#8C6E52]">
        Formulário não encontrado.
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-[#7A9A74] hover:text-[#B47F6A] transition-colors font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
        <a
          href={`/dashboard/submissions/${id}/print`}
          target="_blank"
          className="flex items-center gap-2 bg-[#F4C9C6] text-[#B47F6A] px-5 py-2.5 rounded-full text-sm font-bold tracking-wider hover:bg-[#f1b8b4] transition-all"
        >
          <Printer className="w-4 h-4" />
          Imprimir / PDF
        </a>
      </div>

      {/* Header do paciente */}
      <div className="bg-white rounded-3xl border border-[#EAD8C2] shadow-sm overflow-hidden">
        <div className="p-8 border-b border-[#EAD8C2] bg-[#FAF7F2]/30 relative overflow-hidden text-center">
          <div className="relative z-10">
            <p className="text-[11px] uppercase tracking-widest text-[#B47F6A] font-bold mb-2">
              Relatório do Paciente
            </p>
            <h1 className="font-serif font-bold text-3xl md:text-4xl text-[#7A9A74] mb-2">
              {data.patient_name}
            </h1>
            <div className="flex flex-wrap justify-center gap-4 text-xs text-gray-500 mt-2">
              {data.patient_phone && <span>📞 {data.patient_phone}</span>}
              {data.patient_email && <span>✉ {data.patient_email}</span>}
              {data.child_name && (
                <span>
                  👶 {data.child_name}
                  {data.child_age ? `, ${data.child_age}` : ""}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 italic mt-2">
              Recebido em{" "}
              {format(parseISO(data.created_at), "dd/MM/yyyy 'às' HH:mm")}
            </p>
          </div>
          <div className="absolute right-[-20px] top-[-20px] opacity-10 pointer-events-none">
            <svg width="150" height="150" viewBox="0 0 100 100" fill="none">
              <path
                d="M10 90 Q 50 10 90 90"
                stroke="#7A9A74"
                strokeWidth="0.5"
                fill="none"
              />
              <circle cx="50" cy="30" r="5" fill="#F4C9C6" opacity="0.5" />
            </svg>
          </div>
        </div>

        {/* Painel de gerenciamento */}
        <div className="p-6 bg-[#FAF7F2] border-b border-[#EAD8C2]">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-[#B47F6A] font-bold mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="px-3 py-2 bg-white border border-[#E8D9C8] rounded-xl text-sm text-[#3A2B1F] focus:outline-none focus:border-[#7A9A74] transition-all"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] uppercase tracking-widest text-[#B47F6A] font-bold mb-1.5">
                Notas internas
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações sobre este paciente..."
                className="w-full px-3 py-2 bg-white border border-[#E8D9C8] rounded-xl text-sm text-[#3A2B1F] placeholder-[#A8927D] focus:outline-none focus:border-[#7A9A74] transition-all"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-[#7A9A74] text-white rounded-xl text-sm font-medium hover:bg-[#688a62] transition-colors disabled:opacity-70"
            >
              <Save className="w-4 h-4" />
              {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
            </button>
          </div>
        </div>

        {/* Respostas */}
        <div className="p-8 md:p-12 space-y-10">
          {ANSWER_SECTIONS.map((section) => (
            <AnswerSection
              key={section.title}
              title={section.title}
              fields={section.fields}
              answers={data.answers}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AnswerSection({
  title,
  fields,
  answers,
}: {
  title: string;
  fields: { key: string; label: string; full?: boolean }[];
  answers: Record<string, string>;
}) {
  const hasAny = fields.some((f) => answers[f.key]);
  if (!hasAny) return null;
  return (
    <div className="border-b border-[#EAD8C2]/50 pb-8 last:border-0 last:pb-0">
      <h3 className="font-serif font-bold text-xl text-[#B47F6A] mb-6">
        {title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {fields.map((f) =>
          answers[f.key] ? (
            <AnswerItem
              key={f.key}
              label={f.label}
              val={answers[f.key]}
              full={f.full}
            />
          ) : null
        )}
      </div>
    </div>
  );
}

function AnswerItem({
  label,
  val,
  full,
}: {
  label: string;
  val: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-1 md:col-span-2" : ""}>
      <p className="text-[10px] uppercase tracking-wider text-[#B47F6A] font-bold mb-1.5">
        {label}
      </p>
      <div className="bg-[#FAF7F2]/50 rounded-xl p-4 text-gray-800 whitespace-pre-wrap leading-relaxed outline outline-1 outline-[#EAD8C2]/50">
        {val}
      </div>
    </div>
  );
}
