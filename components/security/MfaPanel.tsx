"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";

type MfaState = { enabled: boolean; remainingCodes: number };

export function MfaPanel() {
  const [state, setState] = useState<MfaState | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/security/mfa", { cache: "no-store" });
    if (response.ok) setState(await response.json());
  }
  useEffect(() => { void load(); }, []);

  async function setup() {
    setLoading(true); setMessage("");
    const response = await fetch("/api/admin/security/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setup" }) });
    const data = await response.json();
    if (response.ok) { setQrCode(data.qrCode); setManualKey(data.manualKey); }
    else setMessage(data.message || "Não foi possível iniciar a configuração.");
    setLoading(false);
  }

  async function verify() {
    setLoading(true); setMessage("");
    const response = await fetch("/api/admin/security/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", code }) });
    const data = await response.json();
    if (response.ok) { setRecoveryCodes(data.recoveryCodes); setQrCode(""); setManualKey(""); setCode(""); await load(); }
    else setMessage(data.message || "Código inválido.");
    setLoading(false);
  }

  async function disable() {
    setLoading(true); setMessage("");
    const response = await fetch("/api/admin/security/mfa", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, code }) });
    const data = await response.json();
    if (response.ok) { setPassword(""); setCode(""); setMessage("Autenticação em dois fatores desativada."); await load(); }
    else setMessage(data.message || "Não foi possível desativar.");
    setLoading(false);
  }

  if (!state) return <div className="brand-card mt-6 flex items-center justify-center p-8 text-[#7A9A74]"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return <section className="brand-card mt-6 overflow-hidden">
    <div className="flex items-start justify-between gap-5 border-b border-[#EAD8C2] bg-[#FAF7F2] p-7">
      <div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#607A56]" /><h2 className="font-serif text-2xl font-semibold text-[#3A2B1F]">Verificação em duas etapas</h2></div><p className="mt-2 text-sm leading-6 text-[#8A7B70]">Protege prontuários e dados de saúde mesmo se a senha for descoberta.</p></div>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${state.enabled ? "bg-[#EAF0E4] text-[#4F6847]" : "bg-[#F5ECE4] text-[#8C5F50]"}`}>{state.enabled ? "Ativa" : "Inativa"}</span>
    </div>
    <div className="p-7">
      {!state.enabled && !qrCode && <button onClick={setup} disabled={loading} className="brand-btn-primary inline-flex items-center gap-2"><KeyRound className="h-4 w-4" />Ativar com aplicativo autenticador</button>}
      {qrCode && <div className="grid gap-7 md:grid-cols-[260px_1fr] md:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrCode} alt="QR Code para configurar aplicativo autenticador" className="h-[260px] w-[260px] rounded-lg border border-[#EAD8C2]" />
        <div><h3 className="font-semibold text-[#3A2B1F]">1. Leia o QR Code</h3><p className="mt-2 text-sm leading-6 text-[#8A7B70]">Use Google Authenticator, Microsoft Authenticator, 1Password ou outro aplicativo TOTP.</p><p className="mt-4 text-xs text-[#8A7B70]">Chave manual</p><code className="mt-1 block break-all rounded-lg bg-[#F5ECE4] p-3 text-xs text-[#5F554D]">{manualKey}</code><label className="brand-label mt-5 block">2. Digite o código exibido</label><div className="dashboard-action-field mt-2"><input value={code} onChange={(event) => setCode(event.target.value)} className="brand-input" inputMode="numeric" autoComplete="one-time-code" /><button onClick={verify} disabled={loading || code.length < 6} className="brand-btn-primary">Confirmar</button></div></div></div>}
      {state.enabled && recoveryCodes.length === 0 && <div><div className="mb-5 flex items-center gap-2 text-sm text-[#4F6847]"><CheckCircle2 className="h-5 w-5" />Proteção ativa. {state.remainingCodes} códigos de recuperação disponíveis.</div><div className="grid gap-4 sm:grid-cols-2"><label><span className="brand-label">Senha atual</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="brand-input mt-2" /></label><label><span className="brand-label">Código do autenticador</span><input value={code} onChange={(event) => setCode(event.target.value)} className="brand-input mt-2" inputMode="numeric" /></label></div><button onClick={disable} disabled={loading || !password || code.length < 6} className="mt-4 rounded-full border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50">Desativar proteção</button></div>}
      {recoveryCodes.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-5"><h3 className="font-semibold text-amber-900">Guarde estes códigos agora</h3><p className="mt-1 text-sm leading-6 text-amber-800">Cada código funciona uma única vez. Eles não serão exibidos novamente.</p><div className="my-4 grid grid-cols-2 gap-2 font-mono text-sm text-amber-950 sm:grid-cols-4">{recoveryCodes.map((item) => <code key={item}>{item}</code>)}</div><button onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n"))} className="inline-flex items-center gap-2 text-sm font-semibold text-amber-900"><Copy className="h-4 w-4" />Copiar códigos</button></div>}
      {message && <p className="mt-4 text-sm text-[#8C5F50]">{message}</p>}
    </div>
  </section>;
}
