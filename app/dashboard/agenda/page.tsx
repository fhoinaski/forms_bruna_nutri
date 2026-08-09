"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Clock,
  MapPin,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  Video,
  XCircle,
} from "lucide-react";
import { addDays, format, isValid, parseISO } from "date-fns";

type AppointmentStatus = "agendado" | "confirmado" | "realizado" | "cancelado";
type AppointmentType = "primeira_consulta" | "consulta" | "retorno" | "avaliacao" | "online" | "outro";
type WorkflowStatus = "pendente" | "enviado" | "dispensado";
type WorkflowStep = "confirmacao" | "lembrete_24h" | "preparo" | "pos_consulta";
type StatusFilter = AppointmentStatus | "todos";

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface Appointment {
  id: string;
  client_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  title: string;
  appointment_type: AppointmentType;
  starts_at: string;
  ends_at: string | null;
  status: AppointmentStatus;
  location: string | null;
  notes: string | null;
  portal_visible: number;
  client_confirmed_at: string | null;
  cancellation_reason: string | null;
}

interface WorkflowItem {
  id: string;
  appointment_id: string;
  step_type: WorkflowStep;
  due_at: string;
  status: WorkflowStatus;
  message: string;
  appointment_title: string;
  starts_at: string;
  client_name: string | null;
  client_phone: string | null;
}

interface FormState {
  client_id: string;
  title: string;
  appointment_type: AppointmentType;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  location: string;
  notes: string;
  portal_visible: boolean;
  cancellation_reason: string;
}

const statusLabels: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

const typeLabels: Record<AppointmentType, string> = {
  primeira_consulta: "Primeira consulta",
  consulta: "Consulta",
  retorno: "Retorno",
  avaliacao: "Avaliacao",
  online: "Online",
  outro: "Outro",
};

const workflowLabels: Record<WorkflowStep, string> = {
  confirmacao: "Confirmacao",
  lembrete_24h: "Lembrete 24h",
  preparo: "Preparo",
  pos_consulta: "Pos-consulta",
};

const firstAppointmentPreparationChecklist = [
  "Ficha de anamnese pronta, impressa ou digital",
  "Balanca e fita metrica calibradas",
  "Ambiente organizado e sem interrupcoes",
  "Revisao das informacoes ja enviadas pela paciente",
];

const firstAppointmentClosingChecklist = [
  "Resumir em voz alta os pontos combinados",
  "Confirmar que a paciente entendeu o plano",
  "Definir data e formato do proximo contato",
  "Explicar como proceder em caso de duvidas antes do retorno",
];

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "agendado", label: "Agendados" },
  { value: "confirmado", label: "Confirmados" },
  { value: "realizado", label: "Realizados" },
  { value: "cancelado", label: "Cancelados" },
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function inputDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayInputDate() {
  return inputDate(new Date());
}

function nextHourInput() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  return `${inputDate(now)}T${pad(now.getHours())}:00`;
}

function toIso(value: string) {
  return new Date(value).toISOString();
}

