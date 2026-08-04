"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clipboard,
  HeartHandshake,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Thermometer,
  UserRound,
} from "lucide-react";
import { format, isValid, parseISO } from "date-fns";

type Stage = "novo" | "acolhimento" | "aguardando_resposta" | "agendado" | "convertido" | "perdido";
type Temperature = "frio" | "morno" | "quente";

interface Opportunity {
  id: string;
  submission_id: string;
  stage: Stage;
  temperature: Temperature;
  objective: string | null;
  service_interest: string | null;
  next_action_at: string | null;
  last_contacted_at: string | null;
  contact_attempts: number;
  notes: string | null;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  child_name: string | null;
  submission_created_at: string;
}

const stageLabels: Record<Stage, string> = {
  novo: "Novo",
  acolhimento: "Acolhimento",
  aguardando_resposta: "Aguardando resposta",
  agendado: "Agendado",
  convertido: "Convertido",
  perdido: "Perdido",
};

const temperatureLabels: Record<Temperature, string> = {
  frio: "Frio",
  morno: "Morno",
  quente: "Quente",
};

const stages: Stage[] = ["novo", "acolhimento", "aguardando_resposta", "agendado", "convertido", "perdido"];

function formatDate(value: string | null, pattern = "dd/MM HH:mm") {
  if (!value) return "—";
  try {
    const date = parseISO(value);
    return isValid(date) ? format(date, pattern) : "—";
  } catch {
    return "—";
  }
}

function toDatetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function messageFor(opportunity: Opportunity) {
  const firstName = opportunity.patient_name.split(" ")[0] || "tudo bem";
  const interest = opportunity.service_interest ? ` sobre ${opportunity.service_interest.toLowerCase()}` : "";
  return `Oi, ${firstName}! Aqui é da Bruna Flores Nutri. Recebi sua pré-consulta${interest} e li com cuidado o que você compartilhou. Queria entender melhor seu momento e te orientar sobre o melhor próximo passo. Podemos conversar por aqui?`;
}

function whatsappUrl(phone: string | null, message: string) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function tempTone(temp: Temperature) {
  if (temp === "quente") return "border-[#E8C3BA] bg-[#F6E6E0] text-[#9A5C4E]";
  if (temp === "morno") return "border-[#EAD8C2] bg-[#F5ECE4] text-[#8C5F50]";
  return "border-[#D9E4D3] bg-[#EAF0E4] text-[#607A56]";
}

