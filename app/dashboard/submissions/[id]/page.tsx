"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Printer, Save, Phone, Mail, Baby } from "lucide-react";
import Link from "next/link";
import { BrandBadge } from "@/components/brand/BrandBadge";

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
  answers: Record<string, unknown>;
}

const ANSWER_SECTIONS = [
  {
    title: "Dados Pessoais",
    fields: [
      { key: "idade", label: "Idade" },
      { key: "nascimento", label: "Data de nascimento" },
      { key: "profissao", label: "Profissão" },
      { key: "cidade", label: "Cidade/Estado" },
    ],
  },
  {
    title: "Momento Atual",
    fields: [
      { key: "motivacao", label: "Motivação", full: true },
      { key: "objetivo", label: "Objetivo principal" },
      { key: "incomodo", label: "O que mais incomoda", full: true },
    ],
  },
  {
    title: "Histórico de Saúde",
    fields: [
      { key: "diagnostico", label: "Diagnóstico", full: true },
      { key: "medicacao", label: "Medicação contínua", full: true },
      { key: "anticoncepcional", label: "Anticoncepcional" },
      { key: "gestante", label: "Gestante/Amamentando" },
      { key: "sintomas", label: "Sintomas frequentes", full: true },
    ],
  },
  {
    title: "Suplementação",
    fields: [
      { key: "suplementos", label: "Uso atual", full: true },
      { key: "suplementosNegativo", label: "Não se adaptou", full: true },
    ],
  },
  {
    title: "Rotina Alimentar",
    fields: [
      { key: "rotina", label: "Rotina descrita", full: true },
      { key: "semComer", label: "Fica longo tempo sem comer" },
      { key: "comerEmocao", label: "Come por fome/emoção" },
      { key: "fomeDia", label: "Fome ao longo do dia", full: true },
    ],
  },
  {
    title: "Sono, Estresse e Rotina",
    fields: [
      { key: "sonoHoras", label: "Horas de sono" },
      { key: "descansada", label: "Acorda descansada" },
      { key: "estresse", label: "Nível de estresse" },
      { key: "atividadeFisica", label: "Atividade física", full: true },
    ],
  },
  {
    title: "Saúde Intestinal",
    fields: [
      { key: "intestinoFreq", label: "Frequência" },
      { key: "desconforto", label: "Gases/Desconforto" },
    ],
  },
  {
    title: "Preferências",
    fields: [
      { key: "naoGosta", label: "Não gosta/tolera", full: true },
      { key: "favoritos", label: "Favoritos no dia a dia", full: true },
    ],
  },
  {
    title: "Dia Alimentar",
    fields: [{ key: "diaAlimentar", label: "Relato", full: true }],
  },
  {
    title: "Expectativas",
    fields: [
      { key: "expectativas", label: "O que espera?", full: true },
      { key: "disposicao", label: "Disposição para mudar (0-10)" },
    ],
  },
  {
    title: "Espaço Livre",
    fields: [{ key: "espacoLivre", label: "Mensagem", full: true }],
  },
];

const STATUS_OPTIONS = [
  { value: "novo", label: "Novo" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "finalizado", label: "Finalizado" },
  { value: "arquivado", label: "Arquivado" },
];

function renderValue(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

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

  if (loading) {
    return (
      <div className="text-center py-20 text-[#A8927D] text-sm">Carregando...</div>
    );
  }
  if (!data) {
    return (
      <div className="text-center py-20 text-[#A8927D] text-sm">
        Formulário não encontrado.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16 animate-fade-up">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-[#7A9A74] hover:text-[#B47F6A] transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
        <a
          href={`/dashboard/submissions/${id}/print`}
          target="_blank"
          className="inline-flex items-center gap-2 bg-[#F4C9C6] text-[#B47F6A] px-5 py-2 rounded-full text-sm font-semibold hover:bg-[#f1b8b4] transition-colors"
        >
          <Printer className="w-4 h-4" />
          Imprimir / PDF
        </a>
      </div>

      {/* Patient card */}
      <div className="brand-card overflow-hidden">
        {/* Header */}
        <div className="p-8 border-b border-[#EAD8C2] bg-gradient-to-br from-[#FAF7F2] to-[#EAD8C2]/30 text-center relative overflow-hidden">
          <div className="absolute right-[-30px] top-[-30px] opacity-10 pointer-events-none">
            <svg width="180" height="180" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="45" stroke="#7A9A74" strokeWidth="0.5" />
              <circle cx="50" cy="50" r="30" stroke="#B47F6A" strokeWidth="0.5" />
              <circle cx="50" cy="20" r="5" fill="#F4C9C6" />
            </svg>
          </div>
          <p className="brand-kicker mb-3">Relatório do Paciente</p>
          <h1 className="font-serif font-bold text-3xl text-[#7A9A74] mb-3">
            {data.patient_name}
          </h1>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-[#8C6E52] mb-3">
            {data.patient_phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                {data.patient_phone}
              </span>
            )}
            {data.patient_email && (
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                {data.patient_email}
              </span>
            )}
            {data.child_name && (
              <span className="flex items-center gap-1.5">
                <Baby className="w-3.5 h-3.5" />
                {data.child_name}
                {data.child_age ? ` (${data.child_age})` : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-[#A8927D]">
            Recebido em {format(parseISO(data.created_at), "dd/MM/yyyy 'às' HH:mm")}
          </p>
          <div className="mt-3 flex justify-center">
            <BrandBadge status={data.status} />
          </div>
        </div>

        {/* Management panel */}
        <div className="p-6 bg-[#FAF7F2]/60 border-b border-[#EAD8C2]">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="brand-label">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="brand-input w-auto"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="brand-label">Notas internas</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações sobre este paciente..."
                className="brand-input"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="brand-btn-primary"
            >
              <Save className="w-4 h-4" />
              {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
            </button>
          </div>
        </div>

        {/* Answers */}
        <div className="p-8 space-y-10">
          {ANSWER_SECTIONS.map((section) => {
            const visible = section.fields
              .map((f) => ({ ...f, rendered: renderValue(data.answers[f.key]) }))
              .filter((f) => f.rendered !== null);

            if (visible.length === 0) return null;

            return (
              <div
                key={section.title}
                className="border-b border-[#EAD8C2]/50 pb-8 last:border-0 last:pb-0"
              >
                <h3 className="font-serif font-bold text-xl text-[#B47F6A] mb-6">
                  {section.title}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {visible.map((f) => (
                    <div key={f.key} className={f.full ? "col-span-1 md:col-span-2" : ""}>
                      <p className="brand-label mb-2">{f.label}</p>
                      <div className="bg-[#FAF7F2] rounded-xl p-4 text-[#3A2B1F] text-sm whitespace-pre-wrap leading-relaxed border border-[#EAD8C2]/60">
                        {f.rendered}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {data.notes && (
            <div className="border-t border-[#EAD8C2]/50 pt-8">
              <h3 className="font-serif font-bold text-xl text-[#B47F6A] mb-6">
                Notas Internas
              </h3>
              <div className="bg-[#FAF7F2] rounded-xl p-4 text-[#3A2B1F] text-sm whitespace-pre-wrap leading-relaxed border border-[#EAD8C2]/60">
                {data.notes}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
