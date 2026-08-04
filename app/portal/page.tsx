"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  HeartHandshake,
  Leaf,
  LogOut,
  Mail,
  MapPin,
  Sparkles,
  Utensils,
} from "lucide-react";

type Appointment = {
  id: string;
  title: string;
  appointment_type: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  location: string | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
};

type PortalProtocol = {
  id: string;
  status: string;
  protocol_title: string | null;
  protocol_description: string | null;
  protocol_category: string | null;
  phases: Array<{
    id: string;
    title: string;
    days: string | null;
    objective: string | null;
    actions: string[];
    notes: string | null;
  }>;
};

type PortalSummary = {
  client: { id: string; name: string; email: string | null; phone: string | null };
  appointments: Appointment[];
  tasks: Task[];
  protocols: PortalProtocol[];
  payments: Array<{
    id: string;
    description: string;
    amount_cents: number;
    due_date: string | null;
    status: string;
    payment_link: string | null;
    receipt_url: string | null;
    installment_number: number | null;
    installment_total: number | null;
  }>;
  carePlan: {
    goals: string | null;
    care_plan: string | null;
    hydration: string | null;
    physical_activity: string | null;
    sleep_routine: string | null;
  } | null;
  mealPlan: {
    id: string;
    title: string;
    notes: string | null;
    version: number;
    meals: Array<{
      name: string;
      suggested_time: string | null;
      notes: string | null;
      items: Array<{ food: string; quantity: string | null; unit: string | null; notes: string | null }>;
    }>;
    substitutions: Array<{ base_food: string; option_food: string; quantity: string | null; unit: string | null; notes: string | null }>;
    supplements: Array<{ name: string; dosage: string | null; unit: string | null; instructions: string | null; notes: string | null }>;
  } | null;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data a confirmar";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDate(value: string | null) {
  if (!value) return "Sem prazo";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

export default function ClientPortalPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [data, setData] = useState<PortalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [taskUpdating, setTaskUpdating] = useState<string | null>(null);
  const [appointmentUpdating, setAppointmentUpdating] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function loadPortal() {
    setLoading(true);
    const response = await fetch("/api/portal/me", { cache: "no-store" });
    if (response.ok) {
      setData(await response.json());
    } else {
      setData(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadPortal();
  }, []);

  const pendingTasks = useMemo(
    () => data?.tasks.filter((task) => task.status === "pendente") ?? [],
    [data]
  );
  const nextAppointment = data?.appointments.find((appointment) => new Date(appointment.starts_at) >= new Date());
  const activeProtocol = data?.protocols.find((protocol) => protocol.status === "ativo");
  const mealPlan = data?.mealPlan;

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const response = await fetch("/api/portal/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.message ?? "Nao foi possivel acessar o portal.");
      setSubmitting(false);
      return;
    }
    await loadPortal();
    setSubmitting(false);
  }

  async function logout() {
    await fetch("/api/portal/logout", { method: "POST" });
    setData(null);
    setCode("");
  }

  async function updateTaskStatus(taskId: string, status: "pendente" | "concluida") {
    setTaskUpdating(taskId);
    const response = await fetch(`/api/portal/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (response.ok) await loadPortal();
    setTaskUpdating(null);
  }

  async function confirmAppointment(appointmentId: string) {
    setAppointmentUpdating(appointmentId);
    const response = await fetch(`/api/portal/appointments/${appointmentId}/confirm`, { method: "POST" });
    if (response.ok) await loadPortal();
    setAppointmentUpdating(null);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F7F0E8] flex items-center justify-center px-6">
        <div className="text-center text-[#607A56]">
          <Leaf className="mx-auto mb-3 h-8 w-8 animate-pulse" />
          <p className="text-sm font-medium">Preparando seu portal...</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#F7F0E8] text-[#3A3028]">
        <section className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-between px-6 py-8 sm:px-10 lg:px-12">
            <div className="flex items-center gap-3">
              <Image src="/brand/bruna-flores-nutri-simbolo.svg" alt="" width={44} height={58} className="h-14 w-11 object-contain" />
              <div>
                <p className="font-serif text-xl font-semibold">Bruna Flores Nutri</p>
                <p className="text-xs uppercase tracking-[0.18em] text-[#607A56]">Portal do cliente</p>
              </div>
            </div>

            <div className="my-16 max-w-xl">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#CDA28B]/40 bg-white/55 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#9B6F59]">
                <HeartHandshake className="h-4 w-4" />
                Acompanhamento com calma e clareza
              </p>
              <h1 className="font-serif text-4xl font-semibold leading-tight sm:text-5xl">
                Seu cuidado nutricional em um lugar simples de acompanhar.
              </h1>
              <p className="mt-5 text-base leading-7 text-[#75675E]">
                Acesse suas consultas, combinados, tarefas e orientacoes do acompanhamento com a Bruna.
              </p>
            </div>

            <p className="text-xs text-[#9A8B80]">
              O acesso e individual. Use o e-mail cadastrado e o codigo enviado pela nutricionista.
            </p>
          </div>

          <div className="flex items-center px-6 pb-10 sm:px-10 lg:py-10">
            <form onSubmit={handleLogin} className="w-full rounded-[28px] border border-white/80 bg-white/75 p-6 shadow-[0_24px_70px_rgba(58,48,40,0.12)] backdrop-blur md:p-8">
              <div className="mb-6">
                <h2 className="font-serif text-2xl font-semibold">Entrar no portal</h2>
                <p className="mt-2 text-sm text-[#75675E]">Informe seus dados para abrir sua area de acompanhamento.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="brand-label">E-mail</label>
                  <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="brand-input" placeholder="seunome@email.com" />
                </div>
                <div>
                  <label className="brand-label">Codigo de acesso</label>
                  <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="brand-input tracking-[0.18em]" placeholder="BF-0000-0000" />
                </div>
              </div>
              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
              <button disabled={submitting} className="brand-btn-primary mt-6 w-full justify-center">
                <Mail className="h-4 w-4" />
                {submitting ? "Entrando..." : "Acessar meu portal"}
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F0E8] text-[#3A3028]">
      <header className="border-b border-[#E8D9CA] bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Image src="/brand/bruna-flores-nutri-simbolo.svg" alt="" width={38} height={50} className="h-12 w-10 object-contain" />
            <div>
              <p className="font-serif text-lg font-semibold">Portal Bruna Flores</p>
              <p className="text-xs text-[#607A56]">Area de acompanhamento</p>
            </div>
          </div>
          <button onClick={logout} className="inline-flex items-center gap-2 rounded-full border border-[#E2CFC0] px-4 py-2 text-sm font-medium text-[#75675E] hover:bg-white">
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        <section className="mb-6 rounded-[28px] bg-[#3F4F3A] p-6 text-white shadow-[0_22px_70px_rgba(63,79,58,0.22)] md:p-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#EAD8C2]">Ola, {firstName(data.client.name)}</p>
          <div className="grid gap-6 md:grid-cols-[1.3fr_0.7fr] md:items-end">
            <div>
              <h1 className="font-serif text-3xl font-semibold md:text-4xl">Seu acompanhamento esta organizado aqui.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#F7F0E8]">
                Consulte os proximos passos combinados, veja sua agenda e acompanhe as orientacoes principais entre os atendimentos.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-white/12 p-3"><p className="text-2xl font-semibold">{pendingTasks.length}</p><p className="text-[11px] text-[#EAD8C2]">tarefas</p></div>
              <div className="rounded-2xl bg-white/12 p-3"><p className="text-2xl font-semibold">{data.protocols.length}</p><p className="text-[11px] text-[#EAD8C2]">protocolos</p></div>
              <div className="rounded-2xl bg-white/12 p-3"><p className="text-2xl font-semibold">{data.appointments.length}</p><p className="text-[11px] text-[#EAD8C2]">consultas</p></div>
            </div>
          </div>
        </section>

        {mealPlan && (
          <section className="mb-5 rounded-2xl border border-[#E6D5C5] bg-white/80 p-5">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Utensils className="h-5 w-5 text-[#607A56]" />
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#607A56]">Plano alimentar</p>
                </div>
                <h2 className="font-serif text-2xl font-semibold">{mealPlan.title}</h2>
                {mealPlan.notes && <p className="mt-2 max-w-3xl text-sm leading-6 text-[#75675E]">{mealPlan.notes}</p>}
              </div>
              <span className="rounded-full bg-[#EEF3EA] px-3 py-1 text-xs font-semibold text-[#607A56]">v{mealPlan.version}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {mealPlan.meals.map((meal) => (
                <article key={meal.name} className="rounded-xl border border-[#EFE2D6] bg-[#FBF7F1] p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="font-serif text-xl font-semibold">{meal.name}</h3>
                    {meal.suggested_time && <span className="rounded-full bg-white px-2.5 py-1 text-xs text-[#607A56]">{meal.suggested_time}</span>}
                  </div>
                  <ul className="space-y-2 text-sm text-[#75675E]">
                    {meal.items.map((item, index) => (
                      <li key={`${meal.name}-${item.food}-${index}`} className="flex justify-between gap-3 border-b border-[#EFE2D6] pb-2 last:border-b-0 last:pb-0">
                        <span>{item.food}</span>
                        <span className="shrink-0 font-semibold text-[#3A3028]">{[item.quantity, item.unit].filter(Boolean).join(" ")}</span>
                      </li>
                    ))}
                  </ul>
                  {meal.notes && <p className="mt-3 text-xs leading-5 text-[#9A8B80]">{meal.notes}</p>}
                </article>
              ))}
            </div>
            {(mealPlan.supplements.length > 0 || mealPlan.substitutions.length > 0) && (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {mealPlan.supplements.length > 0 && (
                  <div className="rounded-xl bg-[#EEF3EA] p-4">
                    <h3 className="font-serif text-lg font-semibold">Suplementos</h3>
                    <ul className="mt-3 space-y-2 text-sm text-[#607066]">
                      {mealPlan.supplements.map((item, index) => (
                        <li key={`${item.name}-${index}`}>{item.name} {[item.dosage, item.unit].filter(Boolean).join(" ")} {item.instructions ? `- ${item.instructions}` : ""}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {mealPlan.substitutions.length > 0 && (
                  <div className="rounded-xl bg-[#F7F0E8] p-4">
                    <h3 className="font-serif text-lg font-semibold">Substituições</h3>
                    <ul className="mt-3 space-y-2 text-sm text-[#75675E]">
                      {mealPlan.substitutions.slice(0, 12).map((item, index) => (
                        <li key={`${item.base_food}-${item.option_food}-${index}`}>
                          {item.base_food}: pode trocar por {item.option_food} {[item.quantity, item.unit].filter(Boolean).join(" ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-[#E6D5C5] bg-white/75 p-5">
              <div className="mb-4 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-[#607A56]" />
                <h2 className="font-serif text-xl font-semibold">Proxima consulta</h2>
              </div>
              {nextAppointment ? (
                <div>
                  <p className="text-lg font-semibold">{nextAppointment.title}</p>
                  <p className="mt-1 text-sm text-[#75675E]">{formatDateTime(nextAppointment.starts_at)}</p>
                  {nextAppointment.location && (
                    <p className="mt-3 flex items-center gap-2 text-sm text-[#607A56]">
                      <MapPin className="h-4 w-4" />
                      {nextAppointment.location}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void confirmAppointment(nextAppointment.id)}
                    disabled={appointmentUpdating === nextAppointment.id || nextAppointment.status === "confirmado"}
                    className="mt-4 rounded-full bg-[#607A56] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#4F6847] disabled:cursor-not-allowed disabled:bg-[#A9BCA1]"
                  >
                    {nextAppointment.status === "confirmado" ? "Consulta confirmada" : appointmentUpdating === nextAppointment.id ? "Confirmando..." : "Confirmar presenca"}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[#75675E]">Nenhuma consulta futura cadastrada no momento.</p>
              )}
            </div>

            <div className="rounded-2xl border border-[#E6D5C5] bg-white/75 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#C58D73]" />
                <h2 className="font-serif text-xl font-semibold">Plano de cuidado</h2>
              </div>
              {data.carePlan?.goals || data.carePlan?.care_plan ? (
                <div className="space-y-4 text-sm leading-6 text-[#75675E]">
                  {data.carePlan.goals && <p><strong className="text-[#3A3028]">Objetivos:</strong> {data.carePlan.goals}</p>}
                  {data.carePlan.care_plan && <p><strong className="text-[#3A3028]">Combinados:</strong> {data.carePlan.care_plan}</p>}
                  {data.carePlan.hydration && <p><strong className="text-[#3A3028]">Hidratacao:</strong> {data.carePlan.hydration}</p>}
                </div>
              ) : (
                <p className="text-sm text-[#75675E]">Seu plano principal aparecera aqui quando a Bruna registrar os combinados.</p>
              )}
            </div>

            <div className="rounded-2xl border border-[#E6D5C5] bg-white/75 p-5">
              <div className="mb-4 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-[#C58D73]" />
                <h2 className="font-serif text-xl font-semibold">Financeiro</h2>
              </div>
              {data.payments.length === 0 ? (
                <p className="text-sm text-[#75675E]">Nenhuma cobranca ativa no momento.</p>
              ) : (
                <div className="space-y-3">
                  {data.payments.slice(0, 4).map((payment) => (
                    <div key={payment.id} className="rounded-xl border border-[#EFE2D6] bg-[#FBF7F1] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{payment.description}</p>
                          <p className="mt-1 text-sm text-[#75675E]">
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(payment.amount_cents / 100)}
                            {payment.installment_number && payment.installment_total ? ` · parcela ${payment.installment_number}/${payment.installment_total}` : ""}
                          </p>
                          <p className="mt-1 text-xs font-medium text-[#9A8B80]">Vencimento: {formatDate(payment.due_date)}</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase text-[#607A56]">{payment.status}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {payment.payment_link && (
                          <a href={payment.payment_link} target="_blank" rel="noreferrer" className="rounded-full bg-[#607A56] px-3 py-2 text-xs font-semibold text-white">Pagar</a>
                        )}
                        {payment.receipt_url && (
                          <a href={payment.receipt_url} target="_blank" rel="noreferrer" className="rounded-full border border-[#DCC8B8] bg-white px-3 py-2 text-xs font-semibold text-[#607A56]">Recibo</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-[#E6D5C5] bg-white/75 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-[#607A56]" />
                  <h2 className="font-serif text-xl font-semibold">Tarefas e orientacoes</h2>
                </div>
                <span className="rounded-full bg-[#EEF3EA] px-3 py-1 text-xs font-semibold text-[#607A56]">{pendingTasks.length} pendente(s)</span>
              </div>
              {data.tasks.length === 0 ? (
                <p className="text-sm text-[#75675E]">Nenhuma tarefa cadastrada ainda.</p>
              ) : (
                <div className="space-y-3">
                  {data.tasks.slice(0, 8).map((task) => (
                    <div key={task.id} className="rounded-xl border border-[#EFE2D6] bg-[#FBF7F1] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                        <CheckCircle2 className={`mt-0.5 h-5 w-5 ${task.status === "concluida" ? "text-[#607A56]" : "text-[#C58D73]"}`} />
                        <div>
                          <p className="font-semibold">{task.title}</p>
                          {task.description && <p className="mt-1 text-sm leading-6 text-[#75675E]">{task.description}</p>}
                          <p className="mt-2 text-xs font-medium text-[#9A8B80]">Prazo: {formatDate(task.due_date)}</p>
                        </div>
                        </div>
                        <button
                          onClick={() => updateTaskStatus(task.id, task.status === "concluida" ? "pendente" : "concluida")}
                          disabled={taskUpdating === task.id}
                          className="shrink-0 rounded-full border border-[#DCC8B8] bg-white px-3 py-1.5 text-xs font-semibold text-[#607A56] hover:bg-[#EEF3EA] disabled:opacity-60"
                        >
                          {taskUpdating === task.id ? "Salvando" : task.status === "concluida" ? "Reabrir" : "Concluir"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {activeProtocol && (
          <section className="mt-5 rounded-2xl border border-[#E6D5C5] bg-white/75 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Leaf className="h-5 w-5 text-[#607A56]" />
              <h2 className="font-serif text-xl font-semibold">{activeProtocol.protocol_title ?? "Protocolo ativo"}</h2>
            </div>
            {activeProtocol.protocol_description && <p className="mb-5 text-sm leading-6 text-[#75675E]">{activeProtocol.protocol_description}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              {activeProtocol.phases.slice(0, 4).map((phase) => (
                <div key={phase.id} className="rounded-xl bg-[#FBF7F1] p-4">
                  <p className="font-semibold">{phase.title}</p>
                  {phase.objective && <p className="mt-1 text-sm text-[#75675E]">{phase.objective}</p>}
                  {phase.actions.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-[#75675E]">
                      {phase.actions.slice(0, 4).map((action) => <li key={action}>- {action}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
