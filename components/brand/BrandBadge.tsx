const STATUS_CLASS: Record<string, string> = {
  novo:         "brand-badge brand-badge-novo",
  em_andamento: "brand-badge brand-badge-andamento",
  finalizado:   "brand-badge brand-badge-finalizado",
  arquivado:    "brand-badge brand-badge-arquivado",
};

const STATUS_LABEL: Record<string, string> = {
  novo:         "Novo",
  em_andamento: "Em andamento",
  finalizado:   "Finalizado",
  arquivado:    "Arquivado",
};

export function BrandBadge({ status }: { status: string }) {
  return (
    <span className={STATUS_CLASS[status] ?? "brand-badge brand-badge-arquivado"}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
