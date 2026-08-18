import Link from "next/link";
import { format, isValid, parseISO } from "date-fns";
import { ChevronRight } from "lucide-react";
import { DashboardPanel, EmptyState, LoadingState } from "@/components/dashboard/DashboardPanel";
import { AppointmentStatusBadge } from "@/components/dashboard/AppointmentStatusBadge";

export interface UpcomingAppointmentItem {
  id: string;
  client_id?: string | null;
  client_name: string | null;
  title: string;
  starts_at: string;
  status: string;
  appointment_type: string;
}

function timeLabel(value: string): string {
  const d = parseISO(value);
  return isValid(d) ? format(d, "HH:mm") : "--:--";
}

export function UpcomingAppointmentsCard({
  appointments,
  loading,
}: {
  appointments: UpcomingAppointmentItem[] | null;
  loading: boolean;
}) {
  return (
    <DashboardPanel title="Próximas consultas" action="Ver todas as consultas" actionHref="/dashboard/agenda">
      {loading ? (
        <LoadingState text="Carregando consultas..." />
      ) : !appointments || appointments.length === 0 ? (
        <EmptyState text="Nenhuma consulta agendada." actionLabel="Agendar consulta" actionHref="/dashboard/agenda" />
      ) : (
        <ul className="divide-y divide-[#F1F1EE]">
          {appointments.slice(0, 5).map((appointment) => (
            <li key={appointment.id}>
              <Link
                href={appointment.client_id ? `/dashboard/clients/${appointment.client_id}` : "/dashboard/agenda"}
                className="flex items-center gap-3 py-2.5 transition hover:opacity-80"
              >
                <span className="w-11 shrink-0 text-sm font-semibold text-[#1F1F1C]">{timeLabel(appointment.starts_at)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#1F1F1C]">
                    {appointment.client_name || "Paciente sem vínculo"}
                  </span>
                  <span className="block truncate text-xs text-[#8A8A85]">{appointment.title}</span>
                </span>
                <AppointmentStatusBadge status={appointment.status} />
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#B0B0AA]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}
