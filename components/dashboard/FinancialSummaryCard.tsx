"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { DashboardPanel, EmptyState, LoadingState } from "@/components/dashboard/DashboardPanel";

export interface FinancialSummaryData {
  receivedMonthCents: number;
  openCents: number;
  overdueCents: number;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const SLICES = [
  { key: "receivedMonthCents" as const, label: "Recebido", color: "#4F7D45" },
  { key: "openCents" as const, label: "Pendente", color: "#D89A45" },
  { key: "overdueCents" as const, label: "Vencido", color: "#C0533F" },
];

export function FinancialSummaryCard({
  data,
  loading,
}: {
  data: FinancialSummaryData | null;
  loading: boolean;
}) {
  const total = data ? data.receivedMonthCents + data.openCents + data.overdueCents : 0;
  const chartData = SLICES.map((slice) => ({ ...slice, value: data?.[slice.key] ?? 0 }));
  const hasData = total > 0;

  return (
    <DashboardPanel title="Resumo financeiro" action="Gerenciar financeiro" actionHref="/dashboard/financeiro">
      {loading ? (
        <LoadingState text="Carregando financeiro..." />
      ) : !data || !hasData ? (
        <EmptyState text="Nenhum lançamento financeiro este mês." />
      ) : (
        <div className="flex items-center gap-4">
          <div
            className="relative h-28 w-28 shrink-0"
            role="img"
            aria-label={`Faturamento do mês: ${formatMoney(total)}. Recebido ${formatMoney(data.receivedMonthCents)}, pendente ${formatMoney(data.openCents)}, vencido ${formatMoney(data.overdueCents)}.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={38} outerRadius={54} paddingAngle={hasData ? 2 : 0} strokeWidth={0}>
                  {chartData.map((slice) => (
                    <Cell key={slice.key} fill={slice.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[15px] font-bold text-[#1F1F1C]">{formatMoney(total)}</span>
              <span className="text-[9px] font-medium uppercase tracking-wide text-[#8A8A85]">Faturamento</span>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-2">
            {SLICES.map((slice) => (
              <li key={slice.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-[#4B4B46]">
                  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: slice.color }} />
                  {slice.label}
                </span>
                <span className="font-semibold text-[#1F1F1C]">{formatMoney(data[slice.key])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardPanel>
  );
}
