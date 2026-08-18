"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { SourceCategory } from "@/lib/analytics/types";

export interface TrafficSourceDatum {
  sourceCategory: SourceCategory;
  sessions: number;
  conversions: number;
  conversionRate: number;
}

export const SOURCE_LABELS: Record<SourceCategory, string> = {
  direct: "Direto",
  organic_search: "Busca orgânica",
  social: "Social",
  paid: "Pago",
  referral: "Referência",
  email: "E-mail",
  whatsapp: "WhatsApp",
  other: "Outros",
};

const SOURCE_COLORS: Record<SourceCategory, string> = {
  direct: "#8A8A85",
  organic_search: "#4F7D45",
  social: "#7A6BAE",
  paid: "#C0533F",
  referral: "#D89A45",
  email: "#3E9166",
  whatsapp: "#3EAE5A",
  other: "#B0B0AA",
};

export function TrafficSourceDonut({ data }: { data: TrafficSourceDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.sessions, 0);
  if (total === 0) {
    return (
      <div className="flex h-[168px] items-center justify-center rounded-lg bg-[#FAFAF8] px-4 text-center text-sm text-[#8A8A85]">
        Sem sessões humanas no período.
      </div>
    );
  }

  const chartData = data.map((item) => ({ ...item, color: SOURCE_COLORS[item.sourceCategory] }));

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-32 w-32 shrink-0" role="img" aria-label={`Origem do tráfego: ${data.map((item) => `${SOURCE_LABELS[item.sourceCategory]} ${Math.round((item.sessions / total) * 100)}%`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="sessions" nameKey="sourceCategory" innerRadius={42} outerRadius={62} paddingAngle={2} strokeWidth={0}>
              {chartData.map((item) => (
                <Cell key={item.sourceCategory} fill={item.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[17px] font-bold text-[#1F1F1C]">{total}</span>
          <span className="text-[9px] font-medium uppercase tracking-wide text-[#8A8A85]">Sessões</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.slice(0, 6).map((item) => (
          <li key={item.sourceCategory} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 text-[#4B4B46]">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: SOURCE_COLORS[item.sourceCategory] }} />
              <span className="truncate">{SOURCE_LABELS[item.sourceCategory]}</span>
            </span>
            <span className="shrink-0 font-semibold text-[#1F1F1C]">
              {item.sessions} · {Math.round((item.sessions / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
