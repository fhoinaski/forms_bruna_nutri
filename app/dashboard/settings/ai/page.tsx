"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Save, ShieldCheck } from "lucide-react";
import { HelpPopover } from "@/components/dashboard/HelpPopover";

type AIProvider = "openai" | "anthropic" | "google" | "deepseek" | "xai" | "groq" | "mistral";

type AISettingsForm = {
  provider: AIProvider;
  api_key: string;
  model: string;
  protocol_system_prompt: string;
  chat_system_prompt: string;
  has_api_key: boolean;
  updated_at: string;
};

const providerModels: Record<AIProvider, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
  anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-4-5-20250929", "claude-opus-4-1-20250805"],
  google: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  xai: ["grok-4", "grok-4-fast", "grok-3", "grok-3-mini"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "deepseek-r1-distill-llama-70b", "gemma2-9b-it"],
  mistral: ["mistral-large-latest", "mistral-small-latest", "pixtral-large-latest", "codestral-latest"],
};

const providerLabels: Record<AIProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  deepseek: "DeepSeek",
  xai: "xAI (Grok)",
  groq: "Groq",
  mistral: "Mistral",
};

const emptyForm: AISettingsForm = {
  provider: "openai",
  api_key: "",
  model: "gpt-4o",
  protocol_system_prompt: "",
  chat_system_prompt: "",
  has_api_key: false,
  updated_at: "",
};

export default function AISettingsPage() {
  const [form, setForm] = useState<AISettingsForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/admin/settings/ai", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Não foi possível carregar.");
        setForm({
          provider: data.provider,
          api_key: data.api_key ?? "",
          model: data.model,
          protocol_system_prompt: data.protocol_system_prompt ?? "",
          chat_system_prompt: data.chat_system_prompt ?? "",
          has_api_key: Boolean(data.has_api_key),
          updated_at: data.updated_at ?? "",
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar.");
      } finally {
        setLoading(false);
      }
    }
    void loadSettings();
  }, []);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: form.provider,
          api_key: form.api_key || null,
          model: form.model,
          protocol_system_prompt: form.protocol_system_prompt || null,
          chat_system_prompt: form.chat_system_prompt || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível salvar.");
      setForm({
        provider: data.provider,
        api_key: data.api_key ?? "",
        model: data.model,
        protocol_system_prompt: data.protocol_system_prompt ?? "",
        chat_system_prompt: data.chat_system_prompt ?? "",
        has_api_key: Boolean(data.has_api_key),
        updated_at: data.updated_at ?? "",
      });
      setMessage("Configurações de IA salvas com segurança.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  function setProvider(provider: AIProvider) {
    setForm({
      ...form,
      provider,
      model: providerModels[provider][0],
    });
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-up space-y-6">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-[#7A9A74] transition-colors hover:text-[#B47F6A]">
        <ArrowLeft className="h-4 w-4" />
        Voltar ao dashboard
      </Link>

      <header className="brand-card overflow-hidden">
        <div className="border-b border-[#EAD8C2] bg-[#FAF7F2] p-8">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF0E4] text-[#607A56]">
            <Bot className="h-7 w-7" />
          </div>
          <p className="brand-kicker mb-2">Configuração dinâmica</p>
          <div className="flex items-start justify-center gap-3 sm:justify-start">
            <h1 className="font-serif text-3xl font-semibold text-[#3A2B1F]">Inteligência Artificial</h1>
            <HelpPopover topicKey="settings/ai" />
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75675E]">
            Configure provedor, chave, modelo e prompts usados pelo agente de protocolos sem depender de variáveis estáticas no deploy.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="brand-card p-8 text-center text-sm text-[#A8927D]">Carregando configurações...</div>
      ) : (
        <form onSubmit={saveSettings} className="brand-card space-y-6 p-6 sm:p-8">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="brand-label">Provedor</label>
              <select value={form.provider} onChange={(event) => setProvider(event.target.value as AIProvider)} className="brand-input">
                {Object.entries(providerLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="brand-label">Modelo</label>
              <input list="ai-models" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} className="brand-input" />
              <datalist id="ai-models">
                {providerModels[form.provider].map((model) => <option key={model} value={model} />)}
              </datalist>
            </div>
          </div>

          <div>
            <label className="brand-label">API Key</label>
            <input
              type="password"
              value={form.api_key}
              onChange={(event) => setForm({ ...form, api_key: event.target.value })}
              className="brand-input"
              placeholder={form.has_api_key ? "Chave já configurada" : "Cole a chave do provedor selecionado"}
              autoComplete="off"
            />
            <p className="mt-2 flex items-center gap-2 text-xs leading-5 text-[#8A7B70]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#607A56]" />
              A chave é mascarada na leitura. Se o campo ficar com valor mascarado, a chave atual será preservada.
            </p>
          </div>

          <div>
            <label className="brand-label">Protocol System Prompt</label>
            <textarea
              value={form.protocol_system_prompt}
              onChange={(event) => setForm({ ...form, protocol_system_prompt: event.target.value })}
              className="brand-input min-h-[260px] resize-y font-mono text-xs leading-5"
              placeholder="Prompt principal usado pelo agente que gera rascunhos de protocolo."
            />
          </div>

          <div>
            <label className="brand-label">Chat System Prompt</label>
            <textarea
              value={form.chat_system_prompt}
              onChange={(event) => setForm({ ...form, chat_system_prompt: event.target.value })}
              className="brand-input min-h-[180px] resize-y font-mono text-xs leading-5"
              placeholder="Prompt usado pelo assistente de chat flutuante do dashboard (ajuda sobre o uso do sistema)."
            />
            <p className="mt-2 text-xs leading-5 text-[#8A7B70]">
              Usado pelo botão de chat flutuante em todas as telas do dashboard. Ele só orienta sobre o uso do sistema — nunca dá conduta clínica.
            </p>
          </div>

          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {message && <p className="rounded-xl border border-[#D9E4D3] bg-[#F4F8F1] px-4 py-3 text-sm text-[#4F6847]">{message}</p>}

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="brand-btn-primary">
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar configurações"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
