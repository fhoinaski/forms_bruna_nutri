"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, CalendarDays, Plus, Trash2 } from "lucide-react";
import { HelpPopover } from "@/components/dashboard/HelpPopover";

type Rule = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  is_active: number;
};

type Block = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

const weekdays = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

function toDatetimeLocal(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocal(value: string) {
  return new Date(value).toISOString();
}

export default function AvailabilityPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    weekday: "1",
    start_time: "09:00",
    end_time: "18:00",
    slot_duration_minutes: "60",
  });
  const [blockForm, setBlockForm] = useState({
    starts_at: "",
    ends_at: "",
    reason: "",
  });

  const load = useCallback(async () => {
    const [rulesResponse, blocksResponse] = await Promise.all([
      fetch("/api/admin/availability-rules", { cache: "no-store" }),
      fetch("/api/admin/availability-blocks", { cache: "no-store" }),
    ]);
    if (rulesResponse.ok) {
      const result = await rulesResponse.json() as { items: Rule[] };
      setRules(result.items);
    }
    if (blocksResponse.ok) {
      const result = await blocksResponse.json() as { items: Block[] };
      setBlocks(result.items);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRule(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/availability-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekday: Number(ruleForm.weekday),
        start_time: ruleForm.start_time,
        end_time: ruleForm.end_time,
        slot_duration_minutes: Number(ruleForm.slot_duration_minutes),
        is_active: 1,
      }),
    });
    setMessage(response.ok ? "Regra de disponibilidade criada." : "Não foi possível criar a regra.");
    await load();
    setSaving(false);
  }

  async function toggleRule(rule: Rule) {
    setSaving(true);
    await fetch(`/api/admin/availability-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: rule.is_active ? 0 : 1 }),
    });
    await load();
    setSaving(false);
  }

  async function deleteRule(id: string) {
    setSaving(true);
    await fetch(`/api/admin/availability-rules/${id}`, { method: "DELETE" });
    await load();
    setSaving(false);
  }

  async function createBlock(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/availability-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        starts_at: fromDatetimeLocal(blockForm.starts_at),
        ends_at: fromDatetimeLocal(blockForm.ends_at),
        reason: blockForm.reason || null,
      }),
    });
    setMessage(response.ok ? "Bloqueio criado." : "Não foi possível criar o bloqueio.");
    setBlockForm({ starts_at: "", ends_at: "", reason: "" });
    await load();
    setSaving(false);
  }

  async function deleteBlock(id: string) {
    setSaving(true);
    await fetch(`/api/admin/availability-blocks/${id}`, { method: "DELETE" });
    await load();
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="brand-card p-6 sm:p-8">
        <Link href="/dashboard/agenda" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#607A56]">
          <ArrowLeft className="h-4 w-4" />
          Voltar para agenda
        </Link>
        <p className="brand-kicker mb-2">Agenda online</p>
        <div className="flex items-start gap-3">
          <h1 className="font-serif text-4xl font-semibold">Disponibilidade para autoagendamento</h1>
          <HelpPopover topicKey="agenda/disponibilidade" />
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75675E]">
          Defina janelas recorrentes de atendimento e bloqueios pontuais. A paciente só verá horários livres, sem dados de outras consultas.
        </p>
      </header>

      {message && (
        <div className="rounded-lg border border-[#D9E4D3] bg-[#F4F8F1] px-4 py-3 text-sm text-[#4F6847]">
          {message}
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={createRule} className="brand-card space-y-5 p-6">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-[#607A56]" />
            <h2 className="font-serif text-2xl font-semibold">Regra recorrente</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="brand-label">Dia da semana</span>
              <select value={ruleForm.weekday} onChange={(event) => setRuleForm({ ...ruleForm, weekday: event.target.value })} className="brand-input">
                {weekdays.map((weekday, index) => <option key={weekday} value={index}>{weekday}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="brand-label">Duração do slot</span>
              <select value={ruleForm.slot_duration_minutes} onChange={(event) => setRuleForm({ ...ruleForm, slot_duration_minutes: event.target.value })} className="brand-input">
                <option value="30">30 minutos</option>
                <option value="45">45 minutos</option>
                <option value="60">60 minutos</option>
                <option value="90">90 minutos</option>
              </select>
            </label>
            <label className="block">
              <span className="brand-label">Início</span>
              <input type="time" value={ruleForm.start_time} onChange={(event) => setRuleForm({ ...ruleForm, start_time: event.target.value })} className="brand-input" />
            </label>
            <label className="block">
              <span className="brand-label">Fim</span>
              <input type="time" value={ruleForm.end_time} onChange={(event) => setRuleForm({ ...ruleForm, end_time: event.target.value })} className="brand-input" />
            </label>
          </div>
          <button type="submit" disabled={saving} className="brand-btn-primary">
            <Plus className="h-4 w-4" />
            Criar regra
          </button>
        </form>

        <form onSubmit={createBlock} className="brand-card space-y-5 p-6">
          <div className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-[#C58D73]" />
            <h2 className="font-serif text-2xl font-semibold">Bloqueio pontual</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="brand-label">Início</span>
              <input required type="datetime-local" value={blockForm.starts_at} onChange={(event) => setBlockForm({ ...blockForm, starts_at: event.target.value })} className="brand-input" />
            </label>
            <label className="block">
              <span className="brand-label">Fim</span>
              <input required type="datetime-local" value={blockForm.ends_at} onChange={(event) => setBlockForm({ ...blockForm, ends_at: event.target.value })} className="brand-input" />
            </label>
          </div>
          <label className="block">
            <span className="brand-label">Motivo</span>
            <input value={blockForm.reason} onChange={(event) => setBlockForm({ ...blockForm, reason: event.target.value })} className="brand-input" placeholder="Feriado, férias, compromisso..." />
          </label>
          <button type="submit" disabled={saving} className="brand-btn-secondary">
            <Plus className="h-4 w-4" />
            Criar bloqueio
          </button>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="brand-card overflow-hidden">
          <div className="border-b border-[#EDE1D6] p-5">
            <h2 className="font-serif text-2xl font-semibold">Regras ativas</h2>
          </div>
          <div className="divide-y divide-[#EDE1D6]">
            {rules.length === 0 ? (
              <p className="p-5 text-sm text-[#75675E]">Nenhuma regra cadastrada.</p>
            ) : rules.map((rule) => (
              <div key={rule.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{weekdays[rule.weekday]}</p>
                  <p className="text-sm text-[#75675E]">{rule.start_time} - {rule.end_time} · {rule.slot_duration_minutes} min</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={saving} onClick={() => void toggleRule(rule)} className="rounded-full border border-[#D9E4D3] px-3 py-2 text-xs font-semibold text-[#607A56]">
                    {rule.is_active ? "Ativa" : "Inativa"}
                  </button>
                  <button type="button" disabled={saving} onClick={() => void deleteRule(rule.id)} className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="brand-card overflow-hidden">
          <div className="border-b border-[#EDE1D6] p-5">
            <h2 className="font-serif text-2xl font-semibold">Bloqueios</h2>
          </div>
          <div className="divide-y divide-[#EDE1D6]">
            {blocks.length === 0 ? (
              <p className="p-5 text-sm text-[#75675E]">Nenhum bloqueio cadastrado.</p>
            ) : blocks.map((block) => (
              <div key={block.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{toDatetimeLocal(block.starts_at).replace("T", " ")} - {toDatetimeLocal(block.ends_at).replace("T", " ")}</p>
                  <p className="text-sm text-[#75675E]">{block.reason || "Sem motivo informado"}</p>
                </div>
                <button type="button" disabled={saving} onClick={() => void deleteBlock(block.id)} className="inline-flex w-fit rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
