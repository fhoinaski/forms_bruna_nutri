"use client";

import { format, isValid, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface DailySessionsPoint {
  dateKey: string;
  sessions: number;
  conversions: number;
}

function dayLabel(dateKey: string): string {
  const d = parseISO(dateKey);
  return isValid(d) ? format(d, "dd/MM") : dateKey;
}

export function SessionsTrendChart({ data }: { data: DailySessionsPoint[] }) {
  const chartData = data.map((point) => ({ label: dayLabel(point.dateKey), sessions: point.sessions, conversions: point.conversions }));
  const hasData = chartData.some((point) => point.sessions > 0);

  if (!hasData) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-[#E8E8E3] bg-[#FAFAF8] px-6 text-center text-sm text-[#8A8A85]">
        Ainda não há visitas suficientes no período para exibir o gráfico.
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full" role="img" aria-label={`Sessões por dia nos últimos ${chartData.length} dias`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#F1F1EE" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#8A8A85", fontSize: 11 }} axisLine={{ stroke: "#E8E8E3" }} tickLine={false} />
          <YAxis tick={{ fill: "#8A8A85", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
          <Tooltip
            contentStyle={{ border: "1px solid #E8E8E3", borderRadius: 8, background: "#FFFFFF", fontSize: 12 }}
            labelStyle={{ color: "#1F1F1C", fontWeight: 600 }}
          />
          <Line type="monotone" dataKey="sessions" name="Sessões" stroke="#4F7D45" strokeWidth={2.5} dot={{ r: 3, fill: "#4F7D45", strokeWidth: 0 }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="conversions" name="Conversões" stroke="#C0533F" strokeWidth={2} dot={{ r: 2.5, fill: "#C0533F", strokeWidth: 0 }} activeDot={{ r: 4.5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
