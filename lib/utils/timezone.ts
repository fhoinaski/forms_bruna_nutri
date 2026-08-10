/**
 * Limites do dia "de hoje" no fuso de Sao Paulo (sem horario de verao desde
 * 2019, entao o offset fixo -03:00 e seguro o ano inteiro). Usado para
 * relatorios diarios, onde comparar contra meia-noite UTC erraria em ate
 * 3 horas para quem esta no Brasil.
 */
export function getSaoPauloDateKey(referenceDate = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Nao foi possivel calcular a data de Sao Paulo.");
  }
  return `${year}-${month}-${day}`;
}

export function getSaoPauloDayBoundaries(referenceDate = new Date()): { dateKey: string; start: string; end: string } {
  const dateKey = getSaoPauloDateKey(referenceDate);
  return {
    dateKey,
    start: new Date(`${dateKey}T00:00:00-03:00`).toISOString(),
    end: new Date(`${dateKey}T23:59:59.999-03:00`).toISOString(),
  };
}
