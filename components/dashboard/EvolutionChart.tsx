"use client";

import { format, isValid, parseISO } from "date-fns";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface AnthropometricHistoryItem {
  measured_at?: string | null;
  created_at?: string | null;
  weight?: number | null;
  body_fat_percentage?: number | null;
}

export interface GrowthReferenceLineItem {
  measured_at?: string | null;
  created_at?: string | null;
  p3?: number | null;
  p50?: number | null;
  p97?: number | null;
}

function chartDate(value?: string | null) {
  if (!value) return "Sem data";
  const date = parseISO(value);
  return isValid(date) ? format(date, "dd/MM/yy") : "Sem data";
}

export function EvolutionChart({
  history,
  referenceLines = [],
}: {
  history: AnthropometricHistoryItem[];
  referenceLines?: GrowthReferenceLineItem[];
}) {
  const referencesByDate = new Map(
    referenceLines.map((item) => [chartDate(item.measured_at ?? item.created_at), item])
  );
  const data = [...history]
    .sort((a, b) => new Date(a.measured_at ?? a.created_at ?? 0).getTime() - new Date(b.measured_at ?? b.created_at ?? 0).getTime())
    .map((item) => {
      const date = chartDate(item.measured_at ?? item.created_at);
      const reference = referencesByDate.get(date);
      return {
        date,
        weight: item.weight ?? undefined,
        bodyFat: item.body_fat_percentage ?? undefined,
        p3: reference?.p3 ?? undefined,
        p50: reference?.p50 ?? undefined,
        p97: reference?.p97 ?? undefined,
      };
    });
  const hasReferences = data.some((item) => item.p3 !== undefined || item.p50 !== undefined || item.p97 !== undefined);

  if (!data.some((item) => item.weight !== undefined || item.bodyFat !== undefined)) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-[#D9C4B2] bg-[#FBF7F1] px-6 text-center text-sm text-[#75675E]">
        Registre peso ou percentual de gordura em uma evolução para visualizar a curva clínica.
      </div>
    );
  }

  return (
    <div className="h-80 w-full" aria-label="Gráfico de evolução de peso e percentual de gordura">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#EDE1D6" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#75675E", fontSize: 11 }} axisLine={{ stroke: "#EDE1D6" }} tickLine={false} />
          <YAxis yAxisId="weight" tick={{ fill: "#75675E", fontSize: 11 }} axisLine={false} tickLine={false} unit=" kg" width={58} />
          <YAxis yAxisId="fat" orientation="right" tick={{ fill: "#75675E", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" width={42} />
          <Tooltip contentStyle={{ border: "1px solid #EDE1D6", borderRadius: 8, background: "#FFFDFC", fontSize: 12 }} labelStyle={{ color: "#3A3028", fontWeight: 600 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#75675E", paddingTop: 12 }} />
          <Line yAxisId="weight" type="monotone" dataKey="weight" name="Peso (kg)" stroke="#7F9A74" strokeWidth={2.5} dot={{ r: 4, fill: "#7F9A74", strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls />
          {hasReferences && (
            <>
              <Line yAxisId="weight" type="monotone" dataKey="p3" name="P3 referencia" stroke="#D9C4B2" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
              <Line yAxisId="weight" type="monotone" dataKey="p50" name="P50 referencia" stroke="#A8927D" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
              <Line yAxisId="weight" type="monotone" dataKey="p97" name="P97 referencia" stroke="#D9C4B2" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
            </>
          )}
          <Line yAxisId="fat" type="monotone" dataKey="bodyFat" name="Gordura (%)" stroke="#C9937B" strokeWidth={2.5} dot={{ r: 4, fill: "#C9937B", strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
