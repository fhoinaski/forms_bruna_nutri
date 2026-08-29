"use client";
import { useState } from "react";

export default function ForgotPortalPasswordPage() {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [sending, setSending] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSending(true);
    await fetch("/api/portal/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    setMessage("Se existir uma conta, enviaremos instruções."); setSending(false);
  }
  return <main className="min-h-screen bg-[#F7F0E8] px-5 py-12 text-[#3A3028]"><form onSubmit={submit} className="mx-auto max-w-md rounded-3xl bg-white p-7 shadow-sm"><p className="text-sm font-semibold text-[#607A56]">Bruna Flores Nutri</p><h1 className="mt-2 font-serif text-3xl font-semibold">Esqueci minha senha</h1><p className="mt-3 text-sm text-[#75675E]">Informe seu e-mail para receber as instruções.</p><label className="mt-6 block text-sm font-semibold" htmlFor="email">E-mail</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="brand-input mt-2" /><button className="brand-btn-primary mt-5 w-full justify-center" disabled={sending}>{sending ? "Enviando..." : "Enviar instruções"}</button>{message && <p className="mt-4 text-sm text-[#607A56]" role="status">{message}</p>}<a href="/portal" className="mt-5 block text-center text-sm text-[#607A56] hover:underline">Voltar ao login</a></form></main>;
}
