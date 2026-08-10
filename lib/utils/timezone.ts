/**
 * Limites do dia "de hoje" no fuso de Sao Paulo (sem horario de verao desde
 * 2019, entao o offset fixo -03:00 e seguro o ano inteiro). Usado para
 * relatorios diarios, onde comparar contra meia-noite UTC erraria em ate
 * 3 horas para quem esta no Brasil.
 */
export function getSaoPauloDayBoundaries(referenceDate = new Date()): { dateKey: string; start: string; end: string } {
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
  return {
    dateKey,
    start: new Date(`${dateKey}T00:00:00-03:00`).toISOString(),
    end: new Date(`${dateKey}T23:59:59.999-03:00`).toISOString(),
  };
}
