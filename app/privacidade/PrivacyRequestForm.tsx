"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";

export function PrivacyRequestForm() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const body = { name: form.get("name"), email: form.get("email"), phone: form.get("phone"), requestType: form.get("requestType"), details: form.get("details"), privacyAccepted: form.get("privacyAccepted") === "on", companyWebsite: form.get("companyWebsite") };
    try {
      const response = await fetch("/api/privacy-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Não foi possível enviar.");
      setSuccess(true);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Não foi possível enviar."); }
    finally { setLoading(false); }
  }

  if (success) return <div className="flex items-start gap-3 rounded-lg border border-[#D9E4D3] bg-[#F4F8F1] p-5 text-[#4F6847]"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Solicitação recebida.</p><p className="mt-1 text-sm leading-6">A identidade será confirmada antes de qualquer acesso, alteração ou exclusão de dados.</p></div></div>;

  return <form onSubmit={submit} className="grid gap-5">
    <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold text-[#5F554D]">Nome completo<input name="name" required minLength={2} className="brand-input mt-2" /></label><label className="text-sm font-semibold text-[#5F554D]">E-mail usado no atendimento<input name="email" type="email" required className="brand-input mt-2" /></label></div>
    <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold text-[#5F554D]">WhatsApp, se desejar<input name="phone" className="brand-input mt-2" /></label><label className="text-sm font-semibold text-[#5F554D]">Tipo de solicitação<select name="requestType" className="brand-input mt-2" defaultValue="acesso"><option value="acesso">Acessar meus dados</option><option value="correcao">Corrigir dados</option><option value="exclusao">Excluir ou anonimizar</option><option value="revogacao">Revogar consentimento</option><option value="informacao">Entender o tratamento</option><option value="outro">Outro assunto</option></select></label></div>
    <label className="text-sm font-semibold text-[#5F554D]">Detalhes<textarea name="details" rows={4} maxLength={3000} className="brand-input mt-2 resize-y" placeholder="Descreva o que você precisa, sem incluir novas informações de saúde." /></label>
    <label className="flex items-start gap-3 text-sm leading-6 text-[#5F554D]"><input name="privacyAccepted" type="checkbox" required className="mt-1 h-5 w-5 accent-[#607A56]" />Autorizo o uso destes dados exclusivamente para identificar e responder à solicitação.</label>
    <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden"><label>Site<input name="companyWebsite" tabIndex={-1} autoComplete="off" /></label></div>
    {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <button disabled={loading} className="inline-flex h-12 w-fit items-center gap-2 rounded-full bg-[#607A56] px-6 text-sm font-semibold text-white transition hover:bg-[#4F6847] disabled:opacity-60"><Send className="h-4 w-4" />{loading ? "Enviando..." : "Enviar solicitação"}</button>
  </form>;
}
