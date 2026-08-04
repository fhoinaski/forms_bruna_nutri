const STATUS_CLASS: Record<string, string> = {
  novo: "inline-flex items-center rounded-full bg-[#EAF0E4] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#607A56]",
  em_andamento: "inline-flex items-center rounded-full bg-[#FFF3D8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9A6B20]",
  finalizado: "inline-flex items-center rounded-full bg-[#E7F7EA] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2F7A45]",
  arquivado: "inline-flex items-center rounded-full bg-[#F1ECE7] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#75675E]",
};

const STATUS_LABEL: Record<string, string> = {
  novo:         "Novo",
  em_andamento: "Em andamento",
  finalizado:   "Finalizado",
  arquivado:    "Arquivado",
};

export function BrandBadge({ status }: { status: string }) {
  return (
    <span className={STATUS_CLASS[status] ?? STATUS_CLASS.arquivado}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
