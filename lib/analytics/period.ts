import { getSaoPauloDayBoundaries } from "@/lib/utils/timezone";

export const ANALYTICS_PERIOD_PRESETS = ["today", "7d", "30d", "90d", "custom"] as const;
export type AnalyticsPeriodPreset = (typeof ANALYTICS_PERIOD_PRESETS)[number];

export interface AnalyticsPeriodRange {
  preset: AnalyticsPeriodPreset;
  from: string;
  to: string;
}

// Todo recorte de periodo do modulo de analytics usa o fuso de Sao Paulo
// (mesma utilidade que o resto do dashboard ja usa para "hoje"), para o dia
// nao virar a meia-noite errada em UTC.
export function resolveAnalyticsPeriod(
  preset: AnalyticsPeriodPreset,
  customFrom?: string | null,
  customTo?: string | null,
  now: Date = new Date()
): AnalyticsPeriodRange {
  const today = getSaoPauloDayBoundaries(now);

  if (preset === "custom" && customFrom && customTo) {
    const fromBoundaries = getSaoPauloDayBoundaries(new Date(`${customFrom}T12:00:00-03:00`));
    const toBoundaries = getSaoPauloDayBoundaries(new Date(`${customTo}T12:00:00-03:00`));
    return { preset, from: fromBoundaries.start, to: toBoundaries.end };
  }

  if (preset === "today") {
    return { preset, from: today.start, to: today.end };
  }

  const daysBack = preset === "7d" ? 6 : preset === "30d" ? 29 : preset === "90d" ? 89 : 6;
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - daysBack);
  const fromBoundaries = getSaoPauloDayBoundaries(fromDate);
  return { preset, from: fromBoundaries.start, to: today.end };
}
