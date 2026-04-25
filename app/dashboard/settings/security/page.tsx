"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Eye, EyeOff, AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";

function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="brand-label">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="brand-input pr-11"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A8927D] hover:text-[#8C6E52] transition-colors"
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function StrengthHint({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li
      className={`flex items-center gap-2 text-xs transition-colors ${
        ok ? "text-[#7A9A74]" : "text-[#A8927D]"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full transition-colors ${
          ok ? "bg-[#7A9A74]" : "bg-[#D0BBA8]"
        }`}
      />
      {text}
    </li>
  );
}

export default function SecurityPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(data.message || "Não foi possível trocar a senha.");
      }
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto animate-fade-up">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-[#7A9A74] hover:text-[#B47F6A] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao dashboard
        </Link>
      </div>

      <div className="brand-card overflow-hidden">
        {/* Header */}
        <div className="p-8 border-b border-[#EAD8C2] bg-[#FAF7F2] text-center">
          <div className="w-14 h-14 bg-[#EAD8C2] rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7 text-[#7A9A74]" />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-[#3A2B1F] mb-1">
            Segurança da conta
          </h1>
          <p className="text-sm text-[#A8927D]">Bruna Flores Nutri</p>
        </div>

        {/* Warning */}
        <div className="px-8 pt-6">
          <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700 leading-relaxed">
              Por segurança, troque a senha inicial antes de acessar o dashboard.
              A nova senha deve ter pelo menos 8 caracteres, incluindo letras,
              números e um caractere especial.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <PasswordInput
            label="Senha atual"
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="Senha atual / inicial"
            autoComplete="current-password"
          />
          <PasswordInput
            label="Nova senha"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Mínimo 8 chars, 1 letra, 1 número, 1 especial"
            autoComplete="new-password"
          />
          <PasswordInput
            label="Confirmar nova senha"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Repita a nova senha"
            autoComplete="new-password"
          />

          {newPassword.length > 0 && (
            <ul className="space-y-1.5">
              <StrengthHint ok={newPassword.length >= 8} text="Pelo menos 8 caracteres" />
              <StrengthHint ok={/[a-zA-Z]/.test(newPassword)} text="Pelo menos 1 letra" />
              <StrengthHint ok={/[0-9]/.test(newPassword)} text="Pelo menos 1 número" />
              <StrengthHint
                ok={/[^a-zA-Z0-9]/.test(newPassword)}
                text="Pelo menos 1 caractere especial"
              />
            </ul>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="brand-btn-primary w-full"
          >
            {loading ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
