"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyPoint } from "@/components/dashboard/AppointmentsTrendChart";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthLabel(monthKey: string): string {
  const [, monthPart] = monthKey.split("-");
  const monthIndex = Number(monthPart) - 1;
  return MONTH_LABELS[monthIndex] ?? monthKey;
}

export function NewPatientsChart({ data }: { data: MonthlyPoint[] }) {
  const chartData = data.map((item) => ({ label: monthLabel(item.month), count: item.count }));
  const hasData = chartData.some((item) => item.count > 0);

  if (!hasData) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-[#E8E8E3] bg-[#FAFAF8] px-6 text-center text-sm text-[#8A8A85]">
        Ainda não há dados suficientes para exibir o gráfico.
      </div>
    );
  }

  return (
    <div className="h-[200px] w-full" role="img" aria-label={`Novos pacientes nos últimos ${chartData.length} meses`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#F1F1EE" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#8A8A85", fontSize: 11 }} axisLine={{ stroke: "#E8E8E3" }} tickLine={false} />
          <YAxis tick={{ fill: "#8A8A85", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
          <Tooltip
            contentStyle={{ border: "1px solid #E8E8E3", borderRadius: 8, background: "#FFFFFF", fontSize: 12 }}
            labelStyle={{ color: "#1F1F1C", fontWeight: 600 }}
            formatter={(value) => [String(value), "Novos pacientes"]}
            cursor={{ fill: "#F1F1EE" }}
          />
          <Bar dataKey="count" name="Novos pacientes" fill="#7CA36F" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
