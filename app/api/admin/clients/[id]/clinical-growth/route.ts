import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getExistingNutritionRecord } from "@/lib/repositories/nutrition-records";
import { getClientEvolutions } from "@/lib/repositories/client-evolutions";
import { calculateBmiValue, parseMeasurement } from "@/lib/clinical/anthropometry";
import { classifyPrePregnancyBmi, classifyWeeklyGainRate, getGestationalReferenceNote, getRecommendedTotalGain } from "@/lib/clinical/gestational";
import { calculateZScore, classifyZScore, getReferenceValue, normalizePediatricSex, type PediatricIndicator, type PediatricSex } from "@/lib/clinical/pediatric-growth";
import { calculateBariatricProgress } from "@/lib/clinical/bariatric";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INDICATOR_LABELS: Record<PediatricIndicator, string> = {
  peso_por_idade: "Peso por idade",
  comprimento_por_idade: "Comprimento/estatura por idade",
  imc_por_idade: "IMC por idade",
  peso_por_comprimento: "Peso por comprimento",
  peso_por_estatura: "Peso por estatura",
  estatura_por_idade: "Estatura por idade",
  perimetro_cefalico: "Perimetro cefalico",
  circunferencia_braquial: "Circunferencia braquial",
  dobra_subescapular: "Dobra subescapular",
  dobra_tricipital: "Dobra tricipital",
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function ageAt(birthDate: string, date = new Date()) {
  const birth = new Date(`${birthDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const days = Math.max(0, Math.round((date.getTime() - birth.getTime()) / 86_400_000));
  return { days, months: Math.round(days / 30.4375), years: days / 365.25 };
}

function measurementDate(value: { measured_at?: string | null; created_at?: string | null }) {
  return new Date(value.measured_at ?? value.created_at ?? 0);
}

function pediatricResult(input: {
  indicator: PediatricIndicator;
  value: number | null;
  axis: number;
  sex: PediatricSex;
  axisUnit?: "dias" | "meses" | "altura_cm";
}) {
  if (!input.value) return null;
  const zScore = calculateZScore(input.value, input.axis, input.sex, input.indicator, input.axisUnit);
  if (zScore === null) return null;
  const classification = classifyZScore(zScore, input.indicator, input.sex, input.axis, input.axisUnit);
  return {
    indicator: input.indicator,
    label: INDICATOR_LABELS[input.indicator],
    value: input.value,
    zScore,
    cautionLabel: classification?.label ?? "Ponto de atencao para avaliacao profissional",
    technicalKey: classification?.technicalKey ?? null,
    technicalRule: classification?.technicalRule ?? null,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });

  const [record, evolutions] = await Promise.all([
    getExistingNutritionRecord(id),
    getClientEvolutions(id),
  ]);

  const lifeStage = normalizeText(record?.life_stage);
  const age = client.birth_date ? ageAt(client.birth_date) : null;
  const sex = normalizePediatricSex(record?.biological_sex);
  const weight = parseMeasurement(record?.current_weight_kg);
  const height = parseMeasurement(record?.height_cm);
  const bmi = calculateBmiValue(weight, height);

  const pediatricApplicable = Boolean(sex && age && (lifeStage.includes("crianca") || lifeStage.includes("bebe") || lifeStage.includes("adolescente") || age.years < 19));
  const pediatricResults = [];
  let chartReferenceLines: Array<{ measured_at?: string | null; created_at?: string | null; p3: number | null; p50: number | null; p97: number | null }> = [];

  if (pediatricApplicable && sex && age) {
    if (age.months <= 60) {
      pediatricResults.push(
        pediatricResult({ indicator: "peso_por_idade", value: weight, axis: age.days, sex, axisUnit: "dias" }),
        pediatricResult({ indicator: "comprimento_por_idade", value: height, axis: age.days, sex, axisUnit: "dias" }),
        pediatricResult({ indicator: "imc_por_idade", value: bmi, axis: age.days, sex, axisUnit: "dias" }),
        pediatricResult({ indicator: age.days < 731 ? "peso_por_comprimento" : "peso_por_estatura", value: weight, axis: height ?? 0, sex, axisUnit: "altura_cm" })
      );
    } else {
      pediatricResults.push(
        pediatricResult({ indicator: "estatura_por_idade", value: height, axis: age.months, sex, axisUnit: "meses" }),
        pediatricResult({ indicator: "imc_por_idade", value: bmi, axis: age.months, sex, axisUnit: "meses" })
      );
    }

    chartReferenceLines = evolutions
      .filter((evolution) => evolution.weight)
      .map((evolution) => {
        const date = measurementDate(evolution);
        const eventAge = client.birth_date ? ageAt(client.birth_date, date) : null;
        if (!eventAge) return null;
        if (eventAge.months > 60) return null;
        const indicator: PediatricIndicator = "peso_por_idade";
        const axis = eventAge.days;
        const axisUnit = "dias";
        return {
          measured_at: evolution.measured_at,
          created_at: evolution.created_at,
          p3: getReferenceValue(axis, sex, indicator, "p3", axisUnit),
          p50: getReferenceValue(axis, sex, indicator, "p50", axisUnit),
          p97: getReferenceValue(axis, sex, indicator, "p97", axisUnit),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  // life_stage isolado nao basta: um registro antigo ou inconsistente
  // poderia ter "gestacao" salvo com sexo biologico Masculino. A
  // classificacao gestacional so se aplica quando o sexo nao afasta essa
  // possibilidade.
  const biologicalSexNormalized = normalizeText(record?.biological_sex);
  const gestationalApplicable = lifeStage.includes("gestacao") && biologicalSexNormalized !== "masculino";
  const preWeight = parseMeasurement(record?.pre_pregnancy_weight_kg);
  const preBmi = calculateBmiValue(preWeight, height);
  const preClassification = preBmi ? classifyPrePregnancyBmi(preBmi) : null;
  const totalGain = preClassification ? getRecommendedTotalGain(preClassification.category) : null;
  const sortedEvolutions = [...evolutions].filter((item) => item.weight).sort((a, b) => measurementDate(a).getTime() - measurementDate(b).getTime());
  const first = sortedEvolutions[0];
  const last = sortedEvolutions.at(-1);
  const weeksBetween = first && last ? (measurementDate(last).getTime() - measurementDate(first).getTime()) / (7 * 86_400_000) : 0;
  const weeklyGainRate = first?.weight && last?.weight && weeksBetween > 0 ? Math.round(((last.weight - first.weight) / weeksBetween) * 100) / 100 : null;
  const weeklyClassification = preClassification && weeklyGainRate !== null ? classifyWeeklyGainRate(preClassification.category, weeklyGainRate) : null;

  const bariatricApplicable = normalizeText(record?.target_group) === "bariatrico";
  const preSurgeryWeight = parseMeasurement(record?.pre_surgery_weight_kg);
  const idealWeight = parseMeasurement(record?.target_weight_kg);
  const currentWeightForBariatric = last?.weight ?? weight;
  const bariatricProgress = bariatricApplicable
    ? calculateBariatricProgress({ preSurgeryWeightKg: preSurgeryWeight, idealWeightKg: idealWeight, currentWeightKg: currentWeightForBariatric })
    : null;

  return NextResponse.json({
    pediatric: {
      applicable: pediatricApplicable,
      sex,
      age,
      results: pediatricResults.filter(Boolean),
      chartReferenceLines,
    },
    gestational: {
      applicable: gestationalApplicable,
      prePregnancyBmi: preBmi,
      prePregnancyClassification: preClassification,
      recommendedTotalGain: totalGain,
      weeklyGainRate,
      weeklyGainClassification: weeklyClassification,
      referenceNote: getGestationalReferenceNote(),
    },
    bariatric: {
      applicable: bariatricApplicable,
      preSurgeryWeightKg: preSurgeryWeight,
      idealWeightKg: idealWeight,
      currentWeightKg: currentWeightForBariatric,
      progress: bariatricProgress,
    },
  });
}
