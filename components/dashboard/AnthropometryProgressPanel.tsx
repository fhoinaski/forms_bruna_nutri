"use client";

import { useEffect, useMemo, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { Activity, Eye, Plus, RefreshCw, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ClinicalEvolutionForm } from "@/components/dashboard/ClinicalEvolutionForm";
import type {
  AnthropometryAvailableMetric,
  AnthropometryChangeSet,
  AnthropometryMetricKey,
  PatientAnthropometryAssessment,
  PatientAnthropometryProgressViewModel,
} from "@/lib/repositories/patient-anthropometry-progress";

function formatDate(value: string | null | undefined, pattern = "dd/MM/yyyy"): string {
  if (!value) return "Nao informado";
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, pattern) : "Nao informado";
}

function formatNumber(value: number | null | undefined, options: Intl.NumberFormatOptions = { maximumFractionDigits: 1 }): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Nao informado";
  return value.toLocaleString("pt-BR", options);
}

function formatMetric(value: number | null | undefined, unit: string, options?: Intl.NumberFormatOptions): string {
  const formatted = formatNumber(value, options);
  return formatted === "Nao informado" || !unit ? formatted : `${formatted} ${unit}`;
}

function formatDelta(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Sem comparativo";
  const sign = value > 0 ? "+" : "";
  const formatted = `${sign}${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`;
  return unit ? `${formatted} ${unit}` : formatted;
}

function metricValue(point: PatientAnthropometryProgressViewModel["trendSeries"][number], metric: AnthropometryMetricKey): number | null {
  if (metric === "weight") return point.weightKg;
  if (metric === "bmi") return point.bmi;
  if (metric === "waist") return point.waistCm;
  if (metric === "bodyFat") return point.bodyFatPercentage;
  return point.leanMassKg;
}

function comparisonRows(current: PatientAnthropometryAssessment | null, baseline: PatientAnthropometryAssessment | null, changes: AnthropometryChangeSet | null) {
  if (!current || !baseline || !changes) return [];
  return [
    { key: "weight", label: "Peso", previous: baseline.weightKg, current: current.weightKg, delta: changes.weightChangeKg, unit: "kg" },
    { key: "bmi", label: "IMC", previous: baseline.bmi, current: current.bmi, delta: changes.bmiChange, unit: "" },
    { key: "waist", label: "Cintura", previous: baseline.waistCm, current: current.waistCm, delta: changes.waistChangeCm, unit: "cm" },
    { key: "bodyFat", label: "% gordura", previous: baseline.bodyFatPercentage, current: current.bodyFatPercentage, delta: changes.bodyFatChangePercentagePoints, unit: "p.p." },
    { key: "leanMass", label: "Massa magra", previous: baseline.leanMassKg, current: current.leanMassKg, delta: changes.leanMassChangeKg, unit: "kg" },
  ].filter((row) => row.previous !== null && row.current !== null);
}

