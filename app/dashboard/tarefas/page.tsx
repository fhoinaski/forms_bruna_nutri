"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  CheckSquare,
  ClipboardList,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  X,
} from "lucide-react";

type TaskStatus = "pendente" | "concluida" | "cancelada";

interface Client {
  id: string;
  name: string;
  phone: string | null;
}

interface Task {
  id: string;
  client_id: string;
  client_name: string | null;
  client_phone: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
}

interface FormState {
  client_id: string;
  title: string;
  description: string;
  due_date: string;
}

const statusLabels: Record<TaskStatus, string> = {
  pendente: "Pendente",
  concluida: "Concluida",
  cancelada: "Cancelada",
};

function isOverdue(task: Task) {
  if (task.status !== "pendente" || !task.due_date) return false;
  return task.due_date < new Date().toISOString().slice(0, 10);
}

function statusTone(task: Task) {
  if (task.status === "concluida") return "bg-[#EAF0E4] text-[#607A56] border-[#C7D7BC]";
  if (task.status === "cancelada") return "bg-[#F3EEE9] text-[#8D8178] border-[#E1D6CD]";
  if (isOverdue(task)) return "bg-[#F6E6E0] text-[#9A5C4E] border-[#E8C3BA]";
  return "bg-[#FFF8E8] text-[#9A6B28] border-[#F3DFA8]";
}

