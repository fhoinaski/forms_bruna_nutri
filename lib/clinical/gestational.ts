import reference from "@/lib/clinical/data/who-growth-lms.json";

type BmiCategory = "baixo_peso" | "normal" | "sobrepeso" | "obesidade";

type BmiRange = {
  classificacao: BmiCategory;
  rotulo: string;
  imc_min: number | null;
  imc_max: number | null;
  interpretacao: string;
};

type TotalGainRange = {
  classificacao: BmiCategory;
  ganho_min_kg: number;
  ganho_max_kg: number;
  observacao?: string;
};

const gestational = (reference as typeof reference).gestacional_iom_oms;

function matchesPrePregnancyRange(bmi: number, range: BmiRange): boolean {
  if (range.classificacao === "baixo_peso") return bmi < 18.5;
  const minOk = range.imc_min === null || bmi >= range.imc_min;
  const maxOk = range.imc_max === null || bmi <= range.imc_max;
  return minOk && maxOk;
}

export function classifyPrePregnancyBmi(bmi: number): { category: BmiCategory; label: string; interpretation: string } | null {
  if (!Number.isFinite(bmi) || bmi <= 0) return null;
  const range = (gestational.cortes_imc_pre_gestacional.faixas as BmiRange[]).find((item) => matchesPrePregnancyRange(bmi, item));
  return range ? { category: range.classificacao, label: range.rotulo, interpretation: range.interpretacao } : null;
}

export function getRecommendedTotalGain(prePregnancyBmiCategory: BmiCategory): TotalGainRange | null {
  return (gestational.ganho_de_peso_total_iom_2009.faixas as TotalGainRange[])
    .find((item) => item.classificacao === prePregnancyBmiCategory) ?? null;
}

export function classifyWeeklyGainRate(
  prePregnancyBmiCategory: BmiCategory,
  kgPerWeek: number
): { classification: "abaixo" | "adequado" | "acima"; label: string; p25: number; p75: number } | null {
  if (!Number.isFinite(kgPerWeek)) return null;
  const curves = gestational.monitoramento_no2_trimestre.curvas_semanais_kg_por_semana as Record<BmiCategory, { p25: number; p75: number }>;
  const range = curves[prePregnancyBmiCategory];
  if (!range) return null;
  if (kgPerWeek < range.p25) return { classification: "abaixo", label: "Abaixo do esperado - ponto de atencao", p25: range.p25, p75: range.p75 };
  if (kgPerWeek > range.p75) return { classification: "acima", label: "Acima do esperado - ponto de atencao", p25: range.p25, p75: range.p75 };
  return { classification: "adequado", label: "Dentro da faixa esperada para acompanhamento", p25: range.p25, p75: range.p75 };
}

export function getGestationalReferenceNote(): string {
  return gestational.monitoramento_no2_trimestre.observacao;
}
