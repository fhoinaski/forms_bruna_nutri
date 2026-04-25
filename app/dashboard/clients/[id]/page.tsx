"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Phone,
  Mail,
  FileText,
  Printer,
  User,
} from "lucide-react";
import { format, parseISO, isValid } from "date-fns";

interface ClientDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  source_submission_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "arquivado", label: "Arquivado" },
];

const STATUS_BADGE: Record<string, string> = {
  ativo: "brand-badge brand-badge-finalizado",
  inativo: "brand-badge brand-badge-andamento",
  arquivado: "brand-badge brand-badge-arquivado",
};
const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  arquivado: "Arquivado",
};

function formatDateSafe(value: string | null, fmt = "dd/MM/yyyy"): string {
  if (!value) return "—";
  try {
    const d = parseISO(value);
    return isValid(d) ? format(d, fmt) : "—";
  } catch {
    return "—";
  }
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [status, setStatus] = useState("ativo");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/clients/${id}`)
      .then((res) => {
        if (!res.ok) {
          router.push("/dashboard/clients");
          return null;
        }
        return res.json() as Promise<ClientDetail>;
      })
      .then((res) => {
        if (!res) return;
        setData(res);
        setName(res.name);
        setEmail(res.email ?? "");
        setPhone(res.phone ?? "");
        setBirthDate(res.birth_date ?? "");
        setStatus(res.status);
        setNotes(res.notes ?? "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, router]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      const res = await fetch(`/api/admin/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          email: email || null,
          phone: phone || null,
          birth_date: birthDate || null,
          status,
          notes: notes || null,
        }),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError("Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-[#A8927D] text-sm">Carregando...</div>
    );
  }
  if (!data) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16 animate-fade-up">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/clients"
          className="inline-flex items-center gap-2 text-sm text-[#7A9A74] hover:text-[#B47F6A] transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Clientes
        </Link>
        <button
          disabled
          title="Disponível em breve"
          className="inline-flex items-center gap-2 text-xs font-medium text-[#A8927D] border border-[#EAD8C2] rounded-full px-4 py-2 opacity-50 cursor-not-allowed"
        >
          <Printer className="w-3.5 h-3.5" />
          Imprimir relatório
        </button>
      </div>

      {/* Header card */}
      <div className="brand-card overflow-hidden">
        <div className="p-8 border-b border-[#EAD8C2] bg-gradient-to-br from-[#FAF7F2] to-[#EAD8C2]/30 text-center relative overflow-hidden">
          <div className="absolute right-[-30px] top-[-30px] opacity-10 pointer-events-none">
            <svg width="180" height="180" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="45" stroke="#7A9A74" strokeWidth="0.5" />
              <circle cx="50" cy="50" r="30" stroke="#B47F6A" strokeWidth="0.5" />
            </svg>
          </div>

          <div className="w-16 h-16 bg-[#EAD8C2] rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-[#8C6E52]" />
          </div>

          <p className="brand-kicker mb-2">Ficha do cliente</p>
          <h1 className="font-serif font-bold text-2xl text-[#3A2B1F] mb-3">
            {data.name}
          </h1>

          <div className="flex flex-wrap justify-center gap-4 text-sm text-[#8C6E52] mb-4">
            {data.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                {data.phone}
              </span>
            )}
            {data.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                {data.email}
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-3">
            <span className={STATUS_BADGE[data.status] ?? "brand-badge brand-badge-arquivado"}>
              {STATUS_LABEL[data.status] ?? data.status}
            </span>
            <span className="text-xs text-[#A8927D]">
              Cadastrado em {formatDateSafe(data.created_at, "dd/MM/yyyy")}
            </span>
          </div>

          {data.source_submission_id && (
            <div className="mt-4">
              <Link
                href={`/dashboard/submissions/${data.source_submission_id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7A9A74] border border-[#7A9A74]/30 rounded-full px-4 py-1.5 hover:bg-[#7A9A74]/10 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Ver formulário original
              </Link>
            </div>
          )}
        </div>

        {/* Edição */}
        <div className="p-8 space-y-6">
          <h2 className="font-serif font-semibold text-lg text-[#B47F6A]">
            Dados do paciente
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="brand-label">Nome completo</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="brand-input"
                placeholder="Nome da paciente"
              />
            </div>
            <div>
              <label className="brand-label">Telefone / WhatsApp</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="brand-input"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <label className="brand-label">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="brand-input"
                placeholder="paciente@email.com"
              />
            </div>
            <div>
              <label className="brand-label">Data de nascimento</label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="brand-input"
              />
            </div>
            <div>
              <label className="brand-label">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="brand-input"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="brand-label">Notas internas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="brand-input resize-y"
              placeholder="Observações sobre a paciente, histórico de atendimento..."
            />
          </div>

          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm">{saveError}</p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="brand-btn-primary"
            >
              <Save className="w-4 h-4" />
              {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar alterações"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
