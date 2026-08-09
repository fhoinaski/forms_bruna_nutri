export type SkinfoldValuesMm = {
  triceps?: number | null;
  subscapular?: number | null;
  chest?: number | null;
  midaxillary?: number | null;
  suprailiac?: number | null;
  abdominal?: number | null;
  thigh?: number | null;
};

export type BiologicalSexForBodyComposition = "Masculino" | "Feminino";

export type BodyCompositionResult = {
  sumSkinfoldsMm: number;
  bodyDensity: number;
  bodyFatPercentage: number;
  fatMassKg: number;
  leanMassKg: number;
};

const SKINFOLD_SITES: Array<keyof SkinfoldValuesMm> = [
  "triceps",
  "subscapular",
  "chest",
  "midaxillary",
  "suprailiac",
  "abdominal",
  "thigh",
];

/**
 * Soma as 7 dobras do protocolo Jackson & Pollock. Retorna null se qualquer
 * uma das 7 estiver ausente — o protocolo não é válido com dado parcial.
 */
export function sumSkinfoldsMm(values: SkinfoldValuesMm): number | null {
  let total = 0;
  for (const site of SKINFOLD_SITES) {
    const value = values[site];
    if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
      return null;
    }
    total += value;
  }
  return total;
}

/**
 * Equações generalizadas de Jackson & Pollock para densidade corporal a
 * partir da soma de 7 dobras cutâneas (mm) e idade (anos).
 * Homens: Jackson AS, Pollock ML. Br J Nutr. 1978.
 * Mulheres: Jackson AS, Pollock ML, Ward A. Med Sci Sports Exerc. 1980.
 */
export function calculateBodyDensityJacksonPollock7(
  sumMm: number,
  ageYears: number,
  sex: BiologicalSexForBodyComposition
): number {
  if (sex === "Masculino") {
    return 1.112 - 0.00043499 * sumMm + 0.00000055 * sumMm ** 2 - 0.00028826 * ageYears;
  }
  return 1.097 - 0.00046971 * sumMm + 0.00000056 * sumMm ** 2 - 0.00012828 * ageYears;
}

/** Fórmula de Siri: converte densidade corporal (g/ml) em % de gordura. */
export function bodyFatPercentageFromDensitySiri(density: number): number {
  return 495 / density - 450;
}

export function fatMassKg(weightKg: number, bodyFatPercentage: number): number {
  return weightKg * (bodyFatPercentage / 100);
}

export function leanMassKg(weightKg: number, fatMass: number): number {
  return weightKg - fatMass;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Calcula a composição corporal completa pelo protocolo de 7 dobras.
 * Retorna null quando faltar peso, idade, sexo (Masculino/Feminino) ou
 * qualquer uma das 7 dobras — nunca aproxima com dado incompleto.
 */
export function calculateBodyComposition(input: {
  weightKg: number | null | undefined;
  ageYears: number | null | undefined;
  sex: string | null | undefined;
  skinfolds: SkinfoldValuesMm;
}): BodyCompositionResult | null {
  if (!isPositiveFinite(input.weightKg) || !isPositiveFinite(input.ageYears)) return null;
  if (input.sex !== "Masculino" && input.sex !== "Feminino") return null;

  const sumSkinfolds = sumSkinfoldsMm(input.skinfolds);
  if (sumSkinfolds === null) return null;

  const bodyDensity = calculateBodyDensityJacksonPollock7(sumSkinfolds, input.ageYears, input.sex);
  const bodyFatPercentage = bodyFatPercentageFromDensitySiri(bodyDensity);
  const fatMass = fatMassKg(input.weightKg, bodyFatPercentage);
  const leanMass = leanMassKg(input.weightKg, fatMass);

  return {
    sumSkinfoldsMm: sumSkinfolds,
    bodyDensity,
    bodyFatPercentage,
    fatMassKg: fatMass,
    leanMassKg: leanMass,
  };
}