function dayRange(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59`);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

function formatTime(value: string | null) {
  if (!value) return "--:--";
  try {
    const date = parseISO(value);
    return isValid(date) ? format(date, "HH:mm") : "--:--";
  } catch {
    return "--:--";
  }
}

function formatDate(value: string | null, fallback = "--") {
  if (!value) return fallback;
  try {
    const date = parseISO(value);
    return isValid(date) ? format(date, "dd/MM/yyyy") : fallback;
  } catch {
    return fallback;
  }
}

function formatReadableDay(value: string) {
  try {
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    }).format(date);
  } catch {
    return value;
  }
}

function statusTone(status: AppointmentStatus) {
  if (status === "confirmado") return "border-[#C7D7BC] bg-[#EAF0E4] text-[#607A56]";
  if (status === "realizado") return "border-[#C8DFDA] bg-[#EEF5F3] text-[#4F7B73]";
  if (status === "cancelado") return "border-[#E8C3BA] bg-[#F6E6E0] text-[#9A5C4E]";
  return "border-[#EDE1D6] bg-[#FBF7F1] text-[#75675E]";
}

function workflowTone(status: WorkflowStatus) {
  if (status === "enviado") return "border-[#C7D7BC] bg-[#EAF0E4] text-[#4F6847]";
  if (status === "dispensado") return "border-[#E8C3BA] bg-[#F6E6E0] text-[#9A5C4E]";
  return "border-[#EDE1D6] bg-[#FFFDFC] text-[#75675E]";
}

function whatsappUrl(phone: string | null, message: string) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function getInitials(name: string | null) {
  if (!name) return "P";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function moveDate(value: string, amount: number) {
  return inputDate(addDays(new Date(`${value}T00:00:00`), amount));
}

export default function AgendaPage() {
  const [selectedDate, setSelectedDate] = useState(todayInputDate());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<FormState>({
    client_id: "",
    title: "",
    appointment_type: "consulta",
    starts_at: nextHourInput(),
    ends_at: "",
    status: "agendado",
    location: "",
    notes: "",
    portal_visible: true,
    cancellation_reason: "",
  });

  const sortedAppointments = useMemo(
    () =>
      [...appointments].sort(
        (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      ),
    [appointments]
  );

  const visibleAppointments = useMemo(
    () =>
      statusFilter === "todos"
        ? sortedAppointments
        : sortedAppointments.filter((item) => item.status === statusFilter),
    [sortedAppointments, statusFilter]
  );

  const pendingWorkflows = useMemo(
    () => workflows.filter((item) => item.status === "pendente"),
    [workflows]
  );

  const stats = useMemo(
    () => ({
      total: sortedAppointments.filter((item) => item.status !== "cancelado").length,
      confirmado: sortedAppointments.filter((item) => item.status === "confirmado").length,
      realizado: sortedAppointments.filter((item) => item.status === "realizado").length,
      pendencias: pendingWorkflows.length,
    }),
    [sortedAppointments, pendingWorkflows.length]
  );

  async function loadAgenda() {
    setLoading(true);
    setMessage("");
    try {
      const range = dayRange(selectedDate);
      const appointmentsParams = new URLSearchParams(range);
      const workflowsParams = new URLSearchParams({
        appointmentFrom: range.from,
        appointmentTo: range.to,
        channel: "whatsapp",
      });
      const [appointmentsRes, workflowRes, clientsRes] = await Promise.all([
        fetch(`/api/admin/appointments?${appointmentsParams}`, { cache: "no-store" }),
        fetch(`/api/admin/appointment-workflows?${workflowsParams}`, { cache: "no-store" }),
        fetch("/api/admin/clients?pageSize=100&status=ativo", { cache: "no-store" }),
      ]);

      if (!appointmentsRes.ok || !workflowRes.ok || !clientsRes.ok) {
        throw new Error("Nao foi possivel carregar a agenda.");
      }

      const appointmentsJson: { items: Appointment[] } = await appointmentsRes.json();
      const workflowJson: { items: WorkflowItem[] } = await workflowRes.json();
      const clientsJson: { items: Client[] } = await clientsRes.json();
      setAppointments(appointmentsJson.items);
      setWorkflows(workflowJson.items);
      setClients(clientsJson.items);
    } catch {
      setMessage("Nao foi possivel carregar a agenda agora.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAgenda();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function createNewAppointment(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const startsAt = toIso(form.starts_at);
      const endsAt = form.ends_at ? toIso(form.ends_at) : null;
      if (endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
        setMessage("O horario final precisa ser depois do inicio.");
        return;
      }

      const payload = {
        client_id: form.client_id || null,
        title: form.title,
        appointment_type: form.appointment_type,
        starts_at: startsAt,
        ends_at: endsAt,
        status: form.status,
        location: form.location || null,
        notes: form.notes || null,
        portal_visible: form.portal_visible ? 1 : 0,
        cancellation_reason: form.cancellation_reason || null,
      };

      const response = await fetch("/api/admin/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Erro ao salvar");

      setForm((current) => ({
        ...current,
        title: "",
        ends_at: "",
        location: "",
        notes: "",
        portal_visible: true,
        cancellation_reason: "",
      }));
      setMessage("Consulta adicionada com roteiro de acompanhamento.");
      await loadAgenda();
    } catch {
      setMessage("Nao foi possivel salvar a consulta.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: AppointmentStatus) {
    setAppointments((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item))
    );
    const response = await fetch(`/api/admin/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setMessage("Nao foi possivel atualizar o status.");
      await loadAgenda();
    }
  }

  async function removeAppointment(id: string) {
    const response = await fetch(`/api/admin/appointments/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setMessage("Nao foi possivel remover o horario.");
      return;
    }
    setAppointments((current) => current.filter((item) => item.id !== id));
    setWorkflows((current) => current.filter((item) => item.appointment_id !== id));
  }

  async function generateWorkflow(appointmentId: string) {
    const response = await fetch("/api/admin/appointment-workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId }),
    });
    setMessage(response.ok ? "Roteiro de acompanhamento preparado." : "Nao foi possivel preparar o roteiro.");
    await loadAgenda();
  }

  async function updateWorkflowStatus(id: string, status: WorkflowStatus) {
    setWorkflows((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item))
    );
    const response = await fetch(`/api/admin/appointment-workflows/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setMessage("Nao foi possivel atualizar a acao.");
      await loadAgenda();
    }
  }

  async function copyMessage(text: string) {
    await navigator.clipboard.writeText(text);
    setMessage("Mensagem copiada.");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="overflow-hidden rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-6 sm:p-7">
            <p className="brand-kicker mb-3">Agenda clinica</p>
            <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028] sm:text-5xl">
              Rotina de atendimentos
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Visualize o dia, confirme consultas, prepare mensagens e mantenha
              cada retorno conectado ao cuidado da paciente.
            </p>
            <Link
              href="/dashboard/agenda/disponibilidade"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#D9E4D3] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] transition hover:bg-[#EAF0E4]"
            >
              <CalendarDays className="h-4 w-4" />
              Disponibilidade
            </Link>
            <div className="mt-6 flex flex-wrap gap-2">
              {statusFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setStatusFilter(item.value)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                    statusFilter === item.value
                      ? "border-[#7F9A74] bg-[#EAF0E4] text-[#607A56]"
                      : "border-[#EDE1D6] bg-[#FBF7F1] text-[#75675E] hover:bg-[#F5FAF0]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <aside className="border-t border-[#EDE1D6] bg-[#FBF7F1] p-6 lg:border-l lg:border-t-0">
            <p className="brand-kicker mb-3">Dia selecionado</p>
            <div className="rounded-2xl bg-[#FFFDFC] p-4">
              <p className="font-serif text-2xl font-semibold capitalize text-[#3A3028]">
                {formatReadableDay(selectedDate)}
              </p>
              <div className="mt-4 grid grid-cols-[44px_1fr_44px] gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDate((current) => moveDate(current, -1))}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[#EDE1D6] text-[#75675E] transition hover:bg-[#FBF7F1]"
                  aria-label="Dia anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="brand-input text-center"
                />
                <button
                  type="button"
                  onClick={() => setSelectedDate((current) => moveDate(current, 1))}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[#EDE1D6] text-[#75675E] transition hover:bg-[#FBF7F1]"
                  aria-label="Proximo dia"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayInputDate())}
                  className="rounded-full border border-[#7F9A74]/35 px-4 py-2 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => void loadAgenda()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#EDE1D6] px-4 py-2 text-xs font-semibold text-[#75675E] transition hover:bg-[#FBF7F1]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Atualizar
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={<CalendarDays />} label="No dia" value={stats.total} hint="consultas ativas" />
        <Metric icon={<CheckCircle2 />} label="Confirmados" value={stats.confirmado} hint="presenca alinhada" />
        <Metric icon={<Clock />} label="Realizados" value={stats.realizado} hint="finalizados" />
        <Metric icon={<MessageCircle />} label="Acoes pendentes" value={stats.pendencias} hint="mensagens a conduzir" />
      </div>

      {message && (
        <div className="rounded-2xl border border-[#EDE1D6] bg-[#FFFDFC] px-5 py-3 text-sm text-[#75675E] shadow-[0_12px_32px_rgba(58,48,40,0.04)]">
          {message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(380px,0.88fr)]">
        <SchedulePanel
          loading={loading}
          appointments={visibleAppointments}
          workflows={workflows}
          onGenerateWorkflow={generateWorkflow}
          onRemove={removeAppointment}
          onStatusChange={updateStatus}
        />

        <div className="space-y-6">
          <NewAppointmentForm
            form={form}
            clients={clients}
            saving={saving}
            onSubmit={createNewAppointment}
            onChange={updateForm}
          />
          <WorkflowPanel
            workflows={workflows}
            onCopy={copyMessage}
            onStatusChange={updateWorkflowStatus}
          />
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: number; hint: string }) {
  return (
    <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
      <div className="flex items-center justify-between">
        <p className="brand-kicker">{label}</p>
        <div className="text-[#607A56] [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
      </div>
      <p className="mt-3 font-serif text-4xl font-semibold text-[#3A3028]">{value}</p>
      <p className="mt-1 text-xs text-[#A9978A]">{hint}</p>
    </div>
  );
}

function SchedulePanel({
  loading,
  appointments,
  workflows,
  onGenerateWorkflow,
  onRemove,
  onStatusChange,
}: {
  loading: boolean;
  appointments: Appointment[];
  workflows: WorkflowItem[];
  onGenerateWorkflow: (appointmentId: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onStatusChange: (id: string, status: AppointmentStatus) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
      <div className="border-b border-[#EDE1D6] px-5 py-5 sm:px-6">
        <p className="brand-kicker mb-2">Linha do tempo</p>
        <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
          Horarios do dia
        </h2>
        <p className="mt-1 text-sm text-[#75675E]">
          Clique nas acoes para atualizar status, preparar roteiro ou remover um horario.
        </p>
      </div>

      <div className="divide-y divide-[#F5ECE4]">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-[#A9978A]">
            Carregando agenda...
          </div>
        ) : appointments.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <CalendarDays className="mx-auto mb-4 h-9 w-9 text-[#C4B3A6]" />
            <p className="font-serif text-xl font-semibold text-[#3A3028]">
              Nenhum horario para este filtro
            </p>
            <p className="mt-2 text-sm text-[#75675E]">
              Ajuste o status ou crie um atendimento no painel ao lado.
            </p>
          </div>
        ) : (
          appointments.map((item) => {
            const itemWorkflowCount = workflows.filter((workflow) => workflow.appointment_id === item.id).length;
            return (
              <article
                key={item.id}
                className="grid gap-4 px-5 py-5 transition hover:bg-[#FBF7F1]/75 sm:px-6 lg:grid-cols-[90px_minmax(0,1fr)_190px]"
              >
                <div className="flex items-start gap-3 lg:block">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EAF0E4] font-serif text-base font-semibold text-[#607A56] lg:hidden">
                    {getInitials(item.client_name)}
                  </span>
                  <div>
                    <p className="font-serif text-3xl font-semibold leading-none text-[#3A3028]">
                      {formatTime(item.starts_at)}
                    </p>
                    {item.ends_at && (
                      <p className="mt-1 text-xs text-[#A9978A]">ate {formatTime(item.ends_at)}</p>
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-semibold text-[#3A3028]">{item.title}</h3>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusTone(item.status)}`}>
                      {statusLabels[item.status]}
                    </span>
                    <span className="rounded-full border border-[#EDE1D6] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A7B70]">
                      {itemWorkflowCount} acoes
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#75675E]">
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="h-3.5 w-3.5 text-[#A9978A]" />
                      {item.client_name || "Paciente sem vinculo"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      {item.appointment_type === "online" ? (
                        <Video className="h-3.5 w-3.5 text-[#A9978A]" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-[#A9978A]" />
                      )}
                      {typeLabels[item.appointment_type]}
                    </span>
                    {item.location && (
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-[#A9978A]" />
                        <span className="break-words">{item.location}</span>
                      </span>
                    )}
                  </div>
                  {item.notes && (
                    <p className="mt-3 rounded-xl bg-[#FBF7F1] px-3 py-2 text-xs leading-5 text-[#75675E]">
                      {item.notes}
                    </p>
                  )}
                  {item.appointment_type === "primeira_consulta" && (
                    <details className="mt-3 rounded-xl border border-[#D9E4D3] bg-[#F5FAF0] p-3">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-[#607A56]">
                        <CheckSquare className="h-4 w-4" />
                        Checklist da primeira consulta
                      </summary>
                      <div className="mt-3 grid gap-3 text-xs leading-5 text-[#607066] sm:grid-cols-2">
                        <div>
                          <p className="mb-2 font-bold uppercase tracking-[0.12em] text-[#607A56]">Antes</p>
                          <ul className="space-y-1.5">
                            {firstAppointmentPreparationChecklist.map((label) => (
                              <li key={label} className="flex gap-2">
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7F9A74]" />
                                <span>{label}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="mb-2 font-bold uppercase tracking-[0.12em] text-[#8C5F50]">Depois</p>
                          <ul className="space-y-1.5">
                            {firstAppointmentClosingChecklist.map((label) => (
                              <li key={label} className="flex gap-2">
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C58D73]" />
                                <span>{label}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </details>
                  )}
                  {itemWorkflowCount === 0 && (
                    <button
                      type="button"
                      onClick={() => void onGenerateWorkflow(item.id)}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#607A56] transition hover:text-[#8C5F50]"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Preparar roteiro
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-[1fr_44px] items-start gap-2 lg:flex lg:justify-end">
                  <select
                    value={item.status}
                    onChange={(event) =>
                      void onStatusChange(item.id, event.target.value as AppointmentStatus)
                    }
                    className="h-11 rounded-full border border-[#EDE1D6] bg-white px-3 text-xs font-semibold text-[#75675E] outline-none transition focus:border-[#7F9A74] focus:ring-2 focus:ring-[#7F9A74]/15"
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void onRemove(item.id)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#E8C3BA] text-[#9A5C4E] transition hover:bg-[#F6E6E0]"
                    aria-label="Remover horario"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function WorkflowPanel({
  workflows,
  onCopy,
  onStatusChange,
}: {
  workflows: WorkflowItem[];
  onCopy: (text: string) => Promise<void>;
  onStatusChange: (id: string, status: WorkflowStatus) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
      <div className="border-b border-[#EDE1D6] px-5 py-5 sm:px-6">
        <p className="brand-kicker mb-2">Central de cuidado</p>
        <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
          Acoes de acompanhamento
        </h2>
      </div>
      <div className="max-h-[560px] divide-y divide-[#F5ECE4] overflow-y-auto">
        {workflows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <MessageCircle className="mx-auto mb-4 h-9 w-9 text-[#C4B3A6]" />
            <p className="font-serif text-xl font-semibold">Nenhuma acao preparada</p>
            <p className="mt-2 text-sm text-[#75675E]">
              Ao criar uma consulta, o roteiro aparece aqui.
            </p>
          </div>
        ) : (
          workflows.map((item) => {
            const url = whatsappUrl(item.client_phone, item.message);
            return (
              <article key={item.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${workflowTone(item.status)}`}>
                        {item.status}
                      </span>
                      <span className="rounded-full bg-[#FBF7F1] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A7B70]">
                        {workflowLabels[item.step_type]}
                      </span>
                    </div>
                    <h3 className="mt-3 font-semibold text-[#3A3028]">
                      {item.client_name || "Paciente sem vinculo"}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-[#8A7B70]">
                      {item.appointment_title} as {formatTime(item.starts_at)} · acao em {formatDate(item.due_at)} {formatTime(item.due_at)}
                    </p>
                  </div>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center gap-2 rounded-full bg-[#607A56] px-4 text-xs font-semibold text-white transition hover:bg-[#4F6847]"
                    >
                      <Send className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  ) : (
                    <span className="rounded-full border border-[#EDE1D6] px-3 py-2 text-xs text-[#A9978A]">
                      Sem telefone
                    </span>
                  )}
                </div>
                <p className="mt-4 rounded-xl bg-[#FBF7F1] p-4 text-sm leading-6 text-[#5F554D]">
                  {item.message}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void onCopy(item.message)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#D9E4D3] px-3 py-2 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]"
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                    Copiar
                  </button>
                  {item.status === "pendente" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void onStatusChange(item.id, "enviado")}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#D9E4D3] px-3 py-2 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Enviado
                      </button>
                      <button
                        type="button"
                        onClick={() => void onStatusChange(item.id, "dispensado")}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#E8C3BA] px-3 py-2 text-xs font-semibold text-[#9A5C4E] transition hover:bg-[#F6E6E0]"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Dispensar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onStatusChange(item.id, "pendente")}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#EDE1D6] px-3 py-2 text-xs font-semibold text-[#75675E] transition hover:bg-[#FBF7F1]"
                    >
                      Reabrir
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function NewAppointmentForm({
  form,
  clients,
  saving,
  onSubmit,
  onChange,
}: {
  form: FormState;
  clients: Client[];
  saving: boolean;
  onSubmit: (event: React.FormEvent) => Promise<void>;
  onChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  return (
    <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)] sm:p-6">
      <div className="mb-5">
        <p className="brand-kicker mb-2">Novo horario</p>
        <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
          Agendar atendimento
        </h2>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="brand-label">Paciente</label>
          <select
            value={form.client_id}
            onChange={(event) => onChange("client_id", event.target.value)}
            className="brand-input"
          >
            <option value="">Sem vinculo por enquanto</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="brand-label">Titulo</label>
          <input
            value={form.title}
            onChange={(event) => onChange("title", event.target.value)}
            className="brand-input"
            placeholder="Ex: Primeira consulta, retorno mensal..."
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="brand-label">Tipo</label>
            <select
              value={form.appointment_type}
              onChange={(event) => onChange("appointment_type", event.target.value as AppointmentType)}
              className="brand-input"
            >
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="brand-label">Status</label>
            <select
              value={form.status}
              onChange={(event) => onChange("status", event.target.value as AppointmentStatus)}
              className="brand-input"
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="brand-label">Inicio</label>
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={(event) => onChange("starts_at", event.target.value)}
              className="brand-input"
              required
            />
          </div>
          <div>
            <label className="brand-label">Fim</label>
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={(event) => onChange("ends_at", event.target.value)}
              className="brand-input"
            />
          </div>
        </div>

        <div>
          <label className="brand-label">Local ou link</label>
          <input
            value={form.location}
            onChange={(event) => onChange("location", event.target.value)}
            className="brand-input"
            placeholder="Consultorio, videochamada ou endereco"
          />
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-sm text-[#75675E]">
          <input
            type="checkbox"
            checked={form.portal_visible}
            onChange={(event) => onChange("portal_visible", event.target.checked)}
            className="mt-1 h-4 w-4 accent-[#7F9A74]"
          />
          <span>
            <strong className="block text-[#3A3028]">Mostrar no portal do cliente</strong>
            A cliente podera ver e confirmar esta consulta no portal.
          </span>
        </label>

        {form.status === "cancelado" && (
          <div>
            <label className="brand-label">Motivo do cancelamento</label>
            <input
              value={form.cancellation_reason}
              onChange={(event) => onChange("cancellation_reason", event.target.value)}
              className="brand-input"
              placeholder="Ex: remarcado pela familia, conflito de agenda..."
            />
          </div>
        )}

        <div>
          <label className="brand-label">Observacoes internas</label>
          <textarea
            value={form.notes}
            onChange={(event) => onChange("notes", event.target.value)}
            className="brand-input min-h-28 resize-none"
            placeholder="Pontos para preparar antes da consulta."
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="brand-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {saving ? "Salvando..." : "Adicionar a agenda"}
        </button>

        <Link
          href="/dashboard/clients"
          className="inline-flex w-full justify-center rounded-full border border-[#7F9A74]/35 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] transition hover:bg-[#EAF0E4]"
        >
          Ver clientes
        </Link>
      </form>
    </section>
  );
}
