export function parseMeasurement(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function calculateBmiValue(
  weightKg: string | number | null | undefined,
  heightCm: string | number | null | undefined
): number | null {
  const weight = parseMeasurement(weightKg);
  const height = parseMeasurement(heightCm);
  if (!weight || !height) return null;
  const heightM = height > 10 ? height / 100 : height;
  return Math.round((weight / (heightM * heightM)) * 10) / 10;
}

export function formatClinicalNumber(value: number | null): string | null {
  if (value === null) return null;
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
}

/**
 * Formata altura para exibição sem assumir a unidade cegamente — o campo é
 * texto livre (o profissional pode digitar "165" ou "1,65"), então usa o
 * MESMO critério já usado por calculateBmiValue (valor > 10 = centímetros,
 * caso contrário metros) em vez de sempre apendar "cm", que produzia
 * exibições sem sentido como "1.65 cm" quando o valor já estava em metros.
 */
export function formatHeightDisplay(heightCm: string | number | null | undefined): string | null {
  const height = parseMeasurement(heightCm);
  if (height === null) return null;
  if (height > 10) {
    return `${Math.round(height)} cm`;
  }
  return `${height.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

export function classifyAdultBmi(bmi: number | string | null | undefined): string | null {
  const value = parseMeasurement(bmi);
  if (!value) return null;
  if (value < 18.5) return "Baixo peso";
  if (value < 25) return "Eutrofia";
  if (value < 30) return "Sobrepeso";
  if (value < 35) return "Obesidade grau I";
  if (value < 40) return "Obesidade grau II";
  return "Obesidade grau III";
}

export function calculateWeightDelta(
  currentWeight: number | null | undefined,
  previousWeight: number | null | undefined
): number | null {
  if (!currentWeight || !previousWeight) return null;
  return Math.round((currentWeight - previousWeight) * 10) / 10;
}

/** Relacao cintura-quadril (RCQ / WHR) — cintura dividida pelo quadril. */
export function calculateWaistHipRatio(
  waistCm: string | number | null | undefined,
  hipCm: string | number | null | undefined
): number | null {
  const waist = parseMeasurement(waistCm);
  const hip = parseMeasurement(hipCm);
  if (!waist || !hip) return null;
  return Math.round((waist / hip) * 1000) / 1000;
}

/**
 * Classificacao de risco cardiometabolico por RCQ, conforme referencia da
 * OMS: alto risco acima de 0,90 para homens e 0,85 para mulheres.
 */
export function classifyWaistHipRatio(
  ratio: number | null,
  biologicalSex: string | null | undefined
): string | null {
  if (ratio === null) return null;
  if (biologicalSex !== "Masculino" && biologicalSex !== "Feminino") {
    return "Defina o sexo biologico para classificar o risco";
  }
  const threshold = biologicalSex === "Masculino" ? 0.9 : 0.85;
  return ratio >= threshold ? "Risco cardiometabolico aumentado" : "Dentro da faixa de referencia";
}

/**
 * Relacao cintura-estatura (RCE / WHtR) — cintura dividida pela altura,
 * expressa como percentual. E um indicador simples de risco
 * cardiometabolico, com o mesmo corte (0,5) valido para adultos de
 * qualquer sexo e altura.
 */
export function calculateWaistHeightRatio(
  waistCm: string | number | null | undefined,
  heightCm: string | number | null | undefined
): number | null {
  const waist = parseMeasurement(waistCm);
  const height = parseMeasurement(heightCm);
  if (!waist || !height) return null;
  return Math.round((waist / height) * 1000) / 1000;
}

export function classifyWaistHeightRatio(ratio: number | null): string | null {
  if (ratio === null) return null;
  return ratio >= 0.5 ? "Risco cardiometabolico aumentado (RCE >= 0,5)" : "Dentro da faixa de referencia";
}

/**
 * Idade completa em anos na data de referencia (por padrao, hoje).
 * Usada para calculos clinicos que dependem da idade no momento da
 * medicao, nao apenas da idade atual do paciente.
 */
export function calculateAgeInYears(
  birthDate: string | null | undefined,
  referenceDate: Date = new Date()
): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  let age = referenceDate.getFullYear() - birth.getFullYear();
  const referenceIsBeforeBirthdayThisYear =
    referenceDate.getMonth() < birth.getMonth() ||
    (referenceDate.getMonth() === birth.getMonth() && referenceDate.getDate() < birth.getDate());
  if (referenceIsBeforeBirthdayThisYear) age -= 1;

  return age >= 0 ? age : null;
}