export default function TarefasPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<FormState>({
    client_id: "",
    title: "",
    description: "",
    due_date: "",
  });

  const summary = useMemo(() => {
    return tasks.reduce(
      (acc, task) => {
        if (task.status === "pendente") acc.pending++;
        if (task.status === "concluida") acc.done++;
        if (isOverdue(task)) acc.overdue++;
        return acc;
      },
      { pending: 0, overdue: 0, done: 0 }
    );
  }, [tasks]);

  async function loadTasks() {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(search ? { search } : {}),
      });
      const [tasksRes, clientsRes] = await Promise.all([
        fetch(`/api/admin/client-tasks?${params}`),
        fetch("/api/admin/clients?pageSize=100&status=ativo"),
      ]);
      if (!tasksRes.ok || !clientsRes.ok) throw new Error();

      const tasksJson: { items: Task[] } = await tasksRes.json();
      const clientsJson: { items: Client[] } = await clientsRes.json();
      setTasks(tasksJson.items);
      setClients(clientsJson.items);
    } catch {
      setMessage("Nao foi possivel carregar as tarefas agora.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, searchTrigger]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setSearchTrigger((current) => current + 1);
  }

  async function createTask(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/client-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: form.client_id,
          title: form.title,
          description: form.description || null,
          due_date: form.due_date || null,
        }),
      });
      if (!response.ok) throw new Error();

      setForm({ client_id: "", title: "", description: "", due_date: "" });
      setMessage("Tarefa adicionada.");
      await loadTasks();
    } catch {
      setMessage("Nao foi possivel adicionar a tarefa.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: TaskStatus) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, status } : task))
    );
    const response = await fetch(`/api/admin/client-tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setMessage("Nao foi possivel atualizar a tarefa.");
      await loadTasks();
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="brand-kicker mb-3">Rotina clinica</p>
            <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028]">
              Central de tarefas
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Organize retornos, ajustes de conduta, contatos com pacientes e
              pendencias de acompanhamento em uma fila unica de trabalho.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadTasks()}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[#7F9A74]/35 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] transition hover:bg-[#EAF0E4]"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
          <div className="flex items-center justify-between">
            <p className="brand-kicker">Pendentes</p>
            <ClipboardList className="h-5 w-5 text-[#9A6B28]" />
          </div>
          <p className="mt-3 font-serif text-4xl font-semibold text-[#3A3028]">{summary.pending}</p>
          <p className="mt-1 text-xs text-[#A9978A]">tarefas aguardando cuidado</p>
        </div>
        <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
          <div className="flex items-center justify-between">
            <p className="brand-kicker">Vencidas</p>
            <AlertCircle className="h-5 w-5 text-[#9A5C4E]" />
          </div>
          <p className="mt-3 font-serif text-4xl font-semibold text-[#3A3028]">{summary.overdue}</p>
          <p className="mt-1 text-xs text-[#A9978A]">precisam de prioridade</p>
        </div>
        <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
          <div className="flex items-center justify-between">
            <p className="brand-kicker">Concluidas</p>
            <CheckSquare className="h-5 w-5 text-[#607A56]" />
          </div>
          <p className="mt-3 font-serif text-4xl font-semibold text-[#3A3028]">{summary.done}</p>
          <p className="mt-1 text-xs text-[#A9978A]">resolvidas no filtro atual</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
          <div className="border-b border-[#EDE1D6] px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
                  Fila de acompanhamento
                </h2>
                <p className="mt-1 text-sm text-[#75675E]">
                  Tudo que precisa de acao, separado do ruido dos formularios.
                </p>
              </div>
              <form onSubmit={handleSearch} className="dashboard-filter-form lg:max-w-xl">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="brand-input brand-input-with-icon"
                    placeholder="Paciente ou tarefa..."
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="brand-input"
                >
                  <option value="">Todos</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button type="submit" className="brand-btn-primary py-0">
                  Buscar
                </button>
              </form>
            </div>
          </div>

          <div className="divide-y divide-[#F5ECE4]">
            {loading ? (
              <div className="px-6 py-16 text-center text-sm text-[#A9978A]">
                Carregando tarefas...
              </div>
            ) : tasks.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <ClipboardList className="mx-auto mb-4 h-9 w-9 text-[#C4B3A6]" />
                <p className="font-serif text-xl font-semibold text-[#3A3028]">
                  Nenhuma tarefa encontrada
                </p>
                <p className="mt-2 text-sm text-[#75675E]">
                  Crie uma tarefa para acompanhar um paciente ou ajuste o filtro.
                </p>
              </div>
            ) : (
              tasks.map((task) => (
                <article
                  key={task.id}
                  className="grid gap-4 px-6 py-5 transition hover:bg-[#FBF7F1]/75 md:grid-cols-[minmax(0,1fr)_145px_128px]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-[#3A3028]">{task.title}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusTone(task)}`}>
                        {isOverdue(task) ? "Vencida" : statusLabels[task.status]}
                      </span>
                    </div>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#75675E]">
                      <UserRound className="h-3.5 w-3.5 text-[#A9978A]" />
                      {task.client_name || "Paciente sem nome"}
                      {task.client_phone ? ` - ${task.client_phone}` : ""}
                    </p>
                    {task.description && (
                      <p className="mt-3 rounded-xl bg-[#FBF7F1] px-3 py-2 text-xs leading-5 text-[#75675E]">
                        {task.description}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="brand-kicker mb-1">Prazo</p>
                    <p className="text-sm font-semibold text-[#3A3028]">
                      {task.due_date || "Sem data"}
                    </p>
                  </div>
                  <div className="flex items-start gap-2 md:justify-end">
                    {task.status !== "concluida" && (
                      <button
                        type="button"
                        onClick={() => void updateStatus(task.id, "concluida")}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#C7D7BC] text-[#607A56] transition hover:bg-[#EAF0E4]"
                        aria-label="Concluir tarefa"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    {task.status !== "cancelada" && (
                      <button
                        type="button"
                        onClick={() => void updateStatus(task.id, "cancelada")}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E8C3BA] text-[#9A5C4E] transition hover:bg-[#F6E6E0]"
                        aria-label="Cancelar tarefa"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <Link
                      href={`/dashboard/clients/${task.client_id}`}
                      className="inline-flex h-10 items-center rounded-full border border-[#7F9A74]/35 px-4 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4]"
                    >
                      Cliente
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
          <div className="mb-5">
            <p className="brand-kicker mb-2">Nova tarefa</p>
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
              Criar acompanhamento
            </h2>
          </div>

          <form onSubmit={createTask} className="space-y-4">
            <div>
              <label className="brand-label">Paciente</label>
              <select
                value={form.client_id}
                onChange={(event) => updateForm("client_id", event.target.value)}
                className="brand-input"
                required
              >
                <option value="">Selecione um paciente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="brand-label">Tarefa</label>
              <input
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                className="brand-input"
                placeholder="Ex: Enviar ajuste do plano alimentar"
                required
              />
            </div>

            <div>
              <label className="brand-label">Prazo</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(event) => updateForm("due_date", event.target.value)}
                className="brand-input"
              />
            </div>

            <div>
              <label className="brand-label">Detalhes</label>
              <textarea
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
                className="brand-input min-h-28 resize-none"
                placeholder="Contexto, combinado com o paciente ou orientacao interna."
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
              {saving ? "Salvando..." : "Adicionar tarefa"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
