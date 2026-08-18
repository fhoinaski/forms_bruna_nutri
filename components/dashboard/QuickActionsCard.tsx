import Link from "next/link";
import { Calendar, ClipboardList, Users, WalletCards } from "lucide-react";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";

const ACTIONS = [
  { href: "/dashboard/clients", icon: Users, label: "Novo paciente" },
  { href: "/dashboard/agenda", icon: Calendar, label: "Nova consulta" },
  { href: "/dashboard/clients", icon: ClipboardList, label: "Novo plano" },
  { href: "/dashboard/financeiro", icon: WalletCards, label: "Pagamento" },
];

export function QuickActionsCard() {
  return (
    <DashboardPanel title="Ações rápidas">
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-[#E8E8E3] bg-[#FAFAF8] px-3 py-3 text-center transition hover:border-[#4F7D45]/40 hover:bg-[#EAF2E7]"
          >
            <action.icon className="h-4 w-4 text-[#4F7D45]" />
            <span className="text-[11px] font-semibold text-[#1F1F1C]">{action.label}</span>
          </Link>
        ))}
      </div>
    </DashboardPanel>
  );
}