function ProgressChart({
  progress,
  metric,
  metricDef,
}: {
  progress: PatientAnthropometryProgressViewModel;
  metric: AnthropometryMetricKey;
  metricDef: AnthropometryAvailableMetric | undefined;
}) {
  const data = progress.trendSeries
    .map((point) => ({
      date: formatDate(point.date, "dd/MM/yy"),
      value: metricValue(point, metric) ?? undefined,
    }))
    .filter((point) => point.value !== undefined);

  if (!metricDef || data.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-[#D9C4B2] bg-[#FBF7F1] px-6 text-center text-sm text-[#75675E]">
        Sem dados suficientes para este grafico.
      </div>
    );
  }

  const summary = data.map((point) => `${point.date}: ${formatMetric(point.value ?? null, metricDef.unit)}`).join("; ");

  return (
    <div>
      <div className="h-72 w-full" aria-label={`Grafico longitudinal de ${metricDef.label}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 16, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="#EDE1D6" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#75675E", fontSize: 11 }} axisLine={{ stroke: "#EDE1D6" }} tickLine={false} />
            <YAxis tick={{ fill: "#75675E", fontSize: 11 }} axisLine={false} tickLine={false} unit={metricDef.unit ? ` ${metricDef.unit}` : ""} width={62} />
            <Tooltip
              formatter={(value) => [formatMetric(typeof value === "number" ? value : null, metricDef.unit), metricDef.label]}
              contentStyle={{ border: "1px solid #EDE1D6", borderRadius: 8, background: "#FFFDFC", fontSize: 12 }}
              labelStyle={{ color: "#3A3028", fontWeight: 600 }}
            />
            <Line type="monotone" dataKey="value" name={metricDef.label} stroke="#607A56" strokeWidth={2.5} dot={{ r: 4, fill: "#607A56", strokeWidth: 0 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">Resumo acessivel do grafico: {summary}</p>
    </div>
  );
}

function AssessmentDetail({ assessment }: { assessment: PatientAnthropometryAssessment }) {
  const skinfoldRows = [
    ["Triceps", assessment.skinfolds.tricepsMm],
    ["Subescapular", assessment.skinfolds.subscapularMm],
    ["Peitoral", assessment.skinfolds.chestMm],
    ["Axilar media", assessment.skinfolds.midaxillaryMm],
    ["Supra-iliaca", assessment.skinfolds.suprailiacMm],
    ["Abdominal", assessment.skinfolds.abdominalMm],
    ["Coxa", assessment.skinfolds.thighMm],
  ].filter(([, value]) => value !== null);
  const noteRows = [
    ["Sintomas", assessment.notes.symptoms],
    ["Adesao", assessment.notes.adherenceNotes],
    ["Progressos", assessment.notes.progressNotes],
    ["Conduta", assessment.notes.conductNotes],
    ["Impressao clinica", assessment.notes.clinicalImpression],
    ["Proximos passos", assessment.notes.nextSteps],
  ].filter(([, value]) => Boolean(value));

  return (
    <section className="rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-4 sm:p-5" aria-label="Detalhes da avaliacao antropometrica">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="brand-kicker">Detalhes</p>
          <h3 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">{formatDate(assessment.date)}</h3>
          <p className="mt-1 text-xs text-[#75675E]">Leitura historica. Edicao deve ser feita por acao explicita.</p>
        </div>
        {assessment.protocolLabel && (
          <span className="w-fit rounded-full bg-[#E8F0E3] px-3 py-1 text-xs font-semibold text-[#607A56]">{assessment.protocolLabel}</span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg bg-[#FBF7F1] p-3"><p className="brand-label">Peso</p><p className="text-sm font-semibold text-[#3A3028]">{formatMetric(assessment.weightKg, "kg")}</p></div>
        <div className="rounded-lg bg-[#FBF7F1] p-3"><p className="brand-label">Altura</p><p className="text-sm font-semibold text-[#3A3028]">{formatMetric(assessment.heightCm, "cm")}</p></div>
        <div className="rounded-lg bg-[#FBF7F1] p-3"><p className="brand-label">IMC</p><p className="text-sm font-semibold text-[#3A3028]">{formatNumber(assessment.bmi)}</p></div>
        <div className="rounded-lg bg-[#FBF7F1] p-3"><p className="brand-label">Gordura</p><p className="text-sm font-semibold text-[#3A3028]">{formatMetric(assessment.bodyFatPercentage, "%")}</p></div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[#EDE1D6] bg-white p-4">
          <h4 className="font-serif text-base font-semibold text-[#3A3028]">Circunferencias</h4>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="brand-label">Cintura</dt><dd>{formatMetric(assessment.waistCm, "cm")}</dd></div>
            <div><dt className="brand-label">Quadril</dt><dd>{formatMetric(assessment.hipCm, "cm")}</dd></div>
            <div><dt className="brand-label">Braco</dt><dd>{formatMetric(assessment.armCm, "cm")}</dd></div>
            <div><dt className="brand-label">Abdomen</dt><dd>{formatMetric(assessment.abdomenCm, "cm")}</dd></div>
            <div><dt className="brand-label">Coxa</dt><dd>{formatMetric(assessment.thighCm, "cm")}</dd></div>
          </dl>
        </div>
        <div className="rounded-lg border border-[#EDE1D6] bg-white p-4">
          <h4 className="font-serif text-base font-semibold text-[#3A3028]">Composicao corporal</h4>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="brand-label">Massa gorda</dt><dd>{formatMetric(assessment.fatMassKg, "kg")}</dd></div>
            <div><dt className="brand-label">Massa magra</dt><dd>{formatMetric(assessment.leanMassKg, "kg")}</dd></div>
            <div><dt className="brand-label">Densidade</dt><dd>{formatMetric(assessment.bodyDensityGml, "g/ml", { maximumFractionDigits: 4 })}</dd></div>
            <div><dt className="brand-label">Protocolo</dt><dd>{assessment.protocolLabel ?? "Nao informado"}</dd></div>
          </dl>
        </div>
      </div>

      {skinfoldRows.length > 0 && (
        <div className="mt-4 rounded-lg border border-[#EDE1D6] bg-white p-4">
          <h4 className="font-serif text-base font-semibold text-[#3A3028]">Dobras cutaneas</h4>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            {skinfoldRows.map(([label, value]) => (
              <div key={label as string}><dt className="brand-label">{label}</dt><dd>{formatMetric(value as number | null, "mm")}</dd></div>
            ))}
          </dl>
        </div>
      )}

      {noteRows.length > 0 && (
        <div className="mt-4 rounded-lg border border-[#EDE1D6] bg-white p-4">
          <h4 className="font-serif text-base font-semibold text-[#3A3028]">Observacoes</h4>
          <dl className="mt-3 space-y-3 text-sm">
            {noteRows.map(([label, value]) => (
              <div key={label as string}><dt className="brand-label">{label}</dt><dd className="mt-1 text-[#3A3028]">{value}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

export function AnthropometryProgressPanel({
  clientId,
  biologicalSex,
  ageYears,
  archived,
  showForm,
  onShowFormChange,
  onChanged,
}: {
  clientId: string;
  biologicalSex: string | null;
  ageYears: number | null;
  archived: boolean;
  showForm: boolean;
  onShowFormChange: (value: boolean) => void;
  onChanged: () => void;
}) {
  const [progress, setProgress] = useState<PatientAnthropometryProgressViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comparisonMode, setComparisonMode] = useState<"previous" | "first">("previous");
  const [metric, setMetric] = useState<AnthropometryMetricKey>("weight");
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);

  async function loadProgress() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/anthropometry-progress`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json() as PatientAnthropometryProgressViewModel;
      setProgress(data);
      const nextMetric = data.availableMetrics.some((item) => item.key === metric) ? metric : data.availableMetrics[0]?.key ?? "weight";
      setMetric(nextMetric);
      setSelectedAssessmentId((current) => current && data.assessmentHistory.some((item) => item.id === current) ? current : data.latestAssessment?.id ?? null);
    } catch {
      setError("Não foi possível carregar a evolução antropométrica.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const latest = progress?.latestAssessment ?? null;
  const baseline = comparisonMode === "first" ? progress?.firstAssessment ?? null : progress?.previousAssessment ?? null;
  const changes = comparisonMode === "first" ? progress?.changes.currentVsFirst ?? null : progress?.changes.currentVsPrevious ?? null;
  const rows = comparisonRows(latest, baseline, changes);
  const selectedAssessment = progress?.assessmentHistory.find((item) => item.id === selectedAssessmentId) ?? latest;
  const metricDef = progress?.availableMetrics.find((item) => item.key === metric);

  const summaryCards = useMemo(() => {
    if (!latest) return [];
    return [
      { label: "Peso", value: formatMetric(latest.weightKg, "kg"), delta: formatDelta(progress?.changes.currentVsPrevious?.weightChangeKg, "kg") },
      { label: "IMC", value: formatNumber(latest.bmi), delta: formatDelta(progress?.changes.currentVsPrevious?.bmiChange, "") },
      { label: "Cintura", value: formatMetric(latest.waistCm, "cm"), delta: formatDelta(progress?.changes.currentVsPrevious?.waistChangeCm, "cm") },
      { label: "Gordura corporal", value: formatMetric(latest.bodyFatPercentage, "%"), delta: formatDelta(progress?.changes.currentVsPrevious?.bodyFatChangePercentagePoints, "p.p.") },
    ].filter((card) => card.value !== "Nao informado");
  }, [latest, progress]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-lg border border-[#EAD8C2] bg-[#FAF7F2]" />
        <div className="h-72 animate-pulse rounded-lg border border-[#EAD8C2] bg-[#FAF7F2]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-6 text-center">
        <p className="text-sm font-medium text-[#3A3028]">{error}</p>
        <button type="button" onClick={loadProgress} className="brand-btn-secondary mx-auto mt-4">
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!progress || !latest) {
    return (
      <div className="space-y-4" data-testid="anthropometry-progress-panel">
        <div>
          <p className="brand-kicker">Antropometria</p>
          <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Antropometria e progresso</h2>
        </div>
        <div className="rounded-lg border border-dashed border-[#D9C4B2] bg-[#FFFDFC] p-8 text-center">
          <Activity className="mx-auto h-10 w-10 text-[#D9C4B2]" />
          <h3 className="mt-3 font-serif text-xl font-semibold text-[#3A3028]">Nenhuma avaliação antropométrica registrada.</h3>
          <p className="mt-2 text-sm text-[#75675E]">Registre a primeira avaliação para acompanhar peso, medidas e composição corporal.</p>
          {!archived && (
            <button type="button" onClick={() => onShowFormChange(true)} className="brand-btn-primary mx-auto mt-5">
              <Plus className="h-4 w-4" />
              Registrar primeira avaliação
            </button>
          )}
          {showForm && (
            <div className="mt-6 text-left">
              <ClinicalEvolutionForm clientId={clientId} biologicalSex={biologicalSex} ageYears={ageYears} onSuccess={() => { onShowFormChange(false); void loadProgress(); onChanged(); }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="anthropometry-progress-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="brand-kicker">Antropometria</p>
          <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Antropometria e progresso</h2>
          <p className="mt-1 text-sm text-[#75675E]">Última avaliação: {formatDate(latest.date)}</p>
        </div>
        {!archived && (
          <button type="button" onClick={() => onShowFormChange(!showForm)} className="brand-btn-primary w-full text-sm sm:w-auto">
            <Plus className="h-4 w-4" />
            Nova avaliação
          </button>
        )}
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4" aria-label="Resumo antropometrico atual">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-4">
            <p className="brand-label">{card.label}</p>
            <p className="mt-2 font-serif text-2xl font-semibold text-[#3A3028]">{card.value}</p>
            <p className="mt-1 text-xs text-[#75675E]">Diferença vs anterior: {card.delta}</p>
          </div>
        ))}
      </section>

      {showForm && (
        <ClinicalEvolutionForm clientId={clientId} biologicalSex={biologicalSex} ageYears={ageYears} onSuccess={() => { onShowFormChange(false); void loadProgress(); onChanged(); }} />
      )}

      {progress.assessmentHistory.length > 1 && (
        <section className="rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="brand-kicker">Comparação</p>
              <h3 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">
                {comparisonMode === "first" ? "Atual vs primeira avaliação" : "Atual vs anterior"}
              </h3>
            </div>
            <div className="flex rounded-lg border border-[#EAD8C2] bg-white p-1" role="group" aria-label="Modo de comparação antropométrica">
              <button type="button" onClick={() => setComparisonMode("previous")} className={`rounded-md px-3 py-2 text-xs font-semibold ${comparisonMode === "previous" ? "bg-[#607A56] text-white" : "text-[#75675E]"}`}>Anterior</button>
              <button type="button" onClick={() => setComparisonMode("first")} className={`rounded-md px-3 py-2 text-xs font-semibold ${comparisonMode === "first" ? "bg-[#607A56] text-white" : "text-[#75675E]"}`}>Primeira</button>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-[#D9C4B2] bg-[#FBF7F1] p-4 text-sm text-[#75675E]">Sem métricas presentes nas duas avaliações para comparar.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase text-[#8C6E52]">
                    <th className="px-3 py-2">Métrica</th>
                    <th className="px-3 py-2">{comparisonMode === "first" ? "Primeira" : "Anterior"}</th>
                    <th className="px-3 py-2">Atual</th>
                    <th className="px-3 py-2">Dif.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-t border-[#EDE1D6]">
                      <td className="px-3 py-3 font-medium text-[#3A3028]">{row.label}</td>
                      <td className="px-3 py-3 text-[#75675E]">{formatMetric(row.previous, row.unit === "p.p." ? "%" : row.unit)}</td>
                      <td className="px-3 py-3 text-[#75675E]">{formatMetric(row.current, row.unit === "p.p." ? "%" : row.unit)}</td>
                      <td className="px-3 py-3 font-semibold text-[#3A3028]">{formatDelta(row.delta, row.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {progress.availableMetrics.length > 0 && (
        <section className="rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="brand-kicker">Gráfico longitudinal</p>
              <h3 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">{metricDef?.label ?? "Métrica"}</h3>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Selecionar métrica do gráfico">
              {progress.availableMetrics.map((item) => (
                <button key={item.key} type="button" onClick={() => setMetric(item.key)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${metric === item.key ? "border-[#607A56] bg-[#E8F0E3] text-[#4F6847]" : "border-[#EAD8C2] bg-white text-[#75675E]"}`}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <ProgressChart progress={progress} metric={metric} metricDef={metricDef} />
          </div>
        </section>
      )}

      <section className="rounded-lg border border-[#EAD8C2] bg-[#FFFDFC] p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#607A56]" />
          <h3 className="font-serif text-lg font-semibold text-[#3A3028]">Histórico de avaliações</h3>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase text-[#8C6E52]">
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Peso</th>
                <th className="px-3 py-2">IMC</th>
                <th className="px-3 py-2">Cintura</th>
                <th className="px-3 py-2">% gordura</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {progress.assessmentHistory.map((assessment) => (
                <tr key={assessment.id} className="border-t border-[#EDE1D6]">
                  <td className="px-3 py-3 font-medium text-[#3A3028]">{formatDate(assessment.date)}</td>
                  <td className="px-3 py-3 text-[#75675E]">{formatMetric(assessment.weightKg, "kg")}</td>
                  <td className="px-3 py-3 text-[#75675E]">{formatNumber(assessment.bmi)}</td>
                  <td className="px-3 py-3 text-[#75675E]">{formatMetric(assessment.waistCm, "cm")}</td>
                  <td className="px-3 py-3 text-[#75675E]">{formatMetric(assessment.bodyFatPercentage, "%")}</td>
                  <td className="px-3 py-3">
                    <button type="button" onClick={() => setSelectedAssessmentId(assessment.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#607A56] underline underline-offset-2">
                      <Eye className="h-3.5 w-3.5" />
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedAssessment && <AssessmentDetail assessment={selectedAssessment} />}
    </div>
  );
}
