import reference from "@/lib/clinical/data/who-growth-lms.json";

export type PediatricSex = "meninas" | "meninos";
export type PediatricIndicator =
  | "peso_por_idade"
  | "comprimento_por_idade"
  | "imc_por_idade"
  | "peso_por_comprimento"
  | "peso_por_estatura"
  | "estatura_por_idade"
  | "perimetro_cefalico"
  | "circunferencia_braquial"
  | "dobra_subescapular"
  | "dobra_tricipital";

type LmsPoint = { axis: number; l: number; m: number; s: number };
type IndicatorData = {
  unidade?: string;
  meninas: { axis: string; points: LmsPoint[] };
  meninos: { axis: string; points: LmsPoint[] };
  classificacao_z?: Record<PediatricSex, Record<string, string>>;
  classificacao?: Record<string, Record<string, string>>;
};

type ReferenceData = typeof reference;
type AxisUnit = "dias" | "meses" | "altura_cm";

const data = reference as ReferenceData;
const PERCENTILE_Z = {
  p3: -1.880793608,
  p50: 0,
  p97: 1.880793608,
} as const;

export function normalizePediatricSex(value: string | null | undefined): PediatricSex | null {
  const normalized = (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("fem") || normalized.includes("menina")) return "meninas";
  if (normalized.includes("masc") || normalized.includes("menino")) return "meninos";
  return null;
}

function getIndicator(indicator: PediatricIndicator, axisValue: number, axisUnit?: AxisUnit): IndicatorData | null {
  if (indicator === "imc_por_idade" && axisUnit === "meses") {
    return data.pediatrico_5_19_anos.imc_por_idade as IndicatorData;
  }
  if (indicator === "imc_por_idade" && axisUnit === "dias") {
    return data.pediatrico_0_5_anos.imc_por_idade as IndicatorData;
  }
  if (indicator === "imc_por_idade" && axisValue >= 61 && axisValue <= 228) {
    return data.pediatrico_5_19_anos.imc_por_idade as IndicatorData;
  }
  if (axisValue <= 1856 && indicator in data.pediatrico_0_5_anos) {
    return data.pediatrico_0_5_anos[indicator as keyof typeof data.pediatrico_0_5_anos] as IndicatorData;
  }
  if (indicator in data.pediatrico_5_19_anos) {
    return data.pediatrico_5_19_anos[indicator as keyof typeof data.pediatrico_5_19_anos] as IndicatorData;
  }
  return null;
}

function nearestPoint(points: LmsPoint[], axisValue: number): LmsPoint | null {
  if (!points.length || !Number.isFinite(axisValue)) return null;
  return points.reduce((best, point) => Math.abs(point.axis - axisValue) < Math.abs(best.axis - axisValue) ? point : best, points[0]);
}

export function zScoreFromLms(value: number, l: number, m: number, s: number): number {
  if (!Number.isFinite(value) || value <= 0 || !m || !s) return Number.NaN;
  if (l === 0) return Math.log(value / m) / s;
  return (Math.pow(value / m, l) - 1) / (l * s);
}

export function valueFromLmsZScore(zScore: number, l: number, m: number, s: number): number {
  if (l === 0) return m * Math.exp(s * zScore);
  return m * Math.pow(1 + l * s * zScore, 1 / l);
}

export function calculateZScore(value: number, axisValue: number, sex: PediatricSex, indicator: PediatricIndicator, axisUnit?: AxisUnit): number | null {
  const indicatorData = getIndicator(indicator, axisValue, axisUnit);
  const point = indicatorData ? nearestPoint(indicatorData[sex].points, axisValue) : null;
  if (!point) return null;
  const z = zScoreFromLms(value, point.l, point.m, point.s);
  return Number.isFinite(z) ? Math.round(z * 100) / 100 : null;
}

function ruleMatches(rule: string, zScore: number): boolean {
  const clean = rule.replaceAll(",", ".").replace(/[Zz]/g, "").replace(/[+]/g, "").toLowerCase();
  const comparisons = clean.match(/(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)/g) ?? [];
  if (!comparisons.length) return false;
  return comparisons.every((comparison) => {
    const [, operator, rawLimit] = comparison.match(/(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)/) ?? [];
    const limit = Number(rawLimit);
    if (operator === "<") return zScore < limit;
    if (operator === "<=") return zScore <= limit;
    if (operator === ">") return zScore > limit;
    if (operator === ">=") return zScore >= limit;
    return false;
  });
}

function priorityForTechnicalKey(key: string): number {
  const order = ["severa", "grave", "magreza", "normal", "estatura_normal", "obesidade", "sobrepeso", "risco", "alta"];
  const index = order.findIndex((item) => key.includes(item));
  return index === -1 ? 99 : index;
}

function cautiousLabel(technicalKey: string): string {
  if (technicalKey.includes("normal") || technicalKey.includes("eutrofia")) return "Dentro do esperado para acompanhamento";
  if (technicalKey.includes("magreza") || technicalKey.includes("baixo") || technicalKey.includes("baixa")) return "Abaixo do esperado para a idade - ponto de atencao";
  if (technicalKey.includes("sobrepeso") || technicalKey.includes("obesidade") || technicalKey.includes("risco") || technicalKey.includes("alta")) return "Acima do esperado para a idade - ponto de atencao";
  return "Ponto de atencao para avaliacao profissional";
}

export function classifyZScore(zScore: number, indicator: PediatricIndicator, sex: PediatricSex, axisValue = 0, axisUnit?: AxisUnit): { technicalKey: string; technicalRule: string; label: string } | null {
  const indicatorData = getIndicator(indicator, indicator === "estatura_por_idade" && axisValue === 0 ? 61 : axisValue, axisUnit);
  const rules = indicatorData?.classificacao_z?.[sex]
    ?? indicatorData?.classificacao?.[indicator]
    ?? null;
  if (!rules) return null;

  const matches = Object.entries(rules)
    .filter(([, rule]) => ruleMatches(String(rule), zScore))
    .sort(([a], [b]) => priorityForTechnicalKey(a) - priorityForTechnicalKey(b));
  const [technicalKey, technicalRule] = matches[0] ?? [];
  return technicalKey ? { technicalKey, technicalRule: String(technicalRule), label: cautiousLabel(technicalKey) } : null;
}

export function getReferenceValue(axisValue: number, sex: PediatricSex, indicator: PediatricIndicator, percentile: keyof typeof PERCENTILE_Z, axisUnit?: AxisUnit): number | null {
  const indicatorData = getIndicator(indicator, axisValue, axisUnit);
  const point = indicatorData ? nearestPoint(indicatorData[sex].points, axisValue) : null;
  if (!point) return null;
  return Math.round(valueFromLmsZScore(PERCENTILE_Z[percentile], point.l, point.m, point.s) * 10) / 10;
}

export function getMedianValue(axisValue: number, sex: PediatricSex, indicator: PediatricIndicator): number | null {
  return getReferenceValue(axisValue, sex, indicator, "p50");
}
