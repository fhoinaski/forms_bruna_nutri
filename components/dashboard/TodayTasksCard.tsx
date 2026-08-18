import Link from "next/link";
import { Check } from "lucide-react";
import { DashboardPanel, EmptyState, LoadingState } from "@/components/dashboard/DashboardPanel";

export interface TodayTaskItem {
  id: string;
  client_id: string;
  client_name: string | null;
  title: string;
  status: string;
}

export function TodayTasksCard({
  tasks,
  loading,
  updating,
  onToggle,
}: {
  tasks: TodayTaskItem[] | null;
  loading: boolean;
  updating: Record<string, boolean>;
  onToggle: (taskId: string, currentStatus: string) => void;
}) {
  const completed = (tasks ?? []).filter((task) => task.status === "concluida").length;
  const total = tasks?.length ?? 0;

  return (
    <DashboardPanel
      title="Tarefas de hoje"
      action="Ver todas"
      actionHref="/dashboard/tarefas"
    >
      {loading ? (
        <LoadingState text="Carregando tarefas..." />
      ) : total === 0 ? (
        <EmptyState text="Tudo em dia por aqui." />
      ) : (
        <>
          <p className="mb-2 text-xs font-semibold text-[#8A8A85]">{completed}/{total} concluídas</p>
          <ul className="space-y-2">
            {tasks!.map((task) => {
              const done = task.status === "concluida";
              return (
                <li key={task.id} className="flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => onToggle(task.id, task.status)}
                    disabled={updating[task.id]}
                    aria-pressed={done}
                    aria-label={`${done ? "Marcar como pendente" : "Marcar como concluída"}: ${task.title}`}
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition disabled:opacity-50 ${
                      done ? "border-[#4F7D45] bg-[#4F7D45] text-white" : "border-[#C9C9C2] bg-white"
                    }`}
                  >
                    {done && <Check className="h-3 w-3" />}
                  </button>
                  <Link href={`/dashboard/clients/${task.client_id}`} className="min-w-0 flex-1 hover:opacity-80">
                    <span className={`block truncate text-sm ${done ? "text-[#B0B0AA] line-through" : "font-medium text-[#1F1F1C]"}`}>
                      {task.title}
                    </span>
                    <span className="block truncate text-xs text-[#8A8A85]">{task.client_name || "Paciente sem nome"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </DashboardPanel>
  );
}
