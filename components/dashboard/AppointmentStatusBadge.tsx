const STATUS_LABEL: Record<string, string> = {
  agendado: "Pendente",
  confirmado: "Confirmada",
  realizado: "Realizada",
  cancelado: "Cancelada",
};

const STATUS_CLASS: Record<string, string> = {
  agendado: "bg-[#FDF1E2] text-[#B5762F]",
  confirmado: "bg-[#EAF2E7] text-[#3D6335]",
  realizado: "bg-[#EFEFEC] text-[#6B6B65]",
  cancelado: "bg-[#FBEAE7] text-[#B23B2E]",
};

export function AppointmentStatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const cls = STATUS_CLASS[status] ?? "bg-[#EFEFEC] text-[#6B6B65]";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}
