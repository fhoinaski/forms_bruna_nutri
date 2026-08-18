export interface FunnelStageDatum {
  stage: string;
  count: number;
  percentOfPrevious: number | null;
  percentOfTotal: number;
}

export function ConversionFunnelPanel({ stages }: { stages: FunnelStageDatum[] }) {
  const maxCount = Math.max(1, ...stages.map((stage) => stage.count));

  if (stages.every((stage) => stage.count === 0)) {
    return (
      <p className="rounded-lg bg-[#FAFAF8] px-3 py-6 text-center text-[13px] text-[#6B6B65]">
        Sem visitantes no período selecionado.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {stages.map((stage) => (
        <li key={stage.stage}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-[#1F1F1C]">{stage.stage}</span>
            <span className="shrink-0 text-xs text-[#8A8A85]">
              <strong className="text-[#1F1F1C]">{stage.count}</strong>
              {stage.percentOfPrevious !== null && ` · ${stage.percentOfPrevious}% da etapa anterior`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#F1F1EE]" role="img" aria-label={`${stage.stage}: ${stage.count} (${stage.percentOfTotal}% do total)`}>
            <div className="h-full rounded-full bg-[#4F7D45]" style={{ width: `${Math.max(2, (stage.count / maxCount) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