export default function OpportunitiesPage() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [temperature, setTemperature] = useState("");
  const [now, setNow] = useState(0);

  async function load() {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({
      ...(search ? { search } : {}),
      ...(temperature ? { temperature } : {}),
    });
    try {
      const response = await fetch(`/api/admin/opportunities?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load");
      const data: { items: Opportunity[] } = await response.json();
      setItems(data.items);
    } catch {
      setMessage("Não foi possível carregar as oportunidades.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setNow(Date.now());
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function backfill() {
    const response = await fetch("/api/admin/opportunities", { method: "POST" });
    setMessage(response.ok ? "Oportunidades sincronizadas." : "Não foi possível sincronizar.");
    await load();
  }

  async function updateOpportunity(id: string, patch: Record<string, unknown>) {
    const response = await fetch(`/api/admin/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      setMessage("Não foi possível atualizar a oportunidade.");
      await load();
      return;
    }
    const data: { item: Opportunity } = await response.json();
    setItems((current) =>
      current.map((item) => item.id === id ? data.item : item)
    );
  }

  async function convertOpportunity(item: Opportunity) {
    const response = await fetch(`/api/admin/submissions/${item.submission_id}/convert-to-client`, {
      method: "POST",
    });
    if (!response.ok) {
      setMessage("Não foi possível converter em cliente.");
      return;
    }
    await updateOpportunity(item.id, { stage: "convertido", nextActionAt: null });
    setMessage("Oportunidade convertida em cliente.");
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setMessage("Mensagem copiada.");
  }

  const metrics = useMemo(() => {
    const active = items.filter((item) => !["convertido", "perdido"].includes(item.stage));
    return {
      total: items.length,
      hot: active.filter((item) => item.temperature === "quente").length,
      overdue: active.filter((item) => item.next_action_at && Date.parse(item.next_action_at) < now).length,
      converted: items.filter((item) => item.stage === "convertido").length,
    };
  }, [items, now]);

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="brand-kicker mb-3">Funil de relacionamento</p>
            <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028]">
              Oportunidades de atendimento
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Conduza cada pré-consulta com acolhimento, contexto e próximos passos
              claros, sem transformar o contato em pressão comercial.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void backfill()} className="inline-flex h-11 items-center gap-2 rounded-full border border-[#D9E4D3] px-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] transition hover:bg-[#EAF0E4]">
              <RefreshCw className="h-4 w-4" />
              Sincronizar
            </button>
            <Link href="/dashboard" className="inline-flex h-11 items-center rounded-full border border-[#D9E4D3] px-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] transition hover:bg-[#EAF0E4]">
              Dashboard
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={<HeartHandshake />} label="Total" value={metrics.total} />
        <Metric icon={<Thermometer />} label="Quentes" value={metrics.hot} accent />
        <Metric icon={<AlertCircle />} label="Atrasadas" value={metrics.overdue} accent={metrics.overdue > 0} />
        <Metric icon={<CheckCircle2 />} label="Convertidas" value={metrics.converted} />
      </div>

      <section className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[220px] flex-1">
            <label className="brand-label">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="brand-input pl-9" placeholder="Nome, telefone, objetivo..." />
            </div>
          </div>
          <div className="min-w-[170px]">
            <label className="brand-label">Temperatura</label>
            <select value={temperature} onChange={(event) => setTemperature(event.target.value)} className="brand-input">
              <option value="">Todas</option>
              <option value="quente">Quente</option>
              <option value="morno">Morno</option>
              <option value="frio">Frio</option>
            </select>
          </div>
          <button type="submit" className="brand-btn-primary">Filtrar</button>
        </form>
        {message && <p className="mt-4 rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-4 py-3 text-sm text-[#75675E]">{message}</p>}
      </section>

      {loading ? (
        <div className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-12 text-center text-sm text-[#A9978A]">
          Carregando oportunidades...
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {stages.map((stage) => {
            const stageItems = items.filter((item) => item.stage === stage);
            return (
              <section key={stage} className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
                <div className="flex items-center justify-between border-b border-[#EDE1D6] px-5 py-4">
                  <h2 className="font-serif text-xl font-semibold">{stageLabels[stage]}</h2>
                  <span className="rounded-full bg-[#FBF7F1] px-3 py-1 text-xs font-semibold text-[#8A7B70]">{stageItems.length}</span>
                </div>
                <div className="space-y-3 p-4">
                  {stageItems.length === 0 ? (
                    <p className="rounded-xl bg-[#FBF7F1] px-4 py-5 text-center text-sm text-[#A9978A]">Sem oportunidades nesta etapa.</p>
                  ) : (
                    stageItems.map((item) => (
                      <OpportunityCard key={item.id} item={item} now={now} onCopy={copy} onUpdate={updateOpportunity} onConvert={convertOpportunity} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
      <div className="flex items-center justify-between">
        <p className="brand-kicker">{label}</p>
        <div className={accent ? "text-[#8C5F50] [&>svg]:h-5 [&>svg]:w-5" : "text-[#607A56] [&>svg]:h-5 [&>svg]:w-5"}>{icon}</div>
      </div>
      <p className="mt-3 font-serif text-4xl font-semibold text-[#3A3028]">{value}</p>
    </div>
  );
}

function OpportunityCard({
  item,
  now,
  onCopy,
  onUpdate,
  onConvert,
}: {
  item: Opportunity;
  now: number;
  onCopy: (text: string) => Promise<void>;
  onUpdate: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onConvert: (item: Opportunity) => Promise<void>;
}) {
  const text = messageFor(item);
  const url = whatsappUrl(item.patient_phone, text);
  const overdue = item.next_action_at && now > 0 && Date.parse(item.next_action_at) < now && !["convertido", "perdido"].includes(item.stage);

  return (
    <article className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-[#3A3028]">{item.patient_name}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-[#75675E]">
            <UserRound className="h-3.5 w-3.5" />
            {item.child_name ? `Criança: ${item.child_name}` : item.patient_phone || item.patient_email || "Contato sem detalhe"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${tempTone(item.temperature)}`}>
          {temperatureLabels[item.temperature]}
        </span>
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#5F554D]">
        {item.objective || "Pré-consulta recebida sem objetivo resumido."}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="brand-label">Etapa</span>
          <select value={item.stage} onChange={(event) => void onUpdate(item.id, { stage: event.target.value })} className="brand-input mt-1">
            {Object.entries(stageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span className="brand-label">Temperatura</span>
          <select value={item.temperature} onChange={(event) => void onUpdate(item.id, { temperature: event.target.value })} className="brand-input mt-1">
            {Object.entries(temperatureLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <label className="mt-3 block">
        <span className="brand-label">Próxima ação</span>
        <input
          type="datetime-local"
          value={toDatetimeLocal(item.next_action_at)}
          onChange={(event) => void onUpdate(item.id, { nextActionAt: fromDatetimeLocal(event.target.value) })}
          className="brand-input mt-1"
        />
      </label>
      <div className="mt-2 flex items-center gap-2 text-xs text-[#8A7B70]">
        <CalendarClock className="h-3.5 w-3.5" />
        {overdue ? "Ação atrasada" : `Próxima: ${formatDate(item.next_action_at)}`}
      </div>

      <div className="mt-4 rounded-xl bg-[#FFFDFC] p-3 text-xs leading-5 text-[#5F554D]">
        {text}
      </div>

      <label className="mt-3 block">
        <span className="brand-label">Nota interna</span>
        <textarea
          defaultValue={item.notes ?? ""}
          onBlur={(event) => {
            if (event.target.value !== (item.notes ?? "")) {
              void onUpdate(item.id, { notes: event.target.value || null });
            }
          }}
          className="brand-input mt-1 min-h-20 resize-none text-sm"
          placeholder="Resumo do contato, objeções, melhor horário, contexto familiar..."
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" onClick={() => void onUpdate(item.id, { contacted: true, stage: item.stage === "novo" ? "acolhimento" : item.stage })} className="inline-flex items-center gap-1.5 rounded-full bg-[#607A56] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#4F6847]">
            <Send className="h-3.5 w-3.5" />
            WhatsApp
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EDE1D6] px-3 py-2 text-xs font-semibold text-[#8A7B70]">
            <MessageCircle className="h-3.5 w-3.5" />
            Sem telefone
          </span>
        )}
        <button type="button" onClick={() => void onCopy(text)} className="inline-flex items-center gap-1.5 rounded-full border border-[#D9E4D3] px-3 py-2 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]">
          <Clipboard className="h-3.5 w-3.5" />
          Copiar
        </button>
        {item.stage !== "convertido" && (
          <button type="button" onClick={() => void onConvert(item)} className="inline-flex items-center gap-1.5 rounded-full border border-[#D9E4D3] px-3 py-2 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Converter
          </button>
        )}
        <Link href={`/dashboard/submissions/${item.submission_id}`} className="inline-flex items-center rounded-full border border-[#EDE1D6] px-3 py-2 text-xs font-semibold text-[#75675E] transition hover:bg-[#FFFDFC]">
          Ver pré-consulta
        </Link>
      </div>
    </article>
  );
}
