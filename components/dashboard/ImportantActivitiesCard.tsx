import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { DashboardPanel, EmptyState, LoadingState } from "@/components/dashboard/DashboardPanel";

export interface ActivityItem {
  id: string;
  title: string;
  subject: string | null;
  href: string;
  priority: "URGENT" | "HIGH" | "NORMAL" | "INFO";
}

const DOT_CLASS: Record<ActivityItem["priority"], string> = {
  URGENT: "bg-[#C0533F]",
  HIGH: "bg-[#D89A45]",
  NORMAL: "bg-[#4F7D45]",
  INFO: "bg-[#B0B0AA]",
};

export function ImportantActivitiesCard({
  items,
  loading,
}: {
  items: ActivityItem[] | null;
  loading: boolean;
}) {
  return (
    <DashboardPanel title="Atividades importantes" action="Ver inbox" actionHref="/dashboard/solicitacoes">
      {loading ? (
        <LoadingState text="Carregando atividades..." />
      ) : !items || items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-[#EAF2E7] px-3 py-6 text-center text-[13px] font-medium text-[#3D6335]">
          <CheckCircle2 className="mx-auto h-4 w-4" />
          <span className="mx-auto">Tudo em dia por aqui.</span>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.slice(0, 5).map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="flex items-start gap-2.5 rounded-lg py-1 transition hover:bg-[#F7F7F4]">
                <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASS[item.priority]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[#1F1F1C]">{item.title}</span>
                  {item.subject && <span className="block truncate text-xs text-[#8A8A85]">{item.subject}</span>}
                </span>
                <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B0B0AA]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}
