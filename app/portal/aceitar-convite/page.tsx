"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

export default function AcceptPortalInvitePage() {
  return <Suspense fallback={null}><AcceptPortalInviteForm /></Suspense>;
}

function AcceptPortalInviteForm() {
  const params = useSearchParams(); const token = params.get("token") ?? ""; const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [message, setMessage] = useState(""); const [sending, setSending] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setSending(true); const response = await fetch("/api/portal/invite/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password, confirmPassword }) }); const data = await response.json().catch(() => ({})); setMessage(response.ok ? "Senha criada. Você já pode entrar no portal." : data.message ?? "Não foi possível criar sua senha."); setSending(false); }
  return <main className="min-h-screen bg-[#F7F0E8] px-5 py-12 text-[#3A3028]"><form onSubmit={submit} className="mx-auto max-w-md rounded-3xl bg-white p-7 shadow-sm"><p className="text-sm font-semibold text-[#607A56]">Bruna Flores Nutri</p><h1 className="mt-2 font-serif text-3xl font-semibold">Criar sua senha</h1><p className="mt-3 text-sm text-[#75675E]">Use uma senha com pelo menos 12 caracteres.</p><label className="mt-6 block text-sm font-semibold" htmlFor="password">Nova senha</label><input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="brand-input mt-2" /><label className="mt-4 block text-sm font-semibold" htmlFor="confirm">Confirmar senha</label><input id="confirm" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="brand-input mt-2" /><button className="brand-btn-primary mt-5 w-full justify-center" disabled={sending}>{sending ? "Criando senha..." : "Criar acesso"}</button>{message && <p className="mt-4 text-sm" role="status">{message}</p>}<a href="/portal" className="mt-5 block text-center text-sm text-[#607A56] hover:underline">Ir para o login</a></form></main>;
}
