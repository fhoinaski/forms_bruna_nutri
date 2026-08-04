"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
  Video,
} from "lucide-react";
import { format, isValid, parseISO } from "date-fns";

type AppointmentStatus = "agendado" | "confirmado" | "realizado" | "cancelado";
type AppointmentType = "consulta" | "retorno" | "avaliacao" | "online" | "outro";

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
  title: string;
  appointment_type: AppointmentType;
  starts_at: string;
  ends_at: string | null;
  status: AppointmentStatus;
  location: string | null;
  notes: string | null;
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
}

const statusLabels: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

const typeLabels: Record<AppointmentType, string> = {
  consulta: "Consulta",
  retorno: "Retorno",
  avaliacao: "Avaliacao",
  online: "Online",
  outro: "Outro",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function todayInputDate() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function nextHourInput() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  return `${todayInputDate()}T${pad(now.getHours())}:00`;
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

function formatTime(value: string) {
  try {
    const date = parseISO(value);
    return isValid(date) ? format(date, "HH:mm") : "--:--";
  } catch {
    return "--:--";
  }
}

function formatFullDate(value: string) {
  try {
    const date = parseISO(value);
    return isValid(date) ? format(date, "dd/MM/yyyy") : "--";
  } catch {
    return "--";
  }
}

function statusTone(status: AppointmentStatus) {
  if (status === "confirmado") return "bg-[#EAF0E4] text-[#607A56] border-[#C7D7BC]";
  if (status === "realizado") return "bg-[#EEF5F3] text-[#4F7B73] border-[#C8DFDA]";
  if (status === "cancelado") return "bg-[#F6E6E0] text-[#9A5C4E] border-[#E8C3BA]";
  return "bg-[#FBF7F1] text-[#75675E] border-[#EDE1D6]";
}

export default function AgendaPage() {
  const [selectedDate, setSelectedDate] = useState(todayInputDate());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
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
  });

  const visibleAppointments = useMemo(
    () =>
      [...appointments].sort(
        (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      ),
    [appointments]
  );

  async function loadAgenda() {
    setLoading(true);
    setMessage("");
    try {
      const range = dayRange(selectedDate);
      const params = new URLSearchParams(range);
      const [appointmentsRes, clientsRes] = await Promise.all([
        fetch(`/api/admin/appointments?${params}`),
        fetch("/api/admin/clients?pageSize=100&status=ativo"),
      ]);

      if (!appointmentsRes.ok || !clientsRes.ok) {
        throw new Error("Nao foi possivel carregar a agenda.");
      }

      const appointmentsJson: { items: Appointment[] } = await appointmentsRes.json();
      const clientsJson: { items: Client[] } = await clientsRes.json();
      setAppointments(appointmentsJson.items);
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
      }));
      setMessage("Consulta adicionada a agenda.");
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
  }

  const todayCount = visibleAppointments.filter((item) => item.status !== "cancelado").length;
  const confirmedCount = visibleAppointments.filter((item) => item.status === "confirmado").length;
  const doneCount = visibleAppointments.filter((item) => item.status === "realizado").length;

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="brand-kicker mb-3">Agenda clinica</p>
            <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028]">
              Rotina de atendimentos
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Cadastre consultas, retornos, avaliacoes e encontros online em uma
              visao simples para conduzir o cuidado diario com clareza.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="brand-label">Dia</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="brand-input min-w-[170px]"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadAgenda()}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-full border border-[#7F9A74]/35 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] transition hover:bg-[#EAF0E4]"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
          <div className="flex items-center justify-between">
            <p className="brand-kicker">No dia</p>
            <CalendarDays className="h-5 w-5 text-[#607A56]" />
          </div>
          <p className="mt-3 font-serif text-4xl font-semibold text-[#3A3028]">{todayCount}</p>
          <p className="mt-1 text-xs text-[#A9978A]">horarios ativos em {formatFullDate(`${selectedDate}T00:00:00`)}</p>
        </div>
        <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
          <div className="flex items-center justify-between">
            <p className="brand-kicker">Confirmados</p>
            <CheckCircle2 className="h-5 w-5 text-[#607A56]" />
          </div>
          <p className="mt-3 font-serif text-4xl font-semibold text-[#3A3028]">{confirmedCount}</p>
          <p className="mt-1 text-xs text-[#A9978A]">pacientes com presenca alinhada</p>
        </div>
        <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
          <div className="flex items-center justify-between">
            <p className="brand-kicker">Realizados</p>
            <Clock className="h-5 w-5 text-[#607A56]" />
          </div>
          <p className="mt-3 font-serif text-4xl font-semibold text-[#3A3028]">{doneCount}</p>
          <p className="mt-1 text-xs text-[#A9978A]">atendimentos finalizados</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
          <div className="border-b border-[#EDE1D6] px-6 py-5">
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
              Horarios do dia
            </h2>
            <p className="mt-1 text-sm text-[#75675E]">
              Acompanhamento rapido do fluxo de atendimento.
            </p>
          </div>

          <div className="divide-y divide-[#F5ECE4]">
            {loading ? (
              <div className="px-6 py-16 text-center text-sm text-[#A9978A]">
                Carregando agenda...
              </div>
            ) : visibleAppointments.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <CalendarDays className="mx-auto mb-4 h-9 w-9 text-[#C4B3A6]" />
                <p className="font-serif text-xl font-semibold text-[#3A3028]">
                  Nenhum horario cadastrado
                </p>
                <p className="mt-2 text-sm text-[#75675E]">
                  Use o formulario ao lado para organizar o primeiro atendimento do dia.
                </p>
              </div>
            ) : (
              visibleAppointments.map((item) => (
                <article
                  key={item.id}
                  className="grid gap-4 px-6 py-5 transition hover:bg-[#FBF7F1]/75 md:grid-cols-[88px_minmax(0,1fr)_190px]"
                >
                  <div>
                    <p className="font-serif text-3xl font-semibold leading-none text-[#3A3028]">
                      {formatTime(item.starts_at)}
                    </p>
                    {item.ends_at && (
                      <p className="mt-1 text-xs text-[#A9978A]">ate {formatTime(item.ends_at)}</p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-[#3A3028]">{item.title}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusTone(item.status)}`}>
                        {statusLabels[item.status]}
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
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-[#A9978A]" />
                          {item.location}
                        </span>
                      )}
                    </div>
                    {item.notes && (
                      <p className="mt-3 rounded-xl bg-[#FBF7F1] px-3 py-2 text-xs leading-5 text-[#75675E]">
                        {item.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-start gap-2 md:justify-end">
                    <select
                      value={item.status}
                      onChange={(event) =>
                        void updateStatus(item.id, event.target.value as AppointmentStatus)
                      }
                      className="h-10 rounded-full border border-[#EDE1D6] bg-white px-3 text-xs font-semibold text-[#75675E] outline-none transition focus:border-[#7F9A74] focus:ring-2 focus:ring-[#7F9A74]/15"
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void removeAppointment(item.id)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E8C3BA] text-[#9A5C4E] transition hover:bg-[#F6E6E0]"
                      aria-label="Remover horario"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
          <div className="mb-5">
            <p className="brand-kicker mb-2">Novo horario</p>
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
              Agendar atendimento
            </h2>
          </div>

          <form onSubmit={createNewAppointment} className="space-y-4">
            <div>
              <label className="brand-label">Paciente</label>
              <select
                value={form.client_id}
                onChange={(event) => updateForm("client_id", event.target.value)}
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
                onChange={(event) => updateForm("title", event.target.value)}
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
                  onChange={(event) =>
                    updateForm("appointment_type", event.target.value as AppointmentType)
                  }
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
                  onChange={(event) => updateForm("status", event.target.value as AppointmentStatus)}
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
                  onChange={(event) => updateForm("starts_at", event.target.value)}
                  className="brand-input"
                  required
                />
              </div>
              <div>
                <label className="brand-label">Fim</label>
                <input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(event) => updateForm("ends_at", event.target.value)}
                  className="brand-input"
                />
              </div>
            </div>

            <div>
              <label className="brand-label">Local ou link</label>
              <input
                value={form.location}
                onChange={(event) => updateForm("location", event.target.value)}
                className="brand-input"
                placeholder="Consultorio, videochamada ou endereco"
              />
            </div>

            <div>
              <label className="brand-label">Observacoes internas</label>
              <textarea
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                className="brand-input min-h-28 resize-none"
                placeholder="Pontos para preparar antes da consulta."
              />
            </div>

            {message && (
              <p className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-3 py-2 text-xs text-[#75675E]">
                {message}
              </p>
            )}

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
      </div>
    </div>
  );
}
