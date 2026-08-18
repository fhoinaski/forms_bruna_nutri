import Link from "next/link";
import { format, isValid, parseISO } from "date-fns";
import { DashboardPanel, EmptyState, LoadingState } from "@/components/dashboard/DashboardPanel";
import { AppointmentStatusBadge } from "@/components/dashboard/AppointmentStatusBadge";

export interface TodayAgendaItem {
  id: string;
  client_id: string | null;
  client_name: string | null;
  title: string;
  starts_at: string;
  status: string;
}

function timeLabel(value: string): string {
  const d = parseISO(value);
  return isValid(d) ? format(d, "HH:mm") : "--:--";
}

export function TodayAgendaCard({
  appointments,
  loading,
}: {
  appointments: TodayAgendaItem[] | null;
  loading: boolean;
}) {
  return (
    <DashboardPanel title="Agenda do dia" action="Ver agenda" actionHref="/dashboard/agenda">
      {loading ? (
        <LoadingState text="Carregando agenda..." />
      ) : !appointments || appointments.length === 0 ? (
        <EmptyState text="Nenhuma consulta agendada para hoje." actionLabel="Agendar consulta" actionHref="/dashboard/agenda" />
      ) : (
        <ul className="space-y-2.5">
          {appointments.map((appointment) => (
            <li key={appointment.id}>
              <Link
                href={appointment.client_id ? `/dashboard/clients/${appointment.client_id}` : "/dashboard/agenda"}
                className="flex items-start justify-between gap-2 rounded-lg py-1 transition hover:bg-[#F7F7F4]"
              >
                <span className="min-w-0">
                  <span className="text-xs font-semibold text-[#4F7D45]">{timeLabel(appointment.starts_at)}</span>
                  <span className="block truncate text-sm font-medium text-[#1F1F1C]">
                    {appointment.client_name || "Paciente sem vínculo"}
                  </span>
                  <span className="block truncate text-xs text-[#8A8A85]">{appointment.title}</span>
                </span>
                <AppointmentStatusBadge status={appointment.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}
