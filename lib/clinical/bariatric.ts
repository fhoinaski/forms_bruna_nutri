/**
 * Acompanhamento pos-bariatrica: percentual de perda de peso total (%TWL)
 * e percentual de excesso de peso perdido (%EWL) — os dois indicadores
 * padrao de literatura para monitorar sucesso da cirurgia bariatrica ao
 * longo do tempo.
 */

export type BariatricProgress = {
  percentTotalWeightLoss: number;
  percentExcessWeightLoss: number | null;
  weightLostKg: number;
};

/** %TWL = (peso pre-cirurgia - peso atual) / peso pre-cirurgia * 100 */
export function calculatePercentTotalWeightLoss(
  preSurgeryWeightKg: number,
  currentWeightKg: number
): number | null {
  if (!Number.isFinite(preSurgeryWeightKg) || preSurgeryWeightKg <= 0) return null;
  if (!Number.isFinite(currentWeightKg) || currentWeightKg <= 0) return null;
  return ((preSurgeryWeightKg - currentWeightKg) / preSurgeryWeightKg) * 100;
}

/**
 * %EWL = (peso pre-cirurgia - peso atual) / (peso pre-cirurgia - peso ideal) * 100
 * Exige um peso ideal/meta de referencia (normalmente a meta clinica
 * combinada com a paciente) — sem ele, o excesso de peso nao pode ser
 * definido e o indicador retorna null.
 */
export function calculatePercentExcessWeightLoss(
  preSurgeryWeightKg: number,
  idealWeightKg: number,
  currentWeightKg: number
): number | null {
  if (!Number.isFinite(preSurgeryWeightKg) || preSurgeryWeightKg <= 0) return null;
  if (!Number.isFinite(idealWeightKg) || idealWeightKg <= 0) return null;
  if (!Number.isFinite(currentWeightKg) || currentWeightKg <= 0) return null;

  const excessWeight = preSurgeryWeightKg - idealWeightKg;
  if (excessWeight <= 0) return null;

  return ((preSurgeryWeightKg - currentWeightKg) / excessWeight) * 100;
}

export function calculateBariatricProgress(input: {
  preSurgeryWeightKg: number | null | undefined;
  idealWeightKg: number | null | undefined;
  currentWeightKg: number | null | undefined;
}): BariatricProgress | null {
  const preSurgery = input.preSurgeryWeightKg;
  const current = input.currentWeightKg;
  if (!preSurgery || !current || !Number.isFinite(preSurgery) || !Number.isFinite(current) || preSurgery <= 0 || current <= 0) {
    return null;
  }

  const percentTotalWeightLoss = calculatePercentTotalWeightLoss(preSurgery, current);
  if (percentTotalWeightLoss === null) return null;

  const idealWeight = input.idealWeightKg;
  const percentExcessWeightLoss = idealWeight ? calculatePercentExcessWeightLoss(preSurgery, idealWeight, current) : null;

  return {
    percentTotalWeightLoss,
    percentExcessWeightLoss,
    weightLostKg: preSurgery - current,
  };
}
