"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface MonthlyPoint {
  month: string;
  count: number;
}

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthLabel(monthKey: string): string {
  const [, monthPart] = monthKey.split("-");
  const monthIndex = Number(monthPart) - 1;
  return MONTH_LABELS[monthIndex] ?? monthKey;
}

export function AppointmentsTrendChart({ data }: { data: MonthlyPoint[] }) {
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
    <div className="h-[200px] w-full" role="img" aria-label={`Evolução de atendimentos nos últimos ${chartData.length} meses`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#F1F1EE" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#8A8A85", fontSize: 11 }} axisLine={{ stroke: "#E8E8E3" }} tickLine={false} />
          <YAxis tick={{ fill: "#8A8A85", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
          <Tooltip
            contentStyle={{ border: "1px solid #E8E8E3", borderRadius: 8, background: "#FFFFFF", fontSize: 12 }}
            labelStyle={{ color: "#1F1F1C", fontWeight: 600 }}
            formatter={(value) => [String(value), "Atendimentos"]}
          />
          <Line
            type="monotone"
            dataKey="count"
            name="Atendimentos"
            stroke="#4F7D45"
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: "#4F7D45", strokeWidth: 0 }}
            activeDot={{ r: 5.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
